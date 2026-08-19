"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { CameraIcon, AlertIcon, CheckIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

type MeterType = "WATER" | "ELECTRICITY";

type DigitEntry = { position: number; digit: string; confidence: number; alternatives: string[] };

type AnalyzedReading = {
  meterType: string;
  meterSubtype: string | null;
  readingValue: number | null;
  rawDisplay: string | null;
  readingUnit: string | null;
  readingConfidence: number;
  imageQualityScore: number;
  imageQualityClass: string;
  digitAnalysis: string; // JSON
  previousReading: number | null;
  consumption: number | null;
  anomalyDetected: boolean;
  anomalyExplanation: string | null;
  integrityStatus: string;
  integrityReason: string | null;
  warnings: string; // JSON
  recommendedAction: string;
  photoUrl: string;
};

const METER_META: Record<MeterType, { emoji: string; label: string }> = {
  WATER: { emoji: "💧", label: "water meter" },
  ELECTRICITY: { emoji: "⚡", label: "Meralco meter" },
};

function confidenceTone(pct: number) {
  return pct >= 90 ? "text-[var(--success)]" : pct >= 70 ? "text-[var(--warning)]" : "text-rausch";
}

/** Creative capture flow for one meter photo → Gemini read → saved result.
 * Three phases in one component (capture / analyzing / result), not three
 * routes/modals, so the transition between them can be a real animated
 * hand-off instead of a page/modal swap — the same photo the user just
 * took stays on screen the whole time, a scan sweeps over it while Gemini
 * reads it, then the result grows out of that same frame. */
export function MeterCaptureModal({
  open, onClose, unitId, unitLabel, meterType, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  unitId: string;
  unitLabel: string;
  meterType: MeterType;
  onSaved: () => void;
}) {
  const [phase, setPhase] = useState<"capture" | "analyzing" | "result" | "error">("capture");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzedReading | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const meta = METER_META[meterType];

  useEffect(() => {
    if (open) {
      setPhase("capture");
      setResult(null);
      setErrorMsg("");
    }
  }, [open]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));
    setPhase("analyzing");

    const form = new FormData();
    form.append("file", file);
    form.append("unitId", unitId);
    form.append("meterType", meterType);

    try {
      const res = await fetch("/api/housekeeping/meters/analyze", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Analysis failed.");
        setPhase("error");
        return;
      }
      setResult(data);
      setPhase("result");
      onSaved();
    } catch {
      setErrorMsg("Couldn't reach the analysis service. Check your connection and try again.");
      setPhase("error");
    }
  }

  function retake() {
    setPhase("capture");
    setResult(null);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${meta.emoji} Log ${meta.label} reading`}
      sub={unitLabel}
      maxWidth={460}
      footer={
        phase === "result" ? (
          <>
            <button onClick={retake} className="btn-ghost">Log another</button>
            <button onClick={onClose} className="btn-primary ml-auto">Done</button>
          </>
        ) : phase === "error" ? (
          <>
            <button onClick={onClose} className="btn-ghost">Close</button>
            <button onClick={retake} className="btn-primary ml-auto">Try again</button>
          </>
        ) : undefined
      }
    >
      {phase === "capture" && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <button
            onClick={() => inputRef.current?.click()}
            aria-label={`Take a photo of the ${meta.label}`}
            className="grid h-24 w-24 place-items-center rounded-full bg-[var(--skin-primary,#6c5ce7)] text-white shadow-elevation-3 transition duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.94]"
          >
            <CameraIcon className="h-9 w-9" />
          </button>
          <div>
            <p className="text-[15px] font-extrabold">Fill the frame with the register</p>
            <p className="mt-1 text-[13px] text-[var(--gray)]">Get close, avoid glare, and keep the digits level.</p>
          </div>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
        </div>
      )}

      {phase === "analyzing" && previewUrl && (
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="relative w-full max-w-[280px] overflow-hidden rounded-2xl border border-[var(--line)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Captured meter" className="block w-full" />
            <div className="meter-scan-line pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-transparent via-white/40 to-transparent mix-blend-overlay" />
          </div>
          <div className="flex items-center gap-2 text-[13.5px] font-bold text-[var(--gray)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--skin-primary,#6c5ce7)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--skin-primary,#6c5ce7)]" />
            </span>
            Reading the register…
          </div>
        </div>
      )}

      {phase === "result" && result && <ResultView result={result} />}

      {phase === "error" && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-rausch/12 text-rausch">
            <AlertIcon className="h-6 w-6" />
          </span>
          <p className="text-[14px] font-bold">{errorMsg}</p>
        </div>
      )}
    </Modal>
  );
}

function ResultView({ result }: { result: AnalyzedReading }) {
  const digits: DigitEntry[] = safeParse(result.digitAnalysis, []);
  const warnings: string[] = safeParse(result.warnings, []);
  const display = result.rawDisplay ?? (result.readingValue != null ? String(result.readingValue) : "—");
  const autoAccepted = result.recommendedAction === "AUTO_ACCEPT";

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={result.photoUrl} alt="Logged meter" className="block max-h-40 w-full object-cover" />
      </div>

      <div className="text-center">
        <div className="flex items-end justify-center gap-1 font-mono text-[38px] font-extrabold leading-none tabular-nums">
          {display.split("").map((ch, i) => {
            const d = digits.find((x) => x.position === i);
            return (
              <span
                key={i}
                className={cn("meter-digit inline-block", d ? confidenceTone(d.confidence) : undefined)}
                style={{ animationDelay: `${i * 45}ms` }}
              >
                {ch}
              </span>
            );
          })}
        </div>
        {result.readingUnit && <div className="mt-0.5 text-[13px] font-bold text-[var(--gray)]">{result.readingUnit}</div>}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className={cn("tag", autoAccepted ? "bg-[var(--success)]/12 text-[var(--success)]" : "bg-[var(--warning)]/14 text-[var(--warning)]")}>
          {autoAccepted ? <CheckIcon className="h-3 w-3" /> : <AlertIcon className="h-3 w-3" />}
          {autoAccepted ? "Auto-accepted" : "Needs review"}
        </span>
        <span className={cn("tag bg-[var(--bg-2)]", confidenceTone(result.readingConfidence))}>
          {Math.round(result.readingConfidence)}% confident
        </span>
        <span className="tag bg-[var(--bg-2)] text-[var(--gray)]">Image {result.imageQualityClass.toLowerCase()}</span>
      </div>

      {result.consumption !== null && (
        <p className="text-center text-[13px] text-[var(--gray)]">
          {result.consumption >= 0 ? "+" : ""}
          {result.consumption} {result.readingUnit} since last reading
          {result.anomalyDetected && <span className="ml-1 font-bold text-[var(--warning)]">· flagged for review</span>}
        </p>
      )}
      {result.anomalyExplanation && (
        <p className="rounded-xl bg-[var(--warning)]/10 px-3 py-2 text-center text-[12.5px] text-[var(--warning)]">{result.anomalyExplanation}</p>
      )}

      {result.integrityStatus !== "NORMAL" && result.integrityReason && (
        <p className="rounded-xl bg-[var(--warning)]/10 px-3 py-2 text-center text-[12.5px] text-[var(--warning)]">{result.integrityReason}</p>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-[var(--bg-2)] px-3.5 py-3 text-[12.5px] text-[var(--gray)]">
          {warnings.map((w, i) => (
            <li key={i} className="flex gap-1.5">
              <span aria-hidden="true">·</span> {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
