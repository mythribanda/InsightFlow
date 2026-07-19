import React, { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { DatasetProfile } from "@/lib/profiler";
import { Eye } from "lucide-react";

// Register all community features
ModuleRegistry.registerModules([AllCommunityModule]);

interface DataGridProps {
  rows: Record<string, unknown>[];
  profile: DatasetProfile;
  onRowsChange: (newRows: Record<string, unknown>[]) => void;
}

export function DataGrid({ rows, profile, onRowsChange }: DataGridProps) {
  const columnDefs = useMemo(() => {
    return profile.columns.map((col) => {
      const isNumeric = col.type === "numeric";
      const isText = col.type === "text" || col.type === "categorical";
      const isEditable = isNumeric || isText;

      return {
        field: col.name,
        headerName: col.name,
        sortable: true,
        filter: true,
        editable: isEditable,
        cellDataType: isNumeric ? "number" : "text",
        valueParser: isNumeric
          ? (params: any) => {
              const val = params.newValue;
              if (val === "" || val === null || val === undefined) {
                return null;
              }
              const num = Number(val);
              return isNaN(num) ? params.oldValue : num;
            }
          : undefined,
      };
    });
  }, [profile]);

  const onCellValueChanged = (event: any) => {
    const rowIndex = event.rowIndex;
    const field = event.colDef.field;
    if (rowIndex === null || rowIndex === undefined || !field) return;

    // Retrieve row index in the original rows array (in case grid is sorted or filtered)
    // AG Grid's event.node.data is the actual data object in the rows array
    const updatedData = event.node.data;
    
    // Find index of this object in original rows array to preserve identity/position
    const originalIndex = rows.indexOf(event.data);
    if (originalIndex === -1) return;

    const newRows = [...rows];
    newRows[originalIndex] = {
      ...newRows[originalIndex],
      [field]: event.newValue,
    };
    
    onRowsChange(newRows);
  };

  return (
    <div className="surface-card overflow-hidden flex flex-col">
      <div className="border-b border-border/60 px-5 py-3.5 text-sm font-semibold flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" /> Interactive Preview & Editor
          <span className="text-[10px] text-muted-foreground bg-primary/10 px-2 py-0.5 rounded border border-primary/20 font-semibold">
            Double-click cells to edit numeric/text columns
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Total: {rows.length} rows
        </span>
      </div>
      
      {/* AG Grid Container with dark quartz styling */}
      <div className="ag-theme-quartz-dark w-full h-[450px]">
        <AgGridReact
          rowData={rows}
          columnDefs={columnDefs}
          pagination={true}
          paginationPageSize={50}
          paginationPageSizeSelector={[10, 20, 50, 100]}
          onCellValueChanged={onCellValueChanged}
          defaultColDef={{
            resizable: true,
            flex: 1,
            minWidth: 120,
          }}
        />
      </div>
    </div>
  );
}
