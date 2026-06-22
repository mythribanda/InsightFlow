import { checkSuitability } from "../src/server/modeling.ts";

try {
  console.log("Calling checkSuitability locally in-process with wrapped argument...");
  const res = await checkSuitability({
    data: {
      target: "top_speed_kmh",
      data: {
        brand: ["Abarth", "Abarth"],
        model: ["500e Convertible", "500e Hatchback"],
        top_speed_kmh: [155, 155]
      }
    }
  });
  console.log("SUCCESS! Result:", res);
} catch (e) {
  console.error("FAILED! Error:", e);
}
