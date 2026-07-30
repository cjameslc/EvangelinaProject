"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { fmtDate, unitLabel, manilaDayStart } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { Pagination } from "@/components/ui/Pagination";
import { UploadIcon, DownloadIcon, EditIcon, AlertIcon } from "@/components/ui/Icons";

type Unit = { id: string; name: string; shortName: string; unitNumber: string };
type Employee = { id: string; name: string; role: string };
type FindingCategory = "Cleaning" | "Laundry" | "Booking" | "Irregularity" | "Comms" | "GuestExp" | "Improvement";
type FindingSeverity = "Critical" | "Warning" | "Minor" | "Positive";
type Finding = {
  id: string; auditorName: string; reviewDate: string;
  unit: Unit | null; employee: Employee | null;
  category: FindingCategory; severity: FindingSeverity;
  title: string; notes: string | null; recommendedAction: string | null;
  cleaningScore: number | null; laundryScore: number | null; bookerScore: number | null;
  overallStars: number | null; followUpNeeded: boolean; photoUrl: string | null;
  resolved: boolean; resolvedAt: string | null; createdAt: string;
};

const CATEGORY_META: Record<FindingCategory, { label: string; icon: string }> = {
  Cleaning: { label: "Cleaning", icon: "🧹" },
  Laundry: { label: "Laundry", icon: "👕" },
  Booking: { label: "Booking", icon: "📋" },
  Irregularity: { label: "Irregularity", icon: "⚠️" },
  Comms: { label: "Comms", icon: "💬" },
  GuestExp: { label: "Guest exp.", icon: "⭐" },
  Improvement: { label: "Improvement", icon: "💡" },
};
const CATEGORY_ORDER = Object.keys(CATEGORY_META) as FindingCategory[];

const SEVERITY_META: Record<FindingSeverity, { label: string; short: string; textClass: string; bgClass: string; dotClass: string }> = {
  Critical: { label: "Critical — needs immediate action", short: "Critical", textClass: "text-rausch", bgClass: "bg-rausch/10 border-rausch/30", dotClass: "bg-rausch" },
  Warning: { label: "Warning — monitor closely", short: "Warning", textClass: "text-amber", bgClass: "bg-amber/10 border-amber/30", dotClass: "bg-amber" },
  Minor: { label: "Minor — note for improvement", short: "Minor", textClass: "text-blue", bgClass: "bg-blue/10 border-blue/30", dotClass: "bg-blue" },
  Positive: { label: "Positive — commendation", short: "Positive", textClass: "text-green", bgClass: "bg-green/10 border-green/30", dotClass: "bg-green" },
};
const SEVERITY_ORDER = Object.keys(SEVERITY_META) as FindingSeverity[];

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const EMPTY_FORM = {
  id: null as string | null,
  auditorName: "",
  reviewDate: manilaDayStart().toISOString().slice(0, 10),
  unitId: "",
  employeeId: "",
  category: "Cleaning" as FindingCategory,
  severity: "Warning" as FindingSeverity,
  title: "",
  notes: "",
  recommendedAction: "",
  cleaningScore: null as number | null,
  laundryScore: null as number | null,
  bookerScore: null as number | null,
  overallStars: null as number | null,
  followUpNeeded: false,
  photoUrl: null as string | null,
};

export function AuditorView({
  units, employees, initialFindings,
}: {
  units: Unit[]; employees: Employee[]; initialFindings: Finding[];
}) {
  const toast = useToast();
  const { data: session } = useSession();
  const [findings, setFindings] = useState(initialFindings);
  const [form, setForm] = useState({ ...EMPTY_FORM, auditorName: session?.user?.name ?? "" });
  const [saving, setSaving] = useState(false);
  const editing = form.id !== null;

  // useSession() resolves asynchronously — on first mount session.user.name
  // may not be ready yet, which would otherwise leave this read-only field
  // permanently blank. Keep it in sync once the session loads, but only
  // while creating a new finding (never overwrite an existing finding's
  // original author while editing it).
  useEffect(() => {
    if (!editing && session?.user?.name) {
      setForm((f) => (f.auditorName ? f : { ...f, auditorName: session.user.name }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, editing]);

  const [statusFilter, setStatusFilter] = useState<"All" | "Open" | "Resolved">("All");
  const [categoryFilter, setCategoryFilter] = useState<"All" | FindingCategory>("All");
  const [auditorFilter, setAuditorFilter] = useState("All");

  const auditorNames = useMemo(() => [...new Set(findings.map((f) => f.auditorName))].sort(), [findings]);

  async function refresh() {
    const res = await fetch("/api/auditor-findings");
    if (res.ok) setFindings(await res.json());
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM, auditorName: session?.user?.name ?? "" });
  }

  function startEdit(f: Finding) {
    setForm({
      id: f.id,
      auditorName: f.auditorName,
      reviewDate: f.reviewDate.slice(0, 10),
      unitId: f.unit?.id ?? "",
      employeeId: f.employee?.id ?? "",
      category: f.category,
      severity: f.severity,
      title: f.title,
      notes: f.notes ?? "",
      recommendedAction: f.recommendedAction ?? "",
      cleaningScore: f.cleaningScore,
      laundryScore: f.laundryScore,
      bookerScore: f.bookerScore,
      overallStars: f.overallStars,
      followUpNeeded: f.followUpNeeded,
      photoUrl: f.photoUrl,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast("Photo is too large (max 4MB)", true); return; }
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/auditor-findings/photo", { method: "POST", body });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast(j.error ?? "Couldn't upload photo", true); return; }
    setForm((f) => ({ ...f, photoUrl: j.url }));
  }

  async function submit() {
    if (!form.auditorName.trim()) { toast("Enter the auditor's name", true); return; }
    if (!form.reviewDate) { toast("Pick a review date", true); return; }
    if (!form.title.trim()) { toast("Enter a finding title", true); return; }
    setSaving(true);
    const payload = {
      auditorName: form.auditorName,
      reviewDate: form.reviewDate,
      unitId: form.unitId || null,
      employeeId: form.employeeId || null,
      category: form.category,
      severity: form.severity,
      title: form.title,
      notes: form.notes || null,
      recommendedAction: form.recommendedAction || null,
      cleaningScore: form.cleaningScore,
      laundryScore: form.laundryScore,
      bookerScore: form.bookerScore,
      overallStars: form.overallStars,
      followUpNeeded: form.followUpNeeded,
      photoUrl: form.photoUrl,
    };
    const res = await fetch(editing ? `/api/auditor-findings/${form.id}` : "/api/auditor-findings", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { toast(j.error ?? "Couldn't save finding", true); return; }
    toast(editing ? "Finding updated ✓" : "Finding submitted ✓");
    resetForm();
    refresh();
  }

  async function toggleResolved(f: Finding) {
    const res = await fetch(`/api/auditor-findings/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: !f.resolved }),
    });
    if (!res.ok) { toast("Couldn't update finding", true); return; }
    toast(f.resolved ? "Reopened" : "Marked resolved ✓");
    refresh();
  }

  async function toggleFollowUp(f: Finding) {
    const res = await fetch(`/api/auditor-findings/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followUpNeeded: !f.followUpNeeded }),
    });
    if (!res.ok) { toast("Couldn't update finding", true); return; }
    refresh();
  }

  function exportCsv() {
    const lines: string[] = ["Date,Auditor,Unit,Employee,Category,Severity,Title,Notes,Recommended action,Cleaning,Laundry,Booker,Stars,Status"];
    filteredFindings.forEach((f) => {
      lines.push(
        [
          fmtDate(f.reviewDate, { month: "short", day: "numeric", year: "numeric" }),
          f.auditorName,
          f.unit?.shortName ?? "All units",
          f.employee?.name ?? "General",
          CATEGORY_META[f.category].label,
          SEVERITY_META[f.severity].short,
          f.title,
          f.notes ?? "",
          f.recommendedAction ?? "",
          f.cleaningScore ?? "",
          f.laundryScore ?? "",
          f.bookerScore ?? "",
          f.overallStars ?? "",
          f.resolved ? "Resolved" : "Open",
        ]
          .map((v) => csvCell(String(v)))
          .join(",")
      );
    });
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, "auditor-findings.csv");
  }

  // ── Score summary ──
  function avgOf(key: "cleaningScore" | "laundryScore" | "bookerScore") {
    const vals = findings.map((f) => f[key]).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }
  const cleaningAvg = avgOf("cleaningScore");
  const laundryAvg = avgOf("laundryScore");
  const bookerAvg = avgOf("bookerScore");
  const nonZero = [cleaningAvg, laundryAvg, bookerAvg].filter((v) => v > 0);
  const overallComposite = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;

  // ── Sidebar: needs owner attention ──
  const needsAttention = useMemo(
    () =>
      findings
        .filter((f) => !f.resolved && (f.severity === "Critical" || f.severity === "Warning"))
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .slice(0, 6),
    [findings]
  );

  // ── Sidebar: findings by employee ──
  const byEmployee = useMemo(() => {
    const map = new Map<string, number>();
    findings.forEach((f) => {
      const key = f.employee?.name ?? "General";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    const max = Math.max(1, ...map.values());
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count, pct: Math.round((count / max) * 100) }));
  }, [findings]);

  // ── Sidebar: top issues flagged ──
  const topIssues = useMemo(() => {
    const map = new Map<FindingCategory, number>();
    findings.forEach((f) => map.set(f.category, (map.get(f.category) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [findings]);

  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (statusFilter === "Open" && f.resolved) return false;
      if (statusFilter === "Resolved" && !f.resolved) return false;
      if (categoryFilter !== "All" && f.category !== categoryFilter) return false;
      if (auditorFilter !== "All" && f.auditorName !== auditorFilter) return false;
      return true;
    });
  }, [findings, statusFilter, categoryFilter, auditorFilter]);

  const FINDINGS_PAGE_SIZE = 10;
  const [findingsPage, setFindingsPage] = useState(1);
  useEffect(() => setFindingsPage(1), [statusFilter, categoryFilter, auditorFilter]);
  const findingsPageCount = Math.max(1, Math.ceil(filteredFindings.length / FINDINGS_PAGE_SIZE));
  const pagedFindings = filteredFindings.slice((findingsPage - 1) * FINDINGS_PAGE_SIZE, findingsPage * FINDINGS_PAGE_SIZE);

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-9 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight sm:text-[30px]">Auditor Review</h1>
          <p className="mt-1 text-[14.5px] text-[var(--gray)]">Document findings, score performance, and flag issues for the owner — cleaning quality, laundry, bookings &amp; irregularities.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={auditorFilter} onChange={(e) => setAuditorFilter(e.target.value)} className="field-input w-auto">
            <option value="All">All auditors</option>
            {auditorNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button onClick={exportCsv} className="btn btn-sm"><DownloadIcon className="h-3.5 w-3.5" /> Export</button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ["Cleaning", cleaningAvg, "teal"],
          ["Laundry", laundryAvg, "violet"],
          ["Booker", bookerAvg, "blue"],
        ] as const).map(([label, val, color]) => (
          <div key={label} className="stat-card">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--gray)]">{label}</div>
            <div className="mt-1 text-[26px] font-extrabold" style={{ color: `var(--${color})` }}>{val.toFixed(1)}</div>
            <div className="text-[11.5px] text-[var(--gray)]">avg score / 10</div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg-2)]">
              <div className="h-full rounded-full" style={{ width: `${(val / 10) * 100}%`, background: `var(--${color})` }} />
            </div>
          </div>
        ))}
        <div className="stat-card">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Overall</div>
          <div className="mt-1 text-[26px] font-extrabold text-rausch">{overallComposite.toFixed(1)}</div>
          <div className="text-[11.5px] text-[var(--gray)]">composite / 10</div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg-2)]">
            <div className="h-full rounded-full bg-rausch" style={{ width: `${(overallComposite / 10) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-extrabold">{editing ? "Edit finding" : "New finding"}</h2>
            <div className="flex items-center gap-2">
              {editing && <span className="rounded-full bg-amber/10 px-2.5 py-1 text-[11px] font-extrabold text-amber">Editing</span>}
              <button onClick={resetForm} className="text-[13px] font-bold text-[var(--gray)] hover:text-[var(--ink)]">Clear</button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="field-label">Auditor</label>
                <input value={form.auditorName} readOnly disabled className="field-input mt-1.5 cursor-not-allowed opacity-70" title="Always the signed-in auditor — not editable" />
              </div>
              <div>
                <label className="field-label">Review date *</label>
                <input type="date" value={form.reviewDate} onChange={(e) => setForm((f) => ({ ...f, reviewDate: e.target.value }))} className="field-input mt-1.5" />
              </div>
              <div>
                <label className="field-label">Unit inspected</label>
                <select value={form.unitId} onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))} className="field-input mt-1.5">
                  <option value="">— All / General —</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{unitLabel(u)}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label">Employee flagged</label>
                <select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} className="field-input mt-1.5">
                  <option value="">— None / General —</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Category *</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {CATEGORY_ORDER.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, category: c }))}
                      className={cn("rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition", form.category === c ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]" : "border-[var(--line)] text-[var(--gray)] hover:border-[var(--ink)]")}
                    >
                      {CATEGORY_META[c].icon} {CATEGORY_META[c].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="field-label">Severity *</label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SEVERITY_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, severity: s }))}
                    className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition", form.severity === s ? SEVERITY_META[s].bgClass + " " + SEVERITY_META[s].textClass + " border-current" : "border-[var(--line)] text-[var(--gray)] hover:border-[var(--ink)]")}
                  >
                    <span className={cn("h-2 w-2 rounded-full", SEVERITY_META[s].dotClass)} />
                    {SEVERITY_META[s].label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="field-label">Finding title *</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="field-input mt-1.5" placeholder="e.g. Bathroom grout not cleaned in unit 1118" />
            </div>

            <div>
              <label className="field-label">Detailed notes &amp; observations</label>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} className="field-input mt-1.5" placeholder="Describe what was found, what standard was missed, and the impact on the guest experience…" />
            </div>

            <div>
              <label className="field-label">Recommended action for owner</label>
              <textarea value={form.recommendedAction} onChange={(e) => setForm((f) => ({ ...f, recommendedAction: e.target.value }))} rows={2} className="field-input mt-1.5" placeholder="e.g. Retrain on grout cleaning. Add to weekly deep-clean checklist." />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {([
                ["cleaningScore", "Cleaning score"],
                ["laundryScore", "Laundry score"],
                ["bookerScore", "Booker score"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="field-label">{label}</label>
                  <div className="mt-2 flex items-center gap-2.5">
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.5}
                      value={form[key] ?? 0}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: +e.target.value }))}
                      style={{ accentColor: "var(--rausch)" }}
                      className="w-full"
                    />
                    <span className="w-8 flex-none text-right text-[13px] font-extrabold">{form[key] ?? 0}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <label className="field-label">Overall star rating</label>
                <div className="mt-1.5 flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setForm((f) => ({ ...f, overallStars: f.overallStars === n ? null : n }))} className="text-2xl leading-none text-amber">
                      {form.overallStars && n <= form.overallStars ? "★" : "☆"}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-[13px] font-bold">
                <input type="checkbox" checked={form.followUpNeeded} onChange={(e) => setForm((f) => ({ ...f, followUpNeeded: e.target.checked }))} className="h-4 w-4" />
                Follow-up needed?
              </label>
            </div>

            <div>
              <label className="field-label">Photo evidence</label>
              <div className="mt-1.5 rounded-2xl border border-dashed border-[var(--line-2)] p-4">
                <input id="finding-photo" type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e.target.files?.[0])} />
                {!form.photoUrl ? (
                  <label htmlFor="finding-photo" className="flex cursor-pointer flex-col items-center gap-2 py-4 text-center text-[13px] font-semibold text-[var(--gray)]">
                    <UploadIcon className="h-6 w-6" />
                    Tap to add a photo of the issue
                  </label>
                ) : (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.photoUrl} alt="Finding evidence" className="max-h-48 w-full rounded-xl object-contain" />
                    <button onClick={() => setForm((f) => ({ ...f, photoUrl: null }))} className="btn-sm btn-ghost mt-2">Remove photo</button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--line)] pt-4">
              <p className="text-[12px] text-[var(--gray)]">All findings are saved and visible to the owner.</p>
              <div className="flex gap-2">
                {editing && <button onClick={resetForm} className="btn-ghost">Cancel</button>}
                <button onClick={submit} disabled={saving} className="btn-primary">{saving ? "Saving…" : editing ? "Save changes" : "Submit finding"}</button>
              </div>
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="card p-4">
            <h3 className="mb-3 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Needs owner attention</h3>
            {needsAttention.length === 0 ? (
              <p className="text-[12.5px] text-[var(--gray)]">Nothing flagged right now.</p>
            ) : (
              <div className="space-y-3">
                {needsAttention.map((f) => (
                  <div key={f.id} className="flex gap-2 border-t border-[var(--line)] pt-3 first:border-0 first:pt-0">
                    <span className={cn("mt-1 h-2 w-2 flex-none rounded-full", SEVERITY_META[f.severity].dotClass)} />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-bold leading-snug">{f.employee?.name ?? "General"} — {f.title}</div>
                      <div className="text-[11px] text-[var(--gray)]">{fmtDate(f.reviewDate, { month: "short", day: "numeric", year: "numeric" })} · {f.unit?.shortName ?? "All units"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Findings by employee</h3>
            {byEmployee.length === 0 ? (
              <p className="text-[12.5px] text-[var(--gray)]">No findings logged yet.</p>
            ) : (
              <div className="space-y-2.5">
                {byEmployee.map((e) => (
                  <div key={e.name}>
                    <div className="mb-1 flex items-center justify-between text-[12.5px] font-bold"><span>{e.name}</span><span className="text-[var(--gray)]">{e.count}</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-2)]"><div className="h-full rounded-full bg-rausch" style={{ width: `${e.pct}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Top issues flagged</h3>
            {topIssues.length === 0 ? (
              <p className="text-[12.5px] text-[var(--gray)]">No findings logged yet.</p>
            ) : (
              <div className="space-y-2">
                {topIssues.map(([cat, count]) => (
                  <div key={cat} className="flex items-center justify-between text-[12.5px]">
                    <span className="font-semibold">{CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}</span>
                    <span className="font-extrabold text-[var(--gray)]">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="mt-5 card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-extrabold">All findings</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex gap-1 rounded-full bg-[var(--bg-2)] p-1">
              {(["All", "Open", "Resolved"] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)} className={cn("rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition", statusFilter === s ? "bg-[var(--card)] shadow-s" : "text-[var(--gray)]")}>{s}</button>
              ))}
            </div>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as any)} className="field-input w-auto">
              <option value="All">All categories</option>
              {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
            </select>
          </div>
        </div>

        {filteredFindings.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-[var(--gray)]">No findings match these filters.</p>
        ) : (
          <div className="space-y-3">
            {pagedFindings.map((f) => (
              <div key={f.id} className={cn("rounded-2xl border p-4", f.resolved ? "border-[var(--line)] opacity-70" : SEVERITY_META[f.severity].bgClass)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className={cn("mt-1.5 h-2.5 w-2.5 flex-none rounded-full", SEVERITY_META[f.severity].dotClass)} />
                    <div>
                      <div className="text-[14px] font-extrabold">{f.title}</div>
                      <div className="text-[11.5px] text-[var(--gray)]">{fmtDate(f.reviewDate, { month: "short", day: "numeric", year: "numeric" })} · {f.auditorName}</div>
                    </div>
                  </div>
                  {f.resolved && <span className="rounded-full bg-green/10 px-2.5 py-1 text-[10.5px] font-extrabold text-green">Resolved</span>}
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--gray)]">{CATEGORY_META[f.category].icon} {CATEGORY_META[f.category].label}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", SEVERITY_META[f.severity].bgClass, SEVERITY_META[f.severity].textClass)}>{SEVERITY_META[f.severity].short}</span>
                  {f.unit && <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--gray)]">{f.unit.shortName}</span>}
                  {f.employee && <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[10.5px] font-bold text-teal">{f.employee.name}</span>}
                  {f.followUpNeeded && <span className="rounded-full bg-amber/10 px-2 py-0.5 text-[10.5px] font-bold text-amber">Follow-up needed</span>}
                </div>

                {f.notes && <p className="mt-2.5 text-[13px] text-[var(--ink)]">{f.notes}</p>}
                {f.recommendedAction && <p className="mt-1.5 text-[13px] font-semibold text-amber">→ {f.recommendedAction}</p>}

                {f.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.photoUrl} alt="Finding evidence" className="mt-2.5 max-h-40 rounded-xl object-cover" />
                )}

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {f.cleaningScore != null && <span className="text-[12px] font-bold text-[var(--gray)]">🧹 {f.cleaningScore}</span>}
                  {f.laundryScore != null && <span className="text-[12px] font-bold text-[var(--gray)]">👕 {f.laundryScore}</span>}
                  {f.bookerScore != null && <span className="text-[12px] font-bold text-[var(--gray)]">📋 {f.bookerScore}</span>}
                  {f.overallStars != null && <span className="text-[13px] text-amber">{"★".repeat(f.overallStars)}{"☆".repeat(5 - f.overallStars)}</span>}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
                  <button onClick={() => toggleResolved(f)} className="btn-sm btn-ghost">{f.resolved ? "Reopen" : "Mark resolved"}</button>
                  <button onClick={() => startEdit(f)} className="btn-sm btn-ghost"><EditIcon className="h-3.5 w-3.5" /> Edit</button>
                  {f.followUpNeeded && (
                    <button onClick={() => toggleFollowUp(f)} className="btn-sm btn-ghost !text-amber"><AlertIcon className="h-3.5 w-3.5" /> Follow up this week</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <Pagination page={findingsPage} pageCount={findingsPageCount} onPageChange={setFindingsPage} totalLabel={`${filteredFindings.length} finding${filteredFindings.length !== 1 ? "s" : ""}`} />
      </div>
    </div>
  );
}
