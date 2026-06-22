# InsightFlow — Spec Addendum (v1 additions)

Companion to `InsightFlow_Implementation_Spec.md`. These slot into the main spec by section reference. Same principle still governs: **computed values are the source of truth; the LLM only narrates them.**

What's added: S1 Data Story (one real new feature) + S2–S4 (three views over computation you already do) + S5 (metric fix). Deferred: Feature Interaction Explorer (not v1).

---

## S1 — Data Story Generator  *(new feature; slots after all modules run)*

A single LLM call converts a JSON of **computed facts** into narrative. The LLM never sees the raw DataFrame and never produces a number not already in the JSON.

### Step 1: aggregate computed facts (no LLM)
Build `insights.py` that collects results from the other modules into one dict:
```python
def build_insights(df, profile, trust, deps, model_result, leakage):
    return {
        "shape": {"rows": len(df), "cols": df.shape[1]},
        "trust_score": trust["value"],
        "missing": [{"col": c, "pct": round(p*100, 1)}
                    for c, p in df.isna().mean().items() if p > 0.2],
        "constant_cols": [c for c in df.columns if df[c].nunique() <= 1],
        "high_cardinality": [c for c in df.columns
                             if df[c].nunique() > 0.5*len(df) and df[c].dtype == object],
        "top_dependencies": deps["top"],          # [{"a":..,"b":..,"r":0.88}, ...]
        "leakage": [{"col": c, "reason": r} for c, r in leakage.items()],
        "model": model_result,                    # {"task":"regression","best":"HistGB","r2":0.84}
        "recommendations": build_recommendations(df, leakage),  # plain strings
    }
```

### Step 2: narrate (one LLM call)
```python
SYS = ("You are a data analyst. Convert this JSON of COMPUTED facts into a concise "
       "Markdown report with sections: Summary, Key Findings, Risks, Recommendations. "
       "Use ONLY numbers and facts present in the JSON. Invent nothing.")
story = groq_complete(system=SYS, user=json.dumps(insights))
```

**Guards:**
- LLM input is the JSON only, never `df`.
- Render the source JSON next to the narrative so the output is auditable.
- Optional sanity check: every number in the narrative should appear in the JSON; flag if not.

This is the honest version of "AI insights." It reads like magic and it cannot hallucinate a finding.

---

## S2 — Feature Recommendation view  *(view over §4.2 + §4.6; no new computation)*

After the leakage scan and a one-shot importance pass, bucket features and show this **before** the user trains.

```python
def recommend_features(X, importance, leakage_flags, hi=0.05):
    out = {"high_signal": [], "low_signal": [], "harmful": [], "leakage": []}
    for c in X.columns:
        if c in leakage_flags:                              out["leakage"].append(c)
        elif X[c].nunique() <= 1:                           out["harmful"].append(c)   # constant
        elif X[c].dtype == object and X[c].nunique() > 0.5*len(X): out["harmful"].append(c)  # id-like
        elif importance.get(c, 0) >= hi:                    out["high_signal"].append(c)
        else:                                               out["low_signal"].append(c)
    return out
```
Importance = one GBM fit + `permutation_importance` (or SHAP mean-abs). UI shows four buckets with the leakage one in red. This is purely presentation of work D1 already does.

---

## S3 — Target Suitability Checker  *(pre-flight; runs when target is selected)*

Cheap checks before any training. This is where the "94% one class → accuracy misleading" warning lives.

```python
def target_health(y, X, task):
    r = {"missing_labels": int(y.isna().sum()), "n_rows": len(y)}
    r["size_ok"] = len(y) >= 50 * X.shape[1]      # heuristic rule of thumb, label it as such in UI
    if task == "classification":
        vc = y.value_counts(normalize=True)
        r["n_classes"]      = int(y.nunique())
        r["majority_share"] = round(float(vc.max()), 3)
        r["imbalanced"]     = vc.max() > 0.8
    else:
        r["target_skew"] = round(float(y.skew()), 2)
    return r
```
UI: green/amber/red per row (class balance, missing labels, dataset size, leakage risk). Mature and cheap. **Label `size_ok` as a heuristic, not a law** — overclaiming a "rule" is the kind of thing a sharp interviewer probes.

---

## S4 — Model Comparison view  *(view over §4.4; no new computation)*

You already train the baseline and the GBM with CV. Collect and display.

```python
def compare_models(X, y, task, cv):
    metrics = METRICS[task]                         # see S5
    rows = []
    for name, est in curated_models(task):          # 2-3 models, each justified
        s = cross_validate(make_pipeline(X, est), X, y, cv=cv, scoring=metrics)
        rows.append({"model": name, **{m: round(s[f"test_{m}"].mean(), 3) for m in metrics}})
    best = max(rows, key=lambda r: r[metrics[0]])    # primary metric = metrics[0]
    return rows, best["model"]
```
**Hard limit (restated):** `curated_models` returns 2-3 models with stated reasons, never a 15-model leaderboard. Highlight the winner on the primary metric.

---

## S5 — Task-appropriate metrics  *(fix to §4.5)*

One source of truth. Never show classification metrics on a regression result or vice versa.

```python
METRICS = {
    "classification": ["roc_auc", "f1", "precision", "recall", "accuracy"],   # lead with roc_auc / f1
    "regression":     ["r2", "neg_root_mean_squared_error", "neg_mean_absolute_error"],
}
```
- UI renders only the set matching the detected task.
- When `target_health.imbalanced` is true: demote accuracy, surface F1 / PR-AUC, show the imbalance warning.
- `precision`/`recall`/`accuracy` are classification only; `r2`/`RMSE`/`MAE` are regression only. Mixing them is a visible mistake.

---

## The modeling flow (your interface idea, with the guards baked in)

This is exactly the UX you described — user selects column, selects task, runs it — with the two non-negotiables built in:

```
select target
   → S3 Target Suitability Checker (pre-flight health)
   → §4.2 Leakage scan + S2 Feature Recommendation (exclude leakers)
   → user picks features + task + models FROM THE CURATED SET (not "all")
   → train with §4.3 leakage-safe pipeline + CV
   → S4 Model Comparison + §4.6 SHAP + S5 task-correct metrics
   → S1 Data Story
```
Your UX was never the problem. The only two guards: **curated models, not all**, and **CV/leakage-checked metrics, not raw**. Everything else is your design.

---

## Updated build order

| Week | Add |
|---|---|
| 2 | D1 + **S5 metrics fix** + **S3 Target Checker** + **S2 Feature Rec** + **S4 Model Comparison** (the three views are nearly free once D1 computes) |
| 3 | D2 anomaly, L1 NL query, **S1 Data Story** (needs the other modules' JSON) |
| 4 | D3 constraints, PDF, polish |

**Deferred, not v1:** Feature Interaction Explorer. Correct method is SHAP interaction values (O(features²), slow past ~15-20 columns) or Friedman's H. Highest effort, highest demo-fragility risk. Build only if everything above is solid, and never let it block.
