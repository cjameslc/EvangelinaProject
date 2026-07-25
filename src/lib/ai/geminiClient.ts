// Thin wrapper around Gemini's REST API. Uses the "-latest" alias rather
// than a pinned version (gemini-2.5-flash, gemini-2.0-flash, and
// gemini-1.5-flash were all confirmed unavailable — "no longer available
// to new users" / zero free-tier quota — on this account's API key,
// despite showing up in ListModels; gemini-flash-latest is what actually
// works, and staying on an alias avoids this exact breakage recurring
// whenever a pinned model gets retired).
const MODEL = "gemini-flash-latest";

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
export async function askGeminiJSON<T>(systemPrompt: string, userMessage: string): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
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
