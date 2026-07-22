export type ForecastResult = {
  forecastCentavos: number;
  method: string;
  confidence: "low" | "medium";
};

/**
 * Simple trailing-average forecast — no external stats library, no
 * black-box model. `periodTotalsCentavos` should be the same-length-period
 * totals immediately preceding the period being forecast (e.g. the last
 * 3 months' revenue, oldest first). Confidence is "medium" only with at
 * least 3 prior periods of history; below that, "low" — this business has
 * only a few months of real data, so overstating confidence here would be
 * dishonest. Every result is meant to be shown in the UI tagged with
 * `method` and `confidence`, never as a bare unqualified number.
 */
export function trailingAverageForecast(periodTotalsCentavos: number[]): ForecastResult {
  const n = periodTotalsCentavos.length;
  if (n === 0) return { forecastCentavos: 0, method: "no prior data", confidence: "low" };
  const avg = periodTotalsCentavos.reduce((s, v) => s + v, 0) / n;
  return {
    forecastCentavos: Math.round(avg),
    method: `trailing ${n}-period average`,
    confidence: n >= 3 ? "medium" : "low",
  };
}
