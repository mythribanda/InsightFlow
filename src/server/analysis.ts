import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type AnalysisResult = {
  shape: {
    rows: number;
    cols: number;
    total_cells: number;
  };
  columns: Array<{
    name: string;
    type: string;
    count: number;
    missing: number;
    missingPct: number;
    unique: number;
    uniquePct: number;
    constant: boolean;
    highCardinality: boolean;
    min?: number;
    max?: number;
    mean?: number;
    median?: number;
    std?: number;
    q1?: number;
    q3?: number;
    outliers?: number;
    zeros?: number;
    negatives?: number;
    topValues?: Array<{ value: string; count: number }>;
    minDate?: string;
    maxDate?: string;
  }>;
  trust_score: number;
  trust_breakdown: Array<{
    label: string;
    score: number;
    weight: number;
    note: string;
  }>;
  dependency: {
    columns: string[];
    pearson: number[][];
    spearman: number[][];
    mutual_info: number[][];
  };
};

export type AnalysisStatusResponse = {
  status: string;
  result?: AnalysisResult;
  error?: string;
};

export const startAnalysis = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "session_id" in v && "data" in v) {
      return v as { session_id: string; data: Record<string, unknown[]> };
    }
    throw new Error("Invalid start analysis request");
  })
  .handler(async ({ data: request }): Promise<{ status: string }> => {
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(`${BACKEND_URL}/analyze/${request.session_id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
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

      return (await response.json()) as { status: string };
    } catch (error) {
      console.error("Start analysis error:", error);
      throw new Error(
        `Failed to start analysis: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const getAnalysisStatus = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "session_id" in v) {
      return v as { session_id: string };
    }
    throw new Error("Invalid status request");
  })
  .handler(async ({ data: request }): Promise<AnalysisStatusResponse> => {
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(`${BACKEND_URL}/analyze/${request.session_id}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
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

      return (await response.json()) as AnalysisStatusResponse;
    } catch (error) {
      console.error("Get analysis status error:", error);
      throw new Error(
        `Failed to get analysis status: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });
