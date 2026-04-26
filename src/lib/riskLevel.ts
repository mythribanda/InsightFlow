import type { DatasetProfile } from "./profiler";

export type RiskLevel = "low" | "medium" | "high";

export function computeRiskLevel(p: DatasetProfile): { level: RiskLevel; score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (p.missingPct > 20) { score += 3; reasons.push(`${p.missingPct.toFixed(0)}% missing data`); }
  else if (p.missingPct > 5) { score += 1; reasons.push(`${p.missingPct.toFixed(0)}% missing data`); }
  if (p.duplicateRows > 0) { score += 1; reasons.push(`${p.duplicateRows} duplicate rows`); }
  if (p.risks.length >= 4) { score += 2; reasons.push(`${p.risks.length} risk signals`); }
  else if (p.risks.length > 0) { score += 1; }
  if (p.humanErrors.length > 0) { score += 2; reasons.push(`${p.humanErrors.length} human-error signals`); }
  if (p.contradictions.length > 0) { score += 1; reasons.push(`${p.contradictions.length} contradictions`); }
  if (p.trustScore < 55) { score += 2; reasons.push("low trust score"); }
  else if (p.trustScore < 80) { score += 1; }
  const level: RiskLevel = score >= 5 ? "high" : score >= 2 ? "medium" : "low";
  return { level, score, reasons };
}

export function severityFor(text: string): "high" | "medium" | "low" {
  const t = text.toLowerCase();
  if (/heavily|dominated|very high|materially|bias/.test(t)) return "high";
  if (/skew|missing|outlier|imbalance|cardinality/.test(t)) return "medium";
  return "low";
}

export function severityStyle(s: "high" | "medium" | "low") {
  if (s === "high") return { color: "var(--color-destructive)", label: "HIGH" };
  if (s === "medium") return { color: "var(--color-warning)", label: "MED" };
  return { color: "var(--color-info)", label: "LOW" };
}
