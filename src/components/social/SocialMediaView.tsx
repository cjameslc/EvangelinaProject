"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeMonthAvailability, type DayAvailability } from "@/lib/socialAvailability";
import {
  computeUnitOpportunities, computeMarketingSuggestions, isoRange, type UnitOpportunity,
} from "@/lib/socialOpportunity";
import {
  CAPTION_CATEGORIES, CAPTION_TEMPLATES, HASHTAG_BASE, buildHashtags, fillTemplate,
} from "@/lib/socialContent";
import { GRAPHIC_FORMATS, drawAvailabilityGraphic, loadImage, downloadCanvas } from "@/lib/socialGraphic";
import { STAY_TYPES } from "@/lib/constants";
import { formatUnitDisplay, peso } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import type { RateTable } from "@/lib/pricing/rates";
import { UnitOpportunityCard, type ViewMode } from "@/components/social/UnitOpportunityCard";
import { ContentGeneratorPanel, type GeneratorUnitContext } from "@/components/social/ContentGeneratorPanel";
import { CheatSheetTab } from "@/components/social/CheatSheetTab";
import {
  CopyIcon, SparkleIcon, DownloadIcon, FilePdfIcon, FileSpreadsheetIcon, ArrowLeftIcon, ArrowRightIcon, ImageIcon, MegaphoneIcon,
  GridIcon, MenuIcon, CalendarIcon,
} from "@/components/ui/Icons";

type Unit = { id: string; name: string; unitNumber: string; shortName: string; photoUrl: string | null; nightlyRate: number; wifiSsid: string | null; wifiPassword: string | null; doorCode: string | null };
type Booking = { unitId: string; date: string; checkOutDate: string | null; stayType: string; checkInTime: string | null; checkOutTime: string | null };

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthLabel(year: number, month0: number) {
  return new Date(Date.UTC(year, month0, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
function isoOf(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(iso: string, n: number) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); }

/** Collapses a run of consecutive non-full days into human-friendly ranges, e.g. "Aug 3", "Aug 5-7". */
function summarizeDates(days: DayAvailability[], includePartial: boolean): string[] {
  const eligible = days.filter((d) => d.status === "available" || (includePartial && d.status === "partial"));
  const out: string[] = [];
  let i = 0;
  while (i < eligible.length) {
    let j = i;
    while (
      j + 1 < eligible.length &&
      new Date(eligible[j + 1].iso).getTime() - new Date(eligible[j].iso).getTime() === 86400000
    ) j++;
    const startD = new Date(`${eligible[i].iso}T00:00:00Z`);
    const endD = new Date(`${eligible[j].iso}T00:00:00Z`);
    const fmt = (d: Date, withDay = true) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: withDay ? "short" : undefined, timeZone: "UTC" });
    out.push(i === j ? fmt(startD) : `${fmt(startD, false)}-${endD.getUTCDate()}`);
    i = j + 1;
  }
  return out;
}

type QuickFilterKey = "today" | "tomorrow" | "weekend" | "week" | "nextWeek" | "month" | "custom";
const QUICK_FILTERS: { key: QuickFilterKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "weekend", label: "This Weekend" },
  { key: "week", label: "This Week" },
  { key: "nextWeek", label: "Next Week" },
  { key: "month", label: "This Month" },
  { key: "custom", label: "Custom Range" },
];

function quickFilterRange(key: QuickFilterKey, todayIso: string, customStart: string, customEnd: string): { start: string; end: string } {
  const today = new Date(`${todayIso}T00:00:00Z`);
  const dow = today.getUTCDay(); // 0=Sun..6=Sat
  switch (key) {
    case "today": return { start: todayIso, end: todayIso };
    case "tomorrow": { const t = addDays(todayIso, 1); return { start: t, end: t }; }
    case "weekend": {
      const satOffset = (6 - dow + 7) % 7;
      const sat = addDays(todayIso, dow === 6 ? 0 : satOffset);
      const sun = addDays(sat, dow === 0 ? 0 : 1);
      return dow === 0 ? { start: todayIso, end: todayIso } : { start: sat, end: sun };
    }
    case "week": { const satOffset = (6 - dow + 7) % 7; return { start: todayIso, end: addDays(todayIso, satOffset) }; }
    case "nextWeek": { const satOffset = (6 - dow + 7) % 7; const nextSun = addDays(todayIso, satOffset + 1); return { start: nextSun, end: addDays(nextSun, 6) }; }
    case "month": { const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)); return { start: todayIso, end: isoOf(end) }; }
    case "custom": return { start: customStart || todayIso, end: customEnd || todayIso };
  }
}

export function SocialMediaView({
  units, bookings, businessName, location, contactPhone, messengerUsername, rates, dpFee, amenities,
}: {
  units: Unit[]; bookings: Booking[]; businessName: string; location: string;
  contactPhone: string | null; messengerUsername: string | null;
  rates: RateTable; dpFee: number; amenities: string[];
}) {
  const toast = useToast();
  const [tab, setTab] = useState<"dates" | "studio" | "captions" | "cheatsheet">("studio");

  const contact = contactPhone ? contactPhone : messengerUsername ? `m.me/${messengerUsername}` : "our page";
  const todayIso = useMemo(() => isoOf(new Date()), []);
  const bookingLink = typeof window !== "undefined" ? `${window.location.origin}/book` : "/book";
  const promoNote = rates.weekdayNightPromoPct > 0 ? `${rates.weekdayNightPromoPct}% off weekday night stays` : null;

  // ---- Content Studio tab state ----
  const [quickFilter, setQuickFilter] = useState<QuickFilterKey>("week");
  const [customStart, setCustomStart] = useState(todayIso);
  const [customEnd, setCustomEnd] = useState(addDays(todayIso, 6));
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const range = quickFilterRange(quickFilter, todayIso, customStart, customEnd);
  const studioDates = useMemo(() => isoRange(range.start, range.end), [range.start, range.end]);

  const opportunities: UnitOpportunity[] = useMemo(
    () => units.map((u) => computeUnitOpportunities(u.id, bookings, studioDates, rates, dpFee)),
    [units, bookings, studioDates, rates, dpFee]
  );
  const suggestions = useMemo(
    () => computeMarketingSuggestions(
      opportunities.map((o, i) => ({ unitId: o.unitId, unitLabel: formatUnitDisplay(units[i].unitNumber, units[i].shortName), days: o.days })),
      todayIso
    ),
    [opportunities, units, todayIso]
  );

  const [generatorUnit, setGeneratorUnit] = useState<{ unit: Unit; opportunity: UnitOpportunity } | null>(null);
  const [genericGeneratorOpen, setGenericGeneratorOpen] = useState(false);

  // ---- Available Dates tab state (month calendar + exports) ----
  const today = useMemo(() => new Date(), []);
  const [monthOffset, setMonthOffset] = useState(0);
  const anchor = new Date(Date.UTC(today.getFullYear(), today.getMonth() + monthOffset, 1));
  const year = anchor.getUTCFullYear();
  const month0 = anchor.getUTCMonth();
  const [unitFilter, setUnitFilter] = useState("all");
  const [stayTypeFilter, setStayTypeFilter] = useState("all");

  const scopedUnits = unitFilter === "all" ? units : units.filter((u) => u.id === unitFilter);
  const monthDays = useMemo(
    () => computeMonthAvailability(scopedUnits, bookings, year, month0, stayTypeFilter),
    [scopedUnits, bookings, year, month0, stayTypeFilter]
  );
  const firstWeekday = new Date(Date.UTC(year, month0, 1)).getUTCDay();

  const dateLines = useMemo(() => summarizeDates(monthDays, unitFilter !== "all"), [monthDays, unitFilter]);
  const availableCount = monthDays.filter((d) => d.status === "available").length;
  const partialCount = monthDays.filter((d) => d.status === "partial").length;
  const fullCount = monthDays.filter((d) => d.status === "full").length;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => { loadImage("/branding/logo.jpg").then(setLogoImg); }, []);
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  async function exportGraphic(formatKey: string) {
    const format = GRAPHIC_FORMATS.find((f) => f.key === formatKey);
    if (!format) return;
    setExportingKey(formatKey);
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvas.width = format.width;
    canvas.height = format.height;
    const headline = fullCount === monthDays.length ? `Fully booked this ${monthLabel(year, month0)}!` : `Available Dates for ${monthLabel(year, month0)}!`;
    drawAvailabilityGraphic(canvas, {
      headline,
      dateLines: dateLines.length ? dateLines : ["Message us for the latest availability"],
      ctaLine: `Message us to book — ${contact}`,
      businessName,
      location,
      logoImage: logoImg,
    });
    downloadCanvas(canvas, `${businessName.replace(/\s/g, "-").toLowerCase()}-${format.key}-${year}-${month0 + 1}.png`);
    setExportingKey(null);
  }

  const exportQuery = `month=${year}-${String(month0 + 1).padStart(2, "0")}&unitId=${unitFilter}&stayType=${stayTypeFilter}`;

  const studioRangeSummary = studioDates.length === 1
    ? new Date(`${studioDates[0]}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : `${new Date(`${studioDates[0]}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${new Date(`${studioDates[studioDates.length - 1]}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-9 sm:px-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-[28px] font-extrabold tracking-tight sm:text-[32px]">
          <MegaphoneIcon className="h-7 w-7 text-rausch" /> Social Media Center
        </h1>
        <p className="mt-1 text-[15px] text-[var(--gray)]">Real availability, ready-to-post graphics, and captions — for {businessName}.</p>
      </div>

      <div className="mb-5 inline-flex flex-wrap gap-1 rounded-full bg-[var(--bg-2)] p-1">
        <button onClick={() => setTab("studio")} className={cn("rounded-full px-4 py-2 text-[13.5px] font-bold transition", tab === "studio" ? "bg-[var(--card)] shadow-s" : "text-[var(--gray)]")}>
          Content Studio
        </button>
        <button onClick={() => setTab("dates")} className={cn("rounded-full px-4 py-2 text-[13.5px] font-bold transition", tab === "dates" ? "bg-[var(--card)] shadow-s" : "text-[var(--gray)]")}>
          Available Dates
        </button>
        <button onClick={() => setTab("captions")} className={cn("rounded-full px-4 py-2 text-[13.5px] font-bold transition", tab === "captions" ? "bg-[var(--card)] shadow-s" : "text-[var(--gray)]")}>
          Captions & Hashtags
        </button>
        <button onClick={() => setTab("cheatsheet")} className={cn("rounded-full px-4 py-2 text-[13.5px] font-bold transition", tab === "cheatsheet" ? "bg-[var(--card)] shadow-s" : "text-[var(--gray)]")}>
          Guest Reply Cheat Sheet
        </button>
      </div>

      {tab === "studio" && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_FILTERS.map((f) => (
              <button key={f.key} onClick={() => setQuickFilter(f.key)} className={cn("pill", quickFilter === f.key && "on")}>{f.label}</button>
            ))}
          </div>
          {quickFilter === "custom" && (
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="field-input w-auto" />
              <span className="text-[13px] text-[var(--gray)]">to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="field-input w-auto" />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-[var(--gray)]">Showing opportunities for <span className="font-extrabold text-[var(--ink)]">{studioRangeSummary}</span></p>
            <div className="inline-flex gap-1 rounded-full bg-[var(--bg-2)] p-1">
              {([["grid", GridIcon, "Grid"], ["tile", MenuIcon, "Tile"], ["story", CalendarIcon, "Story"], ["carousel", ArrowRightIcon, "Carousel"]] as const).map(([key, Icon, label]) => (
                <button key={key} onClick={() => setViewMode(key)} title={label} className={cn("grid h-8 w-8 place-items-center rounded-full transition", viewMode === key ? "bg-[var(--card)] shadow-s" : "text-[var(--gray)]")}>
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {suggestions.length > 0 && (
            <div className="rounded-2xl border border-violet/25 bg-violet/5 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[13px] font-extrabold text-violet"><SparkleIcon className="h-3.5 w-3.5" /> Marketing suggestions</p>
              <ul className="space-y-1">
                {suggestions.map((s, i) => <li key={i} className="text-[12.5px] text-[var(--ink)]">• {s}</li>)}
              </ul>
            </div>
          )}

          <div className={cn(
            viewMode === "carousel" ? "flex gap-3 overflow-x-auto pb-2" :
            viewMode === "story" ? "grid grid-cols-1 gap-3 sm:grid-cols-3" :
            "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          )}>
            {units.map((u, i) => (
              <UnitOpportunityCard
                key={u.id}
                unit={u}
                opportunity={opportunities[i]}
                todayIso={todayIso}
                mode={viewMode}
                onOpenGenerator={() => setGeneratorUnit({ unit: u, opportunity: opportunities[i] })}
              />
            ))}
          </div>
        </div>
      )}

      {tab === "dates" && (
        <div className="space-y-5">
          <div className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <button onClick={() => setMonthOffset((o) => o - 1)} className="btn-icon !h-9 !w-9" aria-label="Previous month"><ArrowLeftIcon className="h-4 w-4" /></button>
                <span className="min-w-[150px] text-center text-[16px] font-extrabold">{monthLabel(year, month0)}</span>
                <button onClick={() => setMonthOffset((o) => o + 1)} className="btn-icon !h-9 !w-9" aria-label="Next month"><ArrowRightIcon className="h-4 w-4" /></button>
                {monthOffset !== 0 && <button onClick={() => setMonthOffset(0)} className="btn-sm btn-ghost ml-1">This month</button>}
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="field-input w-auto">
                  <option value="all">All units</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{formatUnitDisplay(u.unitNumber, u.shortName)}</option>)}
                </select>
                <select value={stayTypeFilter} onChange={(e) => setStayTypeFilter(e.target.value)} className="field-input w-auto">
                  <option value="all">All stay types</option>
                  {Object.entries(STAY_TYPES).filter(([k]) => k !== "Cleaning" && k !== "Maintenance").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-4 text-[12.5px] font-semibold text-[var(--gray)]">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green" /> Available ({availableCount})</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber" /> Partially reserved ({partialCount})</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rausch" /> Fully booked ({fullCount})</span>
            </div>

            <div className="grid grid-cols-7 gap-1.5 text-center">
              {WEEKDAY_LABELS.map((w) => <div key={w} className="py-1 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">{w}</div>)}
              {Array.from({ length: firstWeekday }).map((_, i) => <div key={`pad-${i}`} />)}
              {monthDays.map((d) => {
                const dayNum = Number(d.iso.slice(8, 10));
                const isToday = d.iso === today.toISOString().slice(0, 10);
                return (
                  <div
                    key={d.iso}
                    title={`${d.availableUnitIds.length} of ${scopedUnits.length} unit${scopedUnits.length === 1 ? "" : "s"} open`}
                    className={cn(
                      "flex aspect-square flex-col items-center justify-center rounded-lg text-[13px] font-bold",
                      d.status === "available" ? "bg-green/15 text-green" : d.status === "partial" ? "bg-amber/15 text-amber" : "bg-rausch/15 text-rausch",
                      isToday && "ring-2 ring-[var(--ink)]"
                    )}
                  >
                    {dayNum}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-1 text-[15px] font-extrabold">Download ready-to-post graphics</h2>
            <p className="mb-4 text-[13px] text-[var(--gray)]">On-brand PNG images built from this month&rsquo;s real availability — no editing needed.</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {GRAPHIC_FORMATS.map((f) => (
                <button key={f.key} onClick={() => exportGraphic(f.key)} disabled={exportingKey === f.key} className="btn justify-center disabled:opacity-60">
                  <ImageIcon className="h-4 w-4" /> {exportingKey === f.key ? "Rendering…" : `${f.label} (${f.width}×${f.height})`}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2.5">
              <a href={`/api/social/export/pdf?${exportQuery}`} className="btn-sm btn"><FilePdfIcon className="h-3.5 w-3.5" /> Download PDF</a>
              <a href={`/api/social/export/xlsx?${exportQuery}`} className="btn-sm btn"><FileSpreadsheetIcon className="h-3.5 w-3.5" /> Download Excel</a>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      )}

      {tab === "captions" && (
        <CaptionsTab
          monthText={monthLabel(year, month0)}
          dateLines={dateLines}
          businessName={businessName}
          location={location}
          contact={contact}
          toast={toast}
          onOpenStudio={() => setGenericGeneratorOpen(true)}
        />
      )}

      {tab === "cheatsheet" && <CheatSheetTab units={units} toast={toast} />}

      <ContentGeneratorPanel
        open={!!generatorUnit}
        onClose={() => setGeneratorUnit(null)}
        unitContext={generatorUnit ? unitToGeneratorContext(generatorUnit.unit, generatorUnit.opportunity) : null}
        month={monthLabel(year, month0)}
        availableDatesSummary={dateLines.length ? dateLines.join(", ") : "fully booked this month"}
        businessName={businessName}
        location={location}
        contact={contact}
        amenities={amenities}
        promoNote={promoNote}
        bookingLink={bookingLink}
        toast={toast}
      />
      <ContentGeneratorPanel
        open={genericGeneratorOpen}
        onClose={() => setGenericGeneratorOpen(false)}
        unitContext={null}
        month={monthLabel(year, month0)}
        availableDatesSummary={dateLines.length ? dateLines.join(", ") : "fully booked this month"}
        businessName={businessName}
        location={location}
        contact={contact}
        amenities={amenities}
        promoNote={promoNote}
        bookingLink={bookingLink}
        toast={toast}
      />
    </div>
  );
}

function unitToGeneratorContext(unit: Unit, opportunity: UnitOpportunity): GeneratorUnitContext {
  const openIsos = opportunity.days.filter((d) => d.openStayTypes.length > 0).map((d) => d.iso);
  const cheapest = opportunity.days.flatMap((d) => Object.values(d.price)).filter((p): p is number => typeof p === "number");
  return {
    unitName: formatUnitDisplay(unit.unitNumber, unit.shortName),
    price: cheapest.length ? `From ${peso(Math.min(...cheapest))}` : null,
    dateLines: openIsos.map((iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })),
    hasPhoto: !!unit.photoUrl,
  };
}

function CaptionsTab({
  monthText, dateLines, businessName, location, contact, toast, onOpenStudio,
}: {
  monthText: string; dateLines: string[]; businessName: string; location: string; contact: string;
  toast: (msg: string, isError?: boolean) => void;
  onOpenStudio: () => void;
}) {
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  // "Available Dates" copy ("we've got open slots... 📅 {DATES}") only
  // makes sense when there's a real date to name — with nothing free this
  // month it would fill in the "fully booked" fallback and directly
  // contradict its own opening line. Excluded rather than shown broken;
  // the "Fully Booked"/"Last-Minute" categories are what actually fits.
  const noDatesAvailable = dateLines.length === 0;
  const filteredTemplates = CAPTION_TEMPLATES.filter((t) => {
    if (noDatesAvailable && t.categoryId === "available_dates") return false;
    if (category !== "all" && t.categoryId !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      const cat = CAPTION_CATEGORIES.find((c) => c.id === t.categoryId);
      const hay = `${t.headline} ${t.caption} ${cat?.label ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const availabilitySummary = dateLines.length ? dateLines.join(", ") : "fully booked this month";

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast(`Copied — ${label} ✓`),
      () => toast("Couldn't copy — select and copy manually.", true)
    );
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <SparkleIcon className="h-4 w-4 text-violet" />
          <h2 className="text-[15px] font-extrabold">Generate with AI</h2>
        </div>
        <p className="mb-3 text-[13px] text-[var(--gray)]">
          Open the content generator for platform-specific tone, style, and an AI image prompt — grounded in this month&rsquo;s real availability ({availabilitySummary}).
        </p>
        <button onClick={onOpenStudio} className="btn-primary">
          <SparkleIcon className="h-4 w-4" /> Open content generator
        </button>
      </div>

      {noDatesAvailable && (
        <p className="rounded-xl bg-amber/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-amber">
          No date this month has every unit free at once — &ldquo;Available Dates&rdquo; captions are hidden since they&rsquo;d contradict themselves. Try &ldquo;Fully Booked&rdquo; or &ldquo;Last-Minute Availability&rdquo; below, or check the Content Studio tab for per-unit opportunities.
        </p>
      )}

      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search captions…" className="field-input w-auto min-w-[200px] flex-1" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setCategory("all")} className={cn("pill", category === "all" && "on")}>
          All ({noDatesAvailable ? CAPTION_TEMPLATES.length - CAPTION_TEMPLATES.filter((t) => t.categoryId === "available_dates").length : CAPTION_TEMPLATES.length})
        </button>
        {CAPTION_CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => setCategory(c.id)} className={cn("pill", category === c.id && "on")}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {filteredTemplates.map((t) => {
          const vars = { MONTH: monthText, DATES: availabilitySummary, CONTACT: contact };
          const headline = fillTemplate(t.headline, vars);
          const caption = fillTemplate(t.caption, vars);
          const cta = fillTemplate(t.cta, vars);
          const hashtags = buildHashtags(t.categoryId, monthText, location);
          const full = `${headline}\n\n${caption}\n\n${cta}\n\n${hashtags.join(" ")}`;
          return (
            <div key={t.id} className="card p-4">
              <p className="font-extrabold">{headline}</p>
              <p className="mt-1.5 whitespace-pre-line text-[13px] text-[var(--gray)]">{caption}</p>
              <p className="mt-1.5 text-[13px] font-semibold">{cta}</p>
              <p className="mt-2 text-[11.5px] text-blue">{hashtags.join(" ")}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => copy(full, "caption")} className="btn-sm btn"><CopyIcon className="h-3.5 w-3.5" /> Copy all</button>
                <button onClick={() => copy(hashtags.join(" "), "hashtags")} className="btn-sm btn-ghost"><CopyIcon className="h-3.5 w-3.5" /> Copy hashtags</button>
              </div>
            </div>
          );
        })}
        {filteredTemplates.length === 0 && <p className="text-[13px] text-[var(--gray)]">No captions match — try a different search or category.</p>}
      </div>

      <div className="card p-5">
        <h2 className="mb-1 text-[15px] font-extrabold">Quick hashtag set</h2>
        <p className="mb-3 text-[13px] text-[var(--gray)]">General property + location tags, usable on any post.</p>
        <p className="text-[12.5px] text-blue">{[...HASHTAG_BASE, "#" + location.replace(/[^a-zA-Z0-9]/g, "")].join(" ")}</p>
        <button onClick={() => copy([...HASHTAG_BASE, "#" + location.replace(/[^a-zA-Z0-9]/g, "")].join(" "), "hashtags")} className="btn-sm btn mt-3">
          <CopyIcon className="h-3.5 w-3.5" /> Copy
        </button>
      </div>
    </div>
  );
}
