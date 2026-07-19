"use client";

import { useState } from "react";
import { ChevronDownIcon } from "@/components/ui/Icons";
import { Tag } from "@/components/ui/Tag";
import { cn } from "@/lib/utils";

type Unit = { id: string; name: string; shortName: string; unitNumber: string; owners?: { user: { name: string } }[] };
type HkState = { id?: string; unitId: string; status: string; byName: string | null };
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
          <h3 className="text-[14.5px] font-extrabold leading-tight">{unit.shortName}</h3>
          <div className="mt-0.5 text-[12px] text-[var(--gray)]">Unit {unit.unitNumber}</div>
          <div className="text-[11px] text-[var(--gray)]">Owner: {unit.owners?.length ? unit.owners.map((o) => o.user.name).join(", ") : "Owner/Admin"}</div>
        </div>
        <Tag variant={status}>{status === "todo" ? "To clean" : status === "cleaning" ? "Cleaning" : "Clean"}</Tag>
      </div>

      {isDefaultClean ? (
        <p className="text-[12.5px] font-semibold text-[var(--gray)]">Nothing scheduled — the checklist opens once a guest checks out.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {canEdit && status === "todo" && <button onClick={start} className="btn-sm btn-primary ml-auto">Start cleaning</button>}
            {canEdit && status === "cleaning" && <button onClick={finish} className="btn-sm ml-auto" style={{ background: "#0B7C74", borderColor: "#0B7C74", color: "#fff" }}>Mark clean</button>}
            {canEdit && genuinelyFinished && <button onClick={reset} className="btn-sm btn-ghost ml-auto">Reset</button>}
          </div>

          <div className="flex flex-col gap-1.5">
            {checklistGroups.map((g, gi) => {
              const open = openGroup === gi;
              return (
                <div key={g.name} className="rounded-xl border border-[var(--line)] overflow-hidden">
                  <button onClick={() => setOpenGroup(open ? null : gi)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-extrabold">
                    {g.name}
                    {g.optional && <span className="rounded-full bg-[var(--bg-2)] px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-[var(--gray)]">optional</span>}
                    <span className="ml-auto text-[12px] font-semibold text-[var(--gray)]">{g.items.length}</span>
                    <ChevronDownIcon className={cn("h-3.5 w-3.5 flex-none text-[var(--gray)] transition-transform", open && "rotate-180")} />
                  </button>
                  {open && (
                    <div className="space-y-0.5 p-1.5 pt-0">
                      {g.items.map((item, ii) => (
                        <div key={ii} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-semibold text-[var(--ink)]">
                          <span className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--line-2)]" />
                          {item}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
