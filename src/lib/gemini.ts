import { askGeminiVisionJSON } from "./ai/geminiClient";
import { METER_READING_SYSTEM_PROMPT } from "./meterReadingPrompt";
import { METER_READING_JSON_SCHEMA, meterReadingResultSchema, type MeterReadingResult } from "./meterReadingSchema";

// Accuracy over cost — a wrong meter reading becomes a wrong utility bill.
// Confirmed live on this app's GEMINI_API_KEY (2026-08-16, real request
// against generateContent with inlineData + responseSchema, HTTP 200) —
// see askGeminiVisionJSON's own doc comment for why this deviates from the
// rest of the app's cost-optimized default model.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";

export type HistoricalContext = {
  previousReading: number;
  previousReadingDate: string;
  currentReadingDate: string;
};

export class MeterAnalysisError extends Error {
  constructor(
    message: string,
    public readonly rawText: string,
  ) {
    super(message);
    this.name = "MeterAnalysisError";
  }
}

export async function analyzeMeterPhoto(
  imageBase64: string,
  mimeType: string,
  meterTypeHint: "WATER" | "ELECTRICITY",
  historical?: HistoricalContext,
): Promise<{ parsed: MeterReadingResult; rawText: string }> {
  const instructionLines = [
    `The housekeeper indicated this is a ${meterTypeHint === "WATER" ? "water" : "Meralco electricity"} meter before taking the photo — treat that as a hint, not ground truth: read what's actually in the image and report the meter_type you actually see.`,
  ];

  if (historical) {
    instructionLines.push(
      "Historical validation input (spec STEP 10 — a validation signal only, never a substitute for reading the image):",
      JSON.stringify(
        {
          previous_reading: historical.previousReading,
          previous_reading_date: historical.previousReadingDate,
          current_reading_date: historical.currentReadingDate,
        },
        null,
        2,
      ),
    );
  }

  let rawText: string;
  let json: unknown;
  try {
    // askGeminiVisionJSON already JSON.parses the model's text and throws
    // MeterAnalysisError-worthy messages on a bad response — but it doesn't
    // hand back the raw string, which the DB row (rawResponse) needs for
    // audit fidelity, so re-stringify the parsed result rather than
    // threading a second return value through the shared client.
    json = await askGeminiVisionJSON<unknown>(
      METER_READING_SYSTEM_PROMPT,
      instructionLines.join("\n\n"),
      imageBase64,
      mimeType,
      METER_READING_JSON_SCHEMA,
      MODEL,
    );
    rawText = JSON.stringify(json);
  } catch (err) {
    throw new MeterAnalysisError(err instanceof Error ? err.message : "Gemini request failed.", "");
  }

  const result = meterReadingResultSchema.safeParse(json);
  if (!result.success) {
    throw new MeterAnalysisError(`Model response did not match the expected schema: ${result.error.message}`, rawText);
  }

  return { parsed: result.data, rawText };
}
