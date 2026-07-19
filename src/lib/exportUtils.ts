import * as XLSX from "xlsx";
import Papa from "papaparse";

/**
 * Exports an array of row objects to an Excel (.xlsx) file.
 */
export function downloadXLSX(rows: Record<string, unknown>[], fileName: string, sheetName = "Dataset") {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}

/**
 * Exports an array of row objects to a CSV file.
 */
export function downloadCSV(rows: Record<string, unknown>[], fileName: string) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
