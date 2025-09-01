// server/openai.js
import OpenAI from 'openai';
import { cfg } from './config.js';

export const oai = new OpenAI({ apiKey: cfg.openai.key });

const SYS = [
  'Jesteś asystentem prawnym. Odpowiadaj po polsku.',
  'Korzystaj WYŁĄCZNIE z dostarczonego kontekstu.',
  'NIE dodawaj sekcji ani listy „Przykłady orzeczeń” i NIE wstawiaj linków w odpowiedzi.',
  'Jeśli kontekstu jest za mało, powiedz to wprost.',
  'Na końcu dodaj zdanie: "To nie jest porada prawna."'
].join(' ');

function stripModelExamples(text) {
  if (!text) return '';
  // 1) utnij wszystko od nagłówka "Przykłady orzeczeń:" (również gdy jest \r\n)
  let out = text.replace(/(?:^|[\r\n])\s*przykłady\s+orzeczeń\s*:[\s\S]*$/i, '');

  // 2) usuń wszystkie URL-e (model czasem je „przemyca”)
  out = out.replace(/\bhttps?:\/\/\S+/gi, '');

  // 3) porządki w białych znakach
  out = out.replace(/[ \t]+\n/g, '\n').trim();

  return out;
}

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
  `[${i + 1}] (${c.dt || "?"}, prawomocne:${c.prawomocne ?? "?"}) ${c.snippet}`
).join('\n\n')}`;

  const r = await oai.chat.completions.create({
    model: cfg.openai.chatModel,
    temperature: 0.1,
    messages: [
      { role: 'system', content: SYS },
      { role: 'user', content: prompt }
    ]
  });

  const raw = r.choices[0]?.message?.content || '';
  let safe = stripModelExamples(raw);

  if (!/\bto nie jest porada prawna\b/i.test(safe)) {
    safe += `\n\nTo nie jest porada prawna.`;
  }
  return safe.trim();
}