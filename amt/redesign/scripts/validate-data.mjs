#!/usr/bin/env node
/**
 * Validate amt/redesign/data against products.schema.json and COUNTS.md.
 * Zero dependencies. Run: node amt/redesign/scripts/validate-data.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
const errors = [];

function fail(message) {
  errors.push(message);
}

const schema = JSON.parse(readFileSync(join(dataDir, "products.schema.json"), "utf8"));
const products = JSON.parse(readFileSync(join(dataDir, "products.json"), "utf8"));
const counts = JSON.parse(readFileSync(join(dataDir, "counts.json"), "utf8"));
const countsMd = readFileSync(join(dataDir, "COUNTS.md"), "utf8");

const itemSchema = schema.items;
const required = itemSchema.required;
const families = new Set(itemSchema.properties.family.enum);
const idPattern = new RegExp(itemSchema.properties.id.pattern);
const skuPattern = new RegExp(itemSchema.properties.sku.pattern);
const packRequired = itemSchema.properties.packs.items.required;

if (!Array.isArray(products)) fail("products.json must be an array");

const ids = new Set();
const skus = new Set();
const byFamily = {};

for (const product of products) {
  const label = product && (product.sku || product.id) ? product.sku || product.id : "(missing sku)";
  for (const key of required) {
    if (product == null || !Object.prototype.hasOwnProperty.call(product, key)) {
      fail(`${label}: missing ${key}`);
    }
  }
  if (!product || typeof product !== "object") continue;

  if (typeof product.id !== "string" || !idPattern.test(product.id)) {
    fail(`${label}: id must match ${idPattern}`);
  } else if (ids.has(product.id)) {
    fail(`${label}: duplicate id ${product.id}`);
  } else {
    ids.add(product.id);
  }

  if (typeof product.sku !== "string" || !skuPattern.test(product.sku)) {
    fail(`${label}: sku must match ${skuPattern}`);
  } else if (skus.has(product.sku)) {
    fail(`${label}: duplicate sku ${product.sku}`);
  } else {
    skus.add(product.sku);
  }

  if (typeof product.id === "string" && typeof product.sku === "string" && product.id !== product.sku.toLowerCase()) {
    fail(`${label}: id must be the lowercase sku`);
  }

  if (product.name !== null && typeof product.name !== "string") fail(`${label}: name must be a string or null`);
  if (!Array.isArray(product.synonyms) || product.synonyms.some((item) => typeof item !== "string")) {
    fail(`${label}: synonyms must be an array of strings`);
  }
  if (!families.has(product.family)) fail(`${label}: family ${product.family} is not in the schema enum`);
  else byFamily[product.family] = (byFamily[product.family] || 0) + 1;

  if (product.subfamily !== null && typeof product.subfamily !== "string") fail(`${label}: subfamily must be a string or null`);
  if (product.cas !== null && typeof product.cas !== "string") fail(`${label}: cas must be a string or null`);
  if (product.formula !== null && typeof product.formula !== "string") fail(`${label}: formula must be a string or null`);
  if (product.mw !== null && typeof product.mw !== "number") fail(`${label}: mw must be a number or null`);
  if (product.purity !== null && typeof product.purity !== "string") fail(`${label}: purity must be a string or null`);

  if (!Array.isArray(product.packs) || product.packs.length < 1) {
    fail(`${label}: packs must be a non-empty array`);
  } else {
    product.packs.forEach((pack, index) => {
      for (const key of packRequired) {
        if (!Object.prototype.hasOwnProperty.call(pack, key)) fail(`${label}: packs[${index}] missing ${key}`);
      }
      if (pack.size !== null && typeof pack.size !== "string") fail(`${label}: packs[${index}].size must be a string or null`);
      if (pack.price !== null && typeof pack.price !== "number") fail(`${label}: packs[${index}].price must be a number or null`);
      if (pack.currency !== null && typeof pack.currency !== "string") fail(`${label}: packs[${index}].currency must be a string or null`);
      if (typeof pack.priceText !== "string" || pack.priceText.length === 0) {
        fail(`${label}: packs[${index}].priceText must be a non-empty string`);
      }
      const unpublished = pack.price === null;
      if (unpublished && pack.priceText !== "quote") {
        fail(`${label}: packs[${index}] has a null price but priceText is ${JSON.stringify(pack.priceText)}`);
      }
      if (!unpublished && pack.priceText === "quote") {
        fail(`${label}: packs[${index}] has price ${pack.price} but priceText is "quote"`);
      }
    });
  }

  if (product.structureImage !== null && typeof product.structureImage !== "string") {
    fail(`${label}: structureImage must be a string or null`);
  }

  const documents = product.documents;
  if (!documents || typeof documents !== "object") {
    fail(`${label}: documents must be an object`);
  } else {
    for (const key of ["sds", "coa", "datasheet"]) {
      if (!Object.prototype.hasOwnProperty.call(documents, key)) fail(`${label}: documents.${key} missing`);
      else if (documents[key] !== null && typeof documents[key] !== "string") {
        fail(`${label}: documents.${key} must be a string or null`);
      }
    }
  }

  const source = product.source;
  if (!source || typeof source !== "object") {
    fail(`${label}: source must be an object`);
  } else {
    if (typeof source.url !== "string" || source.url.length === 0) fail(`${label}: source.url must be a string`);
    if (source.pdf !== null && typeof source.pdf !== "string") fail(`${label}: source.pdf must be a string or null`);
    if (source.page !== null && !Number.isInteger(source.page)) fail(`${label}: source.page must be an integer or null`);
  }
}

if (products.length !== counts.uniqueProducts) {
  fail(`counts.json uniqueProducts is ${counts.uniqueProducts}, products.json has ${products.length}`);
}
for (const family of families) {
  const actual = byFamily[family] || 0;
  const expected = counts.byFamily[family] || 0;
  if (actual !== expected) fail(`family ${family}: products.json has ${actual}, counts.json has ${expected}`);
}
const sourceSum = Object.values(counts.byPrimarySource).reduce((sum, n) => sum + n, 0);
if (sourceSum !== products.length) {
  fail(`byPrimarySource sums to ${sourceSum}, products.json has ${products.length}`);
}

const comment = countsMd.match(/<!-- counts\s*([\s\S]*?)\s*-->/);
if (!comment) {
  fail("COUNTS.md is missing the <!-- counts --> block");
} else {
  const embedded = JSON.parse(comment[1]);
  if (JSON.stringify(embedded) !== JSON.stringify(counts)) {
    fail("COUNTS.md <!-- counts --> block does not match counts.json");
  }
}
if (!countsMd.includes(`Total unique SKUs: **${products.length}**`)) {
  fail("COUNTS.md total does not match products.json");
}

if (errors.length) {
  console.error(`validate-data: ${errors.length} problem(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`validate-data: ${products.length} products, counts match, schema core fields ok`);
