import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DecomposeResponse {
  dates: string[];
  observed: number[];
  trend: number[];
  seasonal: number[];
  residual: number[];
  rolling_mean: number[];
  rolling_std: number[];
}

export interface ForecastResponse {
  dates: string[];
  forecast: number[];
  lower_bound: number[];
  upper_bound: number[];
}

export const decomposeTimeSeries = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (
      typeof v === "object" &&
      v !== null &&
      "session_id" in v &&
      "date_column" in v &&
      "value_column" in v
    ) {
      return v as {
        session_id: string;
        date_column: string;
        value_column: string;
      };
    }
    throw new Error("Invalid decomposition request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }): Promise<DecomposeResponse> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    const SESSION_ID = request.session_id;

    try {
      const response = await fetch(`${BACKEND_URL}/timeseries/decompose/${SESSION_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        },
        body: JSON.stringify({
          date_column: request.date_column,
          value_column: request.value_column,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const detail = errorData.detail;
        const msg =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((e: any) => `${e.loc?.join(".") || "error"}: ${e.msg}`).join("; ")
              : typeof detail === "object" && detail !== null
                ? JSON.stringify(detail)
                : `Backend error: ${response.statusText}`;
        throw new Error(msg);
      }

      return (await response.json()) as DecomposeResponse;
    } catch (error) {
      console.error("decomposeTimeSeries error:", error);
      throw new Error(
        `Decomposition failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const forecastTimeSeries = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (
      typeof v === "object" &&
      v !== null &&
      "session_id" in v &&
      "method" in v &&
      "date_column" in v &&
      "value_column" in v &&
      "periods" in v
    ) {
      return v as {
        session_id: string;
        method: string;
        date_column: string;
        value_column: string;
        periods: number;
      };
    }
    throw new Error("Invalid forecast request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }): Promise<ForecastResponse> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    const SESSION_ID = request.session_id;

    try {
      const response = await fetch(`${BACKEND_URL}/timeseries/forecast/${SESSION_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        },
        body: JSON.stringify({
          method: request.method,
          date_column: request.date_column,
          value_column: request.value_column,
          periods: request.periods,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const detail = errorData.detail;
        const msg =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((e: any) => `${e.loc?.join(".") || "error"}: ${e.msg}`).join("; ")
              : typeof detail === "object" && detail !== null
                ? JSON.stringify(detail)
                : `Backend error: ${response.statusText}`;
        throw new Error(msg);
      }

      return (await response.json()) as ForecastResponse;
    } catch (error) {
      console.error("forecastTimeSeries error:", error);
      throw new Error(
        `Forecasting failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });
