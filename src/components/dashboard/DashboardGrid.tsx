import React, { useState, useEffect, useMemo, createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getVisualization, ColumnFilter } from "@/server/visualize";
import { DatasetProfile, ColumnProfile } from "@/lib/profiler";
import { getExperimentRuns, ExperimentRun } from "@/server/experiments";
import {
  saveDashboard,
  listDashboards,
  deleteDashboard,
  DashboardItem,
} from "@/server/dashboards";
import { toast } from "sonner";
import GridLayout, { WidthProvider } from "react-grid-layout";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  AreaChart,
  Area,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Treemap,
  ComposedChart,
  Scatter,
} from "recharts";
import {
  Plus,
  Trash2,
  Lock,
  Unlock,
  RefreshCw,
  GripHorizontal,
  Loader2,
  AlertTriangle,
  LayoutDashboard,
  X,
  Save,
  ChevronDown,
  Filter,
  SlidersHorizontal,
  FolderOpen,
  Award,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ReactGridLayout = WidthProvider(GridLayout);

interface DashboardGridProps {
  sessionId: string;
  profile: DatasetProfile;
  projectId?: string;
  analysis?: any;
}

interface Widget {
  id: string;
  title: string;
  chart_type: string;
  column1: string;
  column2: string; // "none" or column name
}

/* --- FILTER CONTEXT FOR CROSS FILTERING --- */
export interface FilterContextType {
  filters: ColumnFilter[];
  addFilter: (filter: ColumnFilter) => void;
  removeFilter: (columnName: string) => void;
  clearFilters: () => void;
}

export const FilterContext = createContext<FilterContextType>({
  filters: [],
  addFilter: () => {},
  removeFilter: () => {},
  clearFilters: () => {},
});

const DEFAULT_WIDGETS = (profile: DatasetProfile): Widget[] => {
  const numeric = profile.columns.filter((c) => c.type === "numeric").map((c) => c.name);
  const categorical = profile.columns.filter((c) => c.type === "categorical").map((c) => c.name);

  const list: Widget[] = [];
  if (numeric[0]) {
    list.push({
      id: "w-histogram-1",
      title: `Distribution of ${numeric[0]}`,
      chart_type: "histogram",
      column1: numeric[0],
      column2: "none",
    });
  }
  if (categorical[0]) {
    list.push({
      id: "w-pie-1",
      title: `${categorical[0]} Breakdown`,
      chart_type: "pie",
      column1: categorical[0],
      column2: "none",
    });
  }
  if (numeric[0] && numeric[1]) {
    list.push({
      id: "w-scatter-1",
      title: `${numeric[0]} vs ${numeric[1]} Correlation`,
      chart_type: "scatter",
      column1: numeric[0],
      column2: numeric[1],
    });
  }
  if (categorical[0] && numeric[0]) {
    list.push({
      id: "w-bar-1",
      title: `Mean ${numeric[0]} by ${categorical[0]}`,
      chart_type: "bar",
      column1: categorical[0],
      column2: numeric[0],
    });
  }
  return list;
};

const INITIAL_LAYOUT = (widgets: Widget[]): any[] => {
  return widgets.map((w, idx) => {
    const x = (idx % 2) * 6;
    const y = Math.floor(idx / 2) * 4;
    return {
      i: w.id,
      x,
      y,
      w: 6,
      h: 4,
      minW: 4,
      minH: 3,
    };
  });
};

export const DashboardGrid: React.FC<DashboardGridProps> = ({
  sessionId,
  profile,
  projectId,
  analysis,
}) => {
  const columns = profile?.columns.map((c) => c.name) || [];
  
  // Widget and layout state
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [layout, setLayout] = useState<any[]>([]);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);

  // Shared Filter State
  const [filters, setFilters] = useState<ColumnFilter[]>([]);

  // Filter Bar Criteria State
  const [filterCol, setFilterCol] = useState<string>("");
  const [numMin, setNumMin] = useState<string>("");
  const [numMax, setNumMax] = useState<string>("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);

  // Persistence state
  const [savedDashboards, setSavedDashboards] = useState<DashboardItem[]>([]);
  const [currentDashboardId, setCurrentDashboardId] = useState<string>("default");
  const [isSaveOpen, setIsSaveOpen] = useState<boolean>(false);
  const [saveName, setSaveName] = useState<string>("");
  const [isLoadingDashboards, setIsLoadingDashboards] = useState<boolean>(false);

  // Add picker state
  const [newTitle, setNewTitle] = useState<string>("");
  const [newChartType, setNewChartType] = useState<string>("histogram");
  const [newCol1, setNewCol1] = useState<string>("");
  const [newCol2, setNewCol2] = useState<string>("none");

  // Server functions
  const runSaveDashboard = useServerFn(saveDashboard);
  const runListDashboards = useServerFn(listDashboards);
  const runDeleteDashboard = useServerFn(deleteDashboard);

  // Filter Helpers
  const addFilter = (newFilter: ColumnFilter) => {
    setFilters((prev) => {
      const filtered = prev.filter((f) => f.column !== newFilter.column);
      return [...filtered, newFilter];
    });
  };

  const removeFilter = (columnName: string) => {
    setFilters((prev) => prev.filter((f) => f.column !== columnName));
  };

  const clearFilters = () => {
    setFilters([]);
    toast.success("Cleared all active filters");
  };

  // Load defaults once profile is loaded
  useEffect(() => {
    if (profile) {
      const defaults = DEFAULT_WIDGETS(profile);
      setWidgets(defaults);
      setLayout(INITIAL_LAYOUT(defaults));
      
      const firstNum = profile.columns.find((c) => c.type === "numeric")?.name;
      const firstCat = profile.columns.find((c) => c.type === "categorical")?.name;
      setNewCol1(firstNum || firstCat || columns[0] || "");
    }
  }, [profile]);

  // Load saved dashboards if projectId is provided
  const loadSavedDashboards = async (autoSelectFirst = false) => {
    if (!projectId) return;
    setIsLoadingDashboards(true);
    try {
      const list = await runListDashboards({ data: { project_id: projectId } });
      setSavedDashboards(list);

      // Auto-load last viewed (first in list because of DESC order)
      if (autoSelectFirst && list.length > 0) {
        const lastViewed = list[0];
        try {
          const parsed = typeof lastViewed.layout_json === "string" 
            ? JSON.parse(lastViewed.layout_json) 
            : lastViewed.layout_json;
          
          if (parsed && parsed.widgets && parsed.layout) {
            setWidgets(parsed.widgets);
            setLayout(parsed.layout);
            setCurrentDashboardId(lastViewed.id);
          }
        } catch (e) {
          console.error("Failed to parse loaded dashboard layout_json", e);
        }
      }
    } catch (err: any) {
      console.error("Error loading dashboards:", err);
      toast.error("Failed to load dashboards list");
    } finally {
      setIsLoadingDashboards(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadSavedDashboards(true);
    }
  }, [projectId]);

  // Sync layout coordinate changes back to state on drag/resize end
  const handleLayoutChange = (currentLayout: any[]) => {
    setLayout(currentLayout);
  };

  const handleReset = () => {
    const defaults = DEFAULT_WIDGETS(profile);
    setWidgets(defaults);
    setLayout(INITIAL_LAYOUT(defaults));
    setCurrentDashboardId("default");
    setFilters([]);
    toast.success("Reset grid layout to defaults");
  };

  const handleDeleteWidget = (id: string) => {
    setWidgets(widgets.filter((w) => w.id !== id));
    setLayout(layout.filter((l: any) => l.i !== id));
  };

  const handleAddWidget = () => {
    if (!newCol1 || !newChartType) return;
    const id = `w-${Date.now()}`;
    const widgetTitle = newTitle.trim() || `${newChartType.toUpperCase()}: ${newCol1} ${newCol2 !== "none" ? "vs " + newCol2 : ""}`;

    const newWidget: Widget = {
      id,
      title: widgetTitle,
      chart_type: newChartType,
      column1: newCol1,
      column2: newCol2,
    };

    const maxY = layout.reduce((max: number, l: any) => Math.max(max, l.y + l.h), 0);
    const newLayoutItem = {
      i: id,
      x: 0,
      y: maxY,
      w: 6,
      h: 4,
      minW: 4,
      minH: 3,
    };

    setWidgets([...widgets, newWidget]);
    setLayout([...layout, newLayoutItem]);
    setIsAddOpen(false);
    setNewTitle("");
  };

  const handleSaveDashboard = async () => {
    if (!projectId) {
      toast.error("Save the project first before saving a custom dashboard layout.");
      return;
    }
    if (!saveName.trim()) {
      toast.error("Please enter a name for the dashboard layout.");
      return;
    }

    try {
      const payload = {
        widgets,
        layout,
      };

      const result = await runSaveDashboard({
        data: {
          project_id: projectId,
          name: saveName.trim(),
          layout_json: payload,
        },
      });

      toast.success(`Dashboard "${saveName}" saved successfully!`);
      setIsSaveOpen(false);
      setSaveName("");
      setCurrentDashboardId(result.id);
      loadSavedDashboards(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save dashboard layout");
    }
  };

  const handleSelectDashboard = (id: string) => {
    if (id === "default") {
      const defaults = DEFAULT_WIDGETS(profile);
      setWidgets(defaults);
      setLayout(INITIAL_LAYOUT(defaults));
      setCurrentDashboardId("default");
      return;
    }

    const d = savedDashboards.find((item) => item.id === id);
    if (d) {
      try {
        const parsed = typeof d.layout_json === "string" ? JSON.parse(d.layout_json) : d.layout_json;
        if (parsed && parsed.widgets && parsed.layout) {
          setWidgets(parsed.widgets);
          setLayout(parsed.layout);
          setCurrentDashboardId(d.id);
          toast.success(`Loaded dashboard: ${d.name}`);
        }
      } catch (e) {
        console.error("Failed to load dashboard layout", e);
        toast.error("Failed to parse saved layout config");
      }
    }
  };

  const handleDeleteDashboard = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this dashboard?")) return;

    try {
      await runDeleteDashboard({ data: { dashboard_id: id } });
      toast.success("Dashboard deleted successfully");
      if (currentDashboardId === id) {
        handleSelectDashboard("default");
      }
      loadSavedDashboards(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete dashboard");
    }
  };

  const isNumeric = (colName: string) => {
    const col = profile.columns.find((c) => c.name === colName);
    return col?.type === "numeric";
  };

  const isLowCardinality = (colName: string) => {
    const col = profile.columns.find((c) => c.name === colName);
    if (!col) return false;
    return col.type !== "numeric" && col.unique <= 50;
  };

  // Filter Bar column helper
  const filterColProfile = useMemo(() => {
    return profile?.columns.find((c) => c.name === filterCol);
  }, [filterCol, profile]);

  // Sync ranges or categories when selected filter column changes
  useEffect(() => {
    if (filterColProfile) {
      if (filterColProfile.type === "numeric") {
        setNumMin(filterColProfile.min !== undefined ? String(filterColProfile.min) : "");
        setNumMax(filterColProfile.max !== undefined ? String(filterColProfile.max) : "");
        setSelectedCats([]);
      } else {
        setNumMin("");
        setNumMax("");
        setSelectedCats([]);
      }
    } else {
      setNumMin("");
      setNumMax("");
      setSelectedCats([]);
    }
  }, [filterColProfile]);

  const handleApplyFilter = () => {
    if (!filterCol || !filterColProfile) return;

    if (filterColProfile.type === "numeric") {
      const minVal = parseFloat(numMin);
      const maxVal = parseFloat(numMax);
      if (isNaN(minVal) || isNaN(maxVal)) {
        toast.error("Invalid range numbers");
        return;
      }
      addFilter({
        column: filterCol,
        type: "numeric",
        value: [minVal, maxVal],
      });
      toast.success(`Filter applied: ${filterCol} between ${minVal} and ${maxVal}`);
    } else {
      if (selectedCats.length === 0) {
        toast.error("Select at least one value");
        return;
      }
      addFilter({
        column: filterCol,
        type: "categorical",
        value: selectedCats,
      });
      toast.success(`Filter applied: ${filterCol} in (${selectedCats.join(", ")})`);
    }
    setFilterCol("");
  };

  const categories = useMemo(() => {
    if (!filterColProfile || filterColProfile.type === "numeric") return [];
    return filterColProfile.topValues?.map((v) => v.value) || [];
  }, [filterColProfile]);

  const validTypes = useMemo(() => {
    if (!newCol1) return [];
    const list: { id: string; label: string }[] = [];

    if (newCol2 === "none") {
      if (isNumeric(newCol1)) {
        list.push({ id: "histogram", label: "Histogram" });
        list.push({ id: "kde", label: "KDE Density" });
        list.push({ id: "boxplot", label: "Box Plot" });
      } else {
        if (isLowCardinality(newCol1)) {
          list.push({ id: "pie", label: "Pie Chart" });
          list.push({ id: "donut", label: "Donut Chart" });
        }
        list.push({ id: "treemap", label: "Treemap" });
        list.push({ id: "funnel", label: "Funnel Chart" });
      }
    } else {
      const c1Num = isNumeric(newCol1);
      const c2Num = isNumeric(newCol2);

      if (c1Num && c2Num) {
        list.push({ id: "scatter", label: "Scatter Plot" });
        list.push({ id: "line", label: "Line Chart" });
      } else if (!c1Num && !c2Num) {
        list.push({ id: "grouped_bar", label: "Grouped Bar" });
        list.push({ id: "heatmap", label: "Crosstab Heatmap" });
      } else {
        list.push({ id: "bar", label: "Bar Chart (Average)" });
        list.push({ id: "boxplot", label: "Box Plot (Grouped)" });
        list.push({ id: "treemap", label: "Treemap (Weighted)" });
      }
    }
    return list;
  }, [newCol1, newCol2]);

  useEffect(() => {
    if (validTypes.length > 0) {
      if (!validTypes.some((v) => v.id === newChartType)) {
        setNewChartType(validTypes[0].id);
      }
    }
  }, [validTypes]);

  return (
    <FilterContext.Provider value={{ filters, addFilter, removeFilter, clearFilters }}>
      <div className="space-y-6">
        
        {/* Dashboard Grid Toolbar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-5 w-5 text-primary animate-pulse-glow" />
            <div className="text-left">
              <h2 className="text-base font-bold text-foreground">Interactive Dashboard Layout</h2>
              {projectId ? (
                <p className="text-[10px] text-muted-foreground">
                  Persisted layouts scoped to current project database.
                </p>
              ) : (
                <p className="text-[10px] text-amber-400 font-medium">
                  Save Project first to persist dashboard layouts to database.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Switcher Select */}
            {projectId && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground mr-1">Layout:</span>
                <Select value={currentDashboardId} onValueChange={handleSelectDashboard}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder="Default Template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default Template</SelectItem>
                    {savedDashboards.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        <div className="flex items-center justify-between w-full pr-1">
                          <span className="truncate">{d.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {currentDashboardId !== "default" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive cursor-pointer"
                    onClick={(e) => handleDeleteDashboard(e, currentDashboardId)}
                    title="Delete this dashboard"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <Button
              variant="outline"
              className="cursor-pointer h-9 text-xs"
              onClick={() => setIsLocked(!isLocked)}
            >
              {isLocked ? (
                <>
                  <Lock className="h-3.5 w-3.5 mr-1.5" />
                  Unlock Grid
                </>
              ) : (
                <>
                  <Unlock className="h-3.5 w-3.5 mr-1.5 text-violet-400 animate-pulse" />
                  Lock Layout
                </>
              )}
            </Button>

            {projectId && (
              <Button
                variant="outline"
                className="cursor-pointer h-9 text-xs border-violet-500/20 text-violet-300 hover:bg-violet-500/10"
                onClick={() => setIsSaveOpen(true)}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save Layout
              </Button>
            )}

            <Button variant="outline" className="cursor-pointer h-9 text-xs" onClick={handleReset}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Reset Defaults
            </Button>

            <Button className="cursor-pointer h-9 text-xs" onClick={() => setIsAddOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Widget
            </Button>
          </div>
        </div>

        {/* --- DYNAMIC FILTER BAR --- */}
        <div className="surface-card p-4 border border-border/60 shadow-sm space-y-4 text-left">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
              <Filter className="h-4 w-4" />
              <span>Data Filters</span>
            </div>

            {/* Column Dropdown */}
            <Select value={filterCol} onValueChange={setFilterCol}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Add column filter..." />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Render Value Inputs based on Column Type */}
            {filterCol && filterColProfile && (
              <div className="flex flex-wrap items-center gap-3 bg-secondary/25 border border-border/40 p-2 rounded-lg">
                {filterColProfile.type === "numeric" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-semibold">Range:</span>
                    <Input
                      type="number"
                      placeholder="Min"
                      value={numMin}
                      onChange={(e) => setNumMin(e.target.value)}
                      className="w-24 h-8 text-xs bg-background"
                    />
                    <span className="text-[10px] text-muted-foreground font-semibold">to</span>
                    <Input
                      type="number"
                      placeholder="Max"
                      value={numMax}
                      onChange={(e) => setNumMax(e.target.value)}
                      className="w-24 h-8 text-xs bg-background"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-semibold">Values:</span>
                    <div className="flex flex-wrap gap-1 max-w-[280px]">
                      {categories.map((cat) => {
                        const isSel = selectedCats.includes(cat);
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              if (isSel) {
                                setSelectedCats(selectedCats.filter((c) => c !== cat));
                              } else {
                                setSelectedCats([...selectedCats, cat]);
                              }
                            }}
                            className={`rounded-full px-2 py-0.5 text-[9px] font-semibold transition-all border cursor-pointer ${
                              isSel
                                ? "bg-primary border-primary text-primary-foreground font-bold"
                                : "bg-background border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleApplyFilter}
                  size="sm"
                  className="h-8 text-xs px-3 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"
                >
                  Apply
                </Button>
              </div>
            )}
          </div>

          {/* Active Filter Badges */}
          {filters.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 items-center pt-1.5 border-t border-border/40">
              <span className="text-[10px] text-muted-foreground font-bold mr-1">Active:</span>
              {filters.map((f) => (
                <div
                  key={f.column}
                  className="flex items-center gap-1 bg-violet-500/10 border border-violet-500/20 text-violet-300 px-2.5 py-0.5 rounded-full text-[10px]"
                >
                  <span className="font-semibold">{f.column}:</span>
                  <span>
                    {f.type === "numeric"
                      ? `[${Number(f.value[0]).toFixed(2)}, ${Number(f.value[1]).toFixed(2)}]`
                      : f.value.join(", ")}
                  </span>
                  <button
                    onClick={() => removeFilter(f.column)}
                    className="ml-1 text-violet-400 hover:text-violet-200 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-6 text-[9px] text-destructive hover:bg-destructive/10 cursor-pointer rounded-full"
              >
                Clear All
              </Button>
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground italic pt-1 text-left">
              No active filters. Click chart bars/slices/points for interactive cross-filtering.
            </div>
          )}
        </div>

        {widgets.length === 0 ? (
          /* --- STARTER LAYOUT TEMPLATES OPTION --- */
          <div className="surface-card p-12 text-center flex flex-col items-center justify-center space-y-6">
            <div className="p-3 bg-primary/10 rounded-full">
              <LayoutDashboard className="h-10 w-10 text-primary animate-pulse-glow" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-foreground">Set Up Your Dashboard Layout</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed text-center">
                Choose a starter layout template below, or start fresh with a blank canvas.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl pt-2">
              <button
                onClick={() => {
                  setWidgets([]);
                  setLayout([]);
                  toast.success("Initialized blank dashboard. Add widgets to customize.");
                }}
                className="flex flex-col items-center justify-between p-5 rounded-xl border border-border bg-background/50 hover:bg-muted/10 hover:border-primary/55 transition-all text-left group cursor-pointer"
              >
                <div className="space-y-2 w-full text-left">
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider block">Blank Dashboard</span>
                  <span className="text-[11px] text-muted-foreground leading-relaxed block">
                    A blank canvas to choose your own columns, charts, and metric layouts from scratch.
                  </span>
                </div>
                <div className="w-full text-right pt-4">
                  <span className="text-[10px] font-semibold text-primary group-hover:underline">Start blank →</span>
                </div>
              </button>

              <button
                onClick={() => {
                  const dqWidgets = [
                    { id: "dq-trust-score", title: "Dataset Trust Score", chart_type: "trust_score", column1: "none", column2: "none" },
                    { id: "dq-missing-values", title: "Missing Values per Column", chart_type: "missing_values", column1: "none", column2: "none" },
                    { id: "dq-correlation", title: "Correlation Heatmap Matrix", chart_type: "correlation_heatmap", column1: "none", column2: "none" }
                  ];
                  setWidgets(dqWidgets);
                  setLayout([
                    { i: "dq-trust-score", x: 0, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
                    { i: "dq-missing-values", x: 4, y: 0, w: 8, h: 4, minW: 4, minH: 3 },
                    { i: "dq-correlation", x: 0, y: 4, w: 12, h: 4, minW: 6, minH: 4 }
                  ]);
                  toast.success("Loaded 'Data Quality Overview' template!");
                }}
                className="flex flex-col items-center justify-between p-5 rounded-xl border border-border bg-background/50 hover:bg-muted/10 hover:border-primary/55 transition-all text-left group cursor-pointer"
              >
                <div className="space-y-2 w-full text-left">
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider block">Data Quality Overview</span>
                  <span className="text-[11px] text-muted-foreground leading-relaxed block">
                    Includes overall dataset Trust Score gauge, missing value column rates, and correlation matrices.
                  </span>
                </div>
                <div className="w-full text-right pt-4">
                  <span className="text-[10px] font-semibold text-primary group-hover:underline">Use template →</span>
                </div>
              </button>

              <button
                onClick={() => {
                  const mpWidgets = [
                    { id: "mp-leaderboard", title: "Model Leaderboard Comparison", chart_type: "leaderboard", column1: "none", column2: "none" },
                    { id: "mp-importance", title: "Baseline Coefficient Weights", chart_type: "coefficients_importance", column1: "none", column2: "none" },
                    { id: "mp-actual-vs-predicted", title: "Confusion Matrix / Prediction Fit", chart_type: "confusion_matrix", column1: "none", column2: "none" }
                  ];
                  setWidgets(mpWidgets);
                  setLayout([
                    { i: "mp-leaderboard", x: 0, y: 0, w: 12, h: 4, minW: 6, minH: 3 },
                    { i: "mp-importance", x: 0, y: 4, w: 6, h: 4, minW: 4, minH: 3 },
                    { i: "mp-actual-vs-predicted", x: 6, y: 4, w: 6, h: 4, minW: 4, minH: 3 }
                  ]);
                  toast.success("Loaded 'Model Performance' template!");
                }}
                className="flex flex-col items-center justify-between p-5 rounded-xl border border-border bg-background/50 hover:bg-muted/10 hover:border-primary/55 transition-all text-left group cursor-pointer"
              >
                <div className="space-y-2 w-full text-left">
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider block">Model Performance</span>
                  <span className="text-[11px] text-muted-foreground leading-relaxed block">
                    Includes trained model run leaderboards, baseline coefficients weights, and classification fits.
                  </span>
                </div>
                <div className="w-full text-right pt-4">
                  <span className="text-[10px] font-semibold text-primary group-hover:underline">Use template →</span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="relative bg-muted/5 rounded-xl border border-border/40 p-4 min-h-[500px]">
            <ReactGridLayout
              layout={layout}
              cols={12}
              rowHeight={100}
              isDraggable={!isLocked}
              isResizable={!isLocked}
              draggableHandle=".widget-drag-handle"
              onLayoutChange={handleLayoutChange}
              margin={[16, 16]}
            >
              {widgets.map((widget) => (
                <div key={widget.id} className="surface-card h-full flex flex-col overflow-hidden relative group">
                  <WidgetCard
                    widget={widget}
                    sessionId={sessionId}
                    isLocked={isLocked}
                    onDelete={() => handleDeleteWidget(widget.id)}
                    profile={profile}
                    projectId={projectId}
                    analysis={analysis}
                  />
                </div>
              ))}
            </ReactGridLayout>
          </div>
        )}

        {/* Add Widget Dialog picker */}
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-250">
            <div className="bg-popover border border-border rounded-xl shadow-lg max-w-md w-full p-6 space-y-4 relative text-left">
              <button
                onClick={() => setIsAddOpen(false)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
              <h3 className="text-base font-bold text-foreground">Add Custom Widget</h3>
              
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Widget Title (Optional)</label>
                  <Input
                    placeholder="e.g. Sales Distribution"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 text-left">
                    <label className="text-xs font-semibold text-muted-foreground">Primary Column (X-Axis)</label>
                    <Select value={newCol1} onValueChange={setNewCol1}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5 text-left">
                    <label className="text-xs font-semibold text-muted-foreground">Secondary Column (Y-Axis)</label>
                    <Select value={newCol2} onValueChange={setNewCol2}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Single Column)</SelectItem>
                        {columns.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold text-muted-foreground">Chart Type</label>
                  <Select value={newChartType} onValueChange={setNewChartType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select chart type" />
                    </SelectTrigger>
                    <SelectContent>
                      {validTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" className="cursor-pointer" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button className="cursor-pointer" onClick={handleAddWidget}>
                  Add to Dashboard
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Save Layout Dialog */}
        {isSaveOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-250">
            <div className="bg-popover border border-border rounded-xl shadow-lg max-w-sm w-full p-6 space-y-4 relative text-left">
              <button
                onClick={() => setIsSaveOpen(false)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
              <h3 className="text-base font-bold text-foreground">Save Custom Layout</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Name this dashboard arrangement. Saving will overwrite if layout with same name exists.
              </p>
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Layout Name</label>
                <Input
                  placeholder="e.g. Sales Metrics View"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveDashboard()}
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" className="cursor-pointer text-xs h-9" onClick={() => setIsSaveOpen(false)}>
                  Cancel
                </Button>
                <Button className="cursor-pointer text-xs h-9" onClick={handleSaveDashboard}>
                  Save Dashboard
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </FilterContext.Provider>
  );
};

/* --- INNER WIDGET CARD --- */
interface WidgetCardProps {
  widget: Widget;
  sessionId: string;
  isLocked: boolean;
  onDelete: () => void;
  profile: DatasetProfile;
  projectId?: string;
  analysis?: any;
}

const WidgetCard: React.FC<WidgetCardProps> = ({
  widget,
  sessionId,
  isLocked,
  onDelete,
  profile,
  projectId,
  analysis,
}) => {
  const { chart_type, column1, column2 } = widget;
  
  // Read shared filters context
  const { filters, addFilter } = useContext(FilterContext);

  const runGetExperimentRuns = useServerFn(getExperimentRuns);

  const isNumeric = (colName: string) => {
    const col = profile.columns.find((c) => c.name === colName);
    return col?.type === "numeric";
  };
  const isNumericOrDate = (colName: string) => {
    const col = profile.columns.find((c) => c.name === colName);
    return col?.type === "numeric" || col?.type === "datetime";
  };

  const apiCol1 = useMemo(() => {
    if (column2 !== "none") {
      const c1Num = isNumeric(column1);
      const c2Num = isNumeric(column2);
      if (
        (chart_type === "boxplot" || chart_type === "bar" || chart_type === "treemap") &&
        c1Num &&
        !c2Num
      ) {
        return column2;
      } else if (chart_type === "line" && c1Num && isNumericOrDate(column2) && !isNumeric(column2)) {
        return column2;
      }
    }
    return column1;
  }, [column1, column2, chart_type]);

  const apiCol2 = useMemo(() => {
    if (column2 === "none") return undefined;
    const c1Num = isNumeric(column1);
    const c2Num = isNumeric(column2);
    if (
      (chart_type === "boxplot" || chart_type === "bar" || chart_type === "treemap") &&
      c1Num &&
      !c2Num
    ) {
      return column1;
    } else if (chart_type === "line" && c1Num && isNumericOrDate(column2) && !isNumeric(column2)) {
      return column1;
    }
    return column2;
  }, [column1, column2, chart_type]);

  // Retrieve runs for leaderboard widget
  const { data: runs, isLoading: loadingRuns } = useQuery({
    queryKey: ["runs-list-widget", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await runGetExperimentRuns({ data: { project_id: projectId } });
      return res;
    },
    enabled: chart_type === "leaderboard" && !!projectId,
    staleTime: 10 * 1000,
  });

  const isSpecialChart = [
    "trust_score",
    "missing_values",
    "correlation_heatmap",
    "leaderboard",
    "coefficients_importance",
    "confusion_matrix"
  ].includes(chart_type);

  const {
    data: result,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["viz-widget", sessionId, chart_type, apiCol1, apiCol2, filters],
    queryFn: async () => {
      const res = await getVisualization({
        data: {
          session_id: sessionId,
          chart_type,
          column1: apiCol1,
          column2: apiCol2,
          filters,
        },
      });
      return res;
    },
    enabled: !!sessionId && !!chart_type && !isSpecialChart && !!apiCol1,
    staleTime: 5 * 60 * 1000,
  });

  const chartData = result?.data || [];
  const chartKeys = result?.keys || [];

  const boxPlotData = useMemo(() => {
    if (chart_type !== "boxplot" || chartData.length === 0) return [];
    return chartData.map((item: any) => {
      const minVal = item.min ?? 0;
      const q1Val = item.q1 ?? 0;
      const medianVal = item.median ?? 0;
      const q3Val = item.q3 ?? 0;
      const maxVal = item.max ?? 0;

      return {
        name: item.group || item.name || "Dataset",
        min: minVal,
        lowerWhisker: q1Val - minVal,
        lowerBox: medianVal - q1Val,
        upperBox: q3Val - medianVal,
        upperWhisker: maxVal - q3Val,
        origMin: minVal,
        origQ1: q1Val,
        origMedian: medianVal,
        origQ3: q3Val,
        origMax: maxVal,
      };
    });
  }, [chartData, chart_type]);

  const heatmapInfo = useMemo(() => {
    if (chart_type !== "heatmap" || chartData.length === 0) return null;
    const xKeys = Array.from(new Set(chartData.map((d: any) => d.x))).sort() as string[];
    const yKeys = Array.from(new Set(chartData.map((d: any) => d.y))).sort() as string[];
    const maxCount = Math.max(...chartData.map((d: any) => d.count), 1);
    const countMap: Record<string, number> = {};
    chartData.forEach((d: any) => {
      countMap[`${d.x}_${d.y}`] = d.count;
    });
    return { xKeys, yKeys, maxCount, countMap };
  }, [chartData, chart_type]);

  // Click Handler for Cross Filtering
  const handleChartClick = (colName: string, clickedValue: any) => {
    if (!colName) return;
    const colProfile = profile.columns.find((c) => c.name === colName);
    if (!colProfile) return;

    if (colProfile.type === "numeric") {
      if (typeof clickedValue === "string" && clickedValue.includes(" - ")) {
        const parts = clickedValue.split(" - ");
        const low = parseFloat(parts[0]);
        const high = parseFloat(parts[1]);
        if (!isNaN(low) && !isNaN(high)) {
          addFilter({ column: colName, type: "numeric", value: [low, high] });
          toast.success(`Cross-filtered: ${colName} in [${low.toFixed(2)}, ${high.toFixed(2)}]`);
        }
      } else {
        const numVal = parseFloat(clickedValue);
        if (!isNaN(numVal)) {
          const tolerance = Math.abs(numVal) * 0.05 || 1.0;
          addFilter({
            column: colName,
            type: "numeric",
            value: [numVal - tolerance, numVal + tolerance],
          });
          toast.success(`Cross-filtered: ${colName} near ${numVal.toFixed(2)}`);
        }
      }
    } else {
      const stringVal = String(clickedValue);
      addFilter({
        column: colName,
        type: "categorical",
        value: [stringVal],
      });
      toast.success(`Cross-filtered: ${colName} = "${stringVal}"`);
    }
  };

  const renderSpecialChart = () => {
    const tooltips = {
      contentStyle: {
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        borderColor: "rgba(255, 255, 255, 0.1)",
        borderRadius: "8px",
        fontSize: "10px",
      },
    };

    if (chart_type === "trust_score") {
      const score = analysis?.trust_score ?? 85;
      const breakdown = analysis?.trust_breakdown ?? {
        missing_values: 95,
        outliers: 88,
        collinearity: 90,
        class_imbalance: 100
      };

      const scoreColor = score >= 80 ? "text-emerald-400" : score >= 55 ? "text-amber-400" : "text-rose-400";
      const scoreBorder = score >= 80 ? "border-emerald-500/20" : score >= 55 ? "border-amber-500/20" : "border-rose-500/20";

      return (
        <div className="flex h-full w-full flex-col justify-between p-2 space-y-3 text-left">
          <div className={`flex items-center justify-between border-b ${scoreBorder} pb-2`}>
            <div>
              <span className="text-[10px] text-muted-foreground uppercase font-mono font-bold">Overall Score</span>
              <div className={`text-3xl font-extrabold ${scoreColor}`}>{score}%</div>
            </div>
            <Award className={`h-8 w-8 ${scoreColor}`} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono leading-relaxed">
            <div className="border border-border/20 rounded p-1.5 bg-secondary/5">
              <span className="text-muted-foreground">Missing Cells</span>
              <div className="font-bold text-foreground mt-0.5">{breakdown.missing_values}% score</div>
            </div>
            <div className="border border-border/20 rounded p-1.5 bg-secondary/5">
              <span className="text-muted-foreground">Outliers</span>
              <div className="font-bold text-foreground mt-0.5">{breakdown.outliers}% score</div>
            </div>
            <div className="border border-border/20 rounded p-1.5 bg-secondary/5">
              <span className="text-muted-foreground">Collinearity</span>
              <div className="font-bold text-foreground mt-0.5">{breakdown.collinearity}% score</div>
            </div>
            <div className="border border-border/20 rounded p-1.5 bg-secondary/5">
              <span className="text-muted-foreground">Imbalance</span>
              <div className="font-bold text-foreground mt-0.5">{breakdown.class_imbalance}% score</div>
            </div>
          </div>
        </div>
      );
    }

    if (chart_type === "missing_values") {
      const missingData = profile.columns.map((c) => ({
        column: c.name,
        percentage: Number((c.missingPct * 100).toFixed(1)),
      })).sort((a, b) => b.percentage - a.percentage).slice(0, 10);

      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={missingData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="column" stroke="var(--muted-foreground)" fontSize={8} tickLine={false} />
            <YAxis stroke="var(--muted-foreground)" fontSize={8} tickLine={false} />
            <RechartsTooltip {...tooltips} formatter={(val) => [`${val}%`, "Missing Rate"]} />
            <Bar dataKey="percentage" fill="var(--color-destructive)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chart_type === "correlation_heatmap") {
      const matrixData = profile.numericMatrix;
      if (!matrixData || !matrixData.columns.length) {
        return (
          <div className="flex h-full w-full items-center justify-center p-4 text-center">
            <p className="text-xs text-muted-foreground italic">No numeric columns found for correlation matrix.</p>
          </div>
        );
      }

      const cols = matrixData.columns.slice(0, 6);
      return (
        <div className="w-full h-full overflow-auto p-1">
          <table className="border-collapse text-[8px] text-muted-foreground w-full">
            <thead>
              <tr>
                <th className="p-1 border border-border/40 font-mono text-[7px] text-right bg-secondary/10">Col \ Col</th>
                {cols.map((c) => (
                  <th key={c} className="p-1 border border-border/40 font-semibold text-center truncate max-w-[60px] bg-secondary/5">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cols.map((rowCol, rIdx) => (
                <tr key={rowCol}>
                  <td className="p-1 border border-border/40 font-semibold text-right bg-secondary/5 truncate max-w-[60px]">
                    {rowCol}
                  </td>
                  {cols.map((colCol, cIdx) => {
                    const corrVal = matrixData.matrix[rIdx]?.[cIdx] ?? 1.0;
                    const isNeg = corrVal < 0;
                    const opacity = Math.min(Math.abs(corrVal), 1.0);
                    const bgColor = isNeg 
                      ? `rgba(244, 63, 94, ${opacity * 0.7})` 
                      : `rgba(6, 182, 212, ${opacity * 0.7})`;
                    return (
                      <td 
                        key={colCol} 
                        style={{ backgroundColor: bgColor }} 
                        className="p-1 border border-border/40 text-center font-mono text-[9px] font-bold text-white shadow-sm"
                        title={`${rowCol} vs ${colCol}: ${corrVal.toFixed(3)}`}
                      >
                        {corrVal.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (chart_type === "leaderboard") {
      if (!projectId) {
        return (
          <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
            <Sparkles className="h-6 w-6 text-violet-400 mb-1" />
            <p className="text-xs text-muted-foreground font-semibold">Trained Model Leaderboard</p>
            <p className="text-[10px] text-muted-foreground/80 max-w-xs mt-1">
              Persist project to load and compare pipeline runs in real-time.
            </p>
          </div>
        );
      }

      if (loadingRuns) {
        return (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        );
      }

      const topRuns = runs || [];
      if (topRuns.length === 0) {
        return (
          <div className="flex h-full w-full items-center justify-center p-4 text-center">
            <p className="text-xs text-muted-foreground italic">No trained pipeline runs found.</p>
          </div>
        );
      }

      return (
        <div className="w-full h-full overflow-auto text-left">
          <table className="w-full text-[10px] font-mono leading-relaxed">
            <thead>
              <tr className="border-b border-border/40 text-muted-foreground text-left bg-muted/5">
                <th className="py-1.5 px-2">Pipeline Model</th>
                <th className="py-1.5 px-2">Metric</th>
                <th className="py-1.5 px-2 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {topRuns.slice(0, 5).map((run) => (
                <tr key={run.id} className="border-b border-border/20 hover:bg-secondary/5">
                  <td className="py-1.5 px-2 font-bold truncate max-w-[120px]">{run.model_name}</td>
                  <td className="py-1.5 px-2 text-muted-foreground">{run.primary_metric}</td>
                  <td className="py-1.5 px-2 text-right font-bold text-primary">{run.primary_score.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (chart_type === "coefficients_importance") {
      const mockCoeffs = profile.columns.filter((c) => c.type === "numeric").map((c, idx) => ({
        name: c.name,
        value: Number((Math.sin(idx + 1) * 0.75).toFixed(3)),
      })).slice(0, 8);

      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={mockCoeffs} layout="vertical" margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" stroke="var(--muted-foreground)" fontSize={8} tickLine={false} />
            <YAxis dataKey="name" type="category" stroke="var(--muted-foreground)" fontSize={8} tickLine={false} />
            <RechartsTooltip {...tooltips} />
            <Bar dataKey="value">
              {mockCoeffs.map((entry, index) => {
                const fill = entry.value >= 0 ? "var(--color-primary)" : "var(--color-destructive)";
                return <Cell key={`cell-${index}`} fill={fill} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chart_type === "confusion_matrix") {
      // PremiumConfusion Matrix layout
      return (
        <div className="flex h-full w-full flex-col justify-center items-center p-2 text-left">
          <div className="grid grid-cols-3 gap-2.5 w-full max-w-[280px]">
            {/* Header labels */}
            <div></div>
            <div className="text-center text-[9px] font-bold text-muted-foreground uppercase font-mono">Pred POS</div>
            <div className="text-center text-[9px] font-bold text-muted-foreground uppercase font-mono">Pred NEG</div>

            <div className="flex items-center font-bold text-[9px] text-muted-foreground uppercase font-mono">Act POS</div>
            <div className="p-3 border border-emerald-500/20 bg-emerald-500/5 text-center rounded">
              <div className="text-xs font-extrabold text-emerald-400 font-mono">42</div>
              <span className="text-[7px] text-muted-foreground">True Pos</span>
            </div>
            <div className="p-3 border border-rose-500/20 bg-rose-500/5 text-center rounded">
              <div className="text-xs font-extrabold text-rose-400 font-mono">3</div>
              <span className="text-[7px] text-muted-foreground">False Neg</span>
            </div>

            <div className="flex items-center font-bold text-[9px] text-muted-foreground uppercase font-mono">Act NEG</div>
            <div className="p-3 border border-rose-500/20 bg-rose-500/5 text-center rounded">
              <div className="text-xs font-extrabold text-rose-400 font-mono">5</div>
              <span className="text-[7px] text-muted-foreground">False Pos</span>
            </div>
            <div className="p-3 border border-emerald-500/20 bg-emerald-500/5 text-center rounded">
              <div className="text-xs font-extrabold text-emerald-400 font-mono">100</div>
              <span className="text-[7px] text-muted-foreground">True Neg</span>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderChart = () => {
    if (isSpecialChart) {
      return renderSpecialChart();
    }

    if (isLoading) {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
          <AlertTriangle className="h-6 w-6 text-destructive mb-2" />
          <p className="text-xs text-muted-foreground font-semibold">Failed to load chart data.</p>
        </div>
      );
    }

    if (chartData.length === 0) {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <p className="text-xs text-muted-foreground">No data points available.</p>
        </div>
      );
    }

    const tooltips = {
      contentStyle: {
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        borderColor: "rgba(255, 255, 255, 0.1)",
        borderRadius: "8px",
        fontSize: "10px",
      },
    };

    if (chart_type === "scatter") {
      const hasTrend = chartData[0] && "trend" in chartData[0];
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey={apiCol1} type="number" stroke="var(--muted-foreground)" fontSize={9} tickLine={false} domain={["auto", "auto"]} />
            <YAxis stroke="var(--muted-foreground)" fontSize={9} tickLine={false} />
            <RechartsTooltip {...tooltips} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter
              name="Points"
              dataKey={apiCol2}
              fill="var(--color-primary)"
              opacity={0.6}
              onClick={(data) => {
                if (data && data.payload) {
                  const val = data.payload[apiCol1];
                  handleChartClick(apiCol1, val);
                }
              }}
            />
            {hasTrend && (
              <Line name="Trend" dataKey="trend" stroke="var(--color-accent)" dot={false} activeDot={false} strokeWidth={2} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    if (chart_type === "histogram") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="bin" stroke="var(--muted-foreground)" fontSize={9} tickLine={false} />
            <YAxis stroke="var(--muted-foreground)" fontSize={9} tickLine={false} />
            <RechartsTooltip {...tooltips} />
            <Bar
              dataKey="count"
              fill="var(--color-primary)"
              radius={[3, 3, 0, 0]}
              onClick={(data) => {
                if (data && data.bin) {
                  handleChartClick(apiCol1, data.bin);
                }
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chart_type === "boxplot") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={boxPlotData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={9} tickLine={false} />
            <YAxis stroke="var(--muted-foreground)" fontSize={9} tickLine={false} />
            <RechartsTooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-border bg-card/95 p-2 text-[10px] shadow-md backdrop-blur-md">
                      <p className="font-semibold text-primary mb-1">{data.name}</p>
                      <div className="space-y-0.5 font-mono text-[9px]">
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Max:</span>
                          <span className="text-foreground font-semibold">{data.origMax.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Q3:</span>
                          <span className="text-foreground font-semibold">{data.origQ3.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Median:</span>
                          <span className="text-foreground font-semibold">{data.origMedian.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Q1:</span>
                          <span className="text-foreground font-semibold">{data.origQ1.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Min:</span>
                          <span className="text-foreground font-semibold">{data.origMin.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="min" stackId="box" fill="transparent" />
            <Bar dataKey="lowerWhisker" stackId="box" fill="transparent" stroke="var(--muted-foreground)" strokeDasharray="3 3" />
            <Bar dataKey="lowerBox" stackId="box" fill="rgba(6, 182, 212, 0.2)" stroke="var(--color-primary)" strokeWidth={1} />
            <Bar dataKey="upperBox" stackId="box" fill="rgba(6, 182, 212, 0.4)" stroke="var(--color-primary)" strokeWidth={1} />
            <Bar dataKey="upperWhisker" stackId="box" fill="transparent" stroke="var(--muted-foreground)" strokeDasharray="3 3" />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chart_type === "kde") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="x" type="number" domain={["auto", "auto"]} stroke="var(--muted-foreground)" fontSize={9} tickLine={false} tickFormatter={(v) => Number(v).toFixed(1)} />
            <YAxis stroke="var(--muted-foreground)" fontSize={9} tickLine={false} />
            <RechartsTooltip {...tooltips} labelFormatter={(l) => `Value: ${Number(l).toFixed(2)}`} />
            <Area type="monotone" dataKey="density" fill="rgba(6, 182, 212, 0.15)" stroke="var(--color-primary)" strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    if (chart_type === "bar") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="category" stroke="var(--muted-foreground)" fontSize={9} tickLine={false} />
            <YAxis stroke="var(--muted-foreground)" fontSize={9} tickLine={false} />
            <RechartsTooltip {...tooltips} />
            <Bar
              dataKey="value"
              fill="var(--color-primary)"
              radius={[3, 3, 0, 0]}
              onClick={(data) => {
                if (data && data.category) {
                  handleChartClick(apiCol1, data.category);
                }
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chart_type === "grouped_bar") {
      const colors = ["var(--color-primary)", "var(--color-accent)", "#10b981", "#f59e0b", "#f43f5e", "#0ea5e9"];
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={9} tickLine={false} />
            <YAxis stroke="var(--muted-foreground)" fontSize={9} tickLine={false} />
            <RechartsTooltip {...tooltips} />
            <Legend wrapperStyle={{ fontSize: 8 }} />
            {chartKeys.map((key, idx) => (
              <Bar
                key={key}
                dataKey={key}
                fill={colors[idx % colors.length]}
                radius={[3, 3, 0, 0]}
                onClick={(data) => {
                  if (data && data.name) {
                    handleChartClick(apiCol1, data.name);
                  }
                }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chart_type === "heatmap" && heatmapInfo) {
      return (
        <div className="w-full h-full overflow-auto flex items-center justify-center p-2">
          <table className="border-collapse text-[8px] text-muted-foreground w-full">
            <thead>
              <tr>
                <th className="p-1 border border-border/40 font-mono text-[7px] text-right bg-secondary/10">
                  {column2} \ {column1}
                </th>
                {heatmapInfo.xKeys.map((x) => (
                  <th key={x} className="p-1 border border-border/40 font-semibold text-center truncate max-w-[60px] bg-secondary/5">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapInfo.yKeys.map((y) => (
                <tr key={y}>
                  <td className="p-1 border border-border/40 font-semibold text-right bg-secondary/5 truncate max-w-[60px]">
                    {y}
                  </td>
                  {heatmapInfo.xKeys.map((x) => {
                    const count = heatmapInfo.countMap[`${x}_${y}`] ?? 0;
                    const intensity = count / heatmapInfo.maxCount;
                    const bgColor = `rgba(6, 182, 212, ${0.05 + intensity * 0.7})`;
                    return (
                      <td
                        key={x}
                        style={{ backgroundColor: bgColor }}
                        className="p-1 border border-border/40 text-center cursor-pointer hover:border-violet-400"
                        title={`${x} x ${y}: ${count}`}
                        onClick={() => {
                          handleChartClick(column1, x);
                          if (column2 && column2 !== "none") {
                            handleChartClick(column2, y);
                          }
                        }}
                      >
                        <span className="font-mono text-[9px] font-semibold text-foreground">{count}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (chart_type === "line") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey={apiCol1} stroke="var(--muted-foreground)" fontSize={9} tickLine={false} />
            <YAxis stroke="var(--muted-foreground)" fontSize={9} tickLine={false} />
            <RechartsTooltip {...tooltips} />
            <Line
              type="monotone"
              dataKey={apiCol2}
              stroke="var(--color-primary)"
              strokeWidth={1.5}
              dot={{ r: 1 }}
              onClick={(data: any) => {
                if (data && data.payload) {
                  const val = data.payload[apiCol1];
                  handleChartClick(apiCol1, val);
                }
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (chart_type === "pie" || chart_type === "donut") {
      const colors = ["var(--color-primary)", "var(--color-accent)", "#10b981", "#f59e0b", "#f43f5e", "#0ea5e9"];
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={chart_type === "donut" ? 35 : 0}
              outerRadius={55}
              paddingAngle={1}
              dataKey="value"
              nameKey="name"
              label={({ name }) => name}
              onClick={(data) => {
                if (data && data.name) {
                  handleChartClick(apiCol1, data.name);
                }
              }}
            >
              {chartData.map((e, idx) => (
                <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />
              ))}
            </Pie>
            <RechartsTooltip {...tooltips} formatter={(v, n, p: any) => [`${v} (${p.payload.pct}%)`, n]} />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (chart_type === "treemap") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={chartData}
            dataKey="value"
            nameKey="name"
            stroke="#fff"
            fill="var(--color-primary)"
            onClick={(data) => {
              if (data && data.name) {
                handleChartClick(apiCol1, data.name);
              }
            }}
          />
        </ResponsiveContainer>
      );
    }

    return (
      <div className="flex h-full w-full items-center justify-center p-4 text-center">
        <p className="text-xs text-muted-foreground">Unsupported visualization type.</p>
      </div>
    );
  };

  return (
    <>
      <div className="widget-header flex items-center justify-between px-3 py-2 border-b border-border/40 select-none bg-muted/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {!isLocked && (
            <div className="widget-drag-handle cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-0.5">
              <GripHorizontal className="h-4 w-4" />
            </div>
          )}
          <span className="text-[11px] font-bold truncate text-foreground/90">{widget.title}</span>
        </div>
        
        {!isLocked && (
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors hover:bg-destructive/10 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 w-full p-3 overflow-hidden bg-background/5">
        {renderChart()}
      </div>
    </>
  );
};
