import logging
import json
import pandas as pd
import numpy as np
from fastapi import APIRouter, HTTPException, Header

from state import session_data_store, verify_session_owner
from schemas import VisualizationRequest, CodeExportRequest

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/visualize/{session_id}")
async def get_visualization(session_id: str, request: VisualizationRequest, x_user_id: str = Header(None)):
    verify_session_owner(session_id, x_user_id)
    """
    Generate data and insights for client-side visualizations.
    """
    try:
        logger.info(f"[{session_id}] Visualization request for: {request.column1} & {request.column2} (type: {request.chart_type})")
        
        # Retrieve df from store
        df = session_data_store.get(session_id)
        if df is None:
            raise HTTPException(
                status_code=404,
                detail="No dataset found for this session. Please upload a dataset first."
            )
            
        col1 = request.column1
        col2 = request.column2
        chart_type = request.chart_type
        
        if col1 not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{col1}' not found in dataset"
            )
            
        if col2 and col2 not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{col2}' not found in dataset"
            )
            
        # 1. Scatter Plot
        if chart_type == "scatter":
            if not col2:
                raise HTTPException(status_code=400, detail="Scatter plot requires two columns")
            df_clean = df[[col1, col2]].dropna()
            if len(df_clean) < 2:
                return {"data": [], "insight": "Not enough data points for scatter plot."}
            
            # Sample for performance if needed
            if len(df_clean) > 5000:
                df_clean = df_clean.sample(n=5000, random_state=42)
                
            data = df_clean.to_dict('records')
            
            # Compute correlation
            try:
                r = float(df_clean[col1].corr(df_clean[col2]))
            except:
                r = float('nan')
                
            # Compute trend line
            try:
                x = df_clean[col1].values.astype(float)
                y = df_clean[col2].values.astype(float)
                m, c = np.polyfit(x, y, 1)
                for record in data:
                    record['trend'] = float(m * record[col1] + c)
            except:
                pass
                
            if not np.isnan(r):
                strength = "strong" if abs(r) > 0.7 else "moderate" if abs(r) > 0.4 else "weak"
                direction = "positive" if r > 0 else "negative"
                insight = f"Strong positive correlation (r={r:.2f}) between {col1} and {col2}. This suggests values increase together." if strength == "strong" and direction == "positive" else \
                          f"Strong negative correlation (r={r:.2f}) between {col1} and {col2}. This suggests values move in opposite directions." if strength == "strong" and direction == "negative" else \
                          f"There is a {strength} {direction} correlation (r={r:.2f}) between '{col1}' and '{col2}'."
            else:
                insight = f"Scatter plot of '{col1}' vs '{col2}' generated (no linear correlation computed)."
                
            return {"data": data, "insight": insight, "correlation": r if not np.isnan(r) else None}
            
        # 2. Histogram
        elif chart_type == "histogram":
            df_clean = df[col1].dropna()
            if len(df_clean) < 1:
                return {"data": [], "insight": "Not enough data points for histogram."}
            
            counts, bin_edges = np.histogram(df_clean, bins='auto')
            data = []
            for i in range(len(counts)):
                data.append({
                    "bin": f"{bin_edges[i]:.2f} - {bin_edges[i+1]:.2f}",
                    "count": int(counts[i])
                })
            
            peak_bin = data[np.argmax(counts)]["bin"]
            insight = f"The values of '{col1}' range from {df_clean.min():.2f} to {df_clean.max():.2f}, with the peak frequency in the bin '{peak_bin}'."
            return {"data": data, "insight": insight}
            
        # 3. Box Plot (single column)
        elif chart_type == "boxplot" and not col2:
            df_clean = df[col1].dropna()
            if len(df_clean) < 1:
                return {"data": [], "insight": "Not enough data points for box plot."}
                
            desc = df_clean.describe()
            q1 = float(desc.get('25%', 0))
            median = float(desc.get('50%', 0))
            q3 = float(desc.get('75%', 0))
            min_val = float(desc.get('min', 0))
            max_val = float(desc.get('max', 0))
            
            data = [{
                "name": col1,
                "min": min_val,
                "q1": q1,
                "median": median,
                "q3": q3,
                "max": max_val
            }]
            insight = f"'{col1}' has a median value of {median:.2f}, with 50% of the data falling between {q1:.2f} (Q1) and {q3:.2f} (Q3)."
            return {"data": data, "insight": insight}
            
        # 4. Box Plot (grouped: categorical + numeric)
        elif chart_type == "boxplot" and col2:
            # col1 is categorical, col2 is numeric
            df_clean = df[[col1, col2]].dropna()
            if len(df_clean) < 1:
                return {"data": [], "insight": "Not enough data points for grouped box plot."}
                
            groups = df_clean.groupby(col1)[col2]
            data = []
            for name, g in groups:
                if len(g) == 0:
                    continue
                desc = g.describe()
                data.append({
                    "group": str(name),
                    "min": float(desc.get('min', 0)),
                    "q1": float(desc.get('25%', 0)),
                    "median": float(desc.get('50%', 0)),
                    "q3": float(desc.get('75%', 0)),
                    "max": float(desc.get('max', 0))
                })
            
            if not data:
                return {"data": [], "insight": "No grouped data generated."}
                
            data = sorted(data, key=lambda x: x['median'], reverse=True)
            insight = f"Grouped by '{col1}', the highest median '{col2}' is found in group '{data[0]['group']}' ({data[0]['median']:.2f})."
            return {"data": data, "insight": insight}
            
        # 5. Distribution (KDE)
        elif chart_type == "kde":
            df_clean = df[col1].dropna()
            if len(df_clean) < 2:
                return {"data": [], "insight": "Not enough data points for KDE distribution."}
                
            values = df_clean.values.astype(float)
            x_grid = np.linspace(values.min(), values.max(), 100)
            
            # Silverman's bandwidth selection
            n = len(values)
            std = np.std(values)
            if std == 0:
                std = 1.0
            bandwidth = 1.06 * std * (n ** -0.2)
            
            # Compute Gaussian KDE densities in pure numpy
            densities = []
            for x in x_grid:
                diffs = (values - x) / bandwidth
                kernels = np.exp(-0.5 * (diffs ** 2)) / (np.sqrt(2 * np.pi) * bandwidth)
                densities.append(float(np.mean(kernels)))
                
            data = [{"x": float(x), "density": float(d)} for x, d in zip(x_grid, densities)]
            peak_x = x_grid[np.argmax(densities)]
            insight = f"The distribution of '{col1}' is continuous, with a peak density near {peak_x:.2f}."
            return {"data": data, "insight": insight}
            
        # 6. Bar Chart (categorical + numeric)
        elif chart_type == "bar":
            if not col2:
                raise HTTPException(status_code=400, detail="Bar chart requires two columns")
            df_clean = df[[col1, col2]].dropna()
            if len(df_clean) < 1:
                return {"data": [], "insight": "Not enough data points for bar chart."}
                
            # Aggregate by mean
            grouped = df_clean.groupby(col1)[col2].mean().reset_index()
            data = grouped.rename(columns={col1: "category", col2: "value"}).to_dict('records')
            
            if not data:
                return {"data": [], "insight": "No aggregated data generated."}
                
            data = sorted(data, key=lambda x: x['value'], reverse=True)
            insight = f"On average, group '{data[0]['category']}' has the highest '{col2}' value of {data[0]['value']:.2f}."
            return {"data": data, "insight": insight}
            
        # 7. Heatmap (categorical + categorical)
        elif chart_type == "heatmap":
            if not col2:
                raise HTTPException(status_code=400, detail="Heatmap requires two columns")
            df_clean = df[[col1, col2]].dropna()
            if len(df_clean) < 1:
                return {"data": [], "insight": "Not enough data points for heatmap."}
                
            ct = pd.crosstab(df_clean[col1], df_clean[col2])
            data = []
            for idx in ct.index:
                for col in ct.columns:
                    data.append({
                        "x": str(idx),
                        "y": str(col),
                        "count": int(ct.loc[idx, col])
                    })
                    
            if not data:
                return {"data": [], "insight": "No cross-tabulated data generated."}
                
            max_cell = max(data, key=lambda x: x['count'])
            insight = f"The combination of '{col1}' = '{max_cell['x']}' and '{col2}' = '{max_cell['y']}' is most frequent, with {max_cell['count']} occurrences."
            return {"data": data, "insight": insight}
            
        # 8. Grouped Bar Chart (categorical + categorical)
        elif chart_type == "grouped_bar":
            if not col2:
                raise HTTPException(status_code=400, detail="Grouped bar chart requires two columns")
            df_clean = df[[col1, col2]].dropna()
            if len(df_clean) < 1:
                return {"data": [], "insight": "Not enough data points for grouped bar chart."}
                
            ct = pd.crosstab(df_clean[col1], df_clean[col2])
            data = []
            for idx in ct.index:
                row = {"name": str(idx)}
                for col in ct.columns:
                    row[str(col)] = int(ct.loc[idx, col])
                data.append(row)
                
            keys = [str(col) for col in ct.columns]
            insight = f"Comparing '{col1}' across '{col2}', the distribution shows varying frequencies per category."
            return {"data": data, "insight": insight, "keys": keys}

        # 9. Line Chart
        elif chart_type == "line":
            is_numeric_x = pd.api.types.is_numeric_dtype(df[col1])
            is_datetime_x = pd.api.types.is_datetime64_any_dtype(df[col1])
            
            if not is_numeric_x and not is_datetime_x:
                try:
                    temp_dt = pd.to_datetime(df[col1], errors='raise')
                    is_datetime_x = True
                except:
                    pass
            
            if not is_numeric_x and not is_datetime_x:
                raise HTTPException(status_code=400, detail="Line chart requires a numeric or date column for the X axis")
            if not col2:
                raise HTTPException(status_code=400, detail="Line chart requires two columns (x and y)")
            
            df_clean = df[[col1, col2]].copy()
            if is_datetime_x and not pd.api.types.is_datetime64_any_dtype(df_clean[col1]):
                df_clean[col1] = pd.to_datetime(df_clean[col1], errors='coerce')
                
            df_clean = df_clean.dropna()
            if len(df_clean) < 2:
                return {"data": [], "insight": "Not enough data points for a line chart."}

            # Sort by col1 so the line reads left-to-right in order
            df_sorted = df_clean.sort_values(by=col1)
            if len(df_sorted) > 2000:
                df_sorted = df_sorted.iloc[::len(df_sorted)//2000]  # downsample evenly, preserve order

            # Convert datetime X column back to string for JSON serialization
            if is_datetime_x:
                df_sorted[col1] = df_sorted[col1].dt.strftime('%Y-%m-%d %H:%M:%S')

            data = df_sorted.to_dict('records')
            trend = "increasing" if df_sorted[col2].iloc[-1] > df_sorted[col2].iloc[0] else "decreasing"
            insight = f"{col2} shows an overall {trend} trend across {col1}."
            return {"data": data, "insight": insight}

        # 10. Pie / Donut Chart
        elif chart_type in ("pie", "donut"):
            if df[col1].nunique() > 50:
                raise HTTPException(status_code=400, detail="Pie/donut charts need a categorical column with fewer distinct values. Try a column with fewer unique categories.")
            series = df[col1].dropna()
            if series.empty:
                return {"data": [], "insight": "No data available for this column."}

            counts = series.value_counts()
            # Cap at top 8 categories, group the rest as "Other"
            if len(counts) > 8:
                top = counts.head(8)
                other_sum = counts.iloc[8:].sum()
                counts = pd.concat([top, pd.Series({"Other": other_sum})])

            total = counts.sum()
            data = [{"name": str(k), "value": int(v), "pct": round(float(v) / total * 100, 1)} for k, v in counts.items()]
            top_cat = counts.index[0]
            top_pct = round(float(counts.iloc[0]) / total * 100, 1)
            insight = f"'{top_cat}' is the largest category at {top_pct}% of {col1}."
            return {"data": data, "insight": insight, "chart_subtype": "donut" if chart_type == "donut" else "pie"}

        # 11. Treemap
        elif chart_type == "treemap":
            if not col2:
                # Single-column treemap: size by category frequency
                series = df[col1].dropna()
                counts = series.value_counts().head(20)
                data = [{"name": str(k), "value": int(v)} for k, v in counts.items()]
                insight = f"Treemap of {col1} by frequency, showing top {len(data)} categories."
            else:
                # Two-column treemap: size by aggregated numeric value per category
                if not pd.api.types.is_numeric_dtype(df[col2]):
                    raise HTTPException(status_code=400, detail="Treemap's second column (size) must be numeric")
                grouped = df.groupby(col1)[col2].sum().sort_values(ascending=False).head(20)
                data = [{"name": str(k), "value": float(v)} for k, v in grouped.items()]
                insight = f"Treemap of {col1}, sized by total {col2}, showing top {len(data)} categories."
            return {"data": data, "insight": insight}

        # 12. Funnel Chart
        elif chart_type == "funnel":
            if not pd.api.types.is_numeric_dtype(df[col1]) and col1 in df.columns:
                series = df[col1].dropna()
                counts = series.value_counts().sort_values(ascending=False).head(10)
                data = [{"stage": str(k), "value": int(v)} for k, v in counts.items()]
                insight = (
                     f"Funnel approximated from {col1} category counts, ordered largest to smallest. "
                     "True funnel stages (e.g. signup → activation → purchase) require columns that "
                     "represent sequential steps — this is a best-effort approximation, not a real conversion funnel."
                )
                return {"data": data, "insight": insight}
            raise HTTPException(status_code=400, detail="Funnel chart requires a categorical column")

        # 13. Waterfall Chart
        elif chart_type == "waterfall":
            if not col2:
                raise HTTPException(status_code=400, detail="Waterfall chart requires two columns: a category and a numeric delta")
            if not pd.api.types.is_numeric_dtype(df[col2]):
                raise HTTPException(status_code=400, detail="Waterfall's second column must be numeric (the delta values)")

            grouped = df.groupby(col1)[col2].sum().head(15)
            cumulative = 0.0
            data = []
            for name, val in grouped.items():
                start = cumulative
                cumulative += float(val)
                data.append({"name": str(name), "start": start, "end": cumulative, "delta": float(val)})

            insight = f"Waterfall shows cumulative effect of {col2} across {col1} categories, ending at {round(cumulative, 2)}."
            return {"data": data, "insight": insight}

        # 14. Gauge Chart
        elif chart_type == "gauge":
            if not pd.api.types.is_numeric_dtype(df[col1]):
                raise HTTPException(status_code=400, detail="Gauge chart requires a numeric column")
            series = df[col1].dropna()
            if series.empty:
                return {"data": [], "insight": "No data available."}

            current = float(series.mean())
            min_val = float(series.min())
            max_val = float(series.max())
            data = [{"value": current, "min": min_val, "max": max_val}]
            insight = f"Average {col1} is {round(current, 2)}, ranging from {round(min_val, 2)} to {round(max_val, 2)}."
            return {"data": data, "insight": insight}

        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported chart type '{chart_type}'"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Visualization error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Visualization failed: {str(e)}")


@router.post("/visualize/{session_id}/export-code")
async def export_visualization_code(session_id: str, request: CodeExportRequest, x_user_id: str = Header(None)):
    verify_session_owner(session_id, x_user_id)
    """Generate a standalone Python script reproducing the requested chart."""
    df = session_data_store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="No dataset found for this session.")

    col1 = request.column1
    col2 = request.column2
    chart_type = request.chart_type

    # Verify column existence
    if col1 not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{col1}' not found in dataset")
    if col2 and col2 not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{col2}' not found in dataset")

    templates = {
        "scatter": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

df = pd.read_csv("your_dataset.csv")
df_clean = df[["{col1}", "{col2}"]].dropna()

try:
    r = float(df_clean["{col1}"].corr(df_clean["{col2}"]))
    title_suffix = f" (r = {{r:.3f}})"
except:
    title_suffix = ""

plt.figure(figsize=(8, 6))
plt.scatter(df_clean["{col1}"], df_clean["{col2}"], alpha=0.6, color="#0ea5e9")

# Add trend line if both are numeric
try:
    x = df_clean["{col1}"].values.astype(float)
    y = df_clean["{col2}"].values.astype(float)
    m, c = np.polyfit(x, y, 1)
    x_line = np.linspace(x.min(), x.max(), 100)
    plt.plot(x_line, m * x_line + c, color="#f43f5e", linewidth=2, label="Trend Line")
    plt.legend()
except:
    pass

plt.xlabel("{col1}")
plt.ylabel("{col2}")
plt.title(f"{col1} vs {col2}{{title_suffix}}")
plt.tight_layout()
plt.savefig("scatter_{col1}_{col2}.png", dpi=150)
plt.show()
""",
        "histogram": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
series = df["{col1}"].dropna()

plt.figure(figsize=(8, 6))
plt.hist(series, bins="auto", color="#0ea5e9", edgecolor="white")
plt.xlabel("{col1}")
plt.ylabel("Frequency")
plt.title("Distribution of {col1}")
plt.tight_layout()
plt.savefig("histogram_{col1}.png", dpi=150)
plt.show()
""",
        "boxplot": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
""" + (f"""
df_clean = df[["{col1}", "{col2}"]].dropna()
groups = [group.values for name, group in df_clean.groupby("{col1}")["{col2}"]]
labels = [str(name) for name, _ in df_clean.groupby("{col1}")["{col2}"]]

plt.figure(figsize=(10, 6))
plt.boxplot(groups, labels=labels)
plt.xticks(rotation=45, ha="right")
plt.xlabel("{col1}")
plt.ylabel("{col2}")
plt.title("Box Plot of {col2} grouped by {col1}")
""" if col2 else f"""
series = df["{col1}"].dropna()

plt.figure(figsize=(6, 6))
plt.boxplot(series, labels=["{col1}"])
plt.ylabel("{col1}")
plt.title("Box Plot of {col1}")
""") + f"""
plt.tight_layout()
plt.savefig("boxplot_{col1}{'_' + col2 if col2 else ''}.png", dpi=150)
plt.show()
""",
        "kde": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

df = pd.read_csv("your_dataset.csv")
series = df["{col1}"].dropna()

plt.figure(figsize=(8, 6))
sns.kdeplot(series, fill=True, color="#0ea5e9", linewidth=2)
plt.xlabel("{col1}")
plt.ylabel("Density")
plt.title("Density Distribution of {col1}")
plt.tight_layout()
plt.savefig("kde_{col1}.png", dpi=150)
plt.show()
""",
        "bar": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
df_clean = df[["{col1}", "{col2}"]].dropna()
grouped = df_clean.groupby("{col1}")["{col2}"].mean().sort_values(ascending=False).head(20)

plt.figure(figsize=(10, 6))
plt.bar(grouped.index.astype(str), grouped.values, color="#0ea5e9")
plt.xticks(rotation=45, ha="right")
plt.xlabel("{col1}")
plt.ylabel("Average {col2}")
plt.title("Average {col2} by {col1}")
plt.tight_layout()
plt.savefig("bar_{col1}_{col2}.png", dpi=150)
plt.show()
""",
        "grouped_bar": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
df_clean = df[["{col1}", "{col2}"]].dropna()
ct = pd.crosstab(df_clean["{col1}"], df_clean["{col2}"])

ax = ct.plot(kind="bar", figsize=(12, 6), width=0.8)
plt.xticks(rotation=45, ha="right")
plt.xlabel("{col1}")
plt.ylabel("Count")
plt.title("Distribution of {col2} across {col1}")
plt.legend(title="{col2}")
plt.tight_layout()
plt.savefig("grouped_bar_{col1}_{col2}.png", dpi=150)
plt.show()
""",
        "heatmap": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

df = pd.read_csv("your_dataset.csv")
df_clean = df[["{col1}", "{col2}"]].dropna()
ct = pd.crosstab(df_clean["{col1}"], df_clean["{col2}"])

plt.figure(figsize=(10, 8))
sns.heatmap(ct, annot=True, fmt="d", cmap="YlGnBu", cbar=True)
plt.xlabel("{col2}")
plt.ylabel("{col1}")
plt.title("Heatmap Crosstab: {col1} vs {col2}")
plt.tight_layout()
plt.savefig("heatmap_{col1}_{col2}.png", dpi=150)
plt.show()
""",
        "line": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
try:
    if not pd.api.types.is_numeric_dtype(df["{col1}"]):
        df["{col1}"] = pd.to_datetime(df["{col1}"])
except:
    pass

df_clean = df[["{col1}", "{col2}"]].dropna().sort_values(by="{col1}")

plt.figure(figsize=(10, 6))
plt.plot(df_clean["{col1}"], df_clean["{col2}"], color="#0ea5e9", marker="o", markersize=3, linewidth=1.5)
plt.xlabel("{col1}")
plt.ylabel("{col2}")
plt.title("{col2} over {col1}")
plt.xticks(rotation=30)
plt.tight_layout()
plt.savefig("line_{col1}_{col2}.png", dpi=150)
plt.show()
""",
        "pie": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
counts = df["{col1}"].dropna().value_counts()

if len(counts) > 8:
    top = counts.head(8)
    other_sum = counts.iloc[8:].sum()
    counts = pd.concat([top, pd.Series({{"Other": other_sum}})])

plt.figure(figsize=(8, 8))
plt.pie(counts.values, labels=counts.index, autopct="%1.1f%%", startangle=90)
plt.title("Distribution of {col1}")
plt.tight_layout()
plt.savefig("pie_{col1}.png", dpi=150)
plt.show()
""",
        "donut": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
counts = df["{col1}"].dropna().value_counts()

if len(counts) > 8:
    top = counts.head(8)
    other_sum = counts.iloc[8:].sum()
    counts = pd.concat([top, pd.Series({{"Other": other_sum}})])

plt.figure(figsize=(8, 8))
wedgeprops = {{"width": 0.4, "edgecolor": "white"}}
plt.pie(counts.values, labels=counts.index, autopct="%1.1f%%", startangle=90, wedgeprops=wedgeprops)
plt.title("Distribution of {col1}")
plt.tight_layout()
plt.savefig("donut_{col1}.png", dpi=150)
plt.show()
""",
        "treemap": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
""" + (f"""
if not pd.api.types.is_numeric_dtype(df["{col2}"]):
    raise ValueError("Treemap size column ({col2}) must be numeric")
grouped = df.groupby("{col1}")["{col2}"].sum().sort_values(ascending=False).head(20)
labels = [f"{{name}}\\n{{val:.1f}}" for name, val in grouped.items()]
sizes = grouped.values
title = "Treemap of {col1} by {col2}"
""" if col2 else f"""
counts = df["{col1}"].dropna().value_counts().head(20)
labels = [f"{{name}}\\n{{val}}" for name, val in counts.items()]
sizes = counts.values
title = "Treemap of {col1} by frequency"
""") + f"""
try:
    import squarify
    plt.figure(figsize=(12, 8))
    colors = plt.cm.tab20(range(len(sizes)))
    squarify.plot(sizes=sizes, label=labels, color=colors, alpha=0.8, text_kwargs={{"fontsize": 8}})
    plt.axis("off")
    plt.title(title)
    plt.tight_layout()
    plt.savefig("treemap_{col1}{'_' + col2 if col2 else ''}.png", dpi=150)
    plt.show()
except ImportError:
    print("Warning: 'squarify' package is required for treemaps in matplotlib.")
    print("Please run: pip install squarify")
    plt.figure(figsize=(10, 6))
    plt.barh(labels, sizes, color="#0ea5e9")
    plt.xlabel("Value" if "{col2}" else "Count")
    plt.title(title + " (Fallback Bar Chart)")
    plt.gca().invert_yaxis()
    plt.tight_layout()
    plt.savefig("treemap_fallback_{col1}.png", dpi=150)
    plt.show()
""",
        "funnel": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
series = df["{col1}"].dropna()
counts = series.value_counts().sort_values(ascending=False).head(10)

stages = counts.index.astype(str).tolist()
values = counts.values.tolist()

plt.figure(figsize=(10, 6))
y_pos = range(len(stages))
max_val = max(values) if values else 1
left_offsets = [(max_val - val) / 2 for val in values]

plt.barh(y_pos, values, left=left_offsets, color="#0ea5e9", align="center", alpha=0.8)
plt.yticks(y_pos, stages)
plt.gca().invert_yaxis()
plt.xlabel("Frequency")
plt.title("Funnel chart of {col1} (Approximated)")
plt.tight_layout()
plt.savefig("funnel_{col1}.png", dpi=150)
plt.show()
""",
        "waterfall": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

df = pd.read_csv("your_dataset.csv")
grouped = df.groupby("{col1}")["{col2}"].sum().head(15)

names = grouped.index.astype(str).tolist()
deltas = grouped.values.tolist()

cumulative = 0.0
starts = []
ends = []
for d in deltas:
    starts.append(cumulative)
    cumulative += d
    ends.append(cumulative)

# Append total bar
names.append("Total")
deltas.append(cumulative)
starts.append(0)
ends.append(cumulative)

plt.figure(figsize=(12, 6))
colors = []
for d in deltas[:-1]:
    colors.append("#10b981" if d >= 0 else "#ef4444")
colors.append("#0ea5e9")

for i in range(len(names)):
    plt.bar(names[i], ends[i] - starts[i], bottom=starts[i], color=colors[i], edgecolor="black")

plt.xticks(rotation=45, ha="right")
plt.ylabel("{col2}")
plt.title("Waterfall: Cumulative effect of {col2} across {col1}")
plt.axhline(0, color="black", linewidth=0.8, linestyle="--")
plt.tight_layout()
plt.savefig("waterfall_{col1}_{col2}.png", dpi=150)
plt.show()
""",
        "gauge": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

df = pd.read_csv("your_dataset.csv")
series = df["{col1}"].dropna()

val = float(series.mean()) if not series.empty else 0.0
min_val = float(series.min()) if not series.empty else 0.0
max_val = float(series.max()) if not series.empty else 100.0
r = max_val - min_val
pct = (val - min_val) / r if r > 0 else 0.5

fig, ax = plt.subplots(figsize=(6, 4), subplot_kw={{"projection": "polar"}})
ax.bar(x=np.pi/2, height=0.5, width=np.pi, bottom=1.0, color="#f1f5f9", edgecolor="none")
progress_angle = np.pi - (pct * np.pi)
ax.bar(x=(np.pi + progress_angle)/2, height=0.5, width=(np.pi - progress_angle), bottom=1.0, color="#0ea5e9", edgecolor="none")

ax.set_yticklabels([])
ax.set_xticklabels([])
ax.grid(False)
ax.spines['polar'].set_visible(False)

plt.text(0, 1.25, f"{{max_val:.2f}}", ha="center", va="center", fontsize=10, fontweight="bold")
plt.text(np.pi, 1.25, f"{{min_val:.2f}}", ha="center", va="center", fontsize=10, fontweight="bold")
plt.text(np.pi/2, 0.4, f"{{val:.2f}}", ha="center", va="center", fontsize=16, fontweight="bold")
plt.text(np.pi/2, 0.1, "Average {col1}", ha="center", va="center", fontsize=8, color="gray")

ax.set_thetamin(0)
ax.set_thetamax(180)

plt.title("Gauge: Mean {col1} within Min-Max Range", fontsize=12, pad=20)
plt.tight_layout()
plt.savefig("gauge_{col1}.png", dpi=150)
plt.show()
"""
    }

    code = templates.get(chart_type)
    if code is None:
        raise HTTPException(status_code=400, detail=f"No code export template for chart type '{chart_type}'")

    filename = f"{chart_type}_{col1}{'_' + col2 if col2 else ''}.py"
    return {"code": code.strip(), "filename": filename}
