// server/openai.js
import OpenAI from 'openai';
import { cfg } from './config.js';

export const oai = new OpenAI({ apiKey: cfg.openai.key });

function stripModelExamples(text) {
  if (!text) return text;
  // usuń wszystko od "Przykłady orzeczeń" w dół (niezależnie od wielkości liter)
  return text.replace(/(?:^|\n)Przykłady orzeczeń:[\s\S]*$/i, '').trim();
}

export async function embedBatch(texts) {
  const r = await oai.embeddings.create({
    model: cfg.openai.embedModel,
    input: texts
  });
  return r.data.map(d => d.embedding);
}

export async function answerWithContext(question, ctx) {
  const sys = [
    "Jesteś asystentem prawnym. Odpowiadaj po polsku.",
    "Korzystaj WYŁĄCZNIE z dostarczonego kontekstu.",
    "NIE dodawaj żadnej sekcji ani listy 'Przykłady orzeczeń' i NIE wstawiaj linków w odpowiedzi.",
    "Jeśli brak wystarczającego kontekstu, napisz to wprost.",
    "Dodaj wpis \"To nie jest porada prawna.\""
  ].join(" ");

  const prompt = `Pytanie: ${question}

Kontekst:
${ctx.map((c,i)=>`[${i+1}] (${c.dt || "?"}, prawomocne:${c.prawomocne ?? "?"}, link:${c.link || "-"}) ${c.snippet}`).join("\n\n")}`;

  const r = await oai.chat.completions.create({
    model: cfg.openai.chatModel,
    temperature: 0.1,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }]
  });

  const raw = r.choices[0]?.message?.content || "";
  const safe = stripModelExamples(raw); // ← TU używamy helpera

  const tail = ["", "Przykłady orzeczeń:"]
    .concat(ctx.map(c =>
      `- ${c.title || "(bez tytułu)"} — prawomocne: ${c.prawomocne ?? "?"} — ${c.link || "(brak linku)"}`
    ))
    .join("\n");

  return safe + "\n" + tail;
}
export async function answerWithContext(question, ctx) {
  const prompt = `Pytanie: ${question}

Kontekst:
${ctx.map((c,i)=>`[${i+1}] (${c.dt || "?"}, prawomocne:${c.prawomocne ?? "?"}) ${c.snippet}`).join("\n\n")}`;

  const r = await oai.chat.completions.create({
    model: cfg.openai.chatModel,
    temperature: 0.1,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }]
  });

  const raw = r.choices[0]?.message?.content || "";
  const safe = stripModelExamples(raw);
  return safe;
}