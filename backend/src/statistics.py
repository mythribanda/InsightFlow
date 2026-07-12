"""
Statistical testing module using scipy.stats.

Provides helpers to perform:
1. Independent samples t-test
2. One-way ANOVA
3. Chi-square test of independence
4. Confidence interval computation

Each function handles missing values, validates prerequisites, and returns a
dictionary with test metrics and plain-English natural language interpretations.
"""

import logging
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd
import scipy.stats as stats

logger = logging.getLogger(__name__)


def run_t_test(df: pd.DataFrame, col: str, group_col: str) -> Dict[str, Any]:
    """
    Performs an independent two-sample t-test.
    Compares the mean of a numeric column `col` across exactly two groups in `group_col`.
    """
    if col not in df.columns:
        raise ValueError(f"Column '{col}' not found in dataset")
    if group_col not in df.columns:
        raise ValueError(f"Grouping column '{group_col}' not found in dataset")

    # Drop missing values
    clean_df = df[[col, group_col]].dropna()

    if not pd.api.types.is_numeric_dtype(clean_df[col]):
        raise ValueError(f"Column '{col}' must be numeric for a t-test")

    # Get groups
    unique_groups = clean_df[group_col].unique()
    if len(unique_groups) != 2:
        raise ValueError(
            f"Grouping column '{group_col}' must have exactly 2 unique values. "
            f"Found: {list(unique_groups)}"
        )

    g1_val, g2_val = unique_groups
    group1 = clean_df[clean_df[group_col] == g1_val][col]
    group2 = clean_df[clean_df[group_col] == g2_val][col]

    if len(group1) < 2 or len(group2) < 2:
        raise ValueError("Each group must contain at least 2 observations")

    # Independent t-test (Welch's t-test by default, equal_var=False is safer)
    t_stat, p_val = stats.ttest_ind(group1, group2, equal_var=False, nan_policy="omit")

    # Check for NaN results (e.g. zero variance)
    if np.isnan(t_stat) or np.isnan(p_val):
        t_stat = 0.0
        p_val = 1.0

    mean1 = float(group1.mean())
    mean2 = float(group2.mean())
    significant = bool(p_val < 0.05)

    # Narrative interpretation
    sig_text = "statistically significant" if significant else "not statistically significant"
    comparison = (
        "is higher than" if mean1 > mean2 else "is lower than"
    ) if mean1 != mean2 else "is equal to"

    interpretation = (
        f"An independent samples t-test reveals a {sig_text} difference in "
        f"'{col}' between the two groups of '{group_col}'.\n"
        f"• Group '{g1_val}' mean: {mean1:.4f} (N={len(group1)})\n"
        f"• Group '{g2_val}' mean: {mean2:.4f} (N={len(group2)})\n"
    )
    if significant:
        interpretation += (
            f"The average '{col}' for group '{g1_val}' ({mean1:.4f}) {comparison} "
            f"group '{g2_val}' ({mean2:.4f}) (p = {p_val:.4g})."
        )
    else:
        interpretation += (
            f"The observed difference in averages is likely due to random sampling variance "
            f"(p = {p_val:.4g})."
        )

    return {
        "statistic": float(t_stat),
        "p_value": float(p_val),
        "significant": significant,
        "interpretation": interpretation,
        "extra_info": {
            "group1_name": str(g1_val),
            "group1_mean": mean1,
            "group1_count": len(group1),
            "group2_name": str(g2_val),
            "group2_mean": mean2,
            "group2_count": len(group2),
        },
    }


def run_anova(df: pd.DataFrame, col: str, group_col: str) -> Dict[str, Any]:
    """
    Performs a one-way analysis of variance (ANOVA).
    Compares the mean of a numeric column `col` across 2+ groups in `group_col`.
    """
    if col not in df.columns:
        raise ValueError(f"Column '{col}' not found in dataset")
    if group_col not in df.columns:
        raise ValueError(f"Grouping column '{group_col}' not found in dataset")

    # Drop missing values
    clean_df = df[[col, group_col]].dropna()

    if not pd.api.types.is_numeric_dtype(clean_df[col]):
        raise ValueError(f"Column '{col}' must be numeric for ANOVA")

    # Get groups
    unique_groups = clean_df[group_col].unique()
    if len(unique_groups) < 2:
        raise ValueError(
            f"Grouping column '{group_col}' must have at least 2 groups. "
            f"Found: {list(unique_groups)}"
        )

    group_data = []
    group_means = {}
    for g in unique_groups:
        sub_series = clean_df[clean_df[group_col] == g][col]
        if len(sub_series) < 2:
            raise ValueError(f"Group '{g}' must contain at least 2 observations")
        group_data.append(sub_series)
        group_means[str(g)] = {
            "mean": float(sub_series.mean()),
            "count": len(sub_series),
        }

    # One-way ANOVA
    f_stat, p_val = stats.f_oneway(*group_data)

    if np.isnan(f_stat) or np.isnan(p_val):
        f_stat = 0.0
        p_val = 1.0

    significant = bool(p_val < 0.05)

    sig_text = "statistically significant" if significant else "not statistically significant"
    interpretation = (
        f"A one-way ANOVA indicates a {sig_text} difference in averages of '{col}' "
        f"across the groups defined by '{group_col}' (F = {f_stat:.4f}, p = {p_val:.4g}).\n"
    )

    means_desc = "\n".join(
        [f"• Group '{g}': mean = {info['mean']:.4f} (N={info['count']})" for g, info in group_means.items()]
    )
    interpretation += means_desc + "\n"

    if significant:
        # Find highest and lowest means
        sorted_groups = sorted(group_means.items(), key=lambda x: x[1]["mean"])
        lowest_group, lowest_val = sorted_groups[0][0], sorted_groups[0][1]["mean"]
        highest_group, highest_val = sorted_groups[-1][0], sorted_groups[-1][1]["mean"]
        interpretation += (
            f"Group '{highest_group}' has the highest average '{col}' ({highest_val:.4f}), "
            f"while group '{lowest_group}' has the lowest average ({lowest_val:.4f})."
        )
    else:
        interpretation += "There is insufficient evidence to conclude that any group averages differ significantly from each other."

    return {
        "statistic": float(f_stat),
        "p_value": float(p_val),
        "significant": significant,
        "interpretation": interpretation,
        "extra_info": {
            "group_means": group_means,
            "n_groups": len(unique_groups),
        },
    }


def run_chi_square(df: pd.DataFrame, col1: str, col2: str) -> Dict[str, Any]:
    """
    Performs a Chi-Square test of independence between two categorical columns.
    Assesses whether an association exists between `col1` and `col2`.
    """
    if col1 not in df.columns or col2 not in df.columns:
        raise ValueError("Both specified columns must exist in the dataset")

    # Drop missing values
    clean_df = df[[col1, col2]].dropna()

    if len(clean_df) < 5:
        raise ValueError("Dataset must contain at least 5 complete observations")

    # Build contingency table
    contingency_table = pd.crosstab(clean_df[col1], clean_df[col2])

    # Chi-square test
    chi2, p_val, dof, expected = stats.chi2_contingency(contingency_table)

    significant = bool(p_val < 0.05)
    sig_text = "statistically significant" if significant else "not statistically significant"

    interpretation = (
        f"A Chi-square test of independence shows a {sig_text} association "
        f"between '{col1}' and '{col2}' (χ² = {chi2:.4f}, p = {p_val:.4g}, dof = {dof}).\n"
    )

    if significant:
        interpretation += (
            f"The distribution of values in '{col1}' depends significantly on the values "
            f"in '{col2}', suggesting a dependency between these fields."
        )
    else:
        interpretation += (
            f"The variables appear to be independent. Any observed variation in the crosstab "
            f"contingency distribution is likely due to chance alone."
        )

    # Return contingency table as list of lists for serialisation
    return {
        "statistic": float(chi2),
        "p_value": float(p_val),
        "significant": significant,
        "interpretation": interpretation,
        "extra_info": {
            "degrees_of_freedom": int(dof),
            "contingency_table": contingency_table.values.tolist(),
            "columns": list(contingency_table.columns),
            "index": list(contingency_table.index),
        },
    }


def run_confidence_interval(
    df: pd.DataFrame, col: str, confidence: float = 0.95
) -> Dict[str, Any]:
    """
    Computes the sample mean and the Student's t confidence interval bounds for a numeric column.
    """
    if col not in df.columns:
        raise ValueError(f"Column '{col}' not found in dataset")

    series = df[col].dropna()
    if not pd.api.types.is_numeric_dtype(series):
        raise ValueError(f"Column '{col}' must be numeric for confidence intervals")

    n = len(series)
    if n < 2:
        raise ValueError("Column must contain at least 2 non-null observations")

    mean = float(series.mean())
    std_err = stats.sem(series)

    # Compute CI bounds
    lower_bound, upper_bound = stats.t.interval(
        confidence, n - 1, loc=mean, scale=std_err
    )

    margin_of_error = float(upper_bound - mean)

    interpretation = (
        f"For a {confidence * 100:.0f}% confidence level, the estimated population mean for "
        f"'{col}' is between {lower_bound:.4f} and {upper_bound:.4f}.\n"
        f"• Sample Mean: {mean:.4f}\n"
        f"• Margin of Error: ±{margin_of_error:.4f}\n"
        f"• Sample Size: N = {n}"
    )

    return {
        "statistic": mean,
        "p_value": 0.0,  # placeholder
        "significant": True,
        "interpretation": interpretation,
        "extra_info": {
            "mean": mean,
            "margin_of_error": margin_of_error,
            "lower_bound": float(lower_bound),
            "upper_bound": float(upper_bound),
            "confidence_level": confidence,
            "sample_size": n,
        },
    }
