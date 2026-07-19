"use client";

import { useState } from "react";
import { CheckIcon, ChevronDownIcon } from "@/components/ui/Icons";
import { Tag } from "@/components/ui/Tag";
import { cn } from "@/lib/utils";

type Unit = { id: string; name: string; shortName: string; unitNumber: string; owners?: { user: { name: string } }[] };
type HkState = { id?: string; unitId: string; status: string; byName: string | null; checked: boolean[][] };
type ChecklistGroup = { name: string; optional?: boolean; items: string[] };

export function RoomCard({
  unit, state, canEdit, currentUserName, onChange, checklistGroups, hasSchedule,
}: {
  unit: Unit;
  state: HkState | undefined;
  canEdit: boolean;
  currentUserName: string;
  onChange: (unitId: string, patch: any) => Promise<void>;
  checklistGroups: ChecklistGroup[];
  /** Whether a guest is actually checking out of this unit today — with nothing scheduled, there's nothing to clean yet. */
  hasSchedule: boolean;
}) {
  const [openGroup, setOpenGroup] = useState<number | null>(0);
  const checked: boolean[][] = state?.checked?.length ? state.checked : checklistGroups.map((g) => g.items.map(() => false));
  const rawStatus = state?.status ?? "todo";
  // Untouched + nothing scheduled today defaults to Clean, not To clean —
  // a room only actually needs cleaning once a guest has checked out of it.
  const isDefaultClean = rawStatus === "todo" && !hasSchedule;
  const status = isDefaultClean ? "clean" : rawStatus;

  const required = checklistGroups.reduce((acc, g) => (g.optional ? acc : acc + g.items.length), 0);
  const done = checklistGroups.reduce((acc, g, gi) => (g.optional ? acc : acc + (checked[gi]?.filter(Boolean).length ?? 0)), 0);
  const pct = required ? Math.round((done / required) * 100) : 0;

  function toggleItem(gi: number, ii: number) {
    if (!canEdit) return;
    const next = checked.map((row) => [...row]);
    next[gi][ii] = !next[gi][ii];
    onChange(unit.id, { checked: next });
  }

  function start() {
    onChange(unit.id, { status: "cleaning", byName: currentUserName, start: true });
  }
  function finish() {
    onChange(unit.id, { status: "clean", end: true });
  }
  function reset() {
    onChange(unit.id, { status: "todo", checked: checklistGroups.map((g) => g.items.map(() => false)) });
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
        <p className="text-[12.5px] font-semibold text-[var(--gray)]">Nothing scheduled — checklist opens once a guest checks out.</p>
      ) : (
        <>
          <div className="h-[7px] overflow-hidden rounded-full bg-[var(--bg-2)]">
            <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--gray)]">
            <span className="mr-auto">{done}/{required} required steps</span>
            {canEdit && status === "todo" && <button onClick={start} className="btn-sm btn-primary">Start cleaning</button>}
            {canEdit && status === "cleaning" && <button onClick={finish} className="btn-sm" style={{ background: "#0B7C74", borderColor: "#0B7C74", color: "#fff" }}>Mark clean</button>}
            {canEdit && status === "clean" && <button onClick={reset} className="btn-sm btn-ghost">Reset</button>}
          </div>

          <div className="flex flex-col gap-1.5">
        {checklistGroups.map((g, gi) => {
          const gDone = checked[gi]?.filter(Boolean).length ?? 0;
          const open = openGroup === gi;
          return (
            <div key={g.name} className="rounded-xl border border-[var(--line)] overflow-hidden">
              <button onClick={() => setOpenGroup(open ? null : gi)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-extrabold">
                {g.name}
                {g.optional && <span className="rounded-full bg-[var(--bg-2)] px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-[var(--gray)]">optional</span>}
                <span className={cn("ml-auto text-[12px] font-extrabold", gDone === g.items.length && "text-green")}>{gDone}/{g.items.length}</span>
                <ChevronDownIcon className={cn("h-3.5 w-3.5 flex-none text-[var(--gray)] transition-transform", open && "rotate-180")} />
              </button>
              {open && (
                <div className="space-y-0.5 p-1.5 pt-0">
                  {g.items.map((item, ii) => {
                    const isDone = !!checked[gi]?.[ii];
                    return (
                      <button key={ii} onClick={() => toggleItem(gi, ii)} disabled={!canEdit} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] font-semibold hover:bg-[var(--bg-2)]", isDone && "text-[var(--gray)] line-through")}>
                        <span className={cn("grid h-[20px] w-[20px] flex-none place-items-center rounded-md border-2 border-[var(--line-2)]", isDone && "border-teal bg-teal")}>
                          {isDone && <CheckIcon className="h-3 w-3 text-white" />}
                        </span>
                        {item}
                      </button>
                    );
                  })}
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
