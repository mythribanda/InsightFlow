import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DashboardItem {
  id: string;
  project_id: string;
  name: string;
  layout_json: any;
  created_at: string;
  updated_at: string;
}

export const saveDashboard = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (
      typeof v === "object" &&
      v !== null &&
      "project_id" in v &&
      "name" in v &&
      "layout_json" in v
    ) {
      return v as {
        project_id: string;
        name: string;
        layout_json: any;
      };
    }
    throw new Error("Invalid save dashboard request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }): Promise<DashboardItem> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";

    try {
      const response = await fetch(`${BACKEND_URL}/dashboards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        },
        body: JSON.stringify({
          project_id: request.project_id,
          name: request.name,
          layout_json: request.layout_json,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Backend error: ${response.statusText}`);
      }

      return (await response.json()) as DashboardItem;
    } catch (error) {
      console.error("saveDashboard error:", error);
      throw new Error(
        `Failed to save dashboard: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const listDashboards = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "project_id" in v) {
      return v as { project_id: string };
    }
    throw new Error("Invalid list dashboards request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }): Promise<DashboardItem[]> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";

    try {
      const response = await fetch(`${BACKEND_URL}/dashboards/${request.project_id}`, {
        method: "GET",
        headers: {
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Backend error: ${response.statusText}`);
      }

      return (await response.json()) as DashboardItem[];
    } catch (error) {
      console.error("listDashboards error:", error);
      throw new Error(
        `Failed to list dashboards: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const deleteDashboard = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "dashboard_id" in v) {
      return v as { dashboard_id: string };
    }
    throw new Error("Invalid delete dashboard request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }): Promise<{ success: boolean }> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";

    try {
      const response = await fetch(`${BACKEND_URL}/dashboards/${request.dashboard_id}`, {
        method: "DELETE",
        headers: {
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Backend error: ${response.statusText}`);
      }

      return (await response.json()) as { success: boolean };
    } catch (error) {
      console.error("deleteDashboard error:", error);
      throw new Error(
        `Failed to delete dashboard: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });
