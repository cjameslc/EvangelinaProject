// Thin wrapper around Gemini's REST API.
//
// Every call site in this app (dashboard/analytics insights, the guest
// assistant, payment verification, place overview, social captions) does
// the same shape of work — short prose/JSON generation off a system prompt
// grounded in real pre-computed data, never tool-calling or multi-step
// reasoning — so there's no feature here that actually needs a pricier
// tier. Deliberately on the cheapest model confirmed live on this account's
// key, checked directly against real pricing (per-1M-token, paid tier, as
// of 2026-07-27):
//   gemini-3.1-flash-lite   $0.25 in / $1.50 out  <- in use, cheapest live
//   gemini-flash-lite-latest $0.30 in / $2.50 out (-> resolves to 3.5 Flash-Lite)
//   gemini-flash-latest      $1.50 in / $7.50 out (-> resolves to 3.6 Flash)
//   gemini-2.5-flash-lite    $0.10 in / $0.40 out — cheapest on paper, but
//     404s "no longer available to new users" on this key despite showing
//     up in ListModels — same trap gemini-2.5-flash/2.0-flash/1.5-flash
//     already fell into. Confirmed dead, not a typo.
//
// This is a PINNED version, not a "-latest" alias — a deliberate trade of
// the alias's silent-forward-compat guarantee for the lower price, made
// explicitly on cost grounds. Pinned versions do eventually get retired
// (see above) — if gemini-3.1-flash-lite ever 404s, fall back to
// gemini-flash-lite-latest (MODEL_LITE below), which is confirmed to
// always resolve to *some* live lite-tier model, just not necessarily the
// cheapest one at any given moment.
const MODEL = "gemini-3.1-flash-lite";

// The safe fallback referenced above — the "-latest" alias, not the
// cheapest-right-now pinned version, so a caller that imports this
// explicitly instead of relying on the default MODEL keeps working even
// after gemini-3.1-flash-lite eventually gets retired.
export const MODEL_LITE = "gemini-flash-lite-latest";

export async function askGemini(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no text.");
  return text;
}

/**
 * Same REST endpoint as askGemini, but requests Gemini's native JSON output
 * mode (`generationConfig.responseMimeType`) instead of free prose — the
 * Analytics AI Insights panels need a light structure (summary/points/
 * recommendation) the UI can style differently per point, not just a
 * paragraph. No structured-output call existed in this codebase before;
 * this is the first one, kept as a thin sibling of askGemini rather than a
 * flag on it so every existing prose caller is untouched.
 */
export async function askGeminiJSON<T>(systemPrompt: string, userMessage: string, model: string = MODEL): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no text.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Gemini returned invalid JSON.");
  }
}

export type ChatTurn = { role: "user" | "model"; text: string };

/**
 * Same REST endpoint as askGemini, but with a full `contents` array of prior
 * turns instead of a single user message — the AI Concierge (guest chat
 * widget) needs real multi-turn memory ("what about tomorrow?" referring
 * back to an earlier question), which askGemini's one-shot call can't do.
 * `history` is every turn BEFORE the new message; `userMessage` is appended
 * as the final user turn.
 */
export async function askGeminiChat(systemPrompt: string, history: ChatTurn[], userMessage: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const contents = [...history, { role: "user" as const, text: userMessage }].map((t) => ({
    role: t.role,
    parts: [{ text: t.text }],
  }));

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no text.");
  return text;
}

const VISION_TIMEOUT_MS = 20_000;

/**
 * Same REST endpoint as askGemini, but with an inlineData image part added
 * to the user turn — Gemini's generateContent API is multimodal even though
 * nothing in this codebase has sent an image before now. Used by
 * paymentVerification.ts to read an uploaded payment-confirmation
 * screenshot.
 *
 * Guest-facing and blocking (the payment step waits on this), so it gets an
 * explicit timeout — paymentVerification.ts already treats any thrown error
 * here as "needs_review", so a timeout degrades to manual review rather
 * than leaving the guest stuck on "Checking…" indefinitely.
 */
export async function askGeminiVision(systemPrompt: string, userMessage: string, imageBase64: string, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMessage }, { inlineData: { mimeType, data: imageBase64 } }] }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no text.");
  return text;
}
