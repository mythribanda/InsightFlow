import pandas as pd
import numpy as np
import json
import urllib.request
import re
import logging
from typing import Dict, Any, List, Tuple, Optional

logger = logging.getLogger(__name__)

def build_insights(
    df: pd.DataFrame,
    profile: List[Dict[str, Any]],
    trust: Tuple[int, List[Dict[str, Any]]],
    deps: Dict[str, Any],
    leakage: List[Dict[str, Any]],
    model_result: Optional[Dict[str, Any]],
    anomaly_result: Optional[List[Dict[str, Any]]]
) -> Dict[str, Any]:
    """
    Assembles one JSON dict of real computed facts only.
    No raw rows, no invented numbers.
    """
    # 1. Dataset shape
    shape = {
        "rows": int(df.shape[0]),
        "cols": int(df.shape[1]),
        "total_cells": int(df.shape[0] * df.shape[1])
    }

    # 2. Trust Score and Breakdown
    trust_score = trust[0]
    trust_breakdown = trust[1]

    # 3. Column profiles (missingness, constant columns, high cardinality)
    missing_columns = []
    constant_columns = []
    high_cardinality_columns = []

    for c in profile:
        name = c.get("name")
        missing_pct = c.get("missingPct", 0.0)
        if missing_pct > 0:
            missing_columns.append({
                "column": name,
                "missing_pct": float(round(missing_pct, 4))
            })
        if c.get("constant", False):
            constant_columns.append(name)
        if c.get("highCardinality", False):
            high_cardinality_columns.append(name)

    # 4. Top dependencies / correlations (absolute threshold > 0.4 for linear, > 0.1 for non-linear MI)
    pearson_pairs = []
    spearman_pairs = []
    mi_pairs = []

    columns = deps.get("columns", [])
    pearson_matrix = deps.get("pearson", [])
    spearman_matrix = deps.get("spearman", [])
    mi_matrix = deps.get("mutual_info", [])

    n = len(columns)
    for i in range(n):
        for j in range(i + 1, n):
            # Pearson
            if pearson_matrix and i < len(pearson_matrix) and j < len(pearson_matrix[i]):
                p_val = pearson_matrix[i][j]
                if abs(p_val) > 0.4:
                    pearson_pairs.append({
                        "col1": columns[i],
                        "col2": columns[j],
                        "correlation": float(round(p_val, 4))
                    })
            # Spearman
            if spearman_matrix and i < len(spearman_matrix) and j < len(spearman_matrix[i]):
                s_val = spearman_matrix[i][j]
                if abs(s_val) > 0.4:
                    spearman_pairs.append({
                        "col1": columns[i],
                        "col2": columns[j],
                        "correlation": float(round(s_val, 4))
                    })
        
        # Mutual Information (directed, so we check i != j)
        for j in range(n):
            if i != j and mi_matrix and i < len(mi_matrix) and j < len(mi_matrix[i]):
                mi_val = mi_matrix[i][j]
                if mi_val > 0.1:
                    mi_pairs.append({
                        "source": columns[i],
                        "target": columns[j],
                        "dependency_score": float(round(mi_val, 4))
                    })
                    
    mi_pairs.sort(key=lambda x: x["dependency_score"], reverse=True)
    # limit list sizes
    pearson_pairs = pearson_pairs[:10]
    spearman_pairs = spearman_pairs[:10]
    mi_pairs = mi_pairs[:10]

    # 5. Leakage Flags
    leakage_flags = []
    if leakage:
        for f in leakage:
            leakage_flags.append({
                "feature": f.get("feature"),
                "cv_score": float(round(f.get("cv_score", 0.0), 4)) if f.get("cv_score") is not None else None,
                "reason": f.get("reason")
            })

    # 6. Model results (task, best model, validation metrics)
    model_summary = None
    if model_result:
        model_summary = {
            "task": model_result.get("task"),
            "best_model": model_result.get("best", {}).get("model"),
            "best_model_cv_metric": float(round(model_result.get("best", {}).get("val_metric", 0.0), 4)) if model_result.get("best", {}).get("val_metric") is not None else None,
            "best_model_metric_name": model_result.get("best", {}).get("metric_name"),
            "class_imbalance": model_result.get("class_imbalance"),
            "all_results": [
                {
                    "model": r.get("model"),
                    "mean_metric": float(round(r.get("mean_metric", 0.0), 4)) if r.get("mean_metric") is not None else None,
                    "std_metric": float(round(r.get("std_metric", 0.0), 4)) if r.get("std_metric") is not None else None,
                    "metric_name": r.get("metric_name")
                }
                for r in model_result.get("results", [])
            ]
        }

    # 7. Top anomalies (exclude row data)
    anomalies_summary = []
    if anomaly_result:
        for item in anomaly_result[:5]:
            anomalies_summary.append({
                "row_index": int(item["row_index"]),
                "score": float(round(item["score"], 4)),
                "drivers": [
                    {
                        "column": d["column"],
                        "value": str(d["value"]),
                        "deviation": float(round(d["deviation"], 4)),
                        "type": d["type"]
                    }
                    for d in item.get("drivers", [])
                ]
            })

    # 8. Plain text recommendations list
    recommendations = []
    # Duplicates rule
    dup_count = int(df.duplicated().sum())
    if dup_count > 0:
        recommendations.append(f"Drop {dup_count} duplicate rows from the dataset.")
    # Missingness rule
    for col_info in missing_columns:
        col = col_info["column"]
        pct = col_info["missing_pct"]
        if pct > 40.0:
            recommendations.append(f"Consider dropping column '{col}' due to severe missingness ({pct:.1f}% missing).")
        elif pct > 5.0:
            recommendations.append(f"Impute missing values in '{col}' using median/mode ({pct:.1f}% missing).")
    # Constants rule
    for col in constant_columns:
        recommendations.append(f"Remove constant column '{col}' to clean features.")
    # High cardinality rule
    for col in high_cardinality_columns:
        recommendations.append(f"Group rare categories or apply target/hash encoding to '{col}' to prevent overfitting.")
    # Leakage rule
    for flag in leakage_flags:
        recommendations.append(f"Exclude leaky feature '{flag['feature']}' from training (CV score: {flag['cv_score']:.4f}).")
    # Class imbalance rule
    if model_result and model_result.get("class_imbalance") is True:
        recommendations.append("Apply SMOTE or adjust class weights to handle severe class imbalance.")
    # Anomalies rule
    if anomalies_summary:
        recommendations.append(f"Investigate the top {len(anomalies_summary)} anomalous rows that exhibit high statistical deviation.")

    if not recommendations:
        recommendations.append("No immediate data cleansing actions required.")

    return {
        "shape": shape,
        "trust_score": trust_score,
        "trust_breakdown": trust_breakdown,
        "columns_summary": {
            "missing_columns": missing_columns,
            "constant_columns": constant_columns,
            "high_cardinality_columns": high_cardinality_columns
        },
        "top_dependencies": {
            "pearson": pearson_pairs,
            "spearman": spearman_pairs,
            "mutual_info": mi_pairs
        },
        "leakage_flags": leakage_flags,
        "model_result": model_summary,
        "anomalies": anomalies_summary,
        "recommendations": recommendations
    }

def generate_narrative_from_json(insights_json: Dict[str, Any], api_key: str) -> str:
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
    }

    prompt = f"""You are a strict data reporting assistant.
Your task is to convert the following JSON of computed dataset facts into a clean Markdown report.

JSON of Computed Facts:
{json.dumps(insights_json, indent=2)}

You MUST follow these strict rules:
1. Output MUST be formatted in Markdown with exactly these sections:
   ## Summary
   ## Key Findings
   ## Risks
   ## Recommendations
2. Use ONLY numbers, percentages, names, and metrics that are explicitly present in the provided JSON.
3. Absolutely DO NOT invent or hallucinate any numbers, column names, or facts.
4. If a section has no relevant facts (e.g., no leakage flags are present in the JSON), state that clearly (e.g., "No target leakage detected.").
5. Be professional, concise, and direct. Use bullet points where appropriate.
6. The entire output must consist ONLY of the Markdown content. Do not include introductory or concluding conversational text.
"""

    data = {
        "model": "llama-3.1-8b-instant",
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.0
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers=headers,
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            narrative = res_data["choices"][0]["message"]["content"]
            return narrative.strip()
    except Exception as e:
        raise Exception(f"Failed to generate story narrative from Groq: {e}")

def verify_numbers_grounded(markdown_text: str, source_json: Dict[str, Any]) -> List[float]:
    """
    Extracts numbers from Markdown and compares them against the source JSON numbers.
    Any numbers not present in source JSON are returned as mismatches.
    """
    json_numbers = set()
    
    def extract_nums(val):
        if isinstance(val, (int, float)):
            json_numbers.add(round(float(val), 4))
            json_numbers.add(round(float(val) * 100, 4))
        elif isinstance(val, dict):
            for v in val.values():
                extract_nums(v)
        elif isinstance(val, list):
            for item in val:
                extract_nums(item)
        elif isinstance(val, str):
            try:
                num = float(val.replace(",", "").strip())
                json_numbers.add(round(num, 4))
            except ValueError:
                pass

    extract_nums(source_json)

    # Match numbers (both decimals and integers)
    found_nums = re.findall(r'-?\b\d[\d,]*\.?\d*\b', markdown_text)
    mismatches = []
    
    for s in found_nums:
        cleaned = s.replace(",", "").strip()
        if not cleaned:
            continue
        try:
            val = round(float(cleaned), 4)
            # Allow common low integers (like section enumerations, page limits, etc.)
            if val in [1.0, 2.0, 3.0, 4.0, 5.0, 10.0, 100.0]:
                continue
                
            matched = False
            for jn in json_numbers:
                if abs(jn - val) < 1e-4:
                    matched = True
                    break
            if not matched:
                mismatches.append(float(cleaned))
        except ValueError:
            pass
            
    return mismatches
