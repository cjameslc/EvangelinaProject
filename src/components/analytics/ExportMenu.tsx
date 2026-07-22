"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { DownloadIcon, FileSpreadsheetIcon, FilePdfIcon } from "@/components/ui/Icons";

export function ExportMenu() {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  function exportUrl(format: "csv" | "xlsx" | "pdf") {
    return `/api/analytics/export/${format}?${searchParams.toString()}`;
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn btn-sm flex items-center gap-1.5">
        <DownloadIcon className="h-3.5 w-3.5" /> Export
      </button>
      {open && (
        <div className="absolute right-0 top-[38px] z-10 w-44 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-card">
          <a href={exportUrl("pdf")} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)]">
            <FilePdfIcon className="h-4 w-4" /> PDF
          </a>
          <a href={exportUrl("xlsx")} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)]">
            <FileSpreadsheetIcon className="h-4 w-4" /> Excel (.xlsx)
          </a>
          <a href={exportUrl("csv")} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)]">
            <FileSpreadsheetIcon className="h-4 w-4" /> CSV
          </a>
        </div>
      )}
    </div>
  );
}
