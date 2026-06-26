import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ClusteringPoint = {
  x: number;
  y: number;
  cluster: number;
};

export type ClusteringResponse = {
  data: ClusteringPoint[];
  n_clusters_found: number;
  noise_count: number;
  silhouette_score: number | null;
  variance_explained: number;
  insight: string;
};

export const runClustering = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "session_id" in v && "columns" in v && "method" in v) {
      return v as {
        session_id: string;
        columns: string[];
        method: "kmeans" | "dbscan";
        n_clusters?: number;
        eps?: number;
        min_samples?: number;
      };
    }
    throw new Error("Invalid clustering request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request }): Promise<ClusteringResponse> => {
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";

    try {
      const response = await fetch(`${BACKEND_URL}/cluster/${request.session_id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          columns: request.columns,
          method: request.method,
          n_clusters: request.n_clusters,
          eps: request.eps,
          min_samples: request.min_samples,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const detail = errorData.detail;
        const msg = typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((e: any) => `${e.loc?.join(".") || "error"}: ${e.msg}`).join("; ")
            : typeof detail === "object" && detail !== null
              ? JSON.stringify(detail)
              : `Backend error: ${response.statusText}`;
        throw new Error(msg);
      }

      return (await response.json()) as ClusteringResponse;
    } catch (error) {
      console.error("Clustering error:", error);
      throw new Error(
        `Clustering failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });
