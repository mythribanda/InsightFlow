import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedFile {
  rows: Record<string, unknown>[];
  headers: string[];
  fileName: string;
  fileSize: number;
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File size exceeds the limit of 25MB (got ${(
        file.size /
        (1024 * 1024)
      ).toFixed(2)}MB). Please upload a smaller file.`
    );
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv" || ext === "tsv" || ext === "txt") {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
        delimiter: "",
        complete: (res) => {
          const headers = res.meta.fields ?? [];
          resolve({ rows: res.data, headers, fileName: file.name, fileSize: file.size });
        },
        error: reject,
      });
    });
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const headers = json.length ? Object.keys(json[0]) : [];
  return { rows: json, headers, fileName: file.name, fileSize: file.size };
}
