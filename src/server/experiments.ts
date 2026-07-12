import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ExperimentRun {
  id: string;
  model_name: string;
  hyperparameters: Record<string, any>;
  metrics: Record<string, number>;
  task: string;
  primary_metric: string;
  primary_score: number;
  created_at: string;
}

export const getExperimentRuns = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "project_id" in v) {
      return v as { project_id: string; limit?: number; model_name?: string };
    }
    throw new Error("Invalid get experiment runs request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }): Promise<ExperimentRun[]> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    const limit = request.limit ?? 200;
    let url = `${BACKEND_URL}/experiments/${request.project_id}?limit=${limit}`;
    if (request.model_name) {
      url += `&model_name=${encodeURIComponent(request.model_name)}`;
    }

    try {
      const response = await fetch(url, {
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

      return (await response.json()) as ExperimentRun[];
    } catch (error) {
      console.error("getExperimentRuns error:", error);
      throw new Error(
        `Failed to fetch experiment runs: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const deleteExperimentRun = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "project_id" in v && "run_id" in v) {
      return v as { project_id: string; run_id: string };
    }
    throw new Error("Invalid delete experiment run request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }): Promise<void> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(
        `${BACKEND_URL}/experiments/${request.project_id}/runs/${request.run_id}`,
        {
          method: "DELETE",
          headers: {
            "x-user-id": context.userId,
            "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Backend error: ${response.statusText}`);
      }
    } catch (error) {
      console.error("deleteExperimentRun error:", error);
      throw new Error(
        `Failed to delete experiment run: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });
