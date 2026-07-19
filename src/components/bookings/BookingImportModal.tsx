"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { UploadIcon, FileSpreadsheetIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

type PreviewRow = Record<string, string>;
type ImportRowResult =
  | { row: number; status: "created"; bookingId: string; guest: string }
  | { row: number; status: "skipped"; reason: string; raw: Record<string, string> };
type ImportSummary = { totalRows: number; created: number; skipped: number; results: ImportRowResult[] };

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Create Booking → Import Excel. Uploads a .xlsx/.xls/.csv file to
 * POST /api/bookings/import, which parses it and calls the exact same
 * createBookingRecord() the manual "New booking" form uses for every row —
 * this component only handles the file/UI side, never touches booking
 * business logic itself.
 */
export function BookingImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    setSummary(null);
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      setError("Unsupported file type — upload a .xlsx, .xls, or .csv file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("File is too large — the limit is 20MB.");
      return;
    }
    setFile(f);
    setParsing(true);
    try {
      // Client-side preview only — parsed again, authoritatively, server-side
      // on import. Loaded on demand so the xlsx parser isn't in the main
      // bundle for everyone who never opens this modal.
      const XLSX = await import("xlsx");
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
      const nonEmpty = rows.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
      const headers = (nonEmpty[0] ?? []).map((h) => String(h));
      const body = nonEmpty.slice(1, 6).map((r) => {
        const obj: PreviewRow = {};
        headers.forEach((h, i) => { obj[h] = String(r[i] ?? ""); });
        return obj;
      });
      setPreview(body);
      if (nonEmpty.length <= 1) setError("No data rows found below the header row.");
    } catch {
      setError("Couldn't read that file — make sure it's a valid Excel or CSV export.");
      setFile(null);
      setPreview(null);
    } finally {
      setParsing(false);
    }
  }

  async function startImport() {
    if (!file) return;
    setImporting(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/bookings/import", { method: "POST", body: form, signal: controller.signal });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.error ?? "Import failed.");
        return;
      }
      setSummary(j as ImportSummary);
      if ((j as ImportSummary).created > 0) onImported();
    } catch (e: any) {
      if (e?.name !== "AbortError") setError("Import failed — check your connection and try again.");
    } finally {
      setImporting(false);
      abortRef.current = null;
    }
  }

  function cancelImport() {
    abortRef.current?.abort();
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setSummary(null);
    setError(null);
  }

  return (
    <Modal open onClose={onClose} title="Import bookings" sub="Upload a .xlsx, .xls, or .csv file — up to 20MB" maxWidth={640}>
      <div className="space-y-4">
        {!summary && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
              className={cn(
                "rounded-2xl border-2 border-dashed p-8 text-center transition",
                dragOver ? "border-rausch bg-rausch/5" : "border-[var(--line-2)]"
              )}
            >
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
              {!file ? (
                <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center gap-2.5">
                  <UploadIcon className="h-7 w-7 text-[var(--gray)]" />
                  <span className="text-[13.5px] font-bold">Drop a file here, or click to browse</span>
                  <span className="text-[12px] text-[var(--gray)]">.xlsx, .xls, or .csv — max 20MB</span>
                </button>
              ) : (
                <div className="flex items-center justify-center gap-2.5">
                  <FileSpreadsheetIcon className="h-5 w-5 flex-none text-green" />
                  <span className="truncate text-[13.5px] font-bold">{file.name}</span>
                  <button type="button" onClick={reset} className="text-[12px] font-bold text-[var(--gray)] hover:text-rausch">Remove</button>
                </div>
              )}
            </div>

            <a href="/api/bookings/import/template" download className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-rausch hover:underline">
              <FileSpreadsheetIcon className="h-3.5 w-3.5" /> Download the import template
            </a>

            {error && <p className="rounded-xl bg-rausch/10 p-3 text-[13px] font-semibold text-rausch">{error}</p>}

            {parsing && <p className="text-[13px] text-[var(--gray)]">Reading file…</p>}

            {preview && preview.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Preview — first {preview.length} row{preview.length !== 1 ? "s" : ""}</div>
                <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-[var(--bg-2)]">
                        {Object.keys(preview[0]).map((h) => (
                          <th key={h} className="whitespace-nowrap px-2.5 py-2 text-left font-extrabold text-[var(--gray)]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className="border-t border-[var(--line)]">
                          {Object.values(row).map((v, j) => (
                            <td key={j} className="whitespace-nowrap px-2.5 py-2">{v || "—"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {summary && (
          <div>
            <div className="mb-3 grid grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-[var(--line)] p-3 text-center"><div className="text-xl font-extrabold">{summary.totalRows}</div><div className="text-[11px] font-bold uppercase text-[var(--gray)]">Rows</div></div>
              <div className="rounded-xl border border-green/30 bg-green/5 p-3 text-center"><div className="text-xl font-extrabold text-green">{summary.created}</div><div className="text-[11px] font-bold uppercase text-[var(--gray)]">Created</div></div>
              <div className="rounded-xl border border-rausch/30 bg-rausch/5 p-3 text-center"><div className="text-xl font-extrabold text-rausch">{summary.skipped}</div><div className="text-[11px] font-bold uppercase text-[var(--gray)]">Skipped</div></div>
            </div>
            {summary.skipped > 0 && (
              <div className="max-h-[220px] overflow-y-auto rounded-xl border border-[var(--line)]">
                {summary.results.filter((r) => r.status === "skipped").map((r, i) => (
                  <div key={i} className="border-t border-[var(--line)] p-2.5 text-[12px] first:border-0">
                    <span className="font-extrabold">Row {r.row}</span>
                    <span className="text-[var(--gray)]"> — {r.status === "skipped" ? r.reason : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-[var(--line)] pt-4">
        {importing ? (
          <>
            <span className="mr-auto text-[13px] font-semibold text-[var(--gray)]">Importing…</span>
            <button onClick={cancelImport} className="btn-ghost">Cancel</button>
          </>
        ) : summary ? (
          <button onClick={onClose} className="btn-primary">Done</button>
        ) : (
          <>
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={startImport} disabled={!file || parsing || !!error} className="btn-primary">Start import</button>
          </>
        )}
      </div>
    </Modal>
  );
}
