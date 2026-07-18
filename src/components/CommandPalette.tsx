import React, { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useServerFn } from "@tanstack/react-start";
import { listProjects } from "@/server/projects";
import { toast } from "sonner";
import {
  Folder,
  Terminal,
  Brain,
  Moon,
  Sun,
  Play,
  LayoutDashboard,
  Search,
  X
} from "lucide-react";

import { useTheme } from "@/contexts/ThemeContext";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { theme, toggleTheme } = useTheme();
  const [projects, setProjects] = useState<any[]>([]);
  const runListProjects = useServerFn(listProjects);

  // Load projects list
  useEffect(() => {
    if (open) {
      runListProjects()
        .then((data) => setProjects(data || []))
        .catch((err) => console.error("Failed to load projects for command palette:", err));
    }
  }, [open, runListProjects]);

  // Toggle keyboard shortcut (Cmd+K or Ctrl+K)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  if (!open) return null;

  const handleAction = (action: () => void) => {
    action();
    setOpen(false);
  };

  const switchTab = (tabName: string) => {
    window.dispatchEvent(new CustomEvent("switch-tab", { detail: tabName }));
    toast.success(`Switched to ${tabName} workspace.`);
  };

  const runAnalysis = () => {
    window.dispatchEvent(new CustomEvent("trigger-analysis"));
    toast.success("Triggered backend dataset profiling and analysis.");
  };



  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-150">
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer z-10"
        >
          <X className="h-4 w-4" />
        </button>

        <Command label="Command Palette" value={search} onValueChange={setSearch}>
          <div className="flex items-center border-b border-border px-4 py-2">
            <Search className="h-4 w-4 mr-2 text-muted-foreground" />
            <Command.Input
              placeholder="Type a command or search projects..."
              className="flex-1 bg-transparent py-2 text-sm outline-none text-foreground"
              autoFocus
            />
          </div>

          <Command.List className="max-h-[300px] overflow-y-auto p-2 space-y-1">
            <Command.Empty className="py-6 text-center text-xs text-muted-foreground italic">
              No results found.
            </Command.Empty>

            <Command.Group heading="Navigation" className="text-xs text-muted-foreground">
              <Command.Item
                value="dashboard"
                onSelect={() => handleAction(() => switchTab("dashboard"))}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-primary/10 cursor-pointer text-foreground/80 font-medium"
              >
                <LayoutDashboard className="h-3.5 w-3.5 text-primary" />
                <span>Go to Dashboard</span>
              </Command.Item>

              <Command.Item
                value="sql query console workspace sandbox"
                onSelect={() => handleAction(() => switchTab("chat"))}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-primary/10 cursor-pointer text-foreground/80 font-medium"
              >
                <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                <span>Go to SQL Console</span>
              </Command.Item>

              <Command.Item
                value="modeling panel machine learning workspace"
                onSelect={() => handleAction(() => switchTab("modeling"))}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-primary/10 cursor-pointer text-foreground/80 font-medium"
              >
                <Brain className="h-3.5 w-3.5 text-purple-400" />
                <span>Go to Modeling Panel</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Actions" className="text-xs text-muted-foreground">
              <Command.Item
                value="run profiling data analysis"
                onSelect={() => handleAction(() => runAnalysis())}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-primary/10 cursor-pointer text-foreground/80 font-medium"
              >
                <Play className="h-3.5 w-3.5 text-blue-400" />
                <span>Run Dataset Analysis</span>
              </Command.Item>

              <Command.Item
                value="toggle theme mode dark light"
                onSelect={() => handleAction(() => toggleTheme())}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-primary/10 cursor-pointer text-foreground/80 font-medium"
              >
                <Moon className="h-3.5 w-3.5 text-amber-400 dark:hidden" />
                <Sun className="h-3.5 w-3.5 text-amber-400 hidden dark:block" />
                <span>Toggle Theme Mode</span>
              </Command.Item>
            </Command.Group>

            {projects.length > 0 && (
              <Command.Group heading="Switch Project" className="text-xs text-muted-foreground">
                {projects.map((project) => (
                  <Command.Item
                    key={project.id}
                    value={`project ${project.name}`}
                    onSelect={() =>
                      handleAction(() => {
                        window.location.href = `/app?projectId=${project.id}`;
                      })
                    }
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-primary/10 cursor-pointer text-foreground/80 font-medium"
                  >
                    <Folder className="h-3.5 w-3.5 text-amber-500" />
                    <span>{project.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
