// server/test-ask.js
import 'dotenv/config';
import axios from 'axios';
import pLimit from 'p-limit';
import fs from 'node:fs';
import path from 'node:path';

// ------------- PYTANIA (edytuj wedle uznania) -------------
const questions = [
  "Kiedy organ może odmówić udostępnienia informacji publicznej?",
  "Czy błędne oznaczenie adresata decyzji powoduje jej nieważność?",
  "Jakie warunki musi spełnić skarga do WSA, aby nie została odrzucona?",
  "Czy doręczenie przez ePUAP jest skuteczne, gdy pełnomocnictwo nie obejmuje tej formy?",
  "Kiedy można wznowić postępowanie administracyjne?",
  "Czy można złożyć skargę na bezczynność organu?",
  "Czy organ ma obowiązek informować o wszczęciu postępowania?",
  "Czy możliwe jest złożenie skargi na decyzję organu administracji publicznej?",
  "Jak zgłosić naruszenie prawa ucznia na studiach przeprowadzanych w trybie zdalnym?",
  "Ile średnio trwa proces cywilno-karny od złożenia pierwszego wniosku do wydania wyroku?"
];
// -----------------------------------------------------------

const API_URL = process.env.TEST_API_URL || `http://localhost:${process.env.PORT || 8000}/ask`;
const OUT_PATH = path.join(process.cwd(), 'server', `test_results_${Date.now()}.json`);
const CONCURRENCY = Number(process.env.TEST_CONCURRENCY || 3);

async function askOne(q) {
  const t0 = Date.now();
  try {
    const { data } = await axios.post(API_URL, { question: q }, { timeout: 120000 });
    const ms = Date.now() - t0;
    const preview = (data?.answer || '').slice(0, 200).replace(/\s+/g, ' ');
    console.log(`✓ [${ms} ms] ${q}\n   → ${preview}${preview.length === 200 ? '…' : ''}\n`);
    return { ok: true, question: q, ms, data };
  } catch (err) {
    const ms = Date.now() - t0;
    const msg = err?.response?.data?.error || err.message;
    console.error(`✗ [${ms} ms] ${q}\n   ! ${msg}\n`);
    return { ok: false, question: q, ms, error: msg };
  }
}

async function main() {
  console.log(`Running ${questions.length} questions against ${API_URL} (concurrency=${CONCURRENCY})\n`);
  const limit = pLimit(CONCURRENCY);
  const results = await Promise.all(questions.map(q => limit(() => askOne(q))));
  fs.writeFileSync(OUT_PATH, JSON.stringify({ when: new Date().toISOString(), API_URL, results }, null, 2), 'utf-8');
  const ok = results.filter(r => r.ok).length;
  console.log(`Done. OK: ${ok}/${results.length}. Results saved to: ${OUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
