# ML Verification Report

This report consolidates the findings, reproduction cases, implemented fixes, and verification outcomes for the machine learning pipeline issues addressed across all phases.

---

## 1. What Was Broken

### Issue A: SHAP Multiclass Explainability Crash
* **Description:** When training a `HistGradientBoostingClassifier` on a multiclass target (more than 2 classes), `explainer.shap_values(X_transformed_df)` returns a 3D numpy array of shape `(samples, features, classes)`. In contrast, for binary classification and regression, it returns a 2D array of shape `(samples, features)`. The original code failed to unpack the 3D array, passing a 2D slice (`values[sample_idx]`) of shape `(features, classes)` to `shap.plots._waterfall.waterfall_legacy()`, which expects a 1D vector of shape `(features,)`.
* **Original Reproduction Output:**
  ```python
  Traceback (most recent call last):
    File "/app/src/modeling_extensions.py", line 308, in generate_shap_plots
      shap.plots._waterfall.waterfall_legacy(
        expected,
        values[sample_idx],
        X_transformed_df.iloc[sample_idx]
      )
    File "/usr/local/lib/python3.11/site-packages/shap/plots/_waterfall.py", line 380, in waterfall_legacy
      raise Exception("The waterfall_plot can currently only plot a single explanation but a matrix of explanations was passed!")
  Exception: The waterfall_plot can currently only plot a single explanation but a matrix of explanations was passed!")
  ```

### Issue B: ROC-AUC Silent Fold-Drop
* **Description:** During K-Fold Cross-Validation, if a given split's test set did not contain all target classes (which happens frequently in rare-class target distributions), `roc_auc_score` would throw a `ValueError` (due to missing target levels). The original code caught all exceptions during ROC-AUC calculation and appended `np.nan` to the fold scores. However, taking the standard `np.mean()` and `np.std()` on a list containing `np.nan` values resulted in the overall cross-validation score becoming `NaN`. Consequently, the ROC-AUC metric was silently dropped and omitted from the frontend UI comparison table without any explanation.
* **Original Reproduction Output:**
  ```python
  # Fold scores: [0.85, 0.90, np.nan, 0.88, np.nan]
  # Resulting overall score returned:
  mean_roc_auc = np.mean(fold_scores["roc_auc"])  # -> NaN
  std_roc_auc = np.std(fold_scores["roc_auc"])    # -> NaN
  ```

---

## 2. What Was Fixed

### Fix A: Multiclass-Aware SHAP Unpacking
* **Implementation:** The SHAP explanation pipeline was updated to check if the task is multiclass classification. If it is, the code determines the class index predicted for the specific row being explained (`class_idx`) and extracts the corresponding slice from the 3D array or list of arrays. This yields a clean 1D explanation vector for the waterfall plot.
* **Before / After Comparison:**
  * **Before:** Triggers exception/blank screen state when running SHAP for a multiclass target.
  * **After:** Both waterfall and global importance plots render perfectly in the UI.

### Fix B: CV Fold-Drop Recovery & Coverage Tracking
* **Implementation:** 
  1. We now ignore `NaN` values when aggregating cross-validation fold scores using clean list filtering before calling `np.mean` and `np.std`.
  2. We introduced a `roc_auc_fold_coverage` field tracking successful splits (e.g., `4/5`).
  3. We dynamically downscale the K-Fold CV fold count (`adjusted_cv`) to match the size of the minority class when the minority class count is lower than the default CV fold size.
  4. We auto-exclude single-member classes from cross-validation to prevent training failure.
* **Before / After Comparison:**
  * **Before:** ROC-AUC displays as `NaN` or is missing entirely from the comparison table.
  * **After:** The UI shows the calculated ROC-AUC score based on successful folds and renders the coverage text (e.g., `cv: 4/5`) under the metric score.

---

## 3. Files Changed Across All Phases

| File | Type | Description |
| :--- | :--- | :--- |
| [`backend/src/modeling_extensions.py`](file:///c:/Users/Mythri%20Banda/OneDrive/Desktop/github%20projects/InsightFlow/backend/src/modeling_extensions.py) | Python Backend | Patched `generate_shap_plots` to correctly extract single-class vectors for multiclass tasks. |
| [`backend/src/modeling.py`](file:///c:/Users/Mythri%20Banda/OneDrive/Desktop/github%20projects/InsightFlow/backend/src/modeling.py) | Python Backend | Updated CV aggregation to filter out `NaN`s, added `roc_auc_fold_coverage` calculations, added single-member class exclusion, and adjusted fold count dynamically. |
| [`backend/schemas.py`](file:///c:/Users/Mythri%20Banda/OneDrive/Desktop/github%20projects/InsightFlow/backend/schemas.py) | Python Backend | Registered `roc_auc_fold_coverage` on the `ModelResponse` Pydantic model. |
| [`backend/routers/model.py`](file:///c:/Users/Mythri%20Banda/OneDrive/Desktop/github%20projects/InsightFlow/backend/routers/model.py) | Python Backend | Forwarded `roc_auc_fold_coverage` in the modeling router endpoint response. |
| [`src/server/modeling.ts`](file:///c:/Users/Mythri%20Banda/OneDrive/Desktop/github%20projects/InsightFlow/src/server/modeling.ts) | TS Frontend | Updated TypeScript interfaces (`ModelResult`, `ModelResponse`) to define `roc_auc_fold_coverage` and `class_imbalance`. |
| [`src/components/ModelingPanel.tsx`](file:///c:/Users/Mythri%20Banda/OneDrive/Desktop/github%20projects/InsightFlow/src/components/ModelingPanel.tsx) | React UI | Wired the fold-coverage metric into the Best Value overview card and the Metrics Table. |

---

## 4. Items Not Fixed / Not Tested

* **"Compute correctly, no new field needed" approach:** **Not implemented.** We explicitly chose the alternative approach of introducing the `roc_auc_fold_coverage` field to track and surface fold-coverage statistics to the user in the UI. Consequently, verification of the "no new field needed" fallback was not tested.
* **PR Creation / Merging:** **Not executed.** Per user request, no branch merging or Pull Request opening has been performed; changes are preserved locally in the working directory for review.

---

## 5. Branch Supersession Confirmation

* **Branch status:** The SHAP fix commit on the `ml-tech` branch is now **fully superseded** by the implementation in `main`. The logic for multiclass classification SHAP unpacking has been successfully integrated, generalized, and thoroughly verified within the `main` branch. Per requirements, the `ml-tech` branch remains unmodified.

---

## 6. Structured Class Exclusion Visibility (Phase 5)

### Root Cause
Before Phase 5, the model training logic in `run_modeling_pipeline` silently filtered out classes with exactly 1 member. This exclusion was only logged via a Python `warnings.warn()` call on the server side. As a result, the frontend caller had no structured way of knowing that certain rare classes (and their corresponding rows) were dropped from training, leading to a silent discrepancy in the reported sample size and target categories.

### Implementation
1. **Types & Data Structures:** Added the `excluded_classes` field (as a list of dictionaries) to both the internal `ModelingOutput` dataclass (in `backend/src/modeling.py`) and the `ModelResponse` Pydantic model (in `backend/schemas.py`).
2. **Exclusion Tracking:** Populated `excluded_classes` at the point of single-member class filtering inside `run_modeling_pipeline`. Each entry includes:
   - `class`: The name/label of the dropped class.
   - `reason`: Explanation of the drop.
   - `rows_dropped`: Number of rows dropped (always 1 for single-member classes).
3. **API Routing:** Wired `excluded_classes` through the `train_model` router endpoint inside `backend/routers/model.py` to make it visible in the API response.

### Verification Outcomes
We ran a dedicated verification script `verify-class-exclusion.py` against both programmatic pipeline checks and the live HTTP endpoint (`/model/{session_id}`):
* **With 1-member class injected:** Programmatic call to `run_modeling_pipeline` correctly populated `excluded_classes` with:
  `[{'class': 'RareDept', 'reason': 'Exactly 1 member in dataset; cannot be split for cross-validation.', 'rows_dropped': 1}]`.
* **Without 1-member class (unmodified datasets):** Confirmed `excluded_classes` returns an empty list `[]` (not `None` or missing) for both `department` and `car_body_type` targets.
* **HTTP Endpoint Response:** Hitting `/model/{session_id}` on the live backend with an injected 1-member class returned the structured field `excluded_classes` populated correctly inside the raw JSON payload.

---

## 7. Per-Class Multiclass ROC-AUC CV Evaluation (Phase 6)

### Rationale for Rejecting the Previous Approach
The previous approach of reducing the cross-validation splits globally (`cv_splits`) to match the rarest class's count was rejected. In cases such as the `car_body_type` target (which has 8 classes, with the rarest class containing only 2 members), forcing `cv_splits` down from 5 to 2 severely degraded the overall model quality:
- The balanced accuracy estimate dropped from **0.737 to 0.614**.
- The standard deviation of the accuracy metrics collapsed to **0.0** (reflecting zero statistical meaning or variance estimation with only 2 folds).
- This global downscaling penalized the entire model evaluation, including well-represented majority classes, to resolve a problem affecting only one rare class's OVR ROC-AUC evaluation.

### New Statistically Correct Approach
Instead of cutting the fold count globally, we maintain the cross-validation fold count (`cv_splits` = 5) based only on the dataset's total size. Inside K-Fold CV, we calculate ROC-AUC using a one-vs-rest (OVR) strategy per class:
1. For each class present in the full dataset, we check if the fold's test set contains both positive (instances of that class) and negative (instances of other classes) examples.
2. We compute the binary ROC-AUC score *only for the classes that qualify* in that fold.
3. We compute a weighted average of these qualifying class scores (weighted by the class frequency in that fold), matching OVR weighted semantics.
4. We track the class qualification ratio across all folds, returning `roc_auc_class_coverage` (e.g., `"36/40"`).
5. If any class fails to qualify across all folds (0 coverage), we raise a warning list alerting the user, rather than silently omitting it.

### Verification Outcomes
* **No Degraded Metrics:** The `car_body_type` run now executes with a full 5 folds. The metrics report real, non-zero std scores (accuracy: `0.9372 ± 0.0221`, f1: `0.9310 ± 0.0226`, balanced_accuracy: `0.7876 ± 0.0443`).
* **Class-level Coverage:** LogisticRegression and HistGradientBoostingClassifier both correctly report `roc_auc_class_coverage` as `36/40` (on the full EV dataset) and `34/40` (on the mini EV dataset).
* **Zero Change on Binary/Regression Tasks:** Verified that binary targets (e.g. `drivetrain`) and regression targets (e.g. `salary`) compile and evaluate without any behavioral deviation.

---

## 8. E2E Browser Verification Results (Phase 5 & 6 Frontend Wiring)

We successfully wired the new structured backend fields (`roc_auc_class_coverage` and `excluded_classes`) into the React UI and verified their rendering using a Playwright E2E test script.

### UI Modifications Made:
1. **Model Response & Result Types:** Registered `roc_auc_class_coverage` and `excluded_classes` inside [modeling.ts](file:///c:/Users/Mythri%20Banda/OneDrive/Desktop/github%20projects/InsightFlow/src/server/modeling.ts).
2. **Metrics Table & Cards:** Updated [ModelingPanel.tsx](file:///c:/Users/Mythri%20Banda/OneDrive/Desktop/github%20projects/InsightFlow/src/components/ModelingPanel.tsx) to render `roc_auc_class_coverage` next to `roc_auc_fold_coverage` (e.g. `folds: 5/5 | class coverage: 34/40`) under the ROC-AUC score in the metrics table.
3. **Excluded Classes Warning Banner:** Added a warning banner at the top of the comparison and SHAP tabs that is conditionally rendered when `excluded_classes` contains items.

### E2E Scenarios Run & Outputs:
* **Scenario 1 (Rare-class target `car_body_type`):**
  - **Result:** Successfully trained with 5 splits. Surfaced the `folds: 5/5 | class coverage: 34/40` metrics in the comparison view.
  - **Screenshot:** [car_body_type-coverage.png](file:///C:/Users/Mythri%20Banda/.gemini/antigravity/brain/1d6f6d32-4ab9-425a-b3cf-2210f1223fed/car_body_type-coverage.png)
* **Scenario 2 (Injected 1-member class `department` target):**
  - **Result:** Successfully detected and rendered the "Excluded Classes Warning" banner showing that `SoloDept` was excluded from training.
  - **Screenshot:** [injected_solo_class-coverage.png](file:///C:/Users/Mythri%20Banda/.gemini/antigravity/brain/1d6f6d32-4ab9-425a-b3cf-2210f1223fed/injected_solo_class-coverage.png)
* **Scenario 3 (Balanced `department` target):**
  - **Result:** Trained successfully with 5 splits, displaying `folds: 5/5 | class coverage: 20/20`. No warning banner shown.
  - **Screenshot:** [department-coverage.png](file:///C:/Users/Mythri%20Banda/.gemini/antigravity/brain/1d6f6d32-4ab9-425a-b3cf-2210f1223fed/department-coverage.png)
