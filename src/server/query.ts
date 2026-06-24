import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type QueryResponse = {
  code: string;
  result: any; // Can be a serialized DataFrame, Series, list, or scalar
};

export const queryDataset = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "session_id" in v && "question" in v) {
      return v as { session_id: string; question: string };
    }
    throw new Error("Invalid query request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request }): Promise<QueryResponse> => {
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";

    try {
      const response = await fetch(`${BACKEND_URL}/query/${request.session_id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: request.question,
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

      return (await response.json()) as QueryResponse;
    } catch (error) {
      console.error("Query dataset error:", error);
      throw new Error(
        `NL Query failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });
