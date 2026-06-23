import sys
import os

# Add backend directory to sys.path so we can import src
sys.path.append("c:/Users/Mythri Banda/OneDrive/Desktop/github projects/InsightFlow/backend")

import pandas as pd
import numpy as np
from src.modeling import LeakageSafePipeline
from src.modeling_extensions import get_feature_importance

def test():
    # Create a small sample DataFrame
    df = pd.DataFrame({
        'age': [25, 30, 35, 40, 45],
        'experience': [2, 5, 8, 12, 15],
        'salary': [50000.0, 60000.0, 70000.0, 80000.0, 90000.0],
        'department': [1, 0, 1, 0, 1]
    })
    
    X = df[['age', 'experience']]
    y_reg = df['salary']
    y_cls = df['department']

    print("--- 1. Testing LinearRegression pipeline (Regression) ---")
    pipeline_reg = LeakageSafePipeline.build_pipeline(X, y_reg, 'regression')

    print("\n--- 2. Testing LogisticRegression pipeline (Classification) ---")
    pipeline_cls = LeakageSafePipeline.build_pipeline(X, y_cls, 'classification')

    print("\n--- 3. Testing permutation_importance ---")
    pipeline_reg.fit(X, y_reg)
    get_feature_importance(pipeline_reg, X, y_reg, 'regression')

if __name__ == "__main__":
    test()
