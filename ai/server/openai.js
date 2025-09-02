// server/openai.js
import OpenAI from 'openai';
import { cfg } from './config.js';

export const oai = new OpenAI({ apiKey: cfg.openai.key });
const SANITIZE = (process.env.SANITIZE ?? '1') !== '0';

function sanitizeAnswer(s) {
   if (!SANITIZE || !s) return s || '';
   // 1) wytniemy sekcję "Przykłady orzeczeń:" do końca odpowiedzi (różne białe znaki/diakrytyki)
   s = s.replace(/^[ \t]*przykłady\s*orzecze[nń]\s*:\s*[\s\S]*$/gim, '').trim();
   // 2) wytniemy wszystkie URL-e (nawet gdy model je „wplecie” w zdania)
   s = s.replace(/https?:\/\/\S+/gi, '')
        .replace(/\bwww\.\S+/gi, '');
   // 3) posprzątamy nadmiarowe spacje/linie
   s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
   return s;
}
const SYS = [
  'Jesteś asystentem prawnym. Odpowiadaj po polsku.',
  'Korzystaj WYŁĄCZNIE z dostarczonego kontekstu.',
  'NIE dodawaj sekcji ani listy „Przykłady orzeczeń” i NIE wstawiaj linków w odpowiedzi.',
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

  let text = r.choices[0]?.message?.content || '';
  text = sanitizeAnswer(text);

  if (!/\bto nie jest porada prawna\b/i.test(text)) {
    text += `\n\nTo nie jest porada prawna.`;
  }
  return text.trim();
}