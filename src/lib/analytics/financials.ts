// Zero new logic — every call site in the Analytics module imports from
// here, which is itself just a named re-export of @/lib/finance, the
// existing single source of truth for every profit/expense computation.
// Keeps "Analytics never duplicates a calculation" grep-able: nothing in
// src/lib/analytics/ computes profit/margin/cash-flow math independently.
export {
  netProfitCentavos,
  marginPct,
  paidExpensesCentavos,
  pendingExpensesCentavos,
  cashFlowCentavos,
  paidExpensesCentavosForUnit,
  type ExpenseLike,
} from "@/lib/finance";
