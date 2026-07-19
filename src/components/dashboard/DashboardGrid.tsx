import React, { useState, useEffect, useMemo, createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getVisualization, ColumnFilter, generateNLVisualization } from "@/server/visualize";
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
  Hash,
  Type,
  Trash,
  Settings,
  ArrowUpRight,
  Search,
  Calendar,
  CheckSquare,
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

// Power BI Color Palette
const POWERBI_COLORS = [
  "#118D95", // Teal
  "#30C2E6", // Cyan
  "#AB3B56", // Rose
  "#D65C2B", // Orange
  "#D1A111", // Gold
  "#5F2E8A", // Purple
  "#2C96C8", // Slate Blue
  "#E92C7F", // Bright Pink
  "#1F8276", // Forest Green
];

// Helper to filter rows on the client side based on active filters
const getFilteredRows = (rows: Record<string, unknown>[], filters: ColumnFilter[]) => {
  if (!rows || rows.length === 0) return [];
  return rows.filter((row) => {
    for (const filter of filters) {
      const val = row[filter.column];
      if (filter.operator === "between") {
        const [min, max] = filter.value as [any, any];
        
        // Handle Date comparisons
        if (min !== undefined && min !== null && min !== "") {
          const minDate = new Date(min);
          const valDate = new Date(String(val));
          if (!isNaN(minDate.getTime()) && !isNaN(valDate.getTime())) {
            if (valDate < minDate) return false;
          } else {
            const num = Number(val);
            if (!isNaN(num) && num < Number(min)) return false;
          }
        }
        
        if (max !== undefined && max !== null && max !== "") {
          const maxDate = new Date(max);
          const valDate = new Date(String(val));
          if (!isNaN(maxDate.getTime()) && !isNaN(valDate.getTime())) {
            if (valDate > maxDate) return false;
          } else {
            const num = Number(val);
            if (!isNaN(num) && num > Number(max)) return false;
          }
        }
      } else if (filter.operator === "in") {
        const vals = filter.value as string[];
        if (vals.length > 0 && !vals.includes(String(val))) return false;
      }
    }
    return true;
  });
};

interface DashboardGridProps {
  sessionId: string;
  profile: DatasetProfile;
  projectId?: string;
  analysis?: any;
  rows?: Record<string, unknown>[]; // Full dataset rows
}

interface Widget {
  id: string;
  title: string;
  chart_type: string;
  column1: string;
  column2: string; // "none" or column name
  legend_col?: string;
  value_col?: string;
  kpi_aggregation?: "count" | "sum" | "average" | "min" | "max";
  kpi_threshold?: number;
  kpi_operator?: ">" | "<" | ">=" | "<=" | "==";
}

export interface Page {
  id: string;
  name: string;
  widgets: Widget[];
  layout: any[];
  filters: ColumnFilter[];
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
  rows = [],
}) => {
  const columns = profile?.columns.map((c) => c.name) || [];

  // Multi-page report canvas state
  const [pages, setPages] = useState<Page[]>([]);
  const [activePageId, setActivePageId] = useState<string>("");

  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);

  // Persistence state
  const [savedDashboards, setSavedDashboards] = useState<DashboardItem[]>([]);
  const [currentDashboardId, setCurrentDashboardId] = useState<string>("default");
  const [isSaveOpen, setIsSaveOpen] = useState<boolean>(false);
  const [saveName, setSaveName] = useState<string>("");
  const [isLoadingDashboards, setIsLoadingDashboards] = useState<boolean>(false);

  // Filter Bar / Pane states
  const [selectedFilterCol, setSelectedFilterCol] = useState<string>("");

  // Add custom picker state
  const [newTitle, setNewTitle] = useState<string>("");
  const [newChartType, setNewChartType] = useState<string>("histogram");
  const [newCol1, setNewCol1] = useState<string>("");
  const [newCol2, setNewCol2] = useState<string>("none");

  // Server functions
  const runSaveDashboard = useServerFn(saveDashboard);
  const runListDashboards = useServerFn(listDashboards);
  const runDeleteDashboard = useServerFn(deleteDashboard);
  const [nlQuery, setNlQuery] = useState("");
  const [isNlLoading, setIsNlLoading] = useState(false);
  const runGenerateNLVisualization = useServerFn(generateNLVisualization);

  const handleNLSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlQuery.trim()) return;
    setIsNlLoading(true);
    try {
      const spec = await runGenerateNLVisualization({
        data: {
          session_id: sessionId,
          query: nlQuery.trim(),
        },
      });

      // Validate columns on client side for extra safety
      const allCols = profile.columns.map((c) => c.name);
      if (spec.x_field && !allCols.includes(spec.x_field)) {
        toast.error(`Hallucinated field '${spec.x_field}' returned by AI. Validation failed.`);
        setIsNlLoading(false);
        return;
      }
      if (spec.y_field && spec.y_field !== "none" && spec.y_field !== null && !allCols.includes(spec.y_field)) {
        toast.error(`Hallucinated field '${spec.y_field}' returned by AI. Validation failed.`);
        setIsNlLoading(false);
        return;
      }

      // Add widget to canvas
      const id = `w-${Date.now()}`;
      const newWidget: Widget = {
        id,
        title: spec.title || `${spec.chart_type.toUpperCase()}: ${spec.x_field} ${spec.y_field && spec.y_field !== "none" ? "vs " + spec.y_field : ""}`,
        chart_type: spec.chart_type,
        column1: spec.x_field,
        column2: spec.y_field || "none",
        kpi_aggregation: "sum",
        kpi_operator: ">",
        kpi_threshold: undefined,
      };

      updateActivePage((p) => {
        const nextIdx = p.widgets.length;
        const x = (nextIdx % 2) * 6;
        const y = Math.floor(nextIdx / 2) * 4;
        const newLayout = [
          ...p.layout,
          {
            i: id,
            x,
            y,
            w: 6,
            h: 4,
            minW: 4,
            minH: 3,
          },
        ];
        return {
          widgets: [...p.widgets, newWidget],
          layout: newLayout,
        };
      });

      toast.success(`AI created visual: ${newWidget.title}`);
      setNlQuery("");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate AI visual.");
    } finally {
      setIsNlLoading(false);
    }
  };

  // Active page shortcut references
  const activePage = useMemo(() => {
    return pages.find((p) => p.id === activePageId) || pages[0] || null;
  }, [pages, activePageId]);

  const widgets = activePage?.widgets || [];
  const layout = activePage?.layout || [];
  const filters = activePage?.filters || [];

  // Helper to mutate active page fields in pages array
  const updateActivePage = (updater: (p: Page) => Partial<Page>) => {
    setPages((prev) =>
      prev.map((p) => (p.id === activePageId ? { ...p, ...updater(p) } : p))
    );
  };

  // Filter helpers (bound to active page)
  const addFilter = (newFilter: ColumnFilter) => {
    updateActivePage((p) => {
      const filtered = p.filters.filter((f) => f.column !== newFilter.column);
      return { filters: [...filtered, newFilter] };
    });
  };

  const removeFilter = (columnName: string) => {
    updateActivePage((p) => ({
      filters: p.filters.filter((f) => f.column !== columnName),
    }));
  };

  const clearFilters = () => {
    updateActivePage(() => ({ filters: [] }));
    toast.success("Cleared page-level filters");
  };

  // Load defaults once profile is loaded
  useEffect(() => {
    if (profile && pages.length === 0) {
      const defaults = DEFAULT_WIDGETS(profile);
      setPages([
        {
          id: "page-1",
          name: "Page 1",
          widgets: defaults,
          layout: INITIAL_LAYOUT(defaults),
          filters: [],
        },
      ]);
      setActivePageId("page-1");

      const firstNum = profile.columns.find((c) => c.type === "numeric")?.name;
      const firstCat = profile.columns.find((c) => c.type === "categorical")?.name;
      setNewCol1(firstNum || firstCat || columns[0] || "");
    }
  }, [profile, pages.length]);

  // Load saved dashboards list
  const loadSavedDashboards = async (autoSelectFirst = false) => {
    if (!projectId) return;
    setIsLoadingDashboards(true);
    try {
      const list = await runListDashboards({ data: { project_id: projectId } });
      setSavedDashboards(list);

      // Auto-load last saved dashboard on mount
      if (autoSelectFirst && list.length > 0) {
        const lastViewed = list[0];
        try {
          const parsed = typeof lastViewed.layout_json === "string" 
            ? JSON.parse(lastViewed.layout_json) 
            : lastViewed.layout_json;
          
          if (parsed) {
            if (parsed.pages) {
              setPages(parsed.pages);
              setActivePageId(parsed.pages[0]?.id || "page-1");
            } else if (parsed.widgets && parsed.layout) {
              setPages([
                {
                  id: "page-1",
                  name: "Page 1",
                  widgets: parsed.widgets,
                  layout: parsed.layout,
                  filters: [],
                },
              ]);
              setActivePageId("page-1");
            }
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
    updateActivePage(() => ({ layout: currentLayout }));
  };

  const handleReset = () => {
    const defaults = DEFAULT_WIDGETS(profile);
    setPages([
      {
        id: "page-1",
        name: "Page 1",
        widgets: defaults,
        layout: INITIAL_LAYOUT(defaults),
        filters: [],
      },
    ]);
    setActivePageId("page-1");
    setCurrentDashboardId("default");
    toast.success("Reset report canvas to default layout");
  };

  const handleDeleteWidget = (id: string) => {
    updateActivePage((p) => ({
      widgets: p.widgets.filter((w) => w.id !== id),
      layout: p.layout.filter((l: any) => l.i !== id),
    }));
  };

  // Updating widget settings callback from inside tiles settings panels
  const handleUpdateWidget = (updatedWidget: Widget) => {
    updateActivePage((p) => ({
      widgets: p.widgets.map((w) => (w.id === updatedWidget.id ? updatedWidget : w)),
    }));
  };

  // Adding Custom widgets via Add Dialog
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
      kpi_aggregation: "count",
      kpi_operator: ">",
      kpi_threshold: undefined,
    };

    updateActivePage((p) => {
      const nextIdx = p.widgets.length;
      const x = (nextIdx % 2) * 6;
      const y = Math.floor(nextIdx / 2) * 4;
      const newLayout = [
        ...p.layout,
        {
          i: id,
          x,
          y,
          w: 6,
          h: 4,
          minW: 4,
          minH: 3,
        },
      ];
      return {
        widgets: [...p.widgets, newWidget],
        layout: newLayout,
      };
    });

    setIsAddOpen(false);
    setNewTitle("");
  };

  // Left field pane column click addition
  const handleFieldClick = (colName: string) => {
    const colProfile = profile.columns.find((c) => c.name === colName);
    const isNum = colProfile?.type === "numeric";
    const chartType = isNum ? "histogram" : "pie";
    
    const id = `w-${Date.now()}`;
    const widgetTitle = `${chartType.toUpperCase()} of ${colName}`;

    const newWidget: Widget = {
      id,
      title: widgetTitle,
      chart_type: chartType,
      column1: colName,
      column2: "none",
      kpi_aggregation: "count",
      kpi_operator: ">",
      kpi_threshold: undefined,
    };

    updateActivePage((p) => {
      const nextIdx = p.widgets.length;
      const x = (nextIdx % 2) * 6;
      const y = Math.floor(nextIdx / 2) * 4;
      const newLayout = [
        ...p.layout,
        {
          i: id,
          x,
          y,
          w: 6,
          h: 4,
          minW: 4,
          minH: 3,
        },
      ];
      return {
        widgets: [...p.widgets, newWidget],
        layout: newLayout,
      };
    });
    toast.success(`Added ${colName} visualization tile to active page.`);
  };

  // Right filters sidebar helper
  const handleAddPageFilter = (colName: string) => {
    if (!colName) return;
    const exists = filters.some((f) => f.column === colName);
    if (exists) {
      toast.error("Filter already configured for this column.");
      return;
    }
    const colProfile = profile.columns.find((c) => c.name === colName);
    if (colProfile) {
      const newFilter: ColumnFilter = {
        column: colName,
        operator: colProfile.type === "numeric" ? "between" : "in",
        value: colProfile.type === "numeric" ? [undefined, undefined] : [],
      };
      addFilter(newFilter);
      toast.success(`Filter added for '${colName}'.`);
    }
    setSelectedFilterCol("");
  };

  const handleNumericFilterChange = (columnName: string, index: number, val: string) => {
    const filter = filters.find((f) => f.column === columnName);
    if (filter) {
      const nextVals = [...(filter.value as [number | undefined, number | undefined])];
      nextVals[index] = val === "" ? undefined : Number(val);
      addFilter({
        ...filter,
        value: nextVals as [number | undefined, number | undefined],
      });
    }
  };

  const handleCategoricalCheckboxChange = (columnName: string, category: string, checked: boolean) => {
    const filter = filters.find((f) => f.column === columnName);
    if (filter) {
      const currentVals = (filter.value as string[]) || [];
      const nextVals = checked
        ? [...currentVals, category]
        : currentVals.filter((v) => v !== category);
      addFilter({
        ...filter,
        value: nextVals,
      });
    }
  };

  // Multi-page navigation helpers
  const handleAddPage = () => {
    const newPageId = `page-${Date.now()}`;
    const newPage: Page = {
      id: newPageId,
      name: `Page ${pages.length + 1}`,
      widgets: [],
      layout: [],
      filters: [],
    };
    setPages((prev) => [...prev, newPage]);
    setActivePageId(newPageId);
    toast.success(`Created ${newPage.name}`);
  };

  const handleRenamePage = (id: string, currentName: string) => {
    const name = prompt("Enter new page name:", currentName);
    if (name && name.trim()) {
      setPages((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: name.trim() } : p))
      );
    }
  };

  const handleDeletePage = (id: string) => {
    if (pages.length <= 1) return;
    const remaining = pages.filter((p) => p.id !== id);
    setPages(remaining);
    setActivePageId(remaining[0].id);
    toast.success("Page deleted");
  };

  // Save report layout to database
  const handleSaveDashboard = async () => {
    if (!projectId) {
      toast.error("Save the project first before saving report canvas layout.");
      return;
    }
    if (!saveName.trim()) {
      toast.error("Please enter a name for the report canvas layout.");
      return;
    }

    try {
      const payload = {
        pages,
      };

      const result = await runSaveDashboard({
        data: {
          project_id: projectId,
          name: saveName.trim(),
          layout_json: payload,
        },
      });

      toast.success(`Report layout "${saveName}" saved successfully!`);
      setIsSaveOpen(false);
      setSaveName("");
      setCurrentDashboardId(result.id);
      loadSavedDashboards(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save layout");
    }
  };

  // Selection layout loader
  const handleSelectDashboard = (id: string) => {
    if (id === "default") {
      handleReset();
      return;
    }

    const d = savedDashboards.find((item) => item.id === id);
    if (d) {
      try {
        const parsed = typeof d.layout_json === "string" ? JSON.parse(d.layout_json) : d.layout_json;
        if (parsed) {
          if (parsed.pages) {
            setPages(parsed.pages);
            setActivePageId(parsed.pages[0]?.id || "page-1");
          } else if (parsed.widgets && parsed.layout) {
            setPages([
              {
                id: "page-1",
                name: "Page 1",
                widgets: parsed.widgets,
                layout: parsed.layout,
                filters: [],
              },
            ]);
            setActivePageId("page-1");
          }
          setCurrentDashboardId(d.id);
          toast.success(`Loaded report layout: ${d.name}`);
        }
      } catch (e) {
        console.error("Failed to parse loaded layout_json", e);
        toast.error("Failed to parse saved layout");
      }
    }
  };

  const handleDeleteDashboard = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this report layout permanently?")) return;
    try {
      await runDeleteDashboard({ data: { id } });
      toast.success("Report layout deleted");
      if (currentDashboardId === id) {
        handleReset();
      }
      loadSavedDashboards(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete report layout");
    }
  };

  // Pre-calculations for dialog custom widgets options
  const validTypes = useMemo(() => {
    if (!newCol1) return [];
    const colProfile = profile?.columns.find((c) => c.name === newCol1);
    if (!colProfile) return [];

    const isNum = colProfile.type === "numeric";
    const types = [
      { id: "histogram", name: "Histogram (Distribution)" },
      { id: "boxplot", name: "Box Plot (Summary Stats)" },
      { id: "kde", name: "KDE density estimate" },
      { id: "table", name: "Table View" },
      { id: "kpi", name: "KPI Card" },
      { id: "slicer_dropdown", name: "Slicer: Dropdown List" },
      { id: "slicer_date", name: "Slicer: Date/Numeric Range" },
      { id: "slicer_search", name: "Slicer: Search Box" },
    ];

    if (!isNum) {
      types.push({ id: "pie", name: "Pie Chart" });
      types.push({ id: "donut", name: "Donut Chart" });
    }

    types.push({ id: "bar", name: "Bar Chart" });

    if (newCol2 !== "none") {
      const col2Profile = profile?.columns.find((c) => c.name === newCol2);
      if (col2Profile) {
        const c2Num = col2Profile.type === "numeric";
        if (isNum && c2Num) {
          types.push({ id: "scatter", name: "Scatter Plot (Correlation)" });
        }
        if (!isNum && c2Num) {
          types.push({ id: "treemap", name: "Treemap diagram" });
        }
        if (!isNum && !c2Num) {
          types.push({ id: "grouped_bar", name: "Grouped Bar Chart" });
          types.push({ id: "heatmap", name: "Heatmap Matrix" });
        }
      }
    }
    return types;
  }, [newCol1, newCol2, profile]);

  useEffect(() => {
    if (validTypes.length > 0) {
      if (!validTypes.some((v) => v.id === newChartType)) {
        setNewChartType(validTypes[0].id);
      }
    }
  }, [validTypes]);

  return (
    <FilterContext.Provider value={{ filters, addFilter, removeFilter, clearFilters }}>
      <div className="flex flex-col space-y-4 text-left">
        
        {/* Top Control Bar with Power BI Yellow top indicator */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t-2 border-t-[#F2C811] bg-secondary/15 p-4 rounded-b-lg border border-border/60">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-5 w-5 text-[#F2C811] animate-pulse-glow" />
            <div className="text-left">
              <h2 className="text-sm font-bold text-foreground font-mono" style={{ fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
                Report Canvas
              </h2>
              {projectId ? (
                <p className="text-[10px] text-muted-foreground">
                  Power BI inspired report editor. Add slicers on the page to filter other visuals dynamically.
                </p>
              ) : (
                <p className="text-[10px] text-amber-400 font-medium">
                  Save Project first to persist report pages layouts to database.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Saved Layout Selector */}
            {projectId && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground mr-1">Layout:</span>
                <Select value={currentDashboardId} onValueChange={handleSelectDashboard}>
                  <SelectTrigger className="w-[180px] h-8 text-xs bg-background">
                    <SelectValue placeholder="Default Template" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border">
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
                    className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer"
                    onClick={(e) => handleDeleteDashboard(e, currentDashboardId)}
                    title="Delete this layout"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}

            {/* Actions */}
            <Button
              variant="outline"
              className="cursor-pointer h-8 text-[11px]"
              onClick={() => setIsLocked(!isLocked)}
            >
              {isLocked ? (
                <>
                  <Lock className="h-3 w-3 mr-1" />
                  Unlock Canvas
                </>
              ) : (
                <>
                  <Unlock className="h-3 w-3 mr-1 text-[#F2C811] animate-pulse" />
                  Lock Layout
                </>
              )}
            </Button>

            {projectId && (
              <Button
                variant="outline"
                className="cursor-pointer h-8 text-[11px] border-[#F2C811]/30 text-[#F2C811] hover:bg-[#F2C811]/10"
                onClick={() => setIsSaveOpen(true)}
              >
                <Save className="h-3 w-3 mr-1" />
                Save Report
              </Button>
            )}

            <Button variant="outline" className="cursor-pointer h-8 text-[11px]" onClick={handleReset}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Reset Defaults
            </Button>

            <Button className="cursor-pointer h-8 text-[11px]" onClick={() => setIsAddOpen(true)}>
              <Plus className="h-3 w-3 mr-1" />
              Add Visual
            </Button>
          </div>
        </div>

        {/* NL Query Bar */}
        <form onSubmit={handleNLSubmit} className="flex gap-2 w-full bg-white p-3 border border-[#d2d0ce] rounded-lg shadow-sm">
          <div className="relative flex-1">
            <Input
              type="text"
              placeholder="Ask AI to generate a visual (e.g. 'show a bar chart of Sales by Region', 'kpi card of average Rating')"
              value={nlQuery}
              onChange={(e) => setNlQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
              disabled={isNlLoading}
            />
            <Sparkles className="absolute left-3 top-2.5 h-4 w-4 text-[#118D95] animate-pulse-glow" />
          </div>
          <Button
            type="submit"
            disabled={isNlLoading}
            className="h-9 text-xs bg-[#118D95] hover:bg-[#118D95]/90 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            {isNlLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Generate Visual
              </>
            )}
          </Button>
        </form>

        {/* Main Desktop Dashboard Container with Left Field sidebar, Central Canvas, and Right Filters sidebar */}
        <div 
          className="flex w-full overflow-hidden border border-[#d2d0ce] bg-[#f3f2f1] rounded-lg shadow-sm"
          style={{ height: "680px", fontFamily: '"Segoe UI", system-ui, sans-serif' }}
        >
          {/* Left Pane: Fields Pane */}
          <div className="w-56 border-r border-[#d2d0ce] bg-[#faf9f8] flex flex-col select-none shrink-0 text-left">
            <div className="p-3 border-b border-[#d2d0ce] bg-secondary/20">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Fields</h3>
              <p className="text-[9px] text-muted-foreground mt-0.5">Click column to add a visualization tile</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
              {profile?.columns.map((col) => {
                const isNum = col.type === "numeric";
                return (
                  <button
                    key={col.name}
                    onClick={() => handleFieldClick(col.name)}
                    className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-[#eae8e6] active:bg-[#d2d0ce] text-left transition-colors cursor-pointer"
                  >
                    {isNum ? (
                      <Hash className="h-3.5 w-3.5 text-[#118D95]" />
                    ) : (
                      <Type className="h-3.5 w-3.5 text-[#AB3B56]" />
                    )}
                    <span className="text-xs font-medium text-slate-700 truncate" title={col.name}>
                      {col.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Center Canvas Layout Area */}
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {/* Grid dot background canvas */}
            <div 
              className="flex-1 overflow-y-auto p-6 relative"
              style={{ 
                backgroundImage: 'radial-gradient(#c8c6c4 1px, transparent 1px)', 
                backgroundSize: '16px 16px',
                backgroundColor: '#f3f2f1'
              }}
            >
              {widgets.length === 0 ? (
                <div className="flex h-full w-full flex-col items-center justify-center text-center p-8 space-y-3 bg-white/40 rounded-xl border border-dashed border-[#c8c6c4] max-w-lg mx-auto mt-20">
                  <SlidersHorizontal className="h-8 w-8 text-[#118D95] animate-bounce" />
                  <h4 className="text-sm font-semibold text-slate-800">Blank Page Canvas</h4>
                  <p className="text-xs text-slate-500 max-w-sm">
                    Click columns in the **Fields** sidebar on the left to add visualizations automatically, or use the **Add Visual** toolbar button.
                  </p>
                </div>
              ) : (
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
                    <div 
                      key={widget.id} 
                      className="bg-white rounded border border-[#d2d0ce] shadow-sm hover:shadow-md transition-shadow h-full flex flex-col overflow-hidden relative group"
                    >
                      <WidgetCard
                        widget={widget}
                        sessionId={sessionId}
                        isLocked={isLocked}
                        onDelete={() => handleDeleteWidget(widget.id)}
                        onUpdateWidget={handleUpdateWidget}
                        profile={profile}
                        projectId={projectId}
                        analysis={analysis}
                        rows={rows}
                      />
                    </div>
                  ))}
                </ReactGridLayout>
              )}
            </div>

            {/* Bottom Pages Tab Bar */}
            <div className="h-10 border-t border-[#d2d0ce] bg-[#faf9f8] flex items-center px-4 justify-between select-none shrink-0">
              <div className="flex items-center gap-0.5 overflow-x-auto h-full">
                {pages.map((p) => {
                  const isActive = p.id === activePageId;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setActivePageId(p.id)}
                      onDoubleClick={() => handleRenamePage(p.id, p.name)}
                      className={`h-full px-4 flex items-center text-xs font-semibold border-r border-[#d2d0ce] cursor-pointer transition-all ${
                        isActive
                          ? "bg-white text-slate-900 border-t-2 border-t-[#F2C811]"
                          : "text-slate-600 hover:bg-[#eae8e6]"
                      }`}
                    >
                      <span>{p.name}</span>
                      {pages.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePage(p.id);
                          }}
                          className="ml-2.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Delete page"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
                <button
                  onClick={handleAddPage}
                  className="h-full px-3 flex items-center text-slate-500 hover:bg-[#eae8e6] cursor-pointer"
                  title="Add New Page"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="text-[10px] text-slate-400 italic">
                Double-click page tab to rename
              </div>
            </div>
          </div>

          {/* Right Pane: Filters Pane */}
          <div className="w-64 border-l border-[#d2d0ce] bg-[#faf9f8] flex flex-col shrink-0 text-left">
            <div className="p-3 border-b border-[#d2d0ce] bg-[#eae8e6]/60">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
                  <Filter className="h-3.5 w-3.5 text-[#118D95]" />
                  Filters
                </h3>
                {filters.length > 0 && (
                  <button 
                    onClick={clearFilters}
                    className="text-[10px] font-semibold text-rose-600 hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>
              
              {/* Dropdown to add a page level filter */}
              <div className="mt-2">
                <Select value={selectedFilterCol} onValueChange={handleAddPageFilter}>
                  <SelectTrigger className="w-full h-8 text-[11px] bg-background">
                    <SelectValue placeholder="Add page filter..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border">
                    {columns.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Active filters list scroll container */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {filters.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    No active page-level filters. Add columns above or click data bars/slices in charts to filter.
                  </p>
                </div>
              ) : (
                filters.map((f) => {
                  const colProfile = profile.columns.find((c) => c.name === f.column);
                  const isNum = colProfile?.type === "numeric";
                  
                  return (
                    <div key={f.column} className="bg-white border border-[#d2d0ce] rounded p-2.5 space-y-2 relative text-left">
                      <div className="flex items-center justify-between border-b border-secondary/40 pb-1.5">
                        <span className="text-xs font-bold text-slate-700 truncate pr-4" title={f.column}>
                          {f.column}
                        </span>
                        <button
                          onClick={() => removeFilter(f.column)}
                          className="text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Filter range / options input */}
                      {isNum ? (
                        <div className="space-y-1.5">
                          <div className="text-[9px] text-slate-500 font-semibold font-mono">Range filter</div>
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              placeholder="Min"
                              value={(f.value as any)[0] ?? ""}
                              onChange={(e) => handleNumericFilterChange(f.column, 0, e.target.value)}
                              className="h-7 text-xs px-1.5 bg-secondary/15"
                            />
                            <span className="text-[10px] text-slate-400">to</span>
                            <Input
                              type="number"
                              placeholder="Max"
                              value={(f.value as any)[1] ?? ""}
                              onChange={(e) => handleNumericFilterChange(f.column, 1, e.target.value)}
                              className="h-7 text-xs px-1.5 bg-secondary/15"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="text-[9px] text-slate-500 font-semibold font-mono">Include values</div>
                          <div className="max-h-24 overflow-y-auto space-y-1 bg-secondary/10 p-1.5 rounded border border-secondary/35">
                            {colProfile?.topValues?.map((v) => {
                              const checked = ((f.value as string[]) || []).includes(v.value);
                              return (
                                <label key={v.value} className="flex items-center gap-2 text-[10px] text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => handleCategoricalCheckboxChange(f.column, v.value, e.target.checked)}
                                    className="rounded border-slate-300 text-[#118D95] focus:ring-[#118D95] h-3 w-3"
                                  />
                                  <span className="truncate" title={v.value}>{v.value}</span>
                                </label>
                              );
                            }) || (
                              <p className="text-[9px] text-slate-400">No categories found</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Add Widget Picker Dialog modal */}
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-250">
            <div className="bg-popover border border-border rounded-xl shadow-lg max-w-md w-full p-6 space-y-4 relative text-left">
              <button
                onClick={() => setIsAddOpen(false)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
              
              <h3 className="text-base font-bold text-foreground">Add Custom Visual</h3>

              <div className="space-y-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Visual Title (Optional)</label>
                  <Input
                    placeholder="e.g. Sales Breakdown"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Primary Field (X-Axis/Grouping)</label>
                  <Select value={newCol1} onValueChange={setNewCol1}>
                    <SelectTrigger className="w-full bg-background border border-border h-9">
                      <SelectValue placeholder="Select column..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      {columns.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Secondary Field (Y-Axis/Metric, optional)</label>
                  <Select value={newCol2} onValueChange={setNewCol2}>
                    <SelectTrigger className="w-full bg-background border border-border h-9">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      <SelectItem value="none">None (Frequency/Count)</SelectItem>
                      {columns.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {validTypes.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Visual Type</label>
                    <Select value={newChartType} onValueChange={setNewChartType}>
                      <SelectTrigger className="w-full bg-background border border-border h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        {validTypes.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" className="cursor-pointer" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button className="cursor-pointer bg-[#118D95] hover:bg-[#118D95]/90 text-white" onClick={handleAddWidget}>
                  Add Visual
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Save Dashboard Layout Dialog */}
        {isSaveOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-250">
            <div className="bg-popover border border-border rounded-xl shadow-lg max-w-sm w-full p-6 space-y-4 relative text-left">
              <button
                onClick={() => setIsSaveOpen(false)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>

              <h3 className="text-base font-bold text-foreground">Save Report Layout</h3>
              <p className="text-xs text-muted-foreground">
                Persist the multi-page widgets, layout placements, and configured page-level filters.
              </p>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Layout Name</label>
                <Input
                  placeholder="e.g. Q3 Sales Executive Summary"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveDashboard()}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" className="cursor-pointer" onClick={() => setIsSaveOpen(false)}>
                  Cancel
                </Button>
                <Button className="cursor-pointer bg-[#118D95] hover:bg-[#118D95]/90 text-white" onClick={handleSaveDashboard}>
                  Save
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
  onUpdateWidget: (updatedWidget: Widget) => void;
  profile: DatasetProfile;
  projectId?: string;
  analysis?: any;
  rows?: Record<string, unknown>[];
}

const WidgetCard: React.FC<WidgetCardProps> = ({
  widget,
  sessionId,
  isLocked,
  onDelete,
  onUpdateWidget,
  profile,
  projectId,
  analysis,
  rows = [],
}) => {
  const { chart_type, column1, column2, legend_col = "none", value_col = "none", kpi_aggregation = "count", kpi_threshold, kpi_operator = ">" } = widget;
  
  // Read active page's filter context
  const { filters, addFilter, removeFilter, clearFilters } = useContext(FilterContext);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  const columns = profile?.columns.map((c) => c.name) || [];
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

  // Client side filtered rows
  const filteredRows = useMemo(() => {
    return getFilteredRows(rows, filters);
  }, [rows, filters]);

  // Client side visualizer data
  const kpiValue = useMemo(() => {
    if (chart_type !== "kpi" || filteredRows.length === 0) return 0;
    const targetCol = value_col !== "none" ? value_col : column1;
    
    if (kpi_aggregation === "count") {
      return filteredRows.length;
    }
    
    const values = filteredRows
      .map((r) => Number(r[targetCol]))
      .filter((v) => !isNaN(v));

    if (values.length === 0) return 0;
    if (kpi_aggregation === "sum") {
      return values.reduce((a, b) => a + b, 0);
    }
    if (kpi_aggregation === "average") {
      return values.reduce((a, b) => a + b, 0) / values.length;
    }
    if (kpi_aggregation === "min") {
      return Math.min(...values);
    }
    if (kpi_aggregation === "max") {
      return Math.max(...values);
    }
    return 0;
  }, [filteredRows, chart_type, value_col, column1, kpi_aggregation]);

  const kpiStatus = useMemo(() => {
    if (kpi_threshold === undefined) return "normal";
    let passed = false;
    if (kpi_operator === ">") passed = kpiValue > kpi_threshold;
    else if (kpi_operator === "<") passed = kpiValue < kpi_threshold;
    else if (kpi_operator === ">=") passed = kpiValue >= kpi_threshold;
    else if (kpi_operator === "<=") passed = kpiValue <= kpi_threshold;
    else if (kpi_operator === "==") passed = kpiValue === kpi_threshold;
    return passed ? "passed" : "failed";
  }, [kpiValue, kpi_threshold, kpi_operator]);

  const isClientSideVisual = ["table", "kpi", "slicer_dropdown", "slicer_date", "slicer_search"].includes(chart_type);

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
    enabled: !!sessionId && !!chart_type && !isSpecialChart && !!apiCol1 && !isClientSideVisual,
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
        name: item.name,
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
    const xKeys = Array.from(new Set(chartData.map((d: any) => String(d.x))));
    const yKeys = Array.from(new Set(chartData.map((d: any) => String(d.y))));
    const countMap: Record<string, number> = {};
    let maxCount = 1;
    chartData.forEach((d: any) => {
      const key = `${d.x}_${d.y}`;
      countMap[key] = d.count;
      if (d.count > maxCount) maxCount = d.count;
    });
    return { xKeys, yKeys, countMap, maxCount };
  }, [chartData, chart_type]);

  // Interactive cross filtering
  const handleChartClick = (colName: string, categoryValue: any) => {
    if (!colName) return;
    const colProfile = profile.columns.find((c) => c.name === colName);
    if (colProfile && colProfile.type !== "numeric") {
      const activeFilter = filters.find((f) => f.column === colName);
      const currentValues = (activeFilter?.value as string[]) || [];
      const nextValues = currentValues.includes(String(categoryValue))
        ? currentValues.filter((v) => v !== String(categoryValue))
        : [...currentValues, String(categoryValue)];

      if (nextValues.length > 0) {
        addFilter({
          column: colName,
          operator: "in",
          value: nextValues,
        });
        toast.info(`Filtered page where '${colName}' is in [${nextValues.join(", ")}]`);
      } else {
        removeFilter(colName);
        toast.info(`Cleared filter on '${colName}'`);
      }
    }
  };

  const renderSpecialChart = () => {
    const tooltips = {
      contentStyle: {
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        borderColor: "#d2d0ce",
        borderRadius: "4px",
        fontSize: "10px",
        color: "#323130"
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

      const scoreColor = score >= 80 ? "text-[#1F8276]" : score >= 55 ? "text-[#D1A111]" : "text-[#AB3B56]";
      const scoreBorder = score >= 80 ? "border-[#1F8276]/20" : score >= 55 ? "border-[#D1A111]/20" : "border-[#AB3B56]/20";

      return (
        <div className="flex h-full w-full flex-col justify-between p-2 space-y-3 text-left">
          <div className={`flex items-center justify-between border-b ${scoreBorder} pb-2`}>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-mono font-bold">Overall Score</span>
              <div className={`text-3xl font-extrabold ${scoreColor}`}>{score}%</div>
            </div>
            <Award className={`h-8 w-8 ${scoreColor}`} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono leading-relaxed">
            <div className="border border-slate-200 rounded p-1.5 bg-[#faf9f8]">
              <span className="text-slate-500">Missing Cells</span>
              <div className="font-bold text-slate-700 mt-0.5">{breakdown.missing_values}% score</div>
            </div>
            <div className="border border-slate-200 rounded p-1.5 bg-[#faf9f8]">
              <span className="text-slate-500">Outliers</span>
              <div className="font-bold text-slate-700 mt-0.5">{breakdown.outliers}% score</div>
            </div>
            <div className="border border-slate-200 rounded p-1.5 bg-[#faf9f8]">
              <span className="text-slate-500">Collinearity</span>
              <div className="font-bold text-slate-700 mt-0.5">{breakdown.collinearity}% score</div>
            </div>
            <div className="border border-slate-200 rounded p-1.5 bg-[#faf9f8]">
              <span className="text-slate-500">Imbalance</span>
              <div className="font-bold text-slate-700 mt-0.5">{breakdown.class_imbalance}% score</div>
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
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" />
            <XAxis dataKey="column" stroke="#605e5c" fontSize={8} tickLine={false} />
            <YAxis stroke="#605e5c" fontSize={8} tickLine={false} />
            <RechartsTooltip {...tooltips} formatter={(val) => [`${val}%`, "Missing Rate"]} />
            <Bar dataKey="percentage" fill="#AB3B56" radius={[3, 3, 0, 0]} />
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
          <table className="border-collapse text-[8px] text-slate-500 w-full border border-slate-200">
            <thead>
              <tr className="bg-slate-100">
                <th className="p-1 border border-slate-200 font-mono text-[7px] text-right">Col \ Col</th>
                {cols.map((c) => (
                  <th key={c} className="p-1 border border-slate-200 font-semibold text-center truncate max-w-[60px]">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cols.map((rowCol, rIdx) => (
                <tr key={rowCol}>
                  <td className="p-1 border border-slate-200 font-semibold text-right bg-slate-50 truncate max-w-[60px]">
                    {rowCol}
                  </td>
                  {cols.map((colCol, cIdx) => {
                    const rowIdx = matrixData.columns.indexOf(rowCol);
                    const colIdx = matrixData.columns.indexOf(colCol);
                    const val = matrixData.matrix[rowIdx]?.[colIdx] ?? 0;
                    const valStr = val.toFixed(2);
                    const intensity = Math.abs(val);
                    const bgColor = val >= 0 
                      ? `rgba(17, 141, 149, ${intensity * 0.7})` 
                      : `rgba(171, 59, 86, ${intensity * 0.7})`;
                    return (
                      <td
                        key={colCol}
                        style={{ backgroundColor: bgColor }}
                        className="p-1 border border-slate-200 text-center font-mono text-[8px] text-slate-800 font-semibold"
                        title={`${rowCol} vs ${colCol}: ${valStr}`}
                      >
                        {valStr}
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

    if (chart_type === "coefficients_importance") {
      const featData = analysis?.feature_importance || [];
      if (featData.length === 0) {
        return (
          <div className="flex h-full w-full items-center justify-center p-4 text-center">
            <p className="text-xs text-muted-foreground italic">Feature importance data unavailable.</p>
          </div>
        );
      }

      const chartFData = featData.map((d: any) => ({
        feature: d.feature,
        importance: Number(d.importance.toFixed(3)),
      })).sort((a: any, b: any) => b.importance - a.importance).slice(0, 10);

      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartFData} layout="vertical" margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" />
            <XAxis type="number" stroke="#605e5c" fontSize={8} tickLine={false} />
            <YAxis dataKey="feature" type="category" stroke="#605e5c" fontSize={8} tickLine={false} width={65} />
            <RechartsTooltip {...tooltips} />
            <Bar dataKey="importance" fill="#118D95" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chart_type === "confusion_matrix") {
      const cm = analysis?.confusion_matrix;
      if (!cm || !cm.matrix) {
        return (
          <div className="flex h-full w-full items-center justify-center p-4 text-center">
            <p className="text-xs text-muted-foreground italic">Confusion matrix data unavailable.</p>
          </div>
        );
      }

      const labels = cm.labels || ["Negative", "Positive"];
      return (
        <div className="w-full h-full flex flex-col justify-center p-1.5 space-y-1.5 text-slate-800">
          <table className="border-collapse text-[9px] w-full text-center border border-slate-200">
            <thead>
              <tr className="bg-slate-100 font-bold">
                <th className="p-1 border border-slate-200 font-mono text-[7px] text-right">Actual \ Pred</th>
                {labels.map((l: string) => (
                  <th key={l} className="p-1 border border-slate-200">
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((actualLabel: string, rIdx: number) => (
                <tr key={actualLabel}>
                  <td className="p-1 border border-slate-200 font-bold bg-slate-50 text-right">
                    {actualLabel}
                  </td>
                  {labels.map((predLabel: string, cIdx: number) => {
                    const cellVal = cm.matrix[rIdx]?.[cIdx] ?? 0;
                    const isDiagonal = rIdx === cIdx;
                    const bgColor = isDiagonal ? "rgba(17, 141, 149, 0.45)" : "rgba(171, 59, 86, 0.15)";
                    return (
                      <td
                        key={predLabel}
                        style={{ backgroundColor: bgColor }}
                        className="p-2 border border-slate-200 font-semibold font-mono text-xs"
                      >
                        {cellVal}
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
      if (loadingRuns) {
        return (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-[#118D95]" />
          </div>
        );
      }
      const runsList = runs || [];
      if (runsList.length === 0) {
        return (
          <div className="flex h-full w-full items-center justify-center p-4 text-center">
            <p className="text-xs text-muted-foreground italic">No trained models registered.</p>
          </div>
        );
      }
      return (
        <div className="w-full h-full overflow-y-auto pr-1">
          <div className="space-y-1">
            {runsList.slice(0, 5).map((r: ExperimentRun, idx: number) => (
              <div key={r.id} className="flex items-center justify-between text-[10px] p-1.5 border border-slate-200 rounded bg-[#faf9f8]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-slate-500 font-mono">#{idx + 1}</span>
                  <span className="font-semibold text-slate-700 truncate">{r.algorithm}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-bold font-mono text-[#118D95]">R²: {(r.r2 ?? 0).toFixed(3)}</span>
                  <span className="text-[8px] text-slate-400 block">MAE: {(r.mae ?? 0).toFixed(2)}</span>
                </div>
              </div>
            ))}
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

    if (chart_type === "kpi") {
      const color = kpiStatus === "passed"
        ? "text-[#1F8276]" // Green
        : kpiStatus === "failed"
          ? "text-[#AB3B56]" // Red
          : "text-slate-800"; // Black/grey

      return (
        <div className="flex h-full w-full flex-col justify-center items-center p-4 text-center relative select-none">
          <div className={`text-4xl font-extrabold font-mono tracking-tight transition-colors duration-300 ${color}`}>
            {typeof kpiValue === "number" 
              ? kpiValue % 1 === 0 ? kpiValue.toLocaleString() : kpiValue.toFixed(2)
              : String(kpiValue)
            }
          </div>
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1.5">
            {kpi_aggregation.toUpperCase()} of {value_col !== "none" ? value_col : column1}
          </div>
          {kpi_threshold !== undefined && (
            <div className="text-[9px] text-slate-400 mt-0.5 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-mono">
              Threshold: {kpi_operator} {kpi_threshold}
            </div>
          )}
          <ArrowUpRight className={`absolute top-2 right-2 h-4 w-4 ${color}`} />
        </div>
      );
    }

    if (chart_type === "table") {
      const activeCols = [column1, column2, legend_col, value_col].filter((c) => c && c !== "none");
      const displayedCols = activeCols.length > 0 ? activeCols : columns.slice(0, 4);
      
      return (
        <div className="w-full h-full overflow-auto text-left border border-slate-200 rounded">
          <table className="min-w-full divide-y divide-slate-200 text-[10px] text-slate-600 bg-white">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                {displayedCols.map((c) => (
                  <th key={c} className="px-2 py-1.5 text-left font-bold uppercase text-slate-500 border-b border-slate-200">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.slice(0, 50).map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  {displayedCols.map((c) => (
                    <td
                      key={c}
                      className="px-2 py-1 truncate max-w-[120px] cursor-pointer hover:bg-slate-100 hover:text-[#118D95] font-semibold transition-colors"
                      onClick={() => handleChartClick(c, row[c])}
                    >
                      {String(row[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length > 50 && (
            <div className="text-[8px] text-slate-400 py-1 text-center border-t border-slate-100 italic bg-slate-50/30">
              Showing first 50 rows of {filteredRows.length} matching records.
            </div>
          )}
        </div>
      );
    }

    /* ─── Dropdown Slicer Slicer Tile Renderer ─── */
    if (chart_type === "slicer_dropdown") {
      const colProfile = profile.columns.find((c) => c.name === column1);
      const uniqueVals = colProfile?.topValues?.map((v) => v.value) || [];
      const activeFilter = filters.find((f) => f.column === column1);
      const selectedValues = (activeFilter?.value as string[]) || [];

      const handleCheckboxToggle = (val: string, checked: boolean) => {
        const nextVals = checked
          ? [...selectedValues, val]
          : selectedValues.filter((v) => v !== val);

        if (nextVals.length > 0) {
          addFilter({
            column: column1,
            operator: "in",
            value: nextVals,
          });
        } else {
          removeFilter(column1);
        }
      };

      return (
        <div className="w-full h-full flex flex-col p-1 space-y-1.5 text-left text-[10px] text-slate-700">
          <div className="flex items-center gap-1 text-slate-500 font-semibold uppercase tracking-wider text-[8px] bg-slate-100 p-1 rounded">
            <CheckSquare className="h-3 w-3 text-[#118D95]" /> Multi-select Dropdown
          </div>
          <div className="flex-1 overflow-y-auto border border-slate-200 rounded p-1.5 space-y-1 bg-[#faf9f8]">
            {uniqueVals.map((val) => {
              const checked = selectedValues.includes(val);
              return (
                <label key={val} className="flex items-center gap-2 cursor-pointer hover:bg-slate-200/50 p-0.5 rounded">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => handleCheckboxToggle(val, e.target.checked)}
                    className="rounded border-[#d2d0ce] text-[#118D95] focus:ring-[#118D95] h-3 w-3 cursor-pointer"
                  />
                  <span className="truncate">{val}</span>
                </label>
              );
            })}
            {uniqueVals.length === 0 && (
              <span className="text-[9px] text-slate-400 italic">No values available</span>
            )}
          </div>
        </div>
      );
    }

    /* ─── Date / Range Slicer Slicer Tile Renderer ─── */
    if (chart_type === "slicer_date") {
      const colProfile = profile.columns.find((c) => c.name === column1);
      const activeFilter = filters.find((f) => f.column === column1);
      const [minVal, maxVal] = (activeFilter?.value as [any, any]) || [undefined, undefined];

      const handleRangeChange = (index: number, val: string) => {
        const nextRange = [minVal, maxVal];
        nextRange[index] = val === "" ? undefined : isNaN(Number(val)) ? val : Number(val);
        
        if (nextRange[0] !== undefined || nextRange[1] !== undefined) {
          addFilter({
            column: column1,
            operator: "between",
            value: nextRange as any,
          });
        } else {
          removeFilter(column1);
        }
      };

      const isDateCol = colProfile?.type === "datetime" || colProfile?.type === "date" || column1.toLowerCase().includes("date") || column1.toLowerCase().includes("time");

      return (
        <div className="w-full h-full flex flex-col p-1.5 space-y-2 text-left text-[10px] text-slate-700 justify-center">
          <div className="flex items-center gap-1 text-slate-500 font-semibold uppercase tracking-wider text-[8px] bg-slate-100 p-1 rounded">
            <Calendar className="h-3 w-3 text-[#118D95]" /> Range Selector
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 flex flex-col gap-0.5">
              <span className="text-[8px] text-slate-400 font-bold uppercase">From</span>
              <input
                type={isDateCol ? "date" : "number"}
                value={minVal ?? ""}
                onChange={(e) => handleRangeChange(0, e.target.value)}
                className="bg-white border border-[#d2d0ce] rounded p-1 text-[10px] w-full"
              />
            </div>
            <span className="text-slate-400 mt-3 font-semibold">—</span>
            <div className="flex-1 flex flex-col gap-0.5">
              <span className="text-[8px] text-slate-400 font-bold uppercase">To</span>
              <input
                type={isDateCol ? "date" : "number"}
                value={maxVal ?? ""}
                onChange={(e) => handleRangeChange(1, e.target.value)}
                className="bg-white border border-[#d2d0ce] rounded p-1 text-[10px] w-full"
              />
            </div>
          </div>
        </div>
      );
    }

    /* ─── Search / Text Slicer Slicer Tile Renderer ─── */
    if (chart_type === "slicer_search") {
      const handleSearchChange = (txt: string) => {
        setSearchText(txt);
        if (!txt.trim()) {
          removeFilter(column1);
          return;
        }

        const colProfile = profile.columns.find((c) => c.name === column1);
        const uniqueVals = colProfile?.topValues?.map((v) => v.value) || [];
        const matches = uniqueVals.filter((v) =>
          v.toLowerCase().includes(txt.toLowerCase())
        );

        if (matches.length > 0) {
          addFilter({
            column: column1,
            operator: "in",
            value: matches,
          });
        } else {
          // If no categories match, match a dummy key to filter out everything
          addFilter({
            column: column1,
            operator: "in",
            value: ["__NO_SLICER_SEARCH_MATCHES__"],
          });
        }
      };

      return (
        <div className="w-full h-full flex flex-col p-2 space-y-2 text-left text-[10px] text-slate-700 justify-center">
          <div className="flex items-center gap-1 text-slate-500 font-semibold uppercase tracking-wider text-[8px] bg-slate-100 p-1 rounded">
            <Search className="h-3 w-3 text-[#118D95]" /> Text Slicer
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search keyword..."
              value={searchText}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="bg-white border border-[#d2d0ce] rounded p-1.5 pl-7 text-[10px] w-full"
            />
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          </div>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[#118D95]" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
          <AlertTriangle className="h-5 w-5 text-destructive mb-1.5" />
          <p className="text-[10px] text-muted-foreground font-semibold">Failed to fetch chart data.</p>
        </div>
      );
    }

    if (chartData.length === 0) {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <p className="text-[10px] text-slate-400">No data points available.</p>
        </div>
      );
    }

    const tooltips = {
      contentStyle: {
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        borderColor: "#d2d0ce",
        borderRadius: "4px",
        fontSize: "10px",
        color: "#323130"
      },
    };

    if (chart_type === "scatter") {
      const hasTrend = chartData[0] && "trend" in chartData[0];
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" />
            <XAxis dataKey={apiCol1} type="number" stroke="#605e5c" fontSize={8} tickLine={false} domain={["auto", "auto"]} />
            <YAxis stroke="#605e5c" fontSize={8} tickLine={false} />
            <RechartsTooltip {...tooltips} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter
              name="Points"
              dataKey={apiCol2}
              fill="#AB3B56"
              opacity={0.7}
              onClick={(data) => {
                if (data && data.payload) {
                  const val = data.payload[apiCol1];
                  handleChartClick(apiCol1, val);
                }
              }}
            />
            {hasTrend && (
              <Line name="Trend" dataKey="trend" stroke="#118D95" dot={false} activeDot={false} strokeWidth={2} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    if (chart_type === "histogram") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" />
            <XAxis dataKey="bin" stroke="#605e5c" fontSize={8} tickLine={false} />
            <YAxis stroke="#605e5c" fontSize={8} tickLine={false} />
            <RechartsTooltip {...tooltips} />
            <Bar
              dataKey="count"
              fill="#118D95"
              radius={[2, 2, 0, 0]}
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
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" />
            <XAxis dataKey="name" stroke="#605e5c" fontSize={8} tickLine={false} />
            <YAxis stroke="#605e5c" fontSize={8} tickLine={false} />
            <RechartsTooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="rounded border border-slate-300 bg-white p-2 text-[9px] shadow-sm text-slate-700">
                      <p className="font-semibold text-slate-800 mb-1">{data.name}</p>
                      <div className="space-y-0.5 font-mono">
                        <div className="flex justify-between gap-4">
                          <span>Max:</span>
                          <span className="font-bold">{data.origMax.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>Q3:</span>
                          <span className="font-bold">{data.origQ3.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>Median:</span>
                          <span className="font-bold">{data.origMedian.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>Q1:</span>
                          <span className="font-bold">{data.origQ1.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>Min:</span>
                          <span className="font-bold">{data.origMin.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="min" stackId="box" fill="transparent" />
            <Bar dataKey="lowerWhisker" stackId="box" fill="transparent" stroke="#605e5c" strokeDasharray="3 3" />
            <Bar dataKey="lowerBox" stackId="box" fill="rgba(48, 194, 230, 0.25)" stroke="#30C2E6" strokeWidth={1} />
            <Bar dataKey="upperBox" stackId="box" fill="rgba(17, 141, 149, 0.25)" stroke="#118D95" strokeWidth={1} />
            <Bar dataKey="upperWhisker" stackId="box" fill="transparent" stroke="#605e5c" strokeDasharray="3 3" />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chart_type === "kde") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" />
            <XAxis dataKey="x" type="number" domain={["auto", "auto"]} stroke="#605e5c" fontSize={8} tickLine={false} tickFormatter={(v) => Number(v).toFixed(1)} />
            <YAxis stroke="#605e5c" fontSize={8} tickLine={false} />
            <RechartsTooltip {...tooltips} labelFormatter={(l) => `Value: ${Number(l).toFixed(2)}`} />
            <Area type="monotone" dataKey="density" fill="rgba(17, 141, 149, 0.15)" stroke="#118D95" strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    if (chart_type === "bar") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" />
            <XAxis dataKey="category" stroke="#605e5c" fontSize={8} tickLine={false} />
            <YAxis stroke="#605e5c" fontSize={8} tickLine={false} />
            <RechartsTooltip {...tooltips} />
            <Bar
              dataKey="value"
              fill="#118D95"
              radius={[2, 2, 0, 0]}
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
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" />
            <XAxis dataKey="name" stroke="#605e5c" fontSize={8} tickLine={false} />
            <YAxis stroke="#605e5c" fontSize={8} tickLine={false} />
            <RechartsTooltip {...tooltips} />
            <Legend wrapperStyle={{ fontSize: 8 }} />
            {chartKeys.map((key, idx) => (
              <Bar
                key={key}
                dataKey={key}
                fill={POWERBI_COLORS[idx % POWERBI_COLORS.length]}
                radius={[2, 2, 0, 0]}
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
          <table className="border-collapse text-[8px] text-slate-500 w-full border border-slate-200">
            <thead>
              <tr className="bg-slate-100">
                <th className="p-1 border border-slate-200 font-mono text-[7px] text-right">
                  {column2} \ {column1}
                </th>
                {heatmapInfo.xKeys.map((x) => (
                  <th key={x} className="p-1 border border-slate-200 font-semibold text-center truncate max-w-[60px]">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapInfo.yKeys.map((y) => (
                <tr key={y}>
                  <td className="p-1 border border-slate-200 font-semibold text-right bg-slate-50 truncate max-w-[60px]">
                    {y}
                  </td>
                  {heatmapInfo.xKeys.map((x) => {
                    const count = heatmapInfo.countMap[`${x}_${y}`] ?? 0;
                    const intensity = count / heatmapInfo.maxCount;
                    const bgColor = `rgba(17, 141, 149, ${0.05 + intensity * 0.7})`;
                    return (
                      <td
                        key={x}
                        style={{ backgroundColor: bgColor }}
                        className="p-1 border border-slate-200 text-center cursor-pointer hover:border-[#F2C811]"
                        title={`${x} x ${y}: ${count}`}
                        onClick={() => {
                          handleChartClick(column1, x);
                          if (column2 && column2 !== "none") {
                            handleChartClick(column2, y);
                          }
                        }}
                      >
                        <span className="font-mono text-[8px] font-semibold text-slate-800">{count}</span>
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
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" />
            <XAxis dataKey={apiCol1} stroke="#605e5c" fontSize={8} tickLine={false} />
            <YAxis stroke="#605e5c" fontSize={8} tickLine={false} />
            <RechartsTooltip {...tooltips} />
            <Line
              type="monotone"
              dataKey={apiCol2}
              stroke="#30C2E6"
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
                <Cell key={`cell-${idx}`} fill={POWERBI_COLORS[idx % POWERBI_COLORS.length]} />
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
            fill="#118D95"
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
      {/* Header bar of visual widget tile */}
      <div className="widget-header flex items-center justify-between px-3 py-2 border-b border-[#eae8e6] select-none bg-slate-50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {!isLocked && (
            <div className="widget-drag-handle cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 p-0.5 animate-pulse-glow">
              <GripHorizontal className="h-3.5 w-3.5" />
            </div>
          )}
          <span className="text-[10px] font-bold truncate text-slate-700 uppercase tracking-wider">{widget.title}</span>
        </div>
        
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`p-0.5 rounded transition-colors ${
              isSettingsOpen ? "bg-[#F2C811]/25 text-[#D1A111]" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            } cursor-pointer`}
            title="Configure visual settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          {!isLocked && (
            <button
              onClick={onDelete}
              className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition-colors hover:bg-rose-50 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {isSettingsOpen ? (
        /* Settings panel overlay for visual tile customization */
        <div className="flex-1 w-full p-3 overflow-y-auto bg-slate-50 text-[10px] space-y-2.5 text-slate-700">
          <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
            <span className="font-bold text-slate-700 uppercase tracking-wider">Visual Customization</span>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="text-slate-400 hover:text-slate-700 font-bold hover:underline cursor-pointer"
            >
              Done
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-500">Visual Type</label>
              <select
                value={chart_type}
                onChange={(e) => onUpdateWidget({ ...widget, chart_type: e.target.value })}
                className="bg-white border border-[#d2d0ce] rounded p-1 text-[10px]"
              >
                <option value="bar">Bar Chart</option>
                <option value="line">Line Chart</option>
                <option value="pie">Pie Chart</option>
                <option value="donut">Donut Chart</option>
                <option value="scatter">Scatter Plot</option>
                <option value="histogram">Histogram</option>
                <option value="boxplot">Box Plot</option>
                <option value="kde">KDE Plot</option>
                <option value="table">Table</option>
                <option value="kpi">KPI Card</option>
                <option value="slicer_dropdown">Slicer: Dropdown</option>
                <option value="slicer_date">Slicer: Date Range</option>
                <option value="slicer_search">Slicer: Search</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-500">X-Axis / Slicer Field</label>
              <select
                value={column1}
                onChange={(e) => onUpdateWidget({ ...widget, column1: e.target.value })}
                className="bg-white border border-[#d2d0ce] rounded p-1 text-[10px] truncate"
              >
                {columns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-500">Y-Axis Field</label>
              <select
                value={column2}
                onChange={(e) => onUpdateWidget({ ...widget, column2: e.target.value })}
                className="bg-white border border-[#d2d0ce] rounded p-1 text-[10px]"
              >
                <option value="none">None</option>
                {columns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-500">Legend Field</label>
              <select
                value={legend_col}
                onChange={(e) => onUpdateWidget({ ...widget, legend_col: e.target.value })}
                className="bg-white border border-[#d2d0ce] rounded p-1 text-[10px]"
              >
                <option value="none">None</option>
                {columns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-500">Value Field</label>
              <select
                value={value_col}
                onChange={(e) => onUpdateWidget({ ...widget, value_col: e.target.value })}
                className="bg-white border border-[#d2d0ce] rounded p-1 text-[10px]"
              >
                <option value="none">None</option>
                {columns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-500">Visual Title</label>
              <input
                type="text"
                value={widget.title}
                onChange={(e) => onUpdateWidget({ ...widget, title: e.target.value })}
                className="bg-white border border-[#d2d0ce] rounded p-1 text-[10px]"
                placeholder="Visual Title"
              />
            </div>
          </div>

          {/* Conditional KPI Thresholding sub-panel */}
          {chart_type === "kpi" && (
            <div className="border border-[#d2d0ce] rounded p-2 bg-[#eae8e6]/30 space-y-2 mt-1">
              <div className="font-bold text-slate-600">KPI Card Formatting</div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-slate-500">Aggregation</label>
                  <select
                    value={kpi_aggregation}
                    onChange={(e) => onUpdateWidget({ ...widget, kpi_aggregation: e.target.value as any })}
                    className="bg-white border border-[#d2d0ce] rounded p-0.5 text-[9px]"
                  >
                    <option value="count">Count Rows</option>
                    <option value="sum">Sum values</option>
                    <option value="average">Average value</option>
                    <option value="min">Min value</option>
                    <option value="max">Max value</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-slate-500">Threshold Target</label>
                  <input
                    type="number"
                    value={kpi_threshold ?? ""}
                    onChange={(e) => onUpdateWidget({ ...widget, kpi_threshold: e.target.value === "" ? undefined : Number(e.target.value) })}
                    className="bg-white border border-[#d2d0ce] rounded p-0.5 text-[9px]"
                    placeholder="None"
                  />
                </div>

                <div className="flex flex-col gap-1 col-span-2">
                  <label className="font-semibold text-slate-500">Color Pass Comparison (Green if true)</label>
                  <select
                    value={kpi_operator}
                    onChange={(e) => onUpdateWidget({ ...widget, kpi_operator: e.target.value as any })}
                    className="bg-white border border-[#d2d0ce] rounded p-0.5 text-[9px]"
                  >
                    <option value=">">Value &gt; Threshold</option>
                    <option value="<">Value &lt; Threshold</option>
                    <option value=">=">Value &gt;= Threshold</option>
                    <option value="<=">Value &lt;= Threshold</option>
                    <option value="==">Value == Threshold</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 w-full p-3 overflow-hidden bg-background/5">
          {renderChart()}
        </div>
      )}
    </>
  );
};
