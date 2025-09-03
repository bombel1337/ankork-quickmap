// ai/server/ingest.js
import 'dotenv/config';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import { htmlToText } from 'html-to-text';
import { cfg } from './config.js';
import { embedBatch } from './openai.js';

// === utils ===
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function sanitizeIfNeeded(txt) {
  const on = !!cfg.openai?.sanitize; // w config.js: openai.sanitize z .env: SANITIZE=1
  if (!on) return txt || '';
  return String(txt || '').replace(/\s+/g, ' ').trim();
}

function chunkText(txt, size, overlap) {
  if (!txt) return [];
  const clean = sanitizeIfNeeded(txt);
  const out = [];
  let i = 0;
  const step = Math.max(1, size - overlap);
  while (i < clean.length) {
    const end = Math.min(clean.length, i + size);
    out.push(clean.slice(i, end));
    i += step;
  }
  return out;
}

function safeParseJSON(x) {
  if (!x) return null;
  if (typeof x === 'object') return x;
  try { return JSON.parse(String(x)); } catch { return null; }
}

function maybeDate(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

function maybeDateObj(d) {
  // MySQL przez mysql2 zwykle zwraca Date — ale na wszelki wypadek:
  if (!d) return null;
  if (d instanceof Date) return d;
  return maybeDate(d);
}

async function main() {
  // --- MySQL (unified_docs) ---
  const my = await mysql.createPool({
    host: cfg.mysql.host,
    port: cfg.mysql.port || 3306,
    user: cfg.mysql.user,
    password: cfg.mysql.password,
    database: cfg.mysql.database, // np. 'ai_unified'
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5
  });

  // --- MongoDB ---
  const mc = new MongoClient(cfg.mongo.uri);
  await mc.connect();
  const col = mc.db(cfg.mongo.db).collection(cfg.mongo.coll);

  // HARD REFRESH (bez tykania indexu Vector Search)
  if (cfg.api?.RESET_BEFORE_INGEST) {
    const del = await col.deleteMany({});
    console.log(`RESET_BEFORE_INGEST=1 → usunięto ${del.deletedCount} dokumentów z ${cfg.mongo.db}.${cfg.mongo.coll}`);
  }

  // Indeksy idempotentne pod nasze dokumenty-chunki
  await col.createIndex({ text_hash: 1 }, { unique: true }).catch(() => {});
  await col.createIndex({ dt: 1 }).catch(() => {});
  await col.createIndex({ link: 1 }).catch(() => {});
  await col.createIndex({ source: 1, source_pk: 1 }).catch(() => {});
  // Uwaga: index Vector Search (embedding) masz skonfigurowany w Atlasie — tu go nie dotykamy.

  // Parametry batch/chunk
  const batchRows = Number(cfg.ingest.batchRows) || 1000;
  const size = Number(cfg.chunk.size) || 8000;
  const overlap = Number(cfg.chunk.overlap) || 1000;
  const maxRows = Number(cfg.ingest.maxRows ?? -1);
  const embedBatchSize = Number(cfg.ingest.embedBatch) || 128;

  let offset = 0;
  let processedRows = 0;

  while (true) {
    if (maxRows !== -1 && processedRows >= maxRows) break;

    console.log(`(info) MySQL → pobieram batch, offset=${offset}, limit=${batchRows}`);
    const [rows] = await my.query(
      `
      SELECT
        unified_id,
        source,
        source_pk,
        title,
        date_text,
        link,
        created_at,
        updated_at,
        content_text,
        meta
      FROM \`${cfg.mysql.database}\`.\`${cfg.mysql.table}\`
      WHERE content_text IS NOT NULL AND content_text <> ''
      ORDER BY unified_id ASC
      LIMIT ? OFFSET ?
      `,
      [batchRows, offset]
    );

    if (!rows.length) {
      console.log('(info) Brak kolejnych wierszy — koniec.');
      break;
    }

    offset += rows.length;
    processedRows += rows.length;

    // 1) Zbuduj koperty-chunki dla każdego wiersza
    const envelope = [];
    for (const r of rows) {
      const meta = safeParseJSON(r.meta);

      // body: najpierw content_text (plain), opcjonalnie fallback z content_html (jeśli kiedyś się pojawi)
      const body =
        (r.content_text && String(r.content_text).trim()) ||
        htmlToText(r.content_html || '', {
          wordwrap: false,
          selectors: [{ selector: 'a', options: { ignoreHref: true } }]
        }) ||
        '';

      if (!body || body.length < 50) continue;

      // Nagłówek do osadzenia kontekstu
      const headerParts = [];
      if (r.title) headerParts.push(`Tytuł: ${r.title}`);
      if (r.date_text) headerParts.push(`Data: ${r.date_text}`);
      if (r.source) headerParts.push(`Źródło: ${r.source}${r.source_pk ? ` (${r.source_pk})` : ''}`);
      if (r.link) headerParts.push(`Link: ${r.link}`);
      const header = headerParts.join('\n');

      const text = [header, body].filter(Boolean).join('\n\n');
      const chunks = chunkText(text, size, overlap);

      chunks.forEach((ch, idx) => {
        const hash = sha(`${r.unified_id}:${idx}:${ch}`);
        envelope.push({
          r: {
            unified_id: r.unified_id,
            source: r.source,
            source_pk: r.source_pk,
            title: r.title,
            date_text: r.date_text,
            link: r.link,
            created_at: r.created_at,
            updated_at: r.updated_at,
            meta
          },
          idx,
          ch,
          hash
        });
      });
    }

    if (!envelope.length) {
      console.log(`(info) offset=${offset}: brak chunków do zapisu`);
      continue;
    }

    // 2) Sprawdź, które chunki już są
    const hashes = envelope.map(e => e.hash);
    const existing = await col.find(
      { text_hash: { $in: hashes } },
      { projection: { text_hash: 1, embedding: 1 } }
    ).toArray();

    const existsMap = new Map(existing.map(x => [x.text_hash, !!x.embedding]));

    const toInsert = []; // dokumenty, których nie ma (wstawimy bez embeddingu)
    const toEmbed = [];  // dokumenty, którym trzeba policzyć embedding (nowe + istniejące bez embeddingu)

    for (const e of envelope) {
      const had = existsMap.get(e.hash);
      if (had === true) continue;         // już istnieje i MA embedding → nic nie robimy
      if (had === undefined) toInsert.push(e); // nowy dokument → insert bez embeddingu
      toEmbed.push(e);                      // zawsze policz embedding dla nowych i brakujących
    }

    // 3) Insert nowych bez embeddingu (upsert po text_hash)
    if (toInsert.length) {
      const ops = toInsert.map(e => ({
        updateOne: {
          filter: { text_hash: e.hash },
          update: {
            $setOnInsert: {
              text_hash: e.hash,

              // Pola filtrowalne i metadane (zgodne z Twoim indexem Vector Search)
              unified_id: e.r.unified_id,
              source: e.r.source,
              source_pk: e.r.source_pk,
              title: e.r.title ?? null,
              date_text: e.r.date_text ?? null,
              link: e.r.link ?? null,

              // daty (Date) — pomocne do filtrowania zakresami
              created_at: maybeDateObj(e.r.created_at),
              updated_at: maybeDateObj(e.r.updated_at),

              // dodatkowe ułatwienie: zparsowana data_text
              dt: maybeDate(e.r.date_text),

              meta: e.r.meta ?? null,

              // chunk info + właściwy tekst chunku
              chunk_index: e.idx,
              text: e.ch
            }
          },
          upsert: true
        }
      }));
      if (ops.length) {
        await col.bulkWrite(ops, { ordered: false });
      }
    }

    // 4) Liczenie embeddingów i zapis
    for (let i = 0; i < toEmbed.length; i += embedBatchSize) {
      const batch = toEmbed.slice(i, i + embedBatchSize);
      const vecs = await embedBatch(batch.map(b => b.ch)); // korzysta z server/openai.js i cfg.openai.embedModel

      const bulk = [];
      for (let j = 0; j < batch.length; j++) {
        if (!vecs[j]) continue;
        bulk.push({
          updateOne: {
            filter: { text_hash: batch[j].hash },
            update: { $set: { embedding: vecs[j] } } // ścieżka indeksowana w Vector Search: "embedding"
          }
        });
      }
      if (bulk.length) {
        await col.bulkWrite(bulk, { ordered: false });
      }
      console.log(`(info) embeddings: zapisano ${bulk.length}/${batch.length} (batch ${i / embedBatchSize + 1})`);
    }

    console.log(`(ok)  offset=${offset}, wierszy=${rows.length}, nowe=${toInsert.length}, embedowane=${toEmbed.length}`);
  }

  await mc.close();
  await my.end();
  console.log('Ingest zakończony ✅');
}

main().catch(e => {
  console.error('Failed ❌', e);
  process.exit(1);
});
