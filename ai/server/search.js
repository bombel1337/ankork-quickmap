// server/search.js
import { MongoClient } from 'mongodb';
import { cfg } from './config.js';
import { embedBatch } from './openai.js';

const mc = new MongoClient(cfg.mongo.uri);
let colPromise;

async function getCollection() {
  if (!colPromise) {
    colPromise = (async () => {
      await mc.connect();
      return mc.db(cfg.mongo.db).collection(cfg.mongo.coll);
    })();
  }
  return colPromise;
}

export async function vectorSearch(question, topK = 10, numCandidates = 200) {
  const col = await getCollection();

  const [emb] = await embedBatch([question]);

  const pipeline = [
    {
      $vectorSearch: {
        index: cfg.mongo.indexName,
        path: 'embedding',
        queryVector: emb,
        numCandidates,
        limit: topK
      }
    },
    {
      $project: {
        _id: 0,
        unified_id: 1,
        source: 1,
        source_pk: 1,
        chunk_index: 1,
        title: 1,
        date_text: 1,
        link: 1,
        created_at: 1,
        updated_at: 1,
        text: 1,
        meta: 1,
        dt: 1,
        score: { $meta: 'vectorSearchScore' }
      }
    }
  ];

  const docs = await col.aggregate(pipeline).toArray();

  // === NOWE: dociągnij i złącz wszystkie chunki dla KAŻDEGO unified_id ===
  const uniqIds = [...new Set(docs.map(d => d.unified_id).filter(Boolean))];
  const fullTextMap = new Map();

  if (uniqIds.length) {
    // pobieramy wszystkie teksty w 1–N zapytaniach (topK jest małe, więc to szybkie)
    for (const uid of uniqIds) {
      const parts = await col
        .find({ unified_id: uid }, { projection: { text: 1, chunk_index: 1 } })
        .sort({ chunk_index: 1 })
        .toArray();
      const full = parts.map(p => p?.text || '').join('');
      fullTextMap.set(uid, full);
    }
  }

  return docs.map(d => ({
    unified_id: d.unified_id ?? null,
    source: d.source ?? null,
    source_pk: d.source_pk ?? null,
    chunk_idx: d.chunk_index ?? 0,
    title: d.title ?? null,
    link: d.link ?? null,
    date_text: d.date_text ?? null,
    created_at: d.created_at ? new Date(d.created_at).toISOString() : null,
    updated_at: d.updated_at ? new Date(d.updated_at).toISOString() : null,
    // KLUCZOWE: pełny tekst dokumentu; jeśli coś pójdzie nie tak – wróć do chunku
    snippet: fullTextMap.get(d.unified_id) ?? d.text ?? null,
    meta: d.meta ?? null,
    dt: d.dt ?? null,
    prawomocne: (d.prawomocne ?? d?.meta?.prawomocne) ?? null,
    score: d.score
  }));
}
