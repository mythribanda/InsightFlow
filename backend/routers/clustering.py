import logging
from typing import List, Dict, Any
import pandas as pd
import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans, DBSCAN
from sklearn.metrics import silhouette_score
from sklearn.decomposition import PCA

from state import session_data_store, cluster_labels_store
from schemas import ClusterRequest, OptimalKRequest

logger = logging.getLogger(__name__)
router = APIRouter()


def characterize_clusters(
    df_sub: pd.DataFrame,
    labels: np.ndarray,
    numeric_cols: List[str],
    categorical_cols: List[str]
) -> List[Dict[str, Any]]:
    """
    Computes a profile for each cluster showing feature means/modes and how they deviate
    from the global dataset average using z-scores.
    """
    unique_labels = sorted(list(set(labels)))
    profiles = []

    for label in unique_labels:
        mask = labels == label
        cluster_size = int(mask.sum())
        if cluster_size == 0:
            continue

        df_cluster = df_sub[mask]
        feature_profiles = []

        # 1. Numeric deviation
        for col in numeric_cols:
            global_mean = float(df_sub[col].mean())
            global_std = float(df_sub[col].std())
            cluster_mean = float(df_cluster[col].mean())

            if global_std > 1e-6:
                z_score = (cluster_mean - global_mean) / global_std
            else:
                z_score = 0.0

            direction = "above" if z_score >= 0 else "below"
            desc = f"{col} is {abs(z_score):.1f}σ {direction} average"

            feature_profiles.append({
                "column": col,
                "type": "numeric",
                "cluster_val": float(round(cluster_mean, 2)),
                "global_val": float(round(global_mean, 2)),
                "z_score": float(round(z_score, 2)),
                "description": desc
            })

        # 2. Categorical deviation
        for col in categorical_cols:
            modes = df_cluster[col].mode()
            cluster_mode = str(modes.iloc[0]) if len(modes) > 0 else "N/A"

            global_modes = df_sub[col].mode()
            global_mode = str(global_modes.iloc[0]) if len(global_modes) > 0 else "N/A"

            p_cluster = float((df_cluster[col] == cluster_mode).mean())
            p_global = float((df_sub[col] == cluster_mode).mean())

            global_std = np.sqrt(p_global * (1.0 - p_global))
            if global_std > 1e-6:
                z_score = (p_cluster - p_global) / global_std
            else:
                z_score = 0.0

            desc = f"{col} mode is '{cluster_mode}' ({round(p_cluster * 100, 1)}% vs {round(p_global * 100, 1)}% globally, {z_score:+.1f}σ)"

            feature_profiles.append({
                "column": col,
                "type": "categorical",
                "cluster_val": cluster_mode,
                "global_val": global_mode,
                "z_score": float(round(z_score, 2)),
                "description": desc
            })

        # Sort features by absolute z-score descending
        feature_profiles.sort(key=lambda x: abs(x["z_score"]), reverse=True)

        profiles.append({
            "cluster": int(label),
            "size": cluster_size,
            "features": feature_profiles
        })

    return profiles


@router.post("/cluster/{session_id}")
async def run_clustering(session_id: str, request: ClusterRequest):
    """
    POST /cluster/{session_id} -> runs KMeans or DBSCAN on the selected numeric
    and categorical columns (mixed-type preprocessed via ColumnTransformer),
    returns 2D PCA-projected points with cluster labels for visualization.
    """
    try:
        df = session_data_store.get(session_id)
        if df is None:
            raise HTTPException(status_code=404, detail=f"No dataset found for session '{session_id}'.")

        if len(request.columns) < 2:
            raise HTTPException(status_code=400, detail="Select at least 2 columns for clustering.")

        df_sub = df[request.columns].dropna()
        if len(df_sub) < 10:
            raise HTTPException(status_code=400, detail="Not enough complete rows to cluster (need at least 10).")

        from sklearn.compose import ColumnTransformer
        from sklearn.preprocessing import OneHotEncoder
        from sklearn.impute import SimpleImputer
        from sklearn.pipeline import Pipeline

        numeric_cols = df_sub.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = df_sub.select_dtypes(exclude=[np.number]).columns.tolist()

        transformers = []
        if numeric_cols:
            transformers.append(
                ("num", Pipeline([
                    ("imp", SimpleImputer(strategy="median")),
                    ("sc", StandardScaler())
                ]), numeric_cols)
            )
        if categorical_cols:
            transformers.append(
                ("cat", Pipeline([
                    ("imp", SimpleImputer(strategy="most_frequent")),
                    ("oh", OneHotEncoder(handle_unknown="ignore", sparse_output=False))
                ]), categorical_cols)
            )

        preprocessor = ColumnTransformer(transformers=transformers, remainder="drop")
        X_scaled = preprocessor.fit_transform(df_sub)

        if request.method == "kmeans":
            if request.n_clusters < 2 or request.n_clusters > 20:
                raise HTTPException(status_code=400, detail="n_clusters must be between 2 and 20.")
            model = KMeans(n_clusters=request.n_clusters, random_state=42, n_init=10)
            labels = model.fit_predict(X_scaled)
        elif request.method == "dbscan":
            model = DBSCAN(eps=request.eps, min_samples=request.min_samples)
            labels = model.fit_predict(X_scaled)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown clustering method '{request.method}'. Use 'kmeans' or 'dbscan'.")

        # Cache cluster labels mapping for CSV export
        cluster_labels_store[session_id] = {int(idx): int(lbl) for idx, lbl in zip(df_sub.index, labels)}

        n_clusters_found = len(set(labels)) - (1 if -1 in labels else 0)
        noise_count = int((labels == -1).sum()) if request.method == "dbscan" else 0

        sil_score = None
        if n_clusters_found >= 2:
            mask = labels != -1
            if mask.sum() > 1 and len(set(labels[mask])) >= 2:
                try:
                    sil_score = float(silhouette_score(X_scaled[mask], labels[mask]))
                except:
                    sil_score = None

        # Project to 2D for visualization
        if X_scaled.shape[1] > 2:
            pca = PCA(n_components=2, random_state=42)
            coords = pca.fit_transform(X_scaled)
            variance_explained = float(pca.explained_variance_ratio_.sum())
        else:
            coords = X_scaled
            variance_explained = 1.0

        data = [
            {"x": float(coords[i, 0]), "y": float(coords[i, 1]), "cluster": int(labels[i])}
            for i in range(len(labels))
        ]

        # Compute cluster characterization profiles
        profiles = characterize_clusters(df_sub, labels, numeric_cols, categorical_cols)

        insight = f"Found {n_clusters_found} cluster(s) using {request.method}."
        if request.method == "dbscan" and noise_count > 0:
            insight += f" {noise_count} points classified as noise (not in any cluster)."
        if sil_score is not None:
            quality = "well-separated" if sil_score > 0.5 else "weakly separated" if sil_score > 0.25 else "poorly separated"
            insight += f" Silhouette score {round(sil_score, 2)} ({quality})."
        if X_scaled.shape[1] > 2:
            insight += f" 2D projection (PCA) explains {round(variance_explained * 100, 1)}% of variance — some structure is lost in this view."

        return {
            "data": data,
            "n_clusters_found": n_clusters_found,
            "noise_count": noise_count,
            "silhouette_score": sil_score,
            "variance_explained": variance_explained,
            "insight": insight,
            "profiles": profiles
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Clustering failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Clustering failed: {str(e)}")


@router.post("/cluster/optimal-k/{session_id}")
async def get_optimal_k(session_id: str, request: OptimalKRequest):
    """
    POST /cluster/optimal-k/{session_id} -> runs a silhouette sweep over k=2..10
    on the selected features and suggests the optimal k.
    """
    try:
        logger.info(f"[{session_id}] Optimal K calculation request")
        df = session_data_store.get(session_id)
        if df is None:
            raise HTTPException(status_code=404, detail="Dataset not found")
        if len(request.columns) < 2:
            return {"optimal_k": None}

        df_sub = df[request.columns].dropna()
        if len(df_sub) < 10:
            return {"optimal_k": None}

        from sklearn.compose import ColumnTransformer
        from sklearn.preprocessing import OneHotEncoder
        from sklearn.impute import SimpleImputer
        from sklearn.pipeline import Pipeline

        numeric_cols = df_sub.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = df_sub.select_dtypes(exclude=[np.number]).columns.tolist()

        transformers = []
        if numeric_cols:
            transformers.append(
                ("num", Pipeline([
                    ("imp", SimpleImputer(strategy="median")),
                    ("sc", StandardScaler())
                ]), numeric_cols)
            )
        if categorical_cols:
            transformers.append(
                ("cat", Pipeline([
                    ("imp", SimpleImputer(strategy="most_frequent")),
                    ("oh", OneHotEncoder(handle_unknown="ignore", sparse_output=False))
                ]), categorical_cols)
            )

        preprocessor = ColumnTransformer(transformers=transformers, remainder="drop")
        X_scaled = preprocessor.fit_transform(df_sub)

        max_k = min(10, len(df_sub) - 1)
        best_sil = -1.0
        optimal_k = None
        for k in range(2, max_k + 1):
            try:
                km = KMeans(n_clusters=k, random_state=42, n_init=5)
                km_labels = km.fit_predict(X_scaled)
                score = float(silhouette_score(X_scaled, km_labels))
                if score > best_sil:
                    best_sil = score
                    optimal_k = k
            except:
                pass

        return {"optimal_k": optimal_k, "best_score": best_sil if optimal_k else None}
    except Exception as e:
        logger.error(f"[{session_id}] Failed to calculate optimal K: {str(e)}", exc_info=True)
        return {"optimal_k": None}


@router.get("/export/clustered-csv/{session_id}")
async def export_clustered_csv(session_id: str):
    """
    GET /export/clustered-csv/{session_id} -> original dataset with cluster labels appended.
    """
    try:
        logger.info(f"[{session_id}] Clustered CSV Export request received")
        df = session_data_store.get(session_id)
        if df is None:
            raise HTTPException(status_code=404, detail="Session data not found.")

        mapping = cluster_labels_store.get(session_id)
        if mapping is None:
            raise HTTPException(status_code=400, detail="No clustering labels found for this session. Please run clustering first.")

        export_df = df.copy()

        # Add 'cluster' column, mapping the labels back using original dataframe index.
        cluster_col = []
        for idx in export_df.index:
            cluster_col.append(mapping.get(idx, -1))

        export_df["cluster"] = cluster_col

        csv_data = export_df.to_csv(index=False)

        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="insightflow_clustered_{session_id}.csv"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Clustered CSV Export crashed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
