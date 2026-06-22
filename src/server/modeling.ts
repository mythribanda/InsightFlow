import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Server functions to call the Python modeling backend.
 * Supports: target suitability (S3), feature recommendations (S2),
 * model training (§4), and SHAP analysis (§4.6).
 */

const ModelRequestSchema = z.object({
  target: z.string(),
  data: z.record(z.unknown()), // CSV data as dict
  excluded_features: z.array(z.string()).optional(),
  cv_splits: z.number().optional().default(5),
});

export type ModelRequest = z.infer<typeof ModelRequestSchema>;

export type LeakageFlag = {
  column: string;
  reason: string;
  score?: number;
};

export type ModelMetrics = {
  [metric: string]: number;
};

export type FoldScores = {
  [metric: string]: number[];
};

export type ModelResult = {
  model: string;
  metrics: ModelMetrics;
  std: ModelMetrics;
  fold_scores: FoldScores;
};

export type BestModel = {
  model: string;
  primary_metric: string;
  value: number;
  std: number;
};

export type ModelResponse = {
  task: string;
  leakage: LeakageFlag[];
  results: ModelResult[];
  best: BestModel;
};

// S3: Target Suitability
export type SuitabilityResponse = {
  task: string;
  n_samples: number;
  n_features: number;
  missing_pct: number;
  issues: string[];
  warnings: string[];
  suitable: boolean;
};

// S2: Feature Recommendations
export type RecommendationResponse = {
  high_signal: string[];
  low_signal: string[];
  harmful: string[];
  leakage: string[];
};

// §4.6: SHAP Analysis
export type ShapResponse = {
  global_importance?: string; // Base64 PNG
  per_sample_waterfall?: string; // Base64 PNG
  prediction?: number;
  row_label?: string;
  error?: string;
};

// ============ SERVER FUNCTIONS ============

export const checkSuitability = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "target" in v) {
      return v as { target: string; data: Record<string, unknown[]> };
    }
    throw new Error("Invalid suitability request");
  })
  .handler(async ({ data: request }): Promise<SuitabilityResponse> => {
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    const SESSION_ID = "default";
    console.log("checkSuitability handler: request =", request);

    try {
      console.log("checkSuitability handler: sending target =", request?.target, "data keys =", request?.data ? Object.keys(request.data) : null);
      const response = await fetch(`${BACKEND_URL}/suitability/${SESSION_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target: request.target,
          data: request.data,
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

      return (await response.json()) as SuitabilityResponse;
    } catch (error) {
      console.error("Suitability check error:", error);
      throw new Error(
        `Suitability check failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const getRecommendations = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "target" in v) {
      return v as { target: string; data: Record<string, unknown[]> };
    }
    throw new Error("Invalid recommendation request");
  })
  .handler(async ({ data: request }): Promise<RecommendationResponse> => {
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    const SESSION_ID = "default";

    try {
      const response = await fetch(`${BACKEND_URL}/recommend/${SESSION_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target: request.target,
          data: request.data,
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

      return (await response.json()) as RecommendationResponse;
    } catch (error) {
      console.error("Recommendation error:", error);
      throw new Error(
        `Feature recommendation failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const callModelingAPI = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "target" in v) {
      return v as { target: string; data: Record<string, unknown[]>; excluded_features?: string[]; cv_splits?: number };
    }
    throw new Error("Invalid model request");
  })
  .handler(async ({ data: request }): Promise<ModelResponse> => {
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    const SESSION_ID = "default";

    try {
      const response = await fetch(`${BACKEND_URL}/model/${SESSION_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target: request.target,
          data: request.data,
          excluded_features: request.excluded_features || [],
          cv_splits: request.cv_splits || 5,
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

      return (await response.json()) as ModelResponse;
    } catch (error) {
      console.error("Modeling API error:", error);
      throw new Error(
        `Failed to train models: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const getShapAnalysis = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "sample_idx" in v) {
      return v as { sample_idx?: number };
    }
    throw new Error("Invalid SHAP request");
  })
  .handler(async ({ data: request }): Promise<ShapResponse> => {
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    const SESSION_ID = "default";

    try {
      const response = await fetch(`${BACKEND_URL}/shap/${SESSION_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sample_idx: request.sample_idx || 0,
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

      return (await response.json()) as ShapResponse;
    } catch (error) {
      console.error("SHAP analysis error:", error);
      throw new Error(
        `SHAP analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

