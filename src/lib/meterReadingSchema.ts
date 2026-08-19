import { z } from "zod";

// One photo = one meter for this integration (the capture flow has the
// housekeeper pick Water or Electricity before shooting), unlike a
// general-purpose "read whatever's in the frame" tool — so this is a flat
// object, not an array of meters.

// Schema handed to Gemini's generationConfig.responseSchema (see
// src/lib/gemini.ts) so the model is constrained to this exact shape at
// generation time, not just asked nicely in the prompt. Gemini's schema
// dialect is NOT plain JSON Schema — confirmed live against this app's key
// (2026-08-16): it 400s on `type: ["string","null"]` ("Proto field is not
// repeating, cannot start list"). Nullable fields need a single uppercase
// `type` plus `nullable: true` instead.
export const METER_READING_JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    status: { type: "STRING", enum: ["SUCCESS", "PARTIAL", "UNREADABLE", "REVIEW_REQUIRED"] },
    meter_type: { type: "STRING", enum: ["WATER", "ELECTRICITY", "UNKNOWN"] },
    meter_subtype: { type: "STRING", nullable: true },
    meter_type_confidence: { type: "NUMBER" },
    meter_serial_number: { type: "STRING", nullable: true },
    meter_model: { type: "STRING", nullable: true },
    account_number: { type: "STRING", nullable: true },
    reading: {
      type: "OBJECT",
      properties: {
        value: { type: "NUMBER", nullable: true },
        raw_display: { type: "STRING", nullable: true },
        unit: { type: "STRING", nullable: true },
        reading_confidence: { type: "NUMBER" },
      },
      required: ["value", "raw_display", "unit", "reading_confidence"],
    },
    register_detection: {
      type: "OBJECT",
      properties: {
        confidence: { type: "NUMBER" },
        location_description: { type: "STRING", nullable: true },
      },
      required: ["confidence", "location_description"],
    },
    digit_analysis: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          position: { type: "NUMBER" },
          digit: { type: "STRING" },
          confidence: { type: "NUMBER" },
          alternatives: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["position", "digit", "confidence", "alternatives"],
      },
    },
    image_quality: {
      type: "OBJECT",
      properties: {
        score: { type: "NUMBER" },
        classification: { type: "STRING", enum: ["EXCELLENT", "GOOD", "FAIR", "POOR", "UNREADABLE"] },
        issues: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["score", "classification", "issues"],
    },
    validation: {
      type: "OBJECT",
      properties: {
        previous_reading: { type: "NUMBER", nullable: true },
        consumption: { type: "NUMBER", nullable: true },
        anomaly_detected: { type: "BOOLEAN" },
        anomaly_type: { type: "STRING", nullable: true },
        explanation: { type: "STRING", nullable: true },
      },
      required: ["previous_reading", "consumption", "anomaly_detected", "anomaly_type", "explanation"],
    },
    image_integrity: {
      type: "OBJECT",
      properties: {
        status: { type: "STRING", enum: ["NORMAL", "REVIEW_REQUIRED"] },
        reason: { type: "STRING", nullable: true },
      },
      required: ["status", "reason"],
    },
    warnings: { type: "ARRAY", items: { type: "STRING" } },
    recommended_action: { type: "STRING", enum: ["AUTO_ACCEPT", "MANUAL_REVIEW_REQUIRED"] },
  },
  required: [
    "status",
    "meter_type",
    "meter_type_confidence",
    "reading",
    "register_detection",
    "digit_analysis",
    "image_quality",
    "validation",
    "image_integrity",
    "warnings",
    "recommended_action",
  ],
};

// Re-validated on our end after parsing — the response_format schema
// constrains generation, but a model can still occasionally emit a
// borderline-invalid value (e.g. a confidence > 100), so this is defense in
// depth, not redundant. Kept permissive on enum-shaped strings (z.string(),
// not z.enum()) so an unexpected value surfaces as data to review rather
// than a hard failure that discards a real reading.
export const meterReadingResultSchema = z.object({
  status: z.string(),
  meter_type: z.string(),
  meter_subtype: z.string().nullable().default(null),
  meter_type_confidence: z.number(),
  meter_serial_number: z.string().nullable().default(null),
  meter_model: z.string().nullable().default(null),
  account_number: z.string().nullable().default(null),
  reading: z.object({
    value: z.number().nullable(),
    raw_display: z.string().nullable(),
    unit: z.string().nullable(),
    reading_confidence: z.number(),
  }),
  register_detection: z.object({
    confidence: z.number(),
    location_description: z.string().nullable().default(null),
  }),
  digit_analysis: z
    .array(
      z.object({
        position: z.number(),
        digit: z.string(),
        confidence: z.number(),
        alternatives: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  image_quality: z.object({
    score: z.number(),
    classification: z.string(),
    issues: z.array(z.string()).default([]),
  }),
  validation: z.object({
    previous_reading: z.number().nullable().default(null),
    consumption: z.number().nullable().default(null),
    anomaly_detected: z.boolean().default(false),
    anomaly_type: z.string().nullable().default(null),
    explanation: z.string().nullable().default(null),
  }),
  image_integrity: z.object({
    status: z.string(),
    reason: z.string().nullable().default(null),
  }),
  warnings: z.array(z.string()).default([]),
  recommended_action: z.string(),
});

export type MeterReadingResult = z.infer<typeof meterReadingResultSchema>;
