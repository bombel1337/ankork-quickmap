import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import { htmlToText } from 'html-to-text';
import pLimit from 'p-limit';
import { cfg } from './config.js';
import { embedBatch } from './openai.js';

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function chunkText(txt, size, overlap) {
  if (!txt) return [];
  const clean = txt.replace(/\s+/g, ' ').trim();
  const out = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + size);
    out.push(clean.slice(i, end));
    i += Math.max(1, size - overlap);
  }
  return out;
}

async function main() {
  const my = await mysql.createConnection({
    host: cfg.mysql.host,
    port: cfg.mysql.port,
    user: cfg.mysql.user,
    password: cfg.mysql.password,
    database: cfg.mysql.database
  });

  const mc = new MongoClient(cfg.mongo.uri);
  await mc.connect();
  const col = mc.db(cfg.mongo.db).collection(cfg.mongo.coll);

  // ⚠️ HARD REFRESH: czyść kolekcję przy starcie (zachowuje indeks Vector Search)
  if (process.env.RESET_BEFORE_INGEST === '1') {
    const del = await col.deleteMany({});
    console.log(`RESET_BEFORE_INGEST=1 → usunięto ${del.deletedCount} dokumentów z ${cfg.mongo.db}.${cfg.mongo.coll}`);
  }

  // indeksy (idempotentnie)
  await col.createIndex({ text_hash: 1 }, { unique: true }).catch(() => {});
  await col.createIndex({ dt: 1 }).catch(() => {});
  await col.createIndex({ link: 1 }).catch(() => {});


  let offset = 0, processed = 0;
  const limit = cfg.ingest.batchRows;
  const size = cfg.chunk.size, overlap = cfg.chunk.overlap;

  while (true) {
    if (cfg.ingest.maxRows !== -1 && processed >= cfg.ingest.maxRows) break;

    const lim = Number(limit) | 0;
    const off = Number(offset) | 0;
    const sql = `
      SELECT id, created_at, updated_at, status_code, link,
            \`date\` AS date, link_html, prawomocne, uzasadnienie, title
      FROM \`${cfg.mysql.table}\`
      WHERE status_code=200 AND link_html IS NOT NULL AND link_html <> ''
      ORDER BY id
      LIMIT ${lim} OFFSET ${off}
    `;
    const [rows] = await my.query(sql);

    if (!rows.length) break;
    offset += rows.length; processed += rows.length;

    // 1) przygotuj chunki
    const envelope = [];
    for (const r of rows) {
      const text = htmlToText(r.link_html || '', { wordwrap: false, selectors: [{ selector: 'a', options: { ignoreHref: true }}] });
      if (!text || text.length < 50) continue;
      const chunks = chunkText(text, size, overlap);
      chunks.forEach((ch, idx) => {
        const hash = sha(`${r.id}:${idx}:${ch}`);
        envelope.push({ r, idx, ch, hash });
      });
    }
    if (!envelope.length) { console.log(`offset=${offset}: brak chunków`); continue; }

    // 2) sprawdź, które już istnieją
    const hashes = envelope.map(e => e.hash);
    const existing = await col.find({ text_hash: { $in: hashes } }, { projection: { text_hash: 1, embedding: 1 } }).toArray();
    const existsMap = new Map(existing.map(x => [x.text_hash, !!x.embedding]));
    const toInsert = [];
    const toEmbed = [];

    for (const e of envelope) {
      const had = existsMap.get(e.hash);
      if (had === true) continue;               // jest i ma embedding
      if (had === undefined) toInsert.push(e);  // nowy dokument
      toEmbed.push(e);                           // trzeba policzyć embedding
    }

    // 3) insert nowych bez embeddingu (upsert)
    if (toInsert.length) {
      const ops = toInsert.map(e => ({
        updateOne: {
          filter: { text_hash: e.hash },
          update: {
            $setOnInsert: {
              source_id: e.r.id,
              link: e.r.link,
              title: e.r.title,
              dt: e.r.date ? new Date(e.r.date) : null,
              prawomocne: e.r.prawomocne,
              uzasadnienie: e.r.uzasadnienie,
              chunk_index: e.idx,
              text: e.ch
            }
          },
          upsert: true
        }
      }));
      await col.bulkWrite(ops, { ordered: false });
    }

    // 4) policz embeddingi i zapisz
    for (let i = 0; i < toEmbed.length; i += cfg.ingest.embedBatch) {
      const batch = toEmbed.slice(i, i + cfg.ingest.embedBatch);
      const vecs = await embedBatch(batch.map(b => b.ch));
      const bulk = [];
      for (let j = 0; j < batch.length; j++) {
        bulk.push({
          updateOne: {
            filter: { text_hash: batch[j].hash },
            update: { $set: { embedding: vecs[j] } }
          }
        });
      }
      if (bulk.length) await col.bulkWrite(bulk, { ordered: false });
    }

    console.log(`offset=${offset}, wierszy=${rows.length}, nowe=${toInsert.length}, embedowane=${toEmbed.length}`);
  }

  await my.end(); await mc.close();
  console.log('Ingest zakończony.');
}

main().catch(e => { console.error(e); process.exit(1); });
