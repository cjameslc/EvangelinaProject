"use client";

import { useState } from "react";
import { ChevronDownIcon, CheckIcon } from "@/components/ui/Icons";
import { Tag } from "@/components/ui/Tag";
import { PhotoCapture } from "@/components/housekeeping/PhotoCapture";
import { cn } from "@/lib/utils";
import { formatUnitDisplay } from "@/lib/format";

type Unit = { id: string; name: string; shortName: string; unitNumber: string; owners?: { user: { name: string } }[] };
type HkState = { id?: string; unitId: string; status: string; byName: string | null; checked?: boolean[][]; photoUrls?: string[] };
type ChecklistGroup = { name: string; optional?: boolean; items: string[] };

export function RoomCard({
  unit, state, canEdit, currentUserName, onChange, checklistGroups, pendingBookingId, hasAnyCheckoutToday,
}: {
  unit: Unit;
  state: HkState | undefined;
  canEdit: boolean;
  currentUserName: string;
  onChange: (unitId: string, patch: any) => Promise<void>;
  checklistGroups: ChecklistGroup[];
  /** The specific booking whose checkout still needs cleaning today, earliest first — null if nothing's left to address. */
  pendingBookingId: string | null;
  /** Whether this unit has any checkout at all today (even if every one of them's already been cleaned for). */
  hasAnyCheckoutToday: boolean;
}) {
  const [openGroup, setOpenGroup] = useState<number | null>(0);
  const rawStatus = state?.status ?? "todo";
  // Untouched + nothing ever scheduled today defaults to Clean, not To
  // clean — a room only actually needs cleaning once a guest has checked
  // out of it. Distinct from "genuinely finished" below: that also shows
  // Clean, but only after real work (so Reset has something to undo).
  const isDefaultClean = rawStatus === "todo" && !hasAnyCheckoutToday;
  // A unit can have more than one checkout in a day (e.g. a Daycation guest
  // leaving in the evening plus a separate Night booking leaving that same
  // day) — pendingBookingId is whichever of today's checkouts hasn't been
  // cleaned for yet. If one exists, this room isn't done for the day even
  // if the *last* clean (for a different, already-finished checkout) left
  // the raw status at "clean".
  const status = pendingBookingId ? (rawStatus === "cleaning" ? "cleaning" : "todo") : isDefaultClean ? "clean" : rawStatus;
  const genuinelyFinished = !pendingBookingId && !isDefaultClean;

  const checkedGrid = state?.checked ?? [];
  const photoUrls = state?.photoUrls ?? [];
  function isChecked(gi: number, ii: number) {
    return !!checkedGrid[gi]?.[ii];
  }
  function toggleCheck(gi: number, ii: number) {
    const next = checklistGroups.map((g, gIdx) => g.items.map((_, iIdx) => (gIdx === gi && iIdx === ii ? !isChecked(gi, ii) : isChecked(gIdx, iIdx))));
    onChange(unit.id, { checked: next });
  }

  function start() {
    onChange(unit.id, { status: "cleaning", byName: currentUserName, start: true, bookingId: pendingBookingId });
  }
  function finish() {
    onChange(unit.id, { status: "clean", end: true, bookingId: pendingBookingId });
  }
  function reset() {
    onChange(unit.id, { status: "todo", bookingId: null });
  }

  return (
    <div className={cn("card flex flex-col gap-3 p-4", status === "cleaning" && "border-teal/50", status === "todo" && "border-amber/40")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[14.5px] font-extrabold leading-tight">{formatUnitDisplay(unit.unitNumber, unit.shortName)}</h3>
          <div className="text-[11px] text-[var(--gray)]">Owner: {unit.owners?.length ? unit.owners.map((o) => o.user.name).join(", ") : "Owner/Admin"}</div>
        </div>
        <Tag variant={status}>{status === "todo" ? "To clean" : status === "cleaning" ? "Cleaning" : "Clean"}</Tag>
      </div>

      {status === "clean" ? (
        <div className="flex items-center gap-2">
          <p className="text-[12.5px] font-semibold text-[var(--gray)]">
            {isDefaultClean ? "Nothing scheduled — the checklist opens once a guest checks out." : "Cleaned — checklist cleared."}
          </p>
          {canEdit && genuinelyFinished && <button onClick={reset} className="btn-sm btn-ghost ml-auto flex-none">Reset</button>}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {canEdit && status === "todo" && <button onClick={start} className="btn-sm btn-primary ml-auto">Start cleaning</button>}
            {canEdit && status === "cleaning" && <button onClick={finish} className="btn-sm ml-auto" style={{ background: "#0B7C74", borderColor: "#0B7C74", color: "#fff" }}>Mark clean</button>}
          </div>

          <div className="flex flex-col gap-1.5">
            {checklistGroups.map((g, gi) => {
              const open = openGroup === gi;
              const doneCount = g.items.filter((_, ii) => isChecked(gi, ii)).length;
              return (
                <div key={g.name} className="rounded-xl border border-[var(--line)] overflow-hidden">
                  <button onClick={() => setOpenGroup(open ? null : gi)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-extrabold">
                    {g.name}
                    {g.optional && <span className="rounded-full bg-[var(--bg-2)] px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-[var(--gray)]">optional</span>}
                    <span className={cn("ml-auto text-[12px] font-semibold", doneCount === g.items.length ? "text-teal" : "text-[var(--gray)]")}>
                      {doneCount}/{g.items.length}
                    </span>
                    <ChevronDownIcon className={cn("h-3.5 w-3.5 flex-none text-[var(--gray)] transition-transform", open && "rotate-180")} />
                  </button>
                  {open && (
                    <div className="space-y-0.5 p-1.5 pt-0">
                      {g.items.map((item, ii) => {
                        const on = isChecked(gi, ii);
                        return (
                          <button
                            key={ii}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => toggleCheck(gi, ii)}
                            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)] disabled:cursor-default disabled:hover:bg-transparent"
                          >
                            <span className={cn("grid h-4 w-4 flex-none place-items-center rounded border", on ? "border-teal bg-teal text-white" : "border-[var(--line-2)]")}>
                              {on && <CheckIcon className="h-3 w-3" />}
                            </span>
                            <span className={cn(on && "text-[var(--gray)] line-through")}>{item}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {status === "cleaning" && (
            <div>
              <p className="mb-1.5 text-[12px] font-bold text-[var(--gray)]">Photos</p>
              <PhotoCapture unitId={unit.id} photoUrls={photoUrls} onChange={(urls) => onChange(unit.id, { photoUrls: urls })} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
