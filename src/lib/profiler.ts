export type ColType = "numeric" | "categorical" | "datetime" | "boolean" | "text" | "id";

export interface ColumnProfile {
  name: string;
  type: ColType;
  count: number;
  missing: number;
  missingPct: number;
  unique: number;
  uniquePct: number;
  constant: boolean;
  highCardinality: boolean;
  // numeric
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  std?: number;
  q1?: number;
  q3?: number;
  outliers?: number;
  skew?: number;
  zeros?: number;
  negatives?: number;
  // categorical
  topValues?: { value: string; count: number }[];
  // datetime
  minDate?: string;
  maxDate?: string;
  // sample for previews / charting
  sample?: (string | number | null)[];
}

export interface DatasetProfile {
  rowCount: number;
  colCount: number;
  duplicateRows: number;
  totalCells: number;
  missingCells: number;
  missingPct: number;
  columns: ColumnProfile[];
  numericMatrix?: { columns: string[]; matrix: number[][] };
  trustScore: number;
  trustBreakdown: { label: string; score: number; weight: number; note: string }[];
  risks: string[];
  contradictions: string[];
  humanErrors: string[];
  suggestedQuestions: string[];
  recommendedActions: string[];
  behavior: string[];
  preview: Record<string, unknown>[];
  headers: string[];
}

const DATE_REGEX =
  /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/;

function isNumericLike(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  if (typeof v === "number") return Number.isFinite(v);
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return false;
  return !isNaN(Number(s));
}
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}
function isDateLike(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  if (v instanceof Date) return !isNaN(v.getTime());
  const s = String(v).trim();
  if (!DATE_REGEX.test(s) && !/^\d{4}-\d{2}-\d{2}T/.test(s)) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}
function isBoolLike(v: unknown): boolean {
  const s = String(v).toLowerCase().trim();
  return ["true", "false", "yes", "no", "y", "n", "0", "1"].includes(s);
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  return sorted[base];
}

function inferType(values: unknown[]): ColType {
  const non = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (!non.length) return "text";
  let nums = 0, dates = 0, bools = 0;
  const sample = non.slice(0, Math.min(non.length, 200));
  for (const v of sample) {
    if (isNumericLike(v)) nums++;
    else if (isDateLike(v)) dates++;
    else if (isBoolLike(v)) bools++;
  }
  const n = sample.length;
  if (dates / n > 0.7) return "datetime";
  if (nums / n > 0.85) return "numeric";
  if (bools / n > 0.9) return "boolean";
  const unique = new Set(non.map(String)).size;
  if (unique / non.length > 0.95 && non.length > 20) return "id";
  return unique <= Math.max(20, non.length * 0.1) ? "categorical" : "text";
}

function profileColumn(name: string, values: unknown[]): ColumnProfile {
  const count = values.length;
  const missing = values.filter((v) => v === null || v === undefined || v === "").length;
  const non = values.filter((v) => v !== null && v !== undefined && v !== "");
  const uniqueSet = new Set(non.map((v) => String(v)));
  const unique = uniqueSet.size;
  const type = inferType(values);
  const sample = values.slice(0, 8).map((v) => (v === undefined ? null : (v as string | number | null)));
  const profile: ColumnProfile = {
    name,
    type,
    count,
    missing,
    missingPct: count ? (missing / count) * 100 : 0,
    unique,
    uniquePct: count ? (unique / Math.max(non.length, 1)) * 100 : 0,
    constant: unique <= 1 && non.length > 0,
    highCardinality: unique > 50 && unique / Math.max(non.length, 1) > 0.5,
    sample,
  };

  if (type === "numeric") {
    const nums = non.map(toNumber).filter((v): v is number => v !== null);
    if (nums.length) {
      const sorted = [...nums].sort((a, b) => a - b);
      const min = sorted[0], max = sorted[sorted.length - 1];
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const median = quantile(sorted, 0.5);
      const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
      const std = Math.sqrt(variance);
      const q1 = quantile(sorted, 0.25), q3 = quantile(sorted, 0.75);
      const iqr = q3 - q1;
      const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
      const outliers = nums.filter((v) => v < lo || v > hi).length;
      const skew = std > 0 ? nums.reduce((a, b) => a + ((b - mean) / std) ** 3, 0) / nums.length : 0;
      Object.assign(profile, {
        min, max, mean, median, std, q1, q3, outliers, skew,
        zeros: nums.filter((v) => v === 0).length,
        negatives: nums.filter((v) => v < 0).length,
      });
    }
  } else if (type === "categorical" || type === "boolean" || type === "text") {
    const counts = new Map<string, number>();
    for (const v of non) {
      const k = String(v);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    profile.topValues = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, count]) => ({ value, count }));
  } else if (type === "datetime") {
    const dates = non
      .map((v) => new Date(v as string))
      .filter((d) => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    if (dates.length) {
      profile.minDate = dates[0].toISOString();
      profile.maxDate = dates[dates.length - 1].toISOString();
    }
  }
  return profile;
}

function correlationMatrix(rows: Record<string, unknown>[], numericCols: string[]) {
  const cols = numericCols.slice(0, 12);
  const data = cols.map((c) => rows.map((r) => toNumber(r[c])));
  const n = cols.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const xs: number[] = [], ys: number[] = [];
      for (let k = 0; k < data[i].length; k++) {
        const a = data[i][k], b = data[j][k];
        if (a !== null && b !== null) { xs.push(a); ys.push(b); }
      }
      if (xs.length < 3) { matrix[i][j] = 0; continue; }
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      let num = 0, dx = 0, dy = 0;
      for (let k = 0; k < xs.length; k++) {
        num += (xs[k] - mx) * (ys[k] - my);
        dx += (xs[k] - mx) ** 2;
        dy += (ys[k] - my) ** 2;
      }
      matrix[i][j] = dx && dy ? num / Math.sqrt(dx * dy) : 0;
    }
  }
  return { columns: cols, matrix };
}

function detectHumanErrors(cols: ColumnProfile[], rows: Record<string, unknown>[]): string[] {
  const out: string[] = [];
  for (const c of cols) {
    if (c.type === "numeric") {
      const looksLikeAge = /age/i.test(c.name);
      const looksLikePct = /(percent|%|rate|pct)/i.test(c.name);
      if (looksLikeAge && (c.max ?? 0) > 130) out.push(`'${c.name}' contains age values above 130 — likely data entry errors.`);
      if (looksLikeAge && (c.min ?? 0) < 0) out.push(`'${c.name}' contains negative ages.`);
      if (looksLikePct && ((c.max ?? 0) > 100 || (c.min ?? 0) < 0)) out.push(`'${c.name}' looks like a percentage but values fall outside 0–100.`);
      if (/price|amount|cost|salary|revenue/i.test(c.name) && (c.negatives ?? 0) > 0) out.push(`'${c.name}' contains ${c.negatives} negative values where positive is expected.`);
    }
    if (c.type === "datetime" && c.maxDate && new Date(c.maxDate).getFullYear() > new Date().getFullYear() + 5) {
      out.push(`'${c.name}' contains dates far in the future (${new Date(c.maxDate).getFullYear()}).`);
    }
  }
  // whitespace duplicates in categorical
  for (const c of cols) {
    if ((c.type === "categorical" || c.type === "text") && c.topValues) {
      const norm = new Map<string, string[]>();
      for (const t of c.topValues) {
        const k = t.value.trim().toLowerCase();
        if (!norm.has(k)) norm.set(k, []);
        norm.get(k)!.push(t.value);
      }
      for (const [, vs] of norm) {
        if (vs.length > 1) { out.push(`'${c.name}' has near-duplicate categories (e.g. ${vs.slice(0, 3).map((x) => `"${x}"`).join(", ")}) — casing/whitespace inconsistency.`); break; }
      }
    }
  }
  return out.slice(0, 8);
}

function detectContradictions(cols: ColumnProfile[]): string[] {
  const out: string[] = [];
  const byName = new Map(cols.map((c) => [c.name.toLowerCase(), c]));
  const start = [...byName.keys()].find((k) => /start|from|begin/.test(k));
  const end = [...byName.keys()].find((k) => /end|to|finish/.test(k));
  if (start && end) {
    const s = byName.get(start)!, e = byName.get(end)!;
    if (s.type === "datetime" && e.type === "datetime" && s.minDate && e.maxDate) {
      if (new Date(s.minDate) > new Date(e.maxDate)) out.push(`Column '${s.name}' has values later than '${e.name}'.`);
    }
  }
  for (const c of cols) {
    if (c.type === "numeric" && c.std !== undefined && c.mean !== undefined && c.median !== undefined) {
      if (Math.abs(c.mean - c.median) > 2 * c.std && c.std > 0) {
        out.push(`'${c.name}': mean (${c.mean.toFixed(2)}) and median (${c.median.toFixed(2)}) diverge — distribution is skewed; averages may mislead.`);
      }
    }
  }
  return out.slice(0, 6);
}

function describeBehavior(p: Omit<DatasetProfile, "behavior" | "trustScore" | "trustBreakdown" | "risks" | "contradictions" | "humanErrors" | "suggestedQuestions" | "recommendedActions">): string[] {
  const notes: string[] = [];
  if (p.missingPct > 15) notes.push("Sparse — significant missing data across columns.");
  else if (p.missingPct > 3) notes.push("Mildly sparse — pockets of missingness.");
  else notes.push("Dense — very few missing values.");
  if (p.duplicateRows > 0) notes.push(`Contains ${p.duplicateRows} duplicate row(s).`);
  const skewed = p.columns.filter((c) => c.skew !== undefined && Math.abs(c.skew) > 1).length;
  if (skewed >= 2) notes.push(`${skewed} numeric columns are skewed — consider log/Box-Cox transforms.`);
  const constants = p.columns.filter((c) => c.constant).length;
  if (constants) notes.push(`${constants} constant column(s) carry no information.`);
  const cats = p.columns.filter((c) => c.type === "categorical");
  const imbalanced = cats.filter((c) => c.topValues && c.topValues[0] && c.topValues[0].count / Math.max(c.count - c.missing, 1) > 0.8).length;
  if (imbalanced) notes.push(`${imbalanced} categorical column(s) are heavily imbalanced.`);
  const noisy = p.columns.filter((c) => (c.outliers ?? 0) > p.rowCount * 0.05).length;
  if (noisy) notes.push(`${noisy} numeric column(s) show noticeable outlier presence.`);
  return notes;
}

function trustScoring(p: Omit<DatasetProfile, "trustScore" | "trustBreakdown" | "risks" | "contradictions" | "humanErrors" | "suggestedQuestions" | "recommendedActions" | "behavior">) {
  const completeness = Math.max(0, 100 - p.missingPct * 1.5);
  const dupPenalty = Math.max(0, 100 - (p.duplicateRows / Math.max(p.rowCount, 1)) * 200);
  const constantPenalty = Math.max(0, 100 - (p.columns.filter((c) => c.constant).length / Math.max(p.colCount, 1)) * 200);
  const numericCols = p.columns.filter((c) => c.type === "numeric");
  const outlierAvg = numericCols.length
    ? numericCols.reduce((a, c) => a + (c.outliers ?? 0) / Math.max(c.count - c.missing, 1), 0) / numericCols.length
    : 0;
  const outlierScore = Math.max(0, 100 - outlierAvg * 300);
  const variance = numericCols.length
    ? numericCols.filter((c) => (c.std ?? 0) > 0).length / numericCols.length * 100
    : 80;
  const breakdown = [
    { label: "Completeness", score: completeness, weight: 0.35, note: `${p.missingPct.toFixed(1)}% missing` },
    { label: "Uniqueness", score: dupPenalty, weight: 0.20, note: `${p.duplicateRows} duplicates` },
    { label: "Variance", score: variance, weight: 0.15, note: `${numericCols.length} numeric cols` },
    { label: "Stability", score: outlierScore, weight: 0.20, note: `${(outlierAvg * 100).toFixed(1)}% outliers` },
    { label: "Structure", score: constantPenalty, weight: 0.10, note: `${p.columns.filter((c) => c.constant).length} constants` },
  ];
  const score = breakdown.reduce((a, b) => a + b.score * b.weight, 0);
  return { score: Math.round(Math.max(0, Math.min(100, score))), breakdown };
}

function buildRisks(p: Omit<DatasetProfile, "risks" | "contradictions" | "humanErrors" | "suggestedQuestions" | "recommendedActions" | "behavior" | "trustScore" | "trustBreakdown">): string[] {
  const risks: string[] = [];
  if (p.missingPct > 20) risks.push("High missingness can bias models — imputation or row removal will materially change results.");
  for (const c of p.columns) {
    if (c.type === "numeric" && Math.abs(c.skew ?? 0) > 1.5) risks.push(`'${c.name}' is heavily skewed — averages may misrepresent the typical value.`);
    if (c.type === "categorical" && c.topValues && c.topValues[0] && c.topValues[0].count / Math.max(c.count - c.missing, 1) > 0.85) risks.push(`'${c.name}' is dominated by "${c.topValues[0].value}" — risk of biased grouping/segmentation.`);
    if (c.highCardinality) risks.push(`'${c.name}' has very high cardinality — risk of overfitting if used as a feature.`);
  }
  return risks.slice(0, 6);
}

function suggestQuestions(p: Pick<DatasetProfile, "columns">): string[] {
  const qs: string[] = [];
  const num = p.columns.filter((c) => c.type === "numeric").map((c) => c.name);
  const cat = p.columns.filter((c) => c.type === "categorical").map((c) => c.name);
  const dt = p.columns.filter((c) => c.type === "datetime").map((c) => c.name);
  if (num[0]) qs.push(`What is the distribution of ${num[0]}?`);
  if (num[0] && num[1]) qs.push(`How does ${num[0]} relate to ${num[1]}?`);
  if (cat[0] && num[0]) qs.push(`Which ${cat[0]} has the highest average ${num[0]}?`);
  if (dt[0] && num[0]) qs.push(`How does ${num[0]} change over ${dt[0]}?`);
  qs.push("Which columns have the most missing values?");
  qs.push("Are there any obvious outliers I should investigate?");
  return qs.slice(0, 6);
}

function recommendActions(p: Pick<DatasetProfile, "columns" | "duplicateRows" | "missingPct">): string[] {
  const acts: string[] = [];
  if (p.duplicateRows > 0) acts.push(`Drop ${p.duplicateRows} duplicate row(s).`);
  for (const c of p.columns) {
    if (c.constant) acts.push(`Remove constant column '${c.name}'.`);
    if (c.missingPct > 40) acts.push(`Consider dropping '${c.name}' (${c.missingPct.toFixed(0)}% missing) or treat missingness as a signal.`);
    else if (c.missingPct > 5 && c.type === "numeric") acts.push(`Impute '${c.name}' with median (${c.missingPct.toFixed(0)}% missing).`);
    if (c.type === "numeric" && Math.abs(c.skew ?? 0) > 1.5) acts.push(`Apply log/sqrt transform to '${c.name}' for modeling.`);
    if (c.highCardinality) acts.push(`Group rare categories in '${c.name}' or hash-encode it.`);
  }
  return [...new Set(acts)].slice(0, 8);
}

export function profileDataset(rows: Record<string, unknown>[], headers: string[]): DatasetProfile {
  const rowCount = rows.length;
  const colCount = headers.length;
  const totalCells = rowCount * colCount;
  const seen = new Set<string>();
  let dup = 0;
  for (const r of rows) {
    const k = headers.map((h) => String(r[h] ?? "")).join("|");
    if (seen.has(k)) dup++;
    else seen.add(k);
  }
  const columns = headers.map((h) => profileColumn(h, rows.map((r) => r[h])));
  const missingCells = columns.reduce((a, c) => a + c.missing, 0);
  const missingPct = totalCells ? (missingCells / totalCells) * 100 : 0;
  const numericCols = columns.filter((c) => c.type === "numeric").map((c) => c.name);
  const numericMatrix = numericCols.length >= 2 ? correlationMatrix(rows, numericCols) : undefined;

  const base = {
    rowCount, colCount, duplicateRows: dup, totalCells, missingCells, missingPct,
    columns, numericMatrix, preview: rows.slice(0, 10) as Record<string, unknown>[], headers,
  };
  const trust = trustScoring(base);
  const behavior = describeBehavior(base);
  const risks = buildRisks(base);
  const contradictions = detectContradictions(columns);
  const humanErrors = detectHumanErrors(columns, rows);
  const suggestedQuestions = suggestQuestions({ columns });
  const recommendedActions = recommendActions({ columns, duplicateRows: dup, missingPct });

  return {
    ...base,
    trustScore: trust.score,
    trustBreakdown: trust.breakdown,
    behavior,
    risks,
    contradictions,
    humanErrors,
    suggestedQuestions,
    recommendedActions,
  };
}

export function generateInsights(p: DatasetProfile): { text: string; why: string; confidence: number; tag: string }[] {
  const ins: { text: string; why: string; confidence: number; tag: string }[] = [];
  const worstMissing = [...p.columns].sort((a, b) => b.missingPct - a.missingPct)[0];
  if (worstMissing && worstMissing.missingPct > 0) ins.push({
    text: `Column **${worstMissing.name}** has the most missing data (${worstMissing.missingPct.toFixed(1)}%).`,
    why: `Models trained on it will be biased toward the rows that did report a value — impute or drop before analysis.`,
    confidence: 0.99, tag: "Quality",
  });
  if (p.duplicateRows > 0) ins.push({
    text: `Dataset contains **${p.duplicateRows}** duplicate rows (${((p.duplicateRows / p.rowCount) * 100).toFixed(1)}%).`,
    why: `Duplicates inflate counts, skew averages, and silently double-weight some entities in any aggregation.`,
    confidence: 0.98, tag: "Integrity",
  });
  for (const c of p.columns.filter((c) => c.type === "numeric").slice(0, 3)) {
    if (c.mean !== undefined && c.median !== undefined && c.std !== undefined) {
      const skewed = Math.abs(c.mean - c.median) > c.std * 0.5;
      ins.push({
        text: `**${c.name}** averages **${c.mean.toFixed(2)}** (median ${c.median.toFixed(2)}, σ ${c.std.toFixed(2)}).`,
        why: skewed
          ? `Mean and median diverge — the average is being pulled by extremes; report the median for typical behaviour.`
          : `Mean and median agree — the average is a faithful summary of a typical row.`,
        confidence: 0.9, tag: "Distribution",
      });
    }
  }
  for (const c of p.columns.filter((c) => c.type === "categorical").slice(0, 2)) {
    if (c.topValues && c.topValues[0]) {
      const dom = c.topValues[0];
      const share = (dom.count / Math.max(c.count - c.missing, 1)) * 100;
      ins.push({
        text: `In **${c.name}**, "${dom.value}" dominates at ${share.toFixed(1)}%.`,
        why: share > 80
          ? `Any segment-level analysis will essentially mirror this single value — minority groups will be invisible without stratified sampling.`
          : `One value carries most of the weight — consider grouping the long tail before charting.`,
        confidence: 0.85, tag: "Composition",
      });
    }
  }
  if (p.numericMatrix) {
    const { columns, matrix } = p.numericMatrix;
    let best = { i: -1, j: -1, v: 0 };
    for (let i = 0; i < columns.length; i++)
      for (let j = i + 1; j < columns.length; j++)
        if (Math.abs(matrix[i][j]) > Math.abs(best.v)) best = { i, j, v: matrix[i][j] };
    if (best.i >= 0 && Math.abs(best.v) > 0.4) {
      ins.push({
        text: `Strong ${best.v > 0 ? "positive" : "negative"} correlation (${best.v.toFixed(2)}) between **${columns[best.i]}** and **${columns[best.j]}**.`,
        why: `These two columns carry overlapping signal — using both as model features risks multicollinearity; pick one or combine them.`,
        confidence: 0.8, tag: "Relationship",
      });
    }
  }
  const dt = p.columns.find((c) => c.type === "datetime");
  if (dt && dt.minDate && dt.maxDate) {
    ins.push({
      text: `Time range: **${dt.minDate.slice(0, 10)} → ${dt.maxDate.slice(0, 10)}** in column **${dt.name}**.`,
      why: `Knowing the window prevents over-generalising — patterns outside this range are extrapolation, not evidence.`,
      confidence: 0.95, tag: "Temporal",
    });
  }
  return ins.slice(0, 8);
}

export function trendForecast(p: DatasetProfile): string | null {
  const dt = p.columns.find((c) => c.type === "datetime");
  const num = p.columns.find((c) => c.type === "numeric" && (c.skew !== undefined));
  if (!dt || !num) return null;
  const direction = (num.mean ?? 0) > (num.median ?? 0) ? "tilted upward by recent peaks" : "weighted toward typical values";
  return `If the current pattern in **${num.name}** continues across **${dt.name}**, the trend appears ${direction}; expect the next period to remain near ${(num.median ?? 0).toFixed(2)} ± ${((num.std ?? 0)).toFixed(2)}.`;
}
