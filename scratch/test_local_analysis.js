import { startAnalysis } from "../src/server/analysis.ts";

try {
  console.log("Calling startAnalysis locally in-process...");
  const res = await startAnalysis({
    session_id: "test_session",
    data: {
      brand: ["Abarth"],
      model: ["500e"]
    }
  });
  console.log("SUCCESS! Result:", res);
} catch (e) {
  console.error("FAILED! Error:", e);
}
