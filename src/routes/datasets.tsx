import { useState, useEffect, useMemo } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { listProjects, updateProject, deleteProject, listProjectVersions, getVersionSnapshot, restoreProjectVersion } from "@/server/projects";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Brain,
  ArrowLeft,
  Loader2,
  Trash2,
  FolderOpen,
  ExternalLink,
  Star,
  Search,
  Calendar,
  Layers,
  Plus,
  X,
  Clock,
  Heart,
  Tag,
  History,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Eye,
  GitBranch,
  CheckCircle2,
  Sun,
  Moon
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

export const Route = createFileRoute("/datasets")({
  component: DatasetsGalleryPage,
});

interface Project {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  last_opened_at: string;
  favorite: boolean;
  tags: string[];
  dataset_metadata: {
    rows: number;
    cols: number;
    columns: string[];
    fileName: string;
  };
}

interface ProjectVersion {
  id: string;
  project_id: string;
  version_number: number;
  change_note: string | null;
  created_at: string;
  analysis_result?: any;
  // Populated only from /snapshot endpoint:
  preview_metadata?: {
    rows: number;
    cols: number;
    columns: string[];
  } | null;
}

function DatasetsGalleryPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { session, loading: checkingSession } = useAuth();

  const runListProjects = useServerFn(listProjects);
  const runUpdateProject = useServerFn(updateProject);
  const runDeleteProject = useServerFn(deleteProject);
  const runListVersions = useServerFn(listProjectVersions);
  const runGetSnapshot = useServerFn(getVersionSnapshot);
  const runRestoreVersion = useServerFn(restoreProjectVersion);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "size">("recent");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [addingTagProjId, setAddingTagProjId] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState("");
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  // Version history state
  const [expandedVersionsId, setExpandedVersionsId] = useState<string | null>(null);
  const [versionsMap, setVersionsMap] = useState<Record<string, ProjectVersion[]>>({});
  const [loadingVersionsId, setLoadingVersionsId] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<ProjectVersion | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);

  // Load datasets on mount or session change
  useEffect(() => {
    if (checkingSession) return;

    if (!session) {
      toast.error("You must be signed in to view your dataset gallery.");
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
      toast.error("Failed to load datasets: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  }

  // Toggles favorite state
  const handleToggleFavorite = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updatedFav = !project.favorite;
      setProjects(prev =>
        prev.map(p => (p.id === project.id ? { ...p, favorite: updatedFav } : p))
      );
      await runUpdateProject({
        data: {
          project_id: project.id,
          favorite: updatedFav,
        },
      });
      toast.success(
        updatedFav ? `Project "${project.name}" favorited!` : `Project "${project.name}" unfavorited.`
      );
    } catch (err: any) {
      console.error("Error toggling favorite:", err);
      toast.error("Failed to toggle favorite: " + (err.message || err));
      // Revert state on error
      setProjects(prev =>
        prev.map(p => (p.id === project.id ? { ...p, favorite: project.favorite } : p))
      );
    }
  };

  // Adds a tag to a project
  const handleAddTag = async (projectId: string, e: React.FormEvent) => {
    e.preventDefault();
    const tag = newTagInput.trim().toLowerCase();
    if (!tag) return;

    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    if (project.tags.includes(tag)) {
      toast.error("Tag already exists on this dataset.");
      setNewTagInput("");
      setAddingTagProjId(null);
      return;
    }

    const updatedTags = [...project.tags, tag];
    try {
      setProjects(prev =>
        prev.map(p => (p.id === projectId ? { ...p, tags: updatedTags } : p))
      );
      await runUpdateProject({
        data: {
          project_id: projectId,
          tags: updatedTags,
        },
      });
      toast.success(`Tag "${tag}" added.`);
    } catch (err: any) {
      console.error("Failed to add tag:", err);
      toast.error("Failed to add tag: " + (err.message || err));
      // Revert state
      setProjects(prev =>
        prev.map(p => (p.id === projectId ? { ...p, tags: project.tags } : p))
      );
    } finally {
      setNewTagInput("");
      setAddingTagProjId(null);
    }
  };

  // Removes a tag from a project
  const handleRemoveTag = async (project: Project, tagToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedTags = project.tags.filter(t => t !== tagToRemove);
    try {
      setProjects(prev =>
        prev.map(p => (p.id === project.id ? { ...p, tags: updatedTags } : p))
      );
      await runUpdateProject({
        data: {
          project_id: project.id,
          tags: updatedTags,
        },
      });
      toast.success(`Tag "${tagToRemove}" removed.`);
    } catch (err: any) {
      console.error("Failed to remove tag:", err);
      toast.error("Failed to remove tag: " + (err.message || err));
      // Revert
      setProjects(prev =>
        prev.map(p => (p.id === project.id ? { ...p, tags: project.tags } : p))
      );
    }
  };

  // Deletes a project
  const handleDeleteProject = async (projectId: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }
    setIsDeletingId(projectId);
    try {
      await runDeleteProject({ data: { project_id: projectId } });
      toast.success(`Project "${name}" deleted successfully.`);
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (err: any) {
      console.error("Error deleting project:", err);
      toast.error("Failed to delete project: " + (err.message || err));
    } finally {
      setIsDeletingId(null);
    }
  };

  // Compute unique tags from all user projects

  // Toggle the version history panel for a project card (lazy-loads versions)
  const handleToggleVersionPanel = async (projectId: string) => {
    if (expandedVersionsId === projectId) {
      setExpandedVersionsId(null);
      return;
    }
    setExpandedVersionsId(projectId);
    if (versionsMap[projectId]) return; // already loaded

    setLoadingVersionsId(projectId);
    try {
      const data = await runListVersions({ data: { project_id: projectId } });
      setVersionsMap(prev => ({ ...prev, [projectId]: (data as ProjectVersion[]) || [] }));
    } catch (err: any) {
      toast.error("Failed to load version history: " + (err.message || err));
    } finally {
      setLoadingVersionsId(null);
    }
  };

  // Preview a specific version's column metadata (no CSV transfer)
  const handlePreviewVersion = async (projectId: string, version: ProjectVersion) => {
    if (version.preview_metadata) {
      setPreviewVersion(version);
      return;
    }
    setPreviewLoading(true);
    try {
      const data = await runGetSnapshot({ data: { project_id: projectId, version_id: version.id } });
      const enriched = { ...version, ...(data as ProjectVersion) };
      setVersionsMap(prev => ({
        ...prev,
        [projectId]: (prev[projectId] || []).map(v => v.id === version.id ? enriched : v),
      }));
      setPreviewVersion(enriched);
    } catch (err: any) {
      toast.error("Failed to preview version: " + (err.message || err));
    } finally {
      setPreviewLoading(false);
    }
  };

  // Restore a version — loads it into memory then reloads the gallery
  const handleRestoreVersion = async (project: Project, version: ProjectVersion) => {
    if (!confirm(`Restore "${project.name}" to version ${version.version_number}? This will overwrite the live dataset.`)) return;
    setRestoringVersionId(version.id);
    try {
      const session_id = `session_${session?.user?.id}_${project.id}`;
      await runRestoreVersion({
        data: {
          project_id: project.id,
          version_id: version.id,
          session_id,
        },
      });
      toast.success(`Restored "${project.name}" to version ${version.version_number}!`);
      // Refresh versions list for this project
      const freshVersions = await runListVersions({ data: { project_id: project.id } });
      setVersionsMap(prev => ({ ...prev, [project.id]: (freshVersions as ProjectVersion[]) || [] }));
      // Refresh the project list so dataset_metadata is current
      const freshProjects = await runListProjects();
      setProjects((freshProjects as Project[]) || []);
    } catch (err: any) {
      toast.error("Failed to restore version: " + (err.message || err));
    } finally {
      setRestoringVersionId(null);
    }
  };


  const uniqueTags = useMemo(() => {
    const tagsSet = new Set<string>();
    projects.forEach(p => p.tags?.forEach(t => tagsSet.add(t)));
    return Array.from(tagsSet).sort();
  }, [projects]);

  // Toggle selection of a tag filter chip
  const handleToggleTagFilter = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Recently used section: last 5 projects opened
  const recentlyUsedProjects = useMemo(() => {
    return [...projects]
      .filter(p => p.last_opened_at)
      .sort((a, b) => new Date(b.last_opened_at).getTime() - new Date(a.last_opened_at).getTime())
      .slice(0, 5);
  }, [projects]);

  // Filtered & Sorted datasets for the main gallery list
  const filteredAndSortedProjects = useMemo(() => {
    let list = [...projects];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }

    // Favorites filter
    if (favoritesOnly) {
      list = list.filter(p => p.favorite);
    }

    // Tags filter
    if (selectedTags.length > 0) {
      list = list.filter(p => selectedTags.every(t => p.tags?.includes(t)));
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "recent") {
        return new Date(b.last_opened_at || b.created_at).getTime() - new Date(a.last_opened_at || a.created_at).getTime();
      } else if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      } else if (sortBy === "size") {
        const sizeA = (a.dataset_metadata?.rows ?? 0) * (a.dataset_metadata?.cols ?? 0);
        const sizeB = (b.dataset_metadata?.rows ?? 0) * (b.dataset_metadata?.cols ?? 0);
        return sizeB - sizeA;
      }
      return 0;
    });

    return list;
  }, [projects, searchQuery, sortBy, favoritesOnly, selectedTags]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
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
                Dataset <span className="text-gradient">Gallery</span>
              </h1>
              <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider">
                Explore your saved intelligence contexts
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

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-8 flex flex-col gap-8">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] gap-3">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground font-mono">Retrieving your dataset configurations...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] border border-dashed border-white/5 rounded-3xl bg-white/[0.01] p-8 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-muted-foreground mb-4">
              <Layers className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">No datasets saved yet</h3>
            <p className="text-xs text-muted-foreground max-w-sm mb-6 leading-relaxed">
              Upload a dataset in the console, wait for intelligence profiling, and click "Save Project" to build your gallery.
            </p>
            <Link to="/app">
              <Button size="sm" className="font-mono text-xs">
                Upload a Dataset
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* SEARCH AND FILTERS CONTROLS */}
            <div className="surface-card p-6 flex flex-col gap-5 shadow-xl">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="relative w-full md:max-w-md">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search datasets..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 text-xs font-mono bg-white/5 border-white/5 hover:border-white/10 focus-visible:ring-primary"
                  />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                  {/* Favorites Filter Toggle */}
                  <Button
                    size="sm"
                    variant={favoritesOnly ? "default" : "outline"}
                    onClick={() => setFavoritesOnly(!favoritesOnly)}
                    className="text-xs font-mono flex items-center gap-1.5 cursor-pointer"
                  >
                    <Star className={`h-3.5 w-3.5 ${favoritesOnly ? "fill-current" : ""}`} />
                    Favorites
                  </Button>

                  {/* Sort By Selector */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-mono text-slate-500">Sort</span>
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as any)}
                      className="bg-white/5 border border-white/5 rounded-md px-3 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-primary/50 cursor-pointer"
                    >
                      <option value="recent">Recent Activity</option>
                      <option value="name">Alphabetical</option>
                      <option value="size">Size (rows)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Tag Filters list */}
              {uniqueTags.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono text-slate-500">
                    <Tag className="h-3 w-3" />
                    <span>Filter by tags</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {uniqueTags.map(tag => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => handleToggleTagFilter(tag)}
                          className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold tracking-wide transition-all border cursor-pointer ${
                            isSelected
                              ? "bg-primary border-transparent text-primary-foreground hover:bg-primary/95"
                              : "bg-white/5 border-white/5 text-muted-foreground hover:border-white/10 hover:text-foreground"
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                    {selectedTags.length > 0 && (
                      <button
                        onClick={() => setSelectedTags([])}
                        className="px-2.5 py-1 text-[9px] font-mono font-black uppercase tracking-wider text-accent hover:text-accent/80 flex items-center gap-0.5 cursor-pointer ml-1"
                      >
                        <X className="h-3 w-3" /> Clear filters
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* RECENTLY USED SECTION (PINNED AT THE TOP) */}
            {recentlyUsedProjects.length > 0 && !searchQuery && !favoritesOnly && selectedTags.length === 0 && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 select-none">
                  <Clock className="h-4.5 w-4.5 text-primary" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-350">
                    Recently Used Datasets
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {recentlyUsedProjects.map(project => (
                    <Card
                      key={`recent-${project.id}`}
                      onClick={() => window.location.href = `/app?projectId=${project.id}`}
                      className="border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-primary/20 transition-all duration-300 cursor-pointer shadow-md flex flex-col justify-between group overflow-hidden"
                    >
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-xs font-bold font-mono text-white truncate max-w-[120px] group-hover:text-primary transition-colors">
                            {project.name}
                          </CardTitle>
                          <button
                            onClick={e => handleToggleFavorite(project, e)}
                            className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-primary transition-colors cursor-pointer"
                          >
                            <Star
                              className={`h-3.5 w-3.5 ${
                                project.favorite ? "fill-primary text-primary" : ""
                              }`}
                            />
                          </button>
                        </div>
                        <CardDescription className="text-[10px] truncate">
                          {project.dataset_metadata?.fileName}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-mono mt-1">
                          <Layers className="h-3 w-3 shrink-0" />
                          <span>
                            {project.dataset_metadata?.rows?.toLocaleString() ?? 0} rows
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-mono mt-0.5">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>Opened {formatDate(project.last_opened_at)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* MAIN GALLERY LIST */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between select-none">
                <div className="flex items-center gap-2">
                  <Layers className="h-4.5 w-4.5 text-primary" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-350">
                    Datasets & Workspaces ({filteredAndSortedProjects.length})
                  </h3>
                </div>
              </div>

              {filteredAndSortedProjects.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-white/5 rounded-3xl bg-white/[0.005]">
                  <p className="text-xs text-muted-foreground font-mono">No datasets matches your filters.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredAndSortedProjects.map(project => {
                    const meta = project.dataset_metadata;
                    return (
                      <Card
                        key={project.id}
                        className="border border-white/5 bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.02] transition-all duration-300 shadow-lg flex flex-col justify-between"
                      >
                        <CardHeader className="p-5 pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-0.5 min-w-0">
                              <CardTitle className="text-sm font-bold font-mono text-white truncate" title={project.name}>
                                {project.name}
                              </CardTitle>
                              <CardDescription className="text-[10px] truncate max-w-full">
                                {meta?.fileName}
                              </CardDescription>
                            </div>
                            <button
                              onClick={e => handleToggleFavorite(project, e)}
                              className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-primary transition-colors cursor-pointer shrink-0"
                            >
                              <Star
                                className={`h-4.5 w-4.5 ${
                                  project.favorite ? "fill-primary text-primary" : ""
                                }`}
                              />
                            </button>
                          </div>
                        </CardHeader>

                        <CardContent className="px-5 py-0 flex-1 flex flex-col justify-between">
                          <div className="space-y-2">
                            {/* Metadata */}
                            <div className="grid grid-cols-2 gap-4 border-y border-white/5 py-3">
                              <div className="space-y-0.5">
                                <div className="text-[8px] uppercase tracking-wider text-slate-500 font-mono">Shape</div>
                                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>{meta?.rows?.toLocaleString() ?? 0} × {meta?.cols ?? 0}</span>
                                </div>
                              </div>
                              <div className="space-y-0.5">
                                <div className="text-[8px] uppercase tracking-wider text-slate-500 font-mono">Saved Date</div>
                                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>{formatDate(project.created_at)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Tags list and tag input */}
                            <div className="space-y-2 pt-1.5">
                              <div className="text-[8px] uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1">
                                <Tag className="h-2.5 w-2.5" /> Tags
                              </div>
                              <div className="flex flex-wrap gap-1.5 items-center">
                                {project.tags?.map(t => (
                                  <Badge
                                    key={t}
                                    variant="secondary"
                                    className="text-[9px] font-mono tracking-wide px-2 py-0.5 flex items-center gap-1 border border-white/5"
                                  >
                                    <span>{t}</span>
                                    <button
                                      onClick={e => handleRemoveTag(project, t, e)}
                                      className="p-0.5 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground cursor-pointer"
                                    >
                                      <X className="h-2 w-2" />
                                    </button>
                                  </Badge>
                                ))}

                                {addingTagProjId === project.id ? (
                                  <form
                                    onSubmit={e => handleAddTag(project.id, e)}
                                    className="flex items-center gap-1 shrink-0"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <Input
                                      autoFocus
                                      size={1}
                                      value={newTagInput}
                                      onChange={e => setNewTagInput(e.target.value)}
                                      placeholder="new tag"
                                      className="h-5 px-1 py-0.5 text-[9px] font-mono bg-white/5 border-white/10 w-16"
                                    />
                                    <Button type="submit" size="icon" className="h-5 w-5 bg-primary p-0">
                                      <Plus className="h-2.5 w-2.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      onClick={() => setAddingTagProjId(null)}
                                      variant="ghost"
                                      className="h-5 w-5 p-0 text-muted-foreground"
                                    >
                                      <X className="h-2.5 w-2.5" />
                                    </Button>
                                  </form>
                                ) : (
                                  <Badge
                                    onClick={e => {
                                      e.stopPropagation();
                                      setAddingTagProjId(project.id);
                                      setNewTagInput("");
                                    }}
                                    variant="outline"
                                    className="text-[9px] font-mono tracking-wide border-dashed px-2 py-0.5 hover:bg-white/5 cursor-pointer flex items-center gap-1 text-slate-400 hover:text-white"
                                  >
                                    <Plus className="h-2 w-2" /> Add Tag
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Card Action buttons */}
                          <div className="grid grid-cols-6 gap-2 mt-6 pb-5">
                            <Button
                              onClick={() => window.location.href = `/app?projectId=${project.id}`}
                              className="col-span-4 text-xs font-mono font-bold bg-[#1A1926] hover:bg-primary hover:text-primary-foreground border border-white/5 hover:border-transparent transition-all flex items-center justify-center gap-1.5 py-1.5 cursor-pointer"
                            >
                              <FolderOpen className="h-3.5 w-3.5" />
                              Open Workspace
                              <ExternalLink className="h-3 w-3 opacity-50" />
                            </Button>

                            <Button
                              onClick={(e) => { e.stopPropagation(); handleToggleVersionPanel(project.id); }}
                              variant="outline"
                              title="Version history"
                              className={`border-white/5 hover:border-indigo-400/30 hover:bg-indigo-500/10 hover:text-indigo-300 transition-all cursor-pointer p-0 flex items-center justify-center ${expandedVersionsId === project.id ? "border-indigo-400/30 bg-indigo-500/10 text-indigo-300" : ""}`}
                            >
                              {loadingVersionsId === project.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <History className="h-3.5 w-3.5" />
                              )}
                            </Button>

                            <Button
                              onClick={e => handleDeleteProject(project.id, project.name, e)}
                              disabled={isDeletingId === project.id}
                              variant="outline"
                              className="border-white/5 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 transition-all cursor-pointer p-0 flex items-center justify-center"
                            >
                              {isDeletingId === project.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>

                          {/* Version History Expandable Panel */}
                          {expandedVersionsId === project.id && (
                            <div className="pb-5 -mx-5 px-5 border-t border-indigo-500/20 bg-indigo-950/20 pt-4 transition-all">
                              <div className="flex items-center gap-2 mb-3">
                                <GitBranch className="h-3.5 w-3.5 text-indigo-400" />
                                <span className="text-xs font-bold text-indigo-300 font-mono uppercase tracking-wider">Version History</span>
                                <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                                  {(versionsMap[project.id] || []).length} snapshot{(versionsMap[project.id] || []).length !== 1 ? "s" : ""}
                                </span>
                              </div>

                              {loadingVersionsId === project.id ? (
                                <div className="flex items-center gap-2 py-4 justify-center">
                                  <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                                  <span className="text-xs text-muted-foreground font-mono">Loading versions…</span>
                                </div>
                              ) : (versionsMap[project.id] || []).length === 0 ? (
                                <p className="text-[11px] text-muted-foreground font-mono text-center py-3">No version history yet.</p>
                              ) : (
                                <div className="relative">
                                  {/* Timeline line */}
                                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-indigo-500/20" />
                                  <ul className="space-y-2">
                                    {(versionsMap[project.id] || []).map((version, idx) => (
                                      <li key={version.id} className="flex items-start gap-3 pl-1 group/version">
                                        <div className={`mt-1.5 h-3.5 w-3.5 rounded-full shrink-0 flex items-center justify-center z-10 ${idx === 0 ? "bg-indigo-500 shadow-[0_0_6px_2px_rgba(99,102,241,0.3)]" : "bg-[#1c1c2e] border border-indigo-500/30"}`}>
                                          {idx === 0 && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-[10px] font-bold text-indigo-300 font-mono">v{version.version_number}</span>
                                            {idx === 0 && <Badge className="text-[8px] px-1 py-0 bg-indigo-500/20 text-indigo-300 border-indigo-500/30 font-mono">latest</Badge>}
                                            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]" title={version.change_note || ""}>
                                              {version.change_note || "Snapshot"}
                                            </span>
                                          </div>
                                          <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                                            {new Date(version.created_at).toLocaleString()}
                                          </div>
                                          <div className="flex items-center gap-1.5 mt-1.5 opacity-0 group-hover/version:opacity-100 transition-opacity">
                                            <button
                                              onClick={() => handlePreviewVersion(project.id, version)}
                                              className="flex items-center gap-1 text-[9px] font-mono text-slate-400 hover:text-indigo-300 px-1.5 py-0.5 rounded border border-white/5 hover:border-indigo-400/20 hover:bg-indigo-500/10 transition-all cursor-pointer"
                                            >
                                              <Eye className="h-2.5 w-2.5" /> Preview
                                            </button>
                                            {idx > 0 && (
                                              <button
                                                onClick={() => handleRestoreVersion(project, version)}
                                                disabled={restoringVersionId === version.id}
                                                className="flex items-center gap-1 text-[9px] font-mono text-slate-400 hover:text-amber-300 px-1.5 py-0.5 rounded border border-white/5 hover:border-amber-400/20 hover:bg-amber-500/10 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                              >
                                                {restoringVersionId === version.id ? (
                                                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                                ) : (
                                                  <RotateCcw className="h-2.5 w-2.5" />
                                                )}
                                                Restore
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Version Preview Modal */}
      {previewVersion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setPreviewVersion(null)}
        >
          <div
            className="bg-[#0e0e1a] border border-indigo-500/20 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-indigo-200 font-mono">
                  Version {previewVersion.version_number} Preview
                </h3>
              </div>
              <button onClick={() => setPreviewVersion(null)} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-[10px] text-muted-foreground font-mono space-y-1 border border-white/5 rounded-lg p-3 bg-white/[0.02]">
              <div><span className="text-slate-500">Change note: </span><span className="text-indigo-300">{previewVersion.change_note || "Snapshot"}</span></div>
              <div><span className="text-slate-500">Created: </span><span className="text-foreground">{new Date(previewVersion.created_at).toLocaleString()}</span></div>
            </div>

            {previewLoading ? (
              <div className="flex items-center gap-2 justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                <span className="text-xs text-muted-foreground font-mono">Loading snapshot metadata…</span>
              </div>
            ) : previewVersion.preview_metadata ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02] space-y-0.5">
                    <div className="text-[8px] uppercase tracking-wider text-slate-500 font-mono">Rows</div>
                    <div className="text-lg font-bold text-white font-mono">{previewVersion.preview_metadata.rows.toLocaleString()}</div>
                  </div>
                  <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02] space-y-0.5">
                    <div className="text-[8px] uppercase tracking-wider text-slate-500 font-mono">Columns</div>
                    <div className="text-lg font-bold text-white font-mono">{previewVersion.preview_metadata.cols}</div>
                  </div>
                </div>
                <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                  <div className="text-[8px] uppercase tracking-wider text-slate-500 font-mono mb-2">Column Names</div>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {previewVersion.preview_metadata.columns.map(col => (
                      <Badge key={col} variant="secondary" className="text-[9px] font-mono tracking-wide px-1.5 py-0.5 border border-indigo-500/20 bg-indigo-950/30 text-indigo-300">
                        {col}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground font-mono text-center py-2">Click preview to load snapshot details.</p>
            )}

            <div className="flex justify-end">
              <Button onClick={() => setPreviewVersion(null)} variant="outline" className="text-xs font-mono border-white/10 hover:bg-white/5">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

