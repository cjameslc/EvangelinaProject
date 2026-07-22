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
 * Same REST endpoint as askGemini, but with an inlineData image part added
 * to the user turn — Gemini's generateContent API is multimodal even though
 * nothing in this codebase has sent an image before now. Used by
 * paymentVerification.ts to read an uploaded payment-confirmation
 * screenshot.
 */
export async function askGeminiVision(systemPrompt: string, userMessage: string, imageBase64: string, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userMessage }, { inlineData: { mimeType, data: imageBase64 } }] }],
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
