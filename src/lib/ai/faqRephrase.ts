import { askGemini } from "@/lib/ai/geminiClient";

export type FaqRephraseMode = "translate" | "friendly";

const SYSTEM_PROMPT = `You rephrase a customer-service FAQ answer for a Philippine short-term staycation rental business. You are given the REAL answer verbatim — your only job is translation or tone adjustment, never adding, removing, or changing any fact, price, phone number, date, or policy detail. Every number, name, and link in the original must appear unchanged in your output.

Two modes:
- "translate": rewrite the answer in natural, professional English (the original may be Tagalog/Taglish) — same facts, same structure, no Tagalog words left over except proper nouns.
- "friendly": keep the same language (Tagalog/Taglish stays as-is) but make the tone warmer and more conversational, like messaging a friend — still every fact unchanged.

Reply with ONLY the rewritten answer text — no preamble, no quotes around it, no explanation.`;

export async function rephraseFaqAnswer(realAnswer: string, mode: FaqRephraseMode): Promise<string> {
  const raw = await askGemini(SYSTEM_PROMPT, `MODE: ${mode}\n\nREAL ANSWER (verbatim, do not alter any fact):\n${realAnswer}`);
  return raw.trim();
}
