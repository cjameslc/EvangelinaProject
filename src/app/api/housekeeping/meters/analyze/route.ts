import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, isUnitInScope, forbiddenUnitScopeResponse, logAudit } from "@/lib/session";
import { hasActionAccess } from "@/lib/actionAccess";
import { uploadMeterPhoto } from "@/lib/blob";
import { analyzeMeterPhoto, MeterAnalysisError } from "@/lib/gemini";

// Vision analysis on a full-resolution phone photo can take a while.
export const maxDuration = 60;

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!hasActionAccess("housekeeping.edit", user.role, user.additionalActionAccess)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const unitId = form.get("unitId");
  const meterType = form.get("meterType");

  if (!(file instanceof File) || typeof unitId !== "string" || !unitId) {
    return NextResponse.json({ error: "Missing photo or unitId." }, { status: 400 });
  }
  if (meterType !== "WATER" && meterType !== "ELECTRICITY") {
    return NextResponse.json({ error: "meterType must be WATER or ELECTRICITY." }, { status: 400 });
  }
  if (!await isUnitInScope(user, unitId)) return forbiddenUnitScopeResponse(user);
  if (!ACCEPTED_TYPES.has(file.type)) {
    return NextResponse.json({ error: `Unsupported image type: ${file.type || "unknown"}` }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image too large (max 10MB)." }, { status: 400 });
  }

  // Historical validation context (spec STEP 10) comes only from this same
  // unit+meterType's own last reading in the DB — never from client input,
  // so a submission can't be spoofed into validating against a fake history.
  const previous = await prisma.meterReading.findFirst({
    where: { unitId, meterType },
    orderBy: { createdAt: "desc" },
    select: { readingValue: true, createdAt: true },
  });

  const [photoUrl, imageBytes] = await Promise.all([
    uploadMeterPhoto(file, unitId),
    file.arrayBuffer(),
  ]);
  const base64 = Buffer.from(imageBytes).toString("base64");

  let analysis;
  let rawText = "";
  try {
    const result = await analyzeMeterPhoto(
      base64,
      file.type,
      meterType,
      previous?.readingValue != null
        ? {
            previousReading: previous.readingValue,
            previousReadingDate: previous.createdAt.toISOString().slice(0, 10),
            currentReadingDate: new Date().toISOString().slice(0, 10),
          }
        : undefined,
    );
    analysis = result.parsed;
    rawText = result.rawText;
  } catch (err) {
    if (err instanceof MeterAnalysisError) {
      return NextResponse.json(
        { error: "The model's response could not be parsed as a valid reading.", detail: err.message },
        { status: 502 },
      );
    }
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Server is missing GEMINI_API_KEY. Set it in the environment and redeploy." },
        { status: 500 },
      );
    }
    console.error("Meter analysis request failed:", err);
    return NextResponse.json({ error: "Analysis request failed. Please try again." }, { status: 502 });
  }

  const reading = await prisma.meterReading.create({
    data: {
      unitId,
      meterType: analysis.meter_type,
      meterSubtype: analysis.meter_subtype,

      photoUrl,

      readingValue: analysis.reading.value,
      rawDisplay: analysis.reading.raw_display,
      readingUnit: analysis.reading.unit,
      readingConfidence: Math.round(analysis.reading.reading_confidence),

      registerConfidence: Math.round(analysis.register_detection.confidence),
      imageQualityScore: Math.round(analysis.image_quality.score),
      imageQualityClass: analysis.image_quality.classification,

      serialNumber: analysis.meter_serial_number,
      meterModel: analysis.meter_model,
      accountNumber: analysis.account_number,

      digitAnalysis: JSON.stringify(analysis.digit_analysis),

      previousReading: analysis.validation.previous_reading,
      consumption: analysis.validation.consumption,
      anomalyDetected: analysis.validation.anomaly_detected,
      anomalyType: analysis.validation.anomaly_type,
      anomalyExplanation: analysis.validation.explanation,

      integrityStatus: analysis.image_integrity.status,
      integrityReason: analysis.image_integrity.reason,

      warnings: JSON.stringify(analysis.warnings),
      recommendedAction: analysis.recommended_action,

      rawResponse: rawText,
      loggedByName: user.name,
    },
  });

  await logAudit(user.id, "meterReading.create", "MeterReading", reading.id, {
    unitId,
    meterType: analysis.meter_type,
    value: analysis.reading.value,
    confidence: analysis.reading.reading_confidence,
    recommendedAction: analysis.recommended_action,
  });

  return NextResponse.json(reading, { status: 201 });
}
