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
  .handler(async ({ data: request, context }): Promise<QueryResponse> => {
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";

    try {
      const response = await fetch(`${BACKEND_URL}/query/${request.session_id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
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

export type SQLQueryResponse = {
  columns: string[];
  rows: any[];
  row_count: number;
  truncated: boolean;
};

export const sqlQueryDataset = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "session_id" in v && "query" in v) {
      return v as { session_id: string; query: string };
    }
    throw new Error("Invalid SQL query request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }): Promise<SQLQueryResponse> => {
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";

    try {
      const response = await fetch(`${BACKEND_URL}/sql-query/${request.session_id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        },
        body: JSON.stringify({
          query: request.query,
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

      return (await response.json()) as SQLQueryResponse;
    } catch (error) {
      console.error("SQL Query dataset error:", error);
      throw new Error(
        `SQL Query failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });
