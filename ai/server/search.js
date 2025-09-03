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

  // OpenAI embedding (1536-d dla text-embedding-3-small/large)
  const [emb] = await embedBatch([question]);

  const pipeline = [
    {
      $vectorSearch: {
        index: cfg.mongo.indexName, // np. "unified_vec"
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
        title: 1,
        date_text: 1,
        link: 1,
        created_at: 1,
        updated_at: 1,
        content_text: 1,   // tylko do zrobienia snippet
        meta: 1,
        score: { $meta: 'vectorSearchScore' }
      }
    }
  ];

  const docs = await col.aggregate(pipeline).toArray();

  return docs.map(d => ({
    unified_id: d.unified_id ?? null,
    source: d.source ?? null,
    source_pk: d.source_pk ?? null,
    title: d.title ?? null,
    link: d.link ?? null,
    date_text: d.date_text ?? null,
    created_at: d.created_at ? new Date(d.created_at).toISOString() : null,
    updated_at: d.updated_at ? new Date(d.updated_at).toISOString() : null,
    snippet: d.content_text
      ? (d.content_text.length > 900 ? d.content_text.slice(0, 900) + '…' : d.content_text)
      : null,
    meta: d.meta ?? null,
    score: d.score
  }));
}
