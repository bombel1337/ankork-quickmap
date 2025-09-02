import { MongoClient } from 'mongodb';
import { cfg } from './config.js';
import { oai } from './openai.js';
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

export async function vectorSearch(question, topK, numCandidates) {
  const col = await getCollection();

  const [emb] = await embedBatch([question]);

  const pipeline = [
    {
      $vectorSearch: {
        index: cfg.mongo.indexName,
        path: "embedding",
        queryVector: emb,
        numCandidates: numCandidates,
        limit: topK
      }
    },
    {
      $project: {
        _id: 0, text: 1, title: 1, link: 1, dt: 1, prawomocne: 1, uzasadnienie: 1,
        score: { $meta: "vectorSearchScore" }
      }
    }
  ];

  const docs = await col.aggregate(pipeline).toArray();

  return docs.map(d => ({
    link: d.link,
    title: d.title,
    dt: d.dt ? new Date(d.dt).toISOString().slice(0,10) : null,
    prawomocne: d.prawomocne,
    snippet: d.text.length > 900 ? d.text.slice(0,900) + '…' : d.text,
    score: d.score
  }));
}
