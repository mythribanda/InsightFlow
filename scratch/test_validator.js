import { checkSuitability } from "../src/server/modeling.ts";

console.log("String representation:\n", checkSuitability.toString());
console.log("\nProperties:");
for (const key of Object.getOwnPropertyNames(checkSuitability)) {
  console.log(key, typeof checkSuitability[key]);
}
console.log("\nPrototype properties:");
const proto = Object.getPrototypeOf(checkSuitability);
for (const key of Object.getOwnPropertyNames(proto)) {
  console.log(key, typeof proto[key]);
}
