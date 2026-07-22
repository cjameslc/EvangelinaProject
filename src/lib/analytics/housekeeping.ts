export type CleaningLogRow = {
  unitId: string;
  employeeId: string | null;
  startedAt: string | Date;
  endedAt: string | Date | null;
};

export type CleaningStats = { completed: number; pending: number; avgDurationMinutes: number };

/** Completed = has both a start and end; pending = started but not yet finished. */
export function cleaningStats(logs: CleaningLogRow[]): CleaningStats {
  const completed = logs.filter((l) => l.endedAt);
  const pending = logs.filter((l) => !l.endedAt);
  const totalMinutes = completed.reduce((s, l) => s + (new Date(l.endedAt as any).getTime() - new Date(l.startedAt).getTime()) / 60000, 0);
  return {
    completed: completed.length,
    pending: pending.length,
    avgDurationMinutes: completed.length > 0 ? Math.round(totalMinutes / completed.length) : 0,
  };
}

export type CleanerPerformanceRow = { employeeId: string; name: string; completedCount: number; avgDurationMinutes: number };

export function cleanerPerformance(logs: CleaningLogRow[], employees: { id: string; name: string }[]): CleanerPerformanceRow[] {
  const nameById = new Map(employees.map((e) => [e.id, e.name]));
  const byEmployee = new Map<string, { totalMinutes: number; count: number }>();
  for (const l of logs) {
    if (!l.employeeId || !l.endedAt) continue;
    const entry = byEmployee.get(l.employeeId) ?? { totalMinutes: 0, count: 0 };
    entry.totalMinutes += (new Date(l.endedAt).getTime() - new Date(l.startedAt).getTime()) / 60000;
    entry.count += 1;
    byEmployee.set(l.employeeId, entry);
  }
  return [...byEmployee.entries()]
    .map(([employeeId, v]) => ({
      employeeId,
      name: nameById.get(employeeId) ?? "Unknown",
      completedCount: v.count,
      avgDurationMinutes: Math.round(v.totalMinutes / v.count),
    }))
    .sort((a, b) => b.completedCount - a.completedCount);
}

export type HkStateRow = { unitId: string; status: string; startedAt: string | Date | null };

/** Units that have been mid-clean for longer than the threshold — the same "quick clean"-style attention signal Dashboard already surfaces, generalized to a configurable threshold instead of one hardcoded case. */
export function delayedCleanings(states: HkStateRow[], thresholdMinutes: number, now: Date = new Date()): { unitId: string; minutesElapsed: number }[] {
  return states
    .filter((s) => s.status === "cleaning" && s.startedAt)
    .map((s) => ({ unitId: s.unitId, minutesElapsed: Math.round((now.getTime() - new Date(s.startedAt as any).getTime()) / 60000) }))
    .filter((s) => s.minutesElapsed > thresholdMinutes)
    .sort((a, b) => b.minutesElapsed - a.minutesElapsed);
}

/** Snapshot of current room-readiness across the portfolio — a "right now" figure, same reasoning as Financial's Pending Expenses (housekeeping status isn't a period-scoped concept, a room is either ready now or it isn't). */
export function roomsReadySnapshot(states: { status: string }[]): { clean: number; cleaning: number; todo: number } {
  return {
    clean: states.filter((s) => s.status === "clean").length,
    cleaning: states.filter((s) => s.status === "cleaning").length,
    todo: states.filter((s) => s.status === "todo").length,
  };
}
