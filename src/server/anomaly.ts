import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AnomalyDriver = {
  column: string;
  value: string | number;
  deviation: number;
  type: "numeric" | "categorical";
};

export type AnomalyRow = {
  row_index: number;
  score: number;
  row_data: Record<string, string | number | null>;
  drivers: AnomalyDriver[];
};

export const getAnomalyReport = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "session_id" in v) {
      return v as { session_id: string; contamination?: number };
    }
    throw new Error("Invalid anomaly report request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request }): Promise<AnomalyRow[]> => {
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    const contamination = request.contamination ?? 0.05;

    try {
      const response = await fetch(
        `${BACKEND_URL}/anomaly/${request.session_id}?contamination=${contamination}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

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

      return (await response.json()) as AnomalyRow[];
    } catch (error) {
      console.error("Get anomalies error:", error);
      throw new Error(
        `Failed to get anomaly report: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });
