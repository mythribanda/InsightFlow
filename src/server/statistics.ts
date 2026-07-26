import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface StatsResponse {
  statistic: number;
  p_value: number;
  significant: boolean;
  interpretation: string;
  extra_info?: Record<string, any>;
}

export const runStatisticalTest = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (
      typeof v === "object" &&
      v !== null &&
      "session_id" in v &&
      "test_type" in v &&
      "column" in v
    ) {
      return v as {
        session_id: string;
        test_type: string;
        column: string;
        group_column?: string;
        confidence?: number;
      };
    }
    throw new Error("Invalid stats request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }): Promise<StatsResponse> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    const SESSION_ID = request.session_id;

    try {
      const response = await fetch(`${BACKEND_URL}/statistics/${SESSION_ID}/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        },
        body: JSON.stringify({
          test_type: request.test_type,
          column: request.column,
          group_column: request.group_column || null,
          confidence: request.confidence ?? 0.95,
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

      return (await response.json()) as StatsResponse;
    } catch (error) {
      console.error("runStatisticalTest error:", error);
      throw new Error(
        `Statistical test failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });
