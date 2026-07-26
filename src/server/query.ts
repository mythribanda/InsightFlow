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
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
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
  execution_time_ms?: number;
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
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
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

export type SavedQuery = {
  id: string;
  project_id: string;
  name: string;
  query_text: string;
  created_at: string;
};

export const saveQuery = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "project_id" in v && "name" in v && "query_text" in v) {
      return v as { project_id: string; name: string; query_text: string };
    }
    throw new Error("Invalid save query request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }): Promise<SavedQuery> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";

    try {
      const response = await fetch(`${BACKEND_URL}/saved-queries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to save query");
      }

      return (await response.json()) as SavedQuery;
    } catch (error) {
      console.error("Save query error:", error);
      throw new Error(
        `Save query failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const listSavedQueries = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => {
    if (typeof v === "string") return v;
    throw new Error("Invalid project ID");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: projectId, context }): Promise<SavedQuery[]> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";

    try {
      const response = await fetch(`${BACKEND_URL}/saved-queries/${projectId}`, {
        method: "GET",
        headers: {
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to list saved queries");
      }

      return (await response.json()) as SavedQuery[];
    } catch (error) {
      console.error("List saved queries error:", error);
      throw new Error(
        `List saved queries failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const deleteSavedQuery = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "string") return v;
    throw new Error("Invalid query ID");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: queryId, context }): Promise<{ success: boolean }> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";

    try {
      const response = await fetch(`${BACKEND_URL}/saved-queries/${queryId}`, {
        method: "DELETE",
        headers: {
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to delete saved query");
      }

      return (await response.json()) as { success: boolean };
    } catch (error) {
      console.error("Delete saved query error:", error);
      throw new Error(
        `Delete saved query failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });
