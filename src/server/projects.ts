import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const saveProject = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "name" in v && "session_id" in v) {
      return v as { name: string; session_id: string };
    }
    throw new Error("Invalid save project request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }) => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(`${BACKEND_URL}/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        },
        body: JSON.stringify({
          name: request.name,
          session_id: request.session_id,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Backend error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Save project server function error:", error);
      throw new Error(
        `Failed to save project: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const loadProject = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "project_id" in v && "session_id" in v) {
      return v as { project_id: string; session_id: string };
    }
    throw new Error("Invalid load project request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }) => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(`${BACKEND_URL}/projects/${request.project_id}/load`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        },
        body: JSON.stringify({
          session_id: request.session_id,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Backend error: ${response.statusText}`);
      }

      return await response.json() as {
        project: any;
        analysis_result: any;
        csv_data: string;
      };
    } catch (error) {
      console.error("Load project server function error:", error);
      throw new Error(
        `Failed to load project: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(`${BACKEND_URL}/projects`, {
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

      return await response.json() as any[];
    } catch (error) {
      console.error("List projects server function error:", error);
      throw new Error(
        `Failed to list projects: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const updateProject = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "project_id" in v) {
      return v as { project_id: string; name?: string; favorite?: boolean; tags?: string[] };
    }
    throw new Error("Invalid update project request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }) => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(`${BACKEND_URL}/projects/${request.project_id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": context.userId,
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        },
        body: JSON.stringify({
          name: request.name,
          favorite: request.favorite,
          tags: request.tags,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Backend error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Update project server function error:", error);
      throw new Error(
        `Failed to update project: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const deleteProject = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "project_id" in v) {
      return v as { project_id: string };
    }
    throw new Error("Invalid delete project request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }) => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(`${BACKEND_URL}/projects/${request.project_id}`, {
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

      return await response.json();
    } catch (error) {
      console.error("Delete project server function error:", error);
      throw new Error(
        `Failed to delete project: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const listProjectVersions = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "project_id" in v) {
      return v as { project_id: string };
    }
    throw new Error("Invalid list versions request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }) => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(`${BACKEND_URL}/projects/${request.project_id}/versions`, {
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

      return await response.json() as any[];
    } catch (error) {
      console.error("List project versions error:", error);
      throw new Error(
        `Failed to list versions: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const getVersionSnapshot = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "project_id" in v && "version_id" in v) {
      return v as { project_id: string; version_id: string };
    }
    throw new Error("Invalid get version snapshot request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }) => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(
        `${BACKEND_URL}/projects/${request.project_id}/versions/${request.version_id}/snapshot`,
        {
          method: "GET",
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

      return await response.json() as any;
    } catch (error) {
      console.error("Get version snapshot error:", error);
      throw new Error(
        `Failed to get version snapshot: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export const restoreProjectVersion = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (
      typeof v === "object" &&
      v !== null &&
      "project_id" in v &&
      "version_id" in v &&
      "session_id" in v
    ) {
      return v as { project_id: string; version_id: string; session_id: string };
    }
    throw new Error("Invalid restore version request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }) => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(
        `${BACKEND_URL}/projects/${request.project_id}/versions/${request.version_id}/restore`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": context.userId,
            "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
          },
          body: JSON.stringify({ session_id: request.session_id }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Backend error: ${response.statusText}`);
      }

      return await response.json() as {
        project: any;
        analysis_result: any;
        csv_data: string;
        restored_version: number;
      };
    } catch (error) {
      console.error("Restore project version error:", error);
      throw new Error(
        `Failed to restore version: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

