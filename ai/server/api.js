// server/api.js
import express from 'express';
import { cfg } from './config.js';
import { vectorSearch } from './search.js';
import { answerWithContext } from './openai.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.post('/ask', async (req, res) => {
  try {
    const question = String(req.body?.question || '').trim();
    if (!question) return res.status(400).json({ error: 'Missing question' });

    // TU: zamiast axios na :7001, robimy wektorowe w Mongo
    const hits = await vectorSearch(question, cfg.api.topK, cfg.api.numCandidates);
    const answer = await answerWithContext(question, hits);
    res.json({ answer, hits });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
});


app.listen(cfg.api.port, () => {
  console.log(`API listening on :${cfg.api.port}`);
});
