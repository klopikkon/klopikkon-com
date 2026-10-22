/**
 * Set classDerived from data/class-rules.json.
 * Run: node amt/redesign/data/apply-class.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classCounts, classSection, deriveClass, loadClassRules } from "./class-derived.mjs";

const dataDir = dirname(fileURLToPath(import.meta.url));
const rules = loadClassRules();
const products = JSON.parse(readFileSync(join(dataDir, "products.json"), "utf8"));

for (const product of products) {
  const derived = deriveClass(product.name, product.family, rules);
  product.classDerived = derived;
  product.classDerivedSource = derived ? "name" : null;
}

writeFileSync(join(dataDir, "products.json"), `${JSON.stringify(products, null, 2)}\n`);

const counts = JSON.parse(readFileSync(join(dataDir, "counts.json"), "utf8"));
counts.classDerived = classCounts(products, rules);
writeFileSync(join(dataDir, "counts.json"), `${JSON.stringify(counts, null, 2)}\n`);

const section = `${classSection(counts.classDerived).join("\n")}\n`;
let text = readFileSync(join(dataDir, "COUNTS.md"), "utf8");
if (text.includes("## Name-derived class")) {
  text = text.replace(/## Name-derived class\n[\s\S]*?(?=\n## )/, section);
} else {
  text = text.replace("\n## External reference data\n", `\n${section}\n## External reference data\n`);
}
const comment = `<!-- counts\n${JSON.stringify(counts, null, 2)}\n-->`;
text = text.replace(/<!-- counts\n[\s\S]*?\n-->/, comment);
writeFileSync(join(dataDir, "COUNTS.md"), text);
console.log(JSON.stringify(counts.classDerived.byFamily, null, 2));
