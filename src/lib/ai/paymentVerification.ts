import { askGeminiVision } from "@/lib/ai/geminiClient";

export type PaymentVerificationStatus = "auto_approved" | "needs_review" | "rejected";
export type PaymentVerificationResult = { status: PaymentVerificationStatus; note: string };

const SYSTEM_PROMPT = `You are checking an image a guest uploaded as proof of payment for a short-term rental booking in the Philippines (typically a GCash, Maya, or bank-transfer confirmation screenshot, or a photo of a receipt).

Look ONLY at what is actually visible in the image. Never invent or guess a date or amount that isn't clearly legible — if you're not sure, say so via "confidence": "low" rather than making something up.

Respond with ONLY a JSON object, no markdown formatting, no other text, in exactly this shape:
{"isPaymentConfirmation": true or false, "confidence": "high" or "low", "date": "YYYY-MM-DD" or null, "amount": number or null, "reasoning": "one short sentence"}

Rules:
- isPaymentConfirmation: true only if this clearly looks like a real payment/transfer confirmation (GCash, Maya, bank app screen, receipt, etc) — not an unrelated photo or screenshot.
- confidence: "high" only if you can clearly read a specific date AND a specific peso amount. Otherwise "low".
- date: the transaction/payment date shown, in YYYY-MM-DD format. null if not clearly visible.
- amount: the payment amount shown, as a plain number in Philippine pesos (no currency symbol, no commas, no centavos separator issues). null if not clearly visible.`;

function manilaTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

function parseExtraction(raw: string): { isPaymentConfirmation: boolean; confidence: "high" | "low"; date: string | null; amount: number | null; reasoning: string } | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const j = JSON.parse(cleaned);
    if (typeof j.isPaymentConfirmation !== "boolean") return null;
    return {
      isPaymentConfirmation: j.isPaymentConfirmation,
      confidence: j.confidence === "high" ? "high" : "low",
      date: typeof j.date === "string" ? j.date : null,
      amount: typeof j.amount === "number" && Number.isFinite(j.amount) ? j.amount : null,
      reasoning: typeof j.reasoning === "string" ? j.reasoning : "",
    };
  } catch {
    return null;
  }
}

/**
 * Fail-safe by design: a confident non-match is rejected with a specific
 * reason; anything the model can't confidently read is held for manual
 * review rather than auto-rejected (would wrongly bounce a real guest) or
 * auto-approved (would credit unconfirmed revenue). Only a confident match
 * on both date and amount ever returns auto_approved.
 */
export async function analyzePaymentScreenshot(imageBase64: string, mimeType: string, expectedAmountPesos: number): Promise<PaymentVerificationResult> {
  let raw: string;
  try {
    raw = await askGeminiVision(SYSTEM_PROMPT, "Analyze this uploaded payment confirmation image.", imageBase64, mimeType);
  } catch {
    return { status: "needs_review", note: "We couldn't automatically check this image — we'll review it shortly." };
  }

  const extraction = parseExtraction(raw);
  if (!extraction) {
    return { status: "needs_review", note: "We couldn't automatically check this image — we'll review it shortly." };
  }

  if (!extraction.isPaymentConfirmation && extraction.confidence === "high") {
    return { status: "rejected", note: extraction.reasoning || "This doesn't look like a payment confirmation. Please upload a screenshot of your GCash, Maya, or bank transfer receipt." };
  }

  if (extraction.confidence === "low" || extraction.date === null || extraction.amount === null) {
    return { status: "needs_review", note: "We couldn't clearly read the date or amount on this image — we'll review it shortly." };
  }

  const today = manilaTodayISO();
  if (extraction.date !== today) {
    return { status: "rejected", note: `The transaction date on this receipt (${extraction.date}) doesn't match today's date. Please upload a receipt from today's payment.` };
  }

  if (extraction.amount < expectedAmountPesos - 1) {
    return { status: "rejected", note: `This shows ₱${extraction.amount.toLocaleString("en-PH")}, which is less than the ₱${expectedAmountPesos.toLocaleString("en-PH")} required. Please upload proof of the full amount.` };
  }

  return { status: "auto_approved", note: "Payment confirmed." };
}
