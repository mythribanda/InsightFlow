import { startAnalysis } from "../src/server/analysis.ts";

console.log("startAnalysis keys:", Object.keys(startAnalysis));
console.log("startAnalysis validator:", startAnalysis.inputValidator);
console.log("startAnalysis constructor:", startAnalysis.constructor.name);
