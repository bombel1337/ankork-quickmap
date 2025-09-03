// ai/server/ingest.js (fragmenty)
import OpenAI from "openai";
import { MongoClient } from "mongodb";
import { cfg } from './config.js';


const openai = new OpenAI({ apiKey: cfg.openai.key });

async function embed(text) {
  const input = (text || "").slice(0, 100_000); // safety cutoff
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small", // 1536 wymiarów
    input
  });
  return res.data[0].embedding;
}

function buildEmbeddingText(row) {
  // Decydujesz tu „po jakich polach ma szukać” — to, co trafi do embeddingu:
  const parts = [];
  if (row.title) parts.push(row.title);
  if (row.date_text) parts.push(`Data: ${row.date_text}`);
  if (row.source) parts.push(`Źródło: ${row.source}${row.source_pk ? `/${row.source_pk}` : ""}`);
  if (row.meta?.keywords?.length) parts.push(`Słowa kluczowe: ${row.meta.keywords.join(", ")}`);
  if (row.content_text) parts.push(row.content_text);
  return parts.join("\n\n");
}

export async function ingest(rows /* rekordy z MySQL */) {
  const client = new MongoClient(cfg.mongo.uri);
  await client.connect();
  const db = client.db(cfg.mongo.db);
  const col = db.collection("unified_docs");

  // RESET_BEFORE_INGEST=1 -> usuń tylko poprzednie REKORDY (bez kasowania indeksów/tabel)
  if (cfg.api.RESET_BEFORE_INGEST) {
    const filter = cfg.ingest.source ? { source: cfg.ingest.source } : {}; // jeśli chcesz per-source
    await col.deleteMany(filter);
    return
  }

  const ops = [];
  for (const r of rows) {
    const text = buildEmbeddingText(r);
    const emb = await embed(text);

    // Mapowanie 1:1 nazw z MySQL:
    const doc = {
      unified_id: r.unified_id ?? null,
      source: r.source,
      source_pk: r.source_pk,
      title: r.title,
      date_text: r.date_text,
      link: r.link,
      created_at: r.created_at ? new Date(r.created_at) : null,
      updated_at: r.updated_at ? new Date(r.updated_at) : null,
      content_text: r.content_text,
      meta: r.meta || {},
      embedding: emb
    };

    // Upsert po (source, source_pk) — dopasuj do swojego klucza naturalnego:
    ops.push({
      updateOne: {
        filter: { source: r.source, source_pk: r.source_pk },
        update: { $set: doc },
        upsert: true
      }
    });

    // batchuj co ~500
    if (ops.length >= 500) {
      await col.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
  }
  if (ops.length) await col.bulkWrite(ops, { ordered: false });

  await client.close();
}
ingest().catch((e) => {
  console.error('Failed ❌', e);
  process.exit(1);
});