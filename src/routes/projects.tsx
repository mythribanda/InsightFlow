import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { listProjects } from "@/server/projects";
import { ErrorComponent } from "./__root";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Brain,
  ArrowLeft,
  Loader2,
  Trash2,
  Edit2,
  ExternalLink,
  FolderOpen,
  Calendar,
  Layers,
  Sun,
  Moon
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

export const Route = createFileRoute("/projects")({
  component: ProjectsPage,
  errorComponent: ErrorComponent,
});

interface Project {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  dataset_metadata: {
    rows: number;
    cols: number;
    columns: string[];
    fileName: string;
  };
}

function ProjectsPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const runListProjects = useServerFn(listProjects);
  const { session, loading: checkingSession } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  // Check auth and load projects
  useEffect(() => {
    if (checkingSession) return;

    if (!session) {
      toast.error("You must be signed in to view your projects.");
      navigate({ to: "/login" });
      return;
    }

    fetchProjects();
  }, [session, checkingSession, navigate]);

  async function fetchProjects() {
    setLoading(true);
    try {
      const data = await runListProjects();
      setProjects((data as Project[]) || []);
    } catch (err: any) {
      console.error("Error fetching projects:", err);
      toast.error("Failed to load projects: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async (projectId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
      const { error } = await (supabase as any)
        .from("projects")
        .delete()
        .eq("id", projectId);

      if (error) throw error;

      toast.success("Project deleted successfully");
      setProjects(projects.filter((p) => p.id !== projectId));
    } catch (err: any) {
      console.error("Error deleting project:", err);
      toast.error("Failed to delete project: " + (err.message || err));
    }
  };

  const handleRename = async (projectId: string) => {
    if (!editName.trim()) return;
    setIsRenaming(true);
    try {
      const { error } = await (supabase as any)
        .from("projects")
        .update({ name: editName.trim() })
        .eq("id", projectId);

      if (error) throw error;

      toast.success("Project renamed successfully");
      setProjects(
        projects.map((p) => (p.id === projectId ? { ...p, name: editName.trim() } : p))
      );
      setEditingId(null);
    } catch (err: any) {
      console.error("Error renaming project:", err);
      toast.error("Failed to rename project: " + (err.message || err));
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Header */}
      <header className="glass-topbar sticky top-0 z-20">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-2.5">
          <div className="flex items-center gap-3">
            <Link
              to="/app"
              className="p-1.5 rounded-lg hover:bg-white/5 transition-all text-muted-foreground hover:text-foreground cursor-pointer"
              title="Back to Console"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent shadow-[0_0_24px_-4px_var(--color-primary)]">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">
                My <span className="text-gradient">Projects</span>
              </h1>
              <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider">
                Manage your saved workspaces.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link to="/app">
              <Button size="sm" variant="outline" className="text-xs font-mono">
                Console
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Saved Workspaces</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Select a project to restore your full analysis context.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground font-mono">Loading projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 border border-dashed border-white/5 rounded-2xl bg-secondary/10">
            <div className="w-12 h-12 rounded-full bg-secondary/30 flex items-center justify-center mb-4">
              <FolderOpen className="w-5 h-5 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold">No projects saved yet</h3>
            <p className="text-xs text-muted-foreground mt-1 text-center max-w-[280px]">
              Upload a dataset in the console, wait for analysis, and click "Save Project" to store it here.
            </p>
            <Link to="/app" className="mt-6">
              <Button size="sm" className="font-mono text-xs">
                Upload a Dataset
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => {
              const meta = project.dataset_metadata;
              const formattedDate = new Date(project.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              });

              return (
                <Card
                  key={project.id}
                  className="bg-[#15151F]/40 border-white/5 hover:border-white/10 transition-all duration-200 shadow-sm flex flex-col group"
                >
                  <CardHeader className="p-5 pb-3">
                    {editingId === project.id ? (
                      <div className="flex gap-2 w-full items-center">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 text-xs bg-white/5 border-white/10"
                          placeholder="Project name"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(project.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <Button
                          size="sm"
                          className="h-8 text-xs px-2"
                          disabled={isRenaming}
                          onClick={() => handleRename(project.id)}
                        >
                          {isRenaming ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs px-2"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start gap-2">
                        <CardTitle className="text-base font-semibold tracking-tight text-foreground truncate group-hover:text-primary transition-colors">
                          {project.name}
                        </CardTitle>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingId(project.id);
                              setEditName(project.name);
                            }}
                            className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            title="Rename Project"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(project.id, project.name)}
                            className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors cursor-pointer"
                            title="Delete Project"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )}
                    <CardDescription className="font-mono text-[10px] text-muted-foreground mt-1 truncate">
                      {meta?.fileName || "Unknown CSV"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 pt-0 flex-1 flex flex-col justify-between">
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Layers className="h-3.5 w-3.5" />
                        <span>
                          {meta?.rows?.toLocaleString() ?? 0} rows × {meta?.cols ?? 0} columns
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Created {formattedDate}</span>
                      </div>
                    </div>

                    <div className="mt-6">
                      <Button
                        onClick={() => window.location.href = `/app?projectId=${project.id}`}
                        className="w-full text-xs font-mono font-bold bg-[#1A1926] hover:bg-primary hover:text-primary-foreground border border-white/5 hover:border-transparent transition-all flex items-center justify-center gap-1.5 py-1.5 cursor-pointer"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        Open Workspace
                        <ExternalLink className="h-3 w-3 opacity-50" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
