import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ClusteringPoint = {
  x: number;
  y: number;
  cluster: number;
};

export type FeatureProfile = {
  column: string;
  type: "numeric" | "categorical";
  cluster_val: any;
  global_val: any;
  z_score: number;
  description: string;
};

export type ClusterProfile = {
  cluster: number;
  size: number;
  features: FeatureProfile[];
};

export type ClusteringResponse = {
  data: ClusteringPoint[];
  n_clusters_found: number;
  noise_count: number;
  silhouette_score: number | null;
  variance_explained: number;
  insight: string;
  profiles?: ClusterProfile[];
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
  .handler(async ({ data: request, context }): Promise<ClusteringResponse> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";

    try {
      const response = await fetch(`${BACKEND_URL}/cluster/${request.session_id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
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

export const getOptimalK = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "session_id" in v && "columns" in v) {
      return v as {
        session_id: string;
        columns: string[];
      };
    }
    throw new Error("Invalid optimal K request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }): Promise<{ optimal_k: number | null }> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(`${BACKEND_URL}/cluster/optimal-k/${request.session_id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        },
        body: JSON.stringify({
          columns: request.columns,
        }),
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`);
      }

      return (await response.json()) as { optimal_k: number | null };
    } catch (error) {
      console.error("Optimal K fetch error:", error);
      return { optimal_k: null };
    }
  });

export const exportClusteredCSV = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "session_id" in v) {
      return v as { session_id: string };
    }
    throw new Error("Invalid CSV export request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }): Promise<string> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(
        `${BACKEND_URL}/export/clustered-csv/${request.session_id}`,
        {
          method: "GET",
          headers: {
            "x-user-id": context.userId,
            "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend CSV export failed: ${errorText}`);
      }

      return await response.text();
    } catch (error) {
      console.error("Clustered CSV Export server function error:", error);
      throw new Error(
        `Failed to export clustered CSV: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });
