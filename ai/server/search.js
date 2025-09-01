import { MongoClient } from 'mongodb';
import { cfg } from './config.js';
import { oai } from './openai.js';

export async function vectorSearch(question, topK, numCandidates) {
  const mc = new MongoClient(cfg.mongo.uri);
  await mc.connect();
  const col = mc.db(cfg.mongo.db).collection(cfg.mongo.coll);

  // 1) embedding zapytania
  const emb = (await oai.embeddings.create({
    model: cfg.openai.embedModel,
    input: [question]
  })).data[0].embedding;

  // 2) Vector Search pipeline
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
  await mc.close();

  return docs.map(d => ({
    link: d.link,
    title: d.title,
    dt: d.dt ? new Date(d.dt).toISOString().slice(0,10) : null,
    prawomocne: d.prawomocne,
    snippet: d.text.length > 900 ? d.text.slice(0,900) + '…' : d.text,
    score: d.score
  }));
}
