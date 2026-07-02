import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getVisualization = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (
      typeof v === "object" &&
      v !== null &&
      "session_id" in v &&
      "column1" in v &&
      "chart_type" in v
    ) {
      return v as {
        session_id: string;
        column1: string;
        column2?: string | null;
        chart_type: string;
      };
    }
    throw new Error("Invalid visualization request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }) => {
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(
        `${BACKEND_URL}/visualize/${request.session_id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": context.userId,
            "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
          },
          body: JSON.stringify({
            column1: request.column1,
            column2: request.column2 || null,
            chart_type: request.chart_type,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to fetch visualization data from backend");
      }

      return await response.json() as {
        data: any[];
        insight: string;
        correlation?: number;
        keys?: string[];
      };
    } catch (error) {
      console.error("Visualization fetch error:", error);
      throw new Error(
        `Visualization failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const exportVisualizationCode = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (
      typeof v === "object" &&
      v !== null &&
      "session_id" in v &&
      "column1" in v &&
      "chart_type" in v
    ) {
      return v as {
        session_id: string;
        column1: string;
        column2?: string | null;
        chart_type: string;
      };
    }
    throw new Error("Invalid code export request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }) => {
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(
        `${BACKEND_URL}/visualize/${request.session_id}/export-code`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": context.userId,
            "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
          },
          body: JSON.stringify({
            column1: request.column1,
            column2: request.column2 || null,
            chart_type: request.chart_type,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to export visualization code from backend");
      }

      return await response.json() as {
        code: string;
        filename: string;
      };
    } catch (error) {
      console.error("Code export fetch error:", error);
      throw new Error(
        `Code export failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });
