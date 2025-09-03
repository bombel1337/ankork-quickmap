// server/openai.js
import OpenAI from 'openai';
import { cfg } from './config.js';

export const oai = new OpenAI({ apiKey: cfg.openai.key });
const SANITIZE = cfg.openai.sanitize;
function buildSourcesFromHits(hits = []) {
  const uniq = new Map(); // sygnatura -> url
  for (const h of hits) {
    const sig = h?.meta?.sygnatura && String(h.meta.sygnatura).trim();
    const url = h?.link && String(h.link).trim();
    if (sig && url && !uniq.has(sig)) uniq.set(sig, url);
  }
  if (!uniq.size) return '';
  const list = [...uniq.entries()].map(([sig, url]) => `[${sig}](${url})`).join(', ');
  return `\n\nŹródła: ${list}.`;
}

// żeby nie przepalać tokenów w prompt — skracamy TYLKO kontekst dla modelu,
// ale nie zmieniamy zwracanego JSON-a (tam snippet jest pełny).
function shortForPrompt(s, max = 1400) {
  if (!s) return '';
  return s.length > max ? (s.slice(0, max) + '…') : s;
}

function sanitizeAnswer(s) {
  if (!SANITIZE || !s) return s || '';
  // wytnij tylko ewentualną sekcję "Przykłady orzeczeń", ale ZOSTAW linki
  s = s.replace(/^[ \t]*przykłady\s*orzecze[nń]\s*:\s*[\s\S]*$/gim, '').trim();
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}


const SYS = [
  'Jesteś asystentem prawnym. Odpowiadaj po polsku.',
  'Korzystaj WYŁĄCZNIE z dostarczonego kontekstu.',
  'NIE dodawaj sekcji ani listy „Przykłady orzeczeń”.',
  'Jeśli kontekstu jest za mało, powiedz to wprost.',
  'Na końcu dodaj zdanie: "To nie jest porada prawna."'
].join(' ');

export async function embedBatch(texts) {
  const r = await oai.embeddings.create({
    model: cfg.openai.embedModel,
    input: texts
  });
  return r.data.map(d => d.embedding);
}

export async function answerWithContext(question, ctx) {
  const prompt = `Pytanie: ${question}

Kontekst:
${ctx.map((c, i) =>
  `[${i + 1}] (${c.dt || "?"}, prawomocne:${c.prawomocne ?? "?"}) ${shortForPrompt(c.snippet)}`
).join('\n\n')}`;

  const r = await oai.chat.completions.create({
    model: cfg.openai.chatModel,
    temperature: 0.1,
    messages: [
      { role: 'system', content: SYS },
      { role: 'user', content: prompt }
    ]
  });

  let text = r.choices[0]?.message?.content || '';
  text = sanitizeAnswer(text);

  // dopnij sekcję "Źródła" z sygnaturami → linkami
  const sources = buildSourcesFromHits(ctx);
  if (sources) text += sources;

  if (!/\bto nie jest porada prawna\b/i.test(text)) {
    text += `\n\nTo nie jest porada prawna.`;
  }
  return text.trim();
}
