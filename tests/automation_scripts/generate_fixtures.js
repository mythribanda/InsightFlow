import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const FIXTURES_DIR = path.resolve("tests/automation_scripts/fixtures/test-data");
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

// 10 sample rows
const sampleData = [
  { employee_id: "EMP001", name: "Alice Smith", age: 30, experience: 8, department: "Engineering", city: "San Francisco", rating: 4.5, salary: 95000 },
  { employee_id: "EMP002", name: "Bob Jones", age: 24, experience: 2, department: "Marketing", city: "New York", rating: 3.8, salary: 60000 },
  { employee_id: "EMP003", name: "Charlie Brown", age: 45, experience: 20, department: "Sales", city: "Los Angeles", rating: 4.2, salary: 110000 },
  { employee_id: "EMP004", name: "Diana Prince", age: 32, experience: 10, department: "Engineering", city: "San Francisco", rating: 4.9, salary: 125000 },
  { employee_id: "EMP005", name: "Evan Wright", age: 28, experience: 5, department: "HR", city: "Chicago", rating: 3.5, salary: 55000 },
  { employee_id: "EMP006", name: "Fiona Gallagher", age: 29, experience: 6, department: "Finance", city: "Boston", rating: 4.0, salary: 75000 },
  { employee_id: "EMP007", name: "George Costanza", age: 35, experience: 12, department: "Sales", city: "New York", rating: 2.1, salary: 45000 },
  { employee_id: "EMP008", name: "Harriet Tubman", age: 50, experience: 25, department: "Engineering", city: "Washington", rating: 5.0, salary: 150000 },
  { employee_id: "EMP009", name: "Ian Malcolm", age: 40, experience: 15, department: "Marketing", city: "Austin", rating: 4.7, salary: 90000 },
  { employee_id: "EMP010", name: "Julia Roberts", age: 38, experience: 13, department: "HR", city: "Los Angeles", rating: 4.3, salary: 80000 },
];

function generateCSV(data, delimiter = ",") {
  const headers = Object.keys(data[0]).join(delimiter);
  const rows = data.map(row => Object.values(row).join(delimiter));
  return [headers, ...rows].join("\n");
}

console.log("Generating valid.csv, valid.tsv, valid.txt...");
fs.writeFileSync(path.join(FIXTURES_DIR, "valid.csv"), generateCSV(sampleData, ","), "utf-8");
fs.writeFileSync(path.join(FIXTURES_DIR, "valid.tsv"), generateCSV(sampleData, "\t"), "utf-8");
fs.writeFileSync(path.join(FIXTURES_DIR, "valid.txt"), generateCSV(sampleData, ","), "utf-8");

console.log("Generating valid.xlsx, valid.xls...");
const worksheet = XLSX.utils.json_to_sheet(sampleData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
XLSX.writeFile(workbook, path.join(FIXTURES_DIR, "valid.xlsx"), { bookType: "xlsx" });
XLSX.writeFile(workbook, path.join(FIXTURES_DIR, "valid.xls"), { bookType: "xls" });

console.log("Generating empty.csv (headers only)...");
fs.writeFileSync(path.join(FIXTURES_DIR, "empty.csv"), Object.keys(sampleData[0]).join(",") + "\n", "utf-8");

console.log("Generating na_numeric.csv (regression test for NA handling)...");
const naData = JSON.parse(JSON.stringify(sampleData));
naData[2].salary = "NA";
naData[5].age = "NA";
naData[8].rating = "NA";
fs.writeFileSync(path.join(FIXTURES_DIR, "na_numeric.csv"), generateCSV(naData, ","), "utf-8");

console.log("Generating imbalanced.csv (for class imbalance warning)...");
const imbalancedData = [];
// 100 rows total: 90 Engineering, 10 Marketing
for (let i = 0; i < 90; i++) {
  imbalancedData.push({ employee_id: `EMP${i}`, name: `Eng ${i}`, age: 30, experience: 8, department: "Engineering", city: "San Francisco", rating: 4.0, salary: 90000 });
}
for (let i = 90; i < 100; i++) {
  imbalancedData.push({ employee_id: `EMP${i}`, name: `Mkt ${i}`, age: 25, experience: 3, department: "Marketing", city: "New York", rating: 4.0, salary: 60000 });
}
fs.writeFileSync(path.join(FIXTURES_DIR, "imbalanced.csv"), generateCSV(imbalancedData, ","), "utf-8");

console.log("Generating missing_labels.csv (for missing target label issue)...");
const missingLabelsData = JSON.parse(JSON.stringify(sampleData));
// Make 3 out of 10 rows (30%) have empty salary
missingLabelsData[0].salary = "";
missingLabelsData[3].salary = "";
missingLabelsData[7].salary = "";
fs.writeFileSync(path.join(FIXTURES_DIR, "missing_labels.csv"), generateCSV(missingLabelsData, ","), "utf-8");

const oversizedPath = path.join(FIXTURES_DIR, "oversized.csv");
if (fs.existsSync(oversizedPath)) {
  console.log("oversized.csv already exists. Skipping regeneration to prevent transient locks.");
  console.log("All E2E test data fixtures successfully generated!");
} else {
  console.log("Generating oversized.csv (>25MB)...");
  // Let's generate a ~26MB CSV file
  const oversizedStream = fs.createWriteStream(oversizedPath);
  oversizedStream.write(Object.keys(sampleData[0]).join(",") + "\n");
  const totalRows = 450000;
  for (let i = 0; i < totalRows; i++) {
    oversizedStream.write(`EMP${i},Oversized Name ${i},30,8,Engineering,San Francisco,4.0,90000\n`);
  }
  oversizedStream.end(() => {
    console.log("All E2E test data fixtures successfully generated!");
  });
}
