import { manilaDayKey as dayOf } from "@/lib/analytics/period";
import type { Unit, Booking, HkState, StatusFilter } from "../types";

export function useUnitStatus({
  hkStates,
  bookingsWeek,
  todayIso,
}: {
  hkStates: HkState[];
  bookingsWeek: Booking[];
  todayIso: string;
}) {
  function unitStatus(unit: Unit) {
    const hk = hkStates.find((h) => h.unitId === unit.id);
    if (hk?.status === "cleaning") return { label: "Cleaning", dot: "bg-teal" };
    const todays = bookingsWeek.find((b) => b.unitId === unit.id && dayOf(new Date(b.date)) === todayIso);
    if (todays) return { label: "Occupied", dot: "bg-rausch" };
    const upcoming = bookingsWeek
      .filter((b) => b.unitId === unit.id && new Date(b.date) > new Date())
      .sort((a, b) => +new Date(a.date) - +new Date(b.date))[0];
    if (upcoming) return { label: "Reserved", dot: "bg-amber" };
    return { label: "Available", dot: "bg-green" };
  }
  function statusCategory(unit: Unit): Exclude<StatusFilter, "all"> {
    const st = unitStatus(unit);
    if (st.label === "Cleaning") return "cleaning";
    if (st.label.startsWith("Occupied")) return "occupied";
    if (st.label.startsWith("Reserved")) return "reserved";
    return "available";
  }

  return { unitStatus, statusCategory };
}
