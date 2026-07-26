# InsightFlow — Implementation Spec

Scope: solo, ~3-4 weeks, arbitrary tabular data (CSV/XLSX/TSV).
Principle that governs everything: **ground every output in real computation. The LLM only translates and narrates over verified results. It never generates a finding.**

---

## 1. Locked feature set (stop adding to this)

**Deterministic core (table stakes, build first):**
- C1. Upload + parse (CSV/XLSX/TSV)
- C2. Column profiling (types, stats, missingness, cardinality, distribution)
- C3. Trust Score (transparent weighted composite, see §6)
- C4. Dependency map: linear (Pearson/Spearman) + nonlinear (mutual information)

**The three ML differentiators (this is what makes it stand out):**
- D1. **Modeling Studio** — predict a chosen target with leakage detection, proper CV, honest metrics, SHAP. *Highest value. Never cut its rigor.*
- D2. **Multivariate anomaly detection + explanation** (Isolation Forest + per-feature attribution).
- D3. **Constraint / functional-dependency mining + violation detection.** *Stretch goal, cut first if time runs out.*

**One grounded LLM feature:**
- L1. **Natural-language query → executed pandas** (LLM writes code, code runs, result is real).

That is the whole product. Seven things done well beats twenty done shallow.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | FastAPI | async, auto OpenAPI docs, clean. Flask is fine too (you've shipped Flask). |
| Data | pandas, numpy, scipy | standard |
| ML | scikit-learn, shap | IsolationForest, HistGradientBoosting, pipelines, CV, metrics, mutual_info. No extra deps needed; lightgbm optional. |
| LLM | Groq API | you already use it; fast, cheap |
| Frontend | React + Vite + Tailwind | matches your skill set |
| Charts | Recharts (standard charts) + server-rendered PNG for SHAP plots | SHAP plots are matplotlib; render server-side, serve as image |
| PDF export | weasyprint (HTML→PDF) or reportlab | reuse your report HTML |
| DB | none required; optional Postgres only if you save history | analysis is stateless per upload. Do not over-architect. |

**Do not add:** deep learning, AutoML frameworks (PyCaret/AutoGluon/H2O), heavy model zoos. They are slow, black-box, and undefendable in a demo.

---

## 3. Architecture

```
Upload → parse to DataFrame → run analysis modules → return JSON → frontend renders
```

ML runs as a **background job** (FastAPI BackgroundTasks or a simple in-process job dict), because training and SHAP take seconds. Frontend polls a `/job/{id}` status endpoint. Keep the uploaded DataFrame in memory keyed by session id; drop it after N minutes. No premature distributed-system design.

Module layout:
```
app/
  ingest.py        # parse, dtype inference
  profile.py       # C2
  trust.py         # C3
  dependency.py    # C4
  modeling.py      # D1  <-- the wedge
  anomaly.py       # D2
  constraints.py   # D3
  nlquery.py       # L1
  report.py        # PDF
```

---

## 4. D1 — Modeling Studio (the wedge, build this carefully)

User picks a target column. You auto-detect the task, check for leakage, train a small justified set with proper CV, and report honest numbers with explanations.

### 4.1 Task detection
```python
def detect_task(y):
    if y.dtype.kind in "if" and y.nunique() > 20:
        return "regression"
    return "classification"
```
Show the detection in the UI and let the user override.

### 4.2 Leakage detection (run BEFORE training — this is the differentiator)
For each feature, score a single-feature model against the target with CV. Flag any feature that is implausibly predictive, plus structural giveaways.

```python
from sklearn.model_selection import cross_val_score, StratifiedKFold, KFold
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

def leakage_scan(X, y, task):
    flags = {}
    cv = StratifiedKFold(5, shuffle=True, random_state=42) if task=="classification" else KFold(5, shuffle=True, random_state=42)
    for col in X.columns:
        Xi = encode_single(X[[col]])          # impute + one-hot for this one column
        if task == "classification":
            s = cross_val_score(HistGradientBoostingClassifier(), Xi, y, cv=cv, scoring="roc_auc").mean()
            if s > 0.97: flags[col] = f"single-feature AUC {s:.2f} (likely leakage)"
        else:
            s = cross_val_score(HistGradientBoostingRegressor(), Xi, y, cv=cv, scoring="r2").mean()
            if s > 0.95: flags[col] = f"single-feature R² {s:.2f} (likely leakage)"
    # structural giveaways
    for col in X.columns:
        if X[col].nunique() >= 0.95 * len(X):
            flags[col] = "ID-like (near-unique values)"
    return flags
```
UI: show flagged features, let the user exclude them, then re-run. This is the sentence that wins:
> "Model hits 0.97 AUC, but `customer_id` is leaking. Exclude it → honest 0.71."

### 4.3 The model pipeline (preprocessing INSIDE the CV — critical)
Scaling/encoding before the split is itself leakage. Always wrap in a Pipeline so it refits per fold.

```python
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer

def make_pipeline(X, estimator):
    num = X.select_dtypes(include="number").columns
    cat = X.select_dtypes(exclude="number").columns
    pre = ColumnTransformer([
        ("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler())]), num),
        ("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")),
                          ("oh", OneHotEncoder(handle_unknown="ignore"))]), cat),
    ])
    return Pipeline([("pre", pre), ("est", estimator)])
```

### 4.4 Train a small, justified set (NOT "all models")
- **Baseline:** LogisticRegression / LinearRegression. Interpretable floor.
- **Main:** HistGradientBoosting{Classifier,Regressor}. Usually wins on tabular, handles NaN, fast.
Two models. Each has a stated reason. If you must add a third, justify it.

### 4.5 Honest evaluation
```python
from sklearn.model_selection import cross_validate
scores = cross_validate(pipe, X, y, cv=cv, scoring=metrics_for(task))
# report MEAN ± STD across folds, not a single split
```
**Pick the right metric and explain it:**
- Detect imbalance: `y.value_counts(normalize=True).max()`. If > ~0.8, flag it, make PR-AUC/F1 the headline metric, and warn that accuracy is misleading here.
- Regression: RMSE + MAE + R², each with a plain-language meaning.

### 4.6 Explanation (your Explainable-AI story)
```python
import shap
pipe.fit(X, y)
explainer = shap.TreeExplainer(pipe.named_steps["est"])
# transform X through the fitted preprocessor first, then explain
```
Render global importance (bar) + one per-row explanation (waterfall) as server-side PNGs.

### 4.7 Output
A downloadable, runnable sklearn pipeline (`joblib.dump`) + a plain-language summary built from the real numbers, not from the LLM's imagination.

---

## 5. D2 — Anomaly detection + explanation

Per-column outliers (z-score/IQR) are common and only catch values extreme in isolation. Isolation Forest catches rows anomalous **in combination**.

```python
from sklearn.ensemble import IsolationForest
Xt = preprocessor.fit_transform(X)        # reuse the §4.3 ColumnTransformer
iso = IsolationForest(contamination="auto", random_state=42).fit(Xt)
row_score = -iso.score_samples(Xt)        # higher = more anomalous
is_anom = iso.predict(Xt) == -1
```

**Explanation — use robust deviation attribution, not SHAP here.** SHAP on IsolationForest is fragile and slow; for a mini project the deviation approach is bulletproof and just as convincing:

```python
def explain_row(row, df):
    # rank numeric features by how far the row sits from the column's robust center
    med = df.median(numeric_only=True)
    iqr = df.quantile(0.75, numeric_only=True) - df.quantile(0.25, numeric_only=True)
    dev = ((row[med.index] - med).abs() / iqr.replace(0, 1)).sort_values(ascending=False)
    return dev.head(3)   # "driven by: column X (4.2 IQRs), column Y (3.1 IQRs)"
```
UI: a table of anomalous rows, each expandable to "why this row" (top 3 driving columns).

---

## 6. C3 — Trust Score (make it transparent, not a black box)

A weighted composite of measurable sub-scores. Show the breakdown, not just the number. This is a defensible heuristic, not science — say so in the UI.

```python
def trust_score(df, violations_rate):
    completeness = 1 - df.isna().mean().mean()
    dup_rate     = df.duplicated().mean()
    uniqueness   = 1 - dup_rate
    const_cols   = (df.nunique() <= 1).mean()
    structure    = 1 - const_cols
    consistency  = 1 - violations_rate          # from constraint module (§8); 0 if not run
    score = 100 * (0.30*completeness + 0.25*uniqueness + 0.20*structure
                   + 0.15*consistency + 0.10*(1 - outlier_rate(df)))
    return round(score), {...}                  # return the breakdown too
```
Tune weights once and document them. The point is every component is measurable and shown.

---

## 7. C4 — Dependency map (beat the correlation heatmap)

- Numeric↔numeric: Pearson (linear) + Spearman (monotonic).
- Anything↔target or anything↔anything: **mutual information** (`sklearn.feature_selection.mutual_info_classif` / `mutual_info_regression`) catches nonlinear relationships a correlation heatmap misses.
- Optional asymmetric predictive power: `ppscore` (verify it's still maintained before depending on it; not required).

Render two heatmaps side by side: "linear correlation" vs "predictive dependency (MI)". The gap between them is itself an insight.

---

## 8. D3 — Constraint / FD mining (stretch; cut first if short on time)

Two tiers. Build tier 1 first; it's cheap and high-value.

**Tier 1 — format consistency (easy):** detect the dominant format per column (regex for email/date/phone/numeric-id), flag rows that break it.

**Tier 2 — functional dependencies (harder):** discover candidate rules `A → B` (e.g. `zip → city`) and flag violations.
```python
def mine_fds(df, max_violation=0.02):
    rules = []
    cols = [c for c in df.columns if 1 < df[c].nunique() < len(df)]   # skip constant & unique
    for a in cols:
        for b in cols:
            if a == b: continue
            g = df.groupby(a)[b].nunique()
            violators = (g > 1).sum()
            if violators / len(g) <= max_violation:
                rules.append((a, b, violators))   # A approximately determines B
    return rules
```
O(cols²) groupbys; fine for normal column counts. Report each rule + the violating rows. No external library needed.

---

## 9. L1 — NL query → executed pandas (the AI done right)

LLM writes pandas, you execute it, the answer comes from real data. The LLM never states the answer itself.

```python
SCHEMA = build_schema(df)   # column names, dtypes, 2-3 sample values each
prompt = f"""You write pandas. DataFrame is `df`.
Schema:\n{SCHEMA}\nQuestion: {q}
Return ONLY python code assigning the answer to `result`. No prose, no markdown."""
code = groq_complete(prompt)
ns = {"df": df, "pd": pd, "np": np}
exec(code, {"__builtins__": {}}, ns)   # restricted builtins
result = ns["result"]
```
**Security caveat, be honest about it:** `exec` on model output is risky. The restricted `__builtins__` plus a no-import policy is the pragmatic mini-project guard. Show the generated code to the user before/with the result so it's auditable. Do not deploy this publicly without a real sandbox.

---

## 10. Build order + cut list

| Week | Build | Outcome |
|---|---|---|
| 1 | Scaffold (FastAPI + React + upload + job runner), C2 profiling, C3 trust, C4 dependency | deterministic core working end to end |
| 2 | **D1 Modeling Studio** with leakage scan + CV + SHAP | the differentiator, your demo centerpiece |
| 3 | D2 anomaly + explanation, L1 NL query | ML breadth + the grounded AI feature |
| 4 | D3 constraints (tier 1, then tier 2 if time), PDF export, polish | stretch + presentation |

**Cut order if you run short:** D3 tier 2 → D3 tier 1 → L1 → D2. **Never cut the D1 rigor** (leakage scan, proper CV, honest metrics). That rigor is the entire reason this project looks years ahead instead of like a tutorial.

---

## 11. The three things a reviewer will test — make sure these hold

1. "Show me your model accuracy is real." → You show the leakage scan and CV std. Pass.
2. "Why is this row anomalous?" → You show the driving columns. Pass.
3. "How does the AI answer questions?" → You show generated pandas + executed result. Pass.

If all three hold, the project is outstanding. If any is hand-waved, that's where it falls apart.
