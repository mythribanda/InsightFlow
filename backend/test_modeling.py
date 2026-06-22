"""
Test script for modeling pipeline.
Demonstrates task detection, leakage scanning, and model training.

Run: python test_modeling.py (from backend/ directory)
"""

import pandas as pd
import numpy as np
from src.modeling import run_modeling_pipeline

# Test 1: Iris Classification with synthetic leakage
print("=" * 70)
print("TEST 1: Iris Classification with Synthetic Leakage")
print("=" * 70)

from sklearn.datasets import load_iris

iris = load_iris()
X = pd.DataFrame(iris.data, columns=iris.feature_names)
y = pd.Series(iris.target, name='target')

# Add synthetic leakage: copy target into feature
X['leaky_target_copy'] = y.map({0: 'setosa', 1: 'versicolor', 2: 'virginica'})

# Add ID-like column
X['sample_id'] = np.arange(len(X))

# Add near-perfect correlation
X['near_perfect_corr'] = y + np.random.normal(0, 0.01, len(y))

print(f"\nDataset shape: {X.shape}")
print(f"Target shape: {y.shape}")
print(f"Features: {X.columns.tolist()}\n")

# Run pipeline
print("Running modeling pipeline...")
output = run_modeling_pipeline(
    X=X,
    y=y,
    target_col='target',
    cv_splits=5
)

print(f"\n[OK] Task detected: {output.task}")
print(f"[OK] Leakage flags found: {len(output.leakage_flags)}\n")

# Print leakage flags
if output.leakage_flags:
    print("Leakage Flags:")
    for flag in output.leakage_flags:
        print(f"  * {flag['column']}: {flag['reason']}")
        if flag.get('score'):
            print(f"    Score: {flag['score']:.3f}")
else:
    print("[WARNING] No leakage flags found (unexpected!)")

# Print model results
print(f"\nModel Results (5-fold CV, mean +/- std):\n")
for result in output.results:
    print(f"{result['model']}:")
    for metric, mean_val in result['metrics'].items():
        std_val = result['std'][metric]
        print(f"  {metric:20s}: {mean_val:7.3f} +/- {std_val:.3f}")
    print()

# Print best model
print(f"Best Model: {output.best['model']}")
print(f"Primary Metric: {output.best['primary_metric']} = {output.best['value']:.3f} +/- {output.best['std']:.3f}")

# Test 2: Excluding leaky columns
print("\n" + "=" * 70)
print("TEST 2: Iris Classification (EXCLUDING Leaky Columns)")
print("=" * 70)

print("\nRunning pipeline with excluded_features=['leaky_target_copy', 'sample_id', 'near_perfect_corr']...")
output_clean = run_modeling_pipeline(
    X=X,
    y=y,
    target_col='target',
    excluded_features=['leaky_target_copy', 'sample_id', 'near_perfect_corr'],
    cv_splits=5
)

print(f"\n[OK] Task detected: {output_clean.task}")
print(f"[OK] Leakage flags: {len(output_clean.leakage_flags)}\n")

print("Model Results (with leaky columns EXCLUDED):\n")
for result in output_clean.results:
    print(f"{result['model']}:")
    for metric, mean_val in result['metrics'].items():
        std_val = result['std'][metric]
        print(f"  {metric:20s}: {mean_val:7.3f} +/- {std_val:.3f}")
    print()

# Comparison
print("\nComparison (WITH vs WITHOUT leakage):")
print("-" * 70)
print(f"{'Metric':<20} | {'With Leakage':<15} | {'Without Leakage':<15}")
print("-" * 70)

metric_compare = 'accuracy'
for result_with, result_without in zip(output.results, output_clean.results):
    if result_with['model'] == result_without['model']:
        with_val = result_with['metrics'].get(metric_compare, np.nan)
        without_val = result_without['metrics'].get(metric_compare, np.nan)
        model = result_with['model']
        print(f"{model:<20} | {with_val:14.3f} | {without_val:15.3f}")

print("\n[OK] Expected: Metrics WITHOUT leakage should be lower/more honest")
print("[OK] This demonstrates the importance of the leakage scan & exclusion\n")

# Test 3: Simple regression
print("=" * 70)
print("TEST 3: Regression (Diabetes Dataset)")
print("=" * 70)

from sklearn.datasets import load_diabetes

diabetes = load_diabetes()
X_reg = pd.DataFrame(diabetes.data, columns=diabetes.feature_names)
y_reg = pd.Series(diabetes.target, name='target')

# Add one "leaky" feature: very high correlation with target
X_reg['leaky_feature'] = y_reg + np.random.normal(0, 0.1, len(y_reg))

print(f"\nDataset shape: {X_reg.shape}")
print(f"Features: {X_reg.columns.tolist()}\n")

print("Running modeling pipeline...")
output_reg = run_modeling_pipeline(
    X=X_reg,
    y=y_reg,
    target_col='target',
    cv_splits=5
)

print(f"\n[OK] Task detected: {output_reg.task}")
print(f"[OK] Leakage flags found: {len(output_reg.leakage_flags)}\n")

if output_reg.leakage_flags:
    print("Leakage Flags:")
    for flag in output_reg.leakage_flags:
        print(f"  * {flag['column']}: {flag['reason']}")

print(f"\nModel Results (5-fold CV, mean +/- std):\n")
for result in output_reg.results:
    print(f"{result['model']}:")
    for metric, mean_val in result['metrics'].items():
        std_val = result['std'][metric]
        print(f"  {metric:8s}: {mean_val:7.3f} +/- {std_val:.3f}")
    print()

print("=" * 70)
print("All tests complete!")
print("=" * 70)
