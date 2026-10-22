#!/usr/bin/env node
/**
 * Validate amt/redesign/data against products.schema.json and COUNTS.md.
 * Zero dependencies. Run: node amt/redesign/scripts/validate-data.mjs
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classCounts, deriveClass, loadClassRules } from "../data/class-derived.mjs";

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

const classRules = loadClassRules();
const itemSchema = schema.items;
const required = itemSchema.required;
const families = new Set(itemSchema.properties.family.enum);

function normSize(size) {
  return String(size || "").replace(/\s+/g, "").toLowerCase();
}

function priceConflict(product) {
  const home = Array.isArray(product.homepagePacks) ? product.homepagePacks : [];
  if (!home.length) return false;
  const pdfPrices = new Map();
  for (const pack of product.packs || []) {
    const key = normSize(pack.size);
    if (!pdfPrices.has(key)) pdfPrices.set(key, new Set());
    pdfPrices.get(key).add(pack.price);
  }
  return home.some((pack) => {
    const prices = pdfPrices.get(normSize(pack.size));
    return !prices || !prices.has(pack.price);
  });
}
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

  if (typeof product.subfamily !== "string" || product.subfamily.length === 0) {
    fail(`${label}: subfamily must be a non-empty string`);
  }
  const subSource = product.subfamilySource;
  if (!subSource || subSource.heading !== product.subfamily) {
    fail(`${label}: subfamilySource.heading must match subfamily`);
  } else {
    if (typeof subSource.url !== "string" || subSource.url.length === 0) fail(`${label}: subfamilySource.url missing`);
    if (typeof subSource.location !== "string" || subSource.location.length === 0) fail(`${label}: subfamilySource.location missing`);
    if (subSource.page !== null && !Number.isInteger(subSource.page)) fail(`${label}: subfamilySource.page must be an integer or null`);
  }
  if (product.subfamily === "Ionisable Lipid") {
    const labels = product.homepageLabels || [];
    if (!labels.includes("Ionisable Lipid")) fail(`${label}: Ionisable Lipid subfamily without that homepage label`);
  }

  if (product.subfamily !== null && typeof product.subfamily !== "string") fail(`${label}: subfamily must be a string or null`);
  if (product.cas !== null && typeof product.cas !== "string") fail(`${label}: cas must be a string or null`);
  if (product.cas === "No CAS#") fail(`${label}: a printed No CAS# belongs in casRaw, not cas`);
  if (product.casRaw != null) {
    if (product.casRaw !== "No CAS#") fail(`${label}: casRaw must be the printed No CAS# text`);
    if (product.cas != null) fail(`${label}: cas must be null when casRaw is set`);
    if (product.catalogueNote !== "No CAS#") fail(`${label}: catalogueNote must keep the printed No CAS# text`);
  }
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
  if (product.structureImage) {
    if (!product.structureImage.startsWith("assets/products/")) {
      fail(`${label}: structureImage must be an AMT file under assets/products/`);
    } else if (!existsSync(join(root, product.structureImage))) {
      fail(`${label}: AMT structure image file is missing`);
    }
    if (typeof product.structureImageSource !== "string" || !product.structureImageSource.startsWith("https://www.amtechpl.com/")) {
      fail(`${label}: structureImageSource must be the AMT file URL`);
    }
    if (product.structureImageExternal && product.structureImage === product.structureImageExternal) {
      fail(`${label}: structureImage must not reuse the PubChem file`);
    }
  } else if (product.structureImageSource != null) {
    fail(`${label}: structureImageSource set without an AMT image`);
  }

  const documents = product.documents;
  if (!Array.isArray(documents)) {
    fail(`${label}: documents must be an array`);
  } else {
    for (const doc of documents) {
      if (!doc || typeof doc !== "object") {
        fail(`${label}: documents entry must be an object`);
        continue;
      }
      if (!["sds", "coa", "datasheet", "spec", "technical"].includes(doc.type)) {
        fail(`${label}: documents type ${doc.type} is not an SDS, COA, datasheet, spec, or technical sheet`);
      }
      if (typeof doc.url !== "string" || !doc.url.startsWith("https://")) fail(`${label}: document url must be https`);
      if (typeof doc.source !== "string" || doc.source.length === 0) fail(`${label}: document source is missing`);
    }
  }
  const conflict = priceConflict(product);
  if (conflict) {
    if (product.priceConflict !== true) fail(`${label}: homepage and catalogue prices disagree but priceConflict is not true`);
  } else if (Object.prototype.hasOwnProperty.call(product, "priceConflict")) {
    fail(`${label}: priceConflict is set without a homepage/catalogue price disagreement`);
  }

  const pegNominal = /(?:^|[^A-Za-z0-9])m?PEG\s*(?:\(\s*(\d{3,})\s*\)|[\s-]?(\d{3,}))(?!\d)/gi;
  if (!Object.prototype.hasOwnProperty.call(product, "formulaExternal")) fail(`${label}: missing formulaExternal`);
  if (!Object.prototype.hasOwnProperty.call(product, "mwExternal")) fail(`${label}: missing mwExternal`);
  if (!Object.prototype.hasOwnProperty.call(product, "structureImageExternal")) fail(`${label}: missing structureImageExternal`);
  if (!Object.prototype.hasOwnProperty.call(product, "externalSource")) fail(`${label}: missing externalSource`);
  if (!Object.prototype.hasOwnProperty.call(product, "mwNominal")) fail(`${label}: missing mwNominal`);
  if (!Object.prototype.hasOwnProperty.call(product, "mwNominalSource")) fail(`${label}: missing mwNominalSource`);

  const external = product.externalSource;
  if (external == null) {
    if (product.formulaExternal != null || product.mwExternal != null || product.structureImageExternal != null) {
      fail(`${label}: external fields are set without externalSource`);
    }
  } else {
    if (external.name !== "PubChem" || !Number.isInteger(external.cid) || external.cid < 1) {
      fail(`${label}: externalSource must be PubChem with an integer cid`);
    }
    if (external.url !== `https://pubchem.ncbi.nlm.nih.gov/compound/${external.cid}`) {
      fail(`${label}: externalSource.url does not match the CID`);
    }
    if (typeof product.formulaExternal !== "string" || product.formulaExternal.length === 0) {
      fail(`${label}: formulaExternal must be a non-empty string when PubChem matched`);
    }
    if (typeof product.mwExternal !== "number" || product.mwExternal <= 0) {
      fail(`${label}: mwExternal must be a positive number when PubChem matched`);
    }
    if (product.structureImageExternal != null) {
      const expected = `assets/structures/pubchem/${external.cid}.svg`;
      if (product.structureImageExternal !== expected) {
        fail(`${label}: structureImageExternal must be ${expected}`);
      } else if (!existsSync(join(root, product.structureImageExternal))) {
        fail(`${label}: structure image file is missing`);
      } else {
        const svg = readFileSync(join(root, product.structureImageExternal), "utf8");
        if (!svg.startsWith("<svg") || !svg.includes("</svg>")) {
          fail(`${label}: structure image is not an SVG`);
        } else if (svg.length > 40000) {
          fail(`${label}: structure SVG is ${svg.length} bytes`);
        }
      }
    }
  }

  if (product.mwNominal == null) {
    if (product.mwNominalSource != null) fail(`${label}: mwNominalSource set without mwNominal`);
  } else {
    if (typeof product.mwNominal !== "number" || product.mwNominal < 200) {
      fail(`${label}: mwNominal must be a number of at least 200`);
    }
    if (product.mwNominalSource !== "name") fail(`${label}: mwNominalSource must be "name"`);
    const found = new Set();
    for (const match of String(product.name || "").matchAll(pegNominal)) {
      found.add(Number(match[1] || match[2]));
    }
    if (found.size !== 1 || !found.has(product.mwNominal)) {
      fail(`${label}: mwNominal ${product.mwNominal} is not the single PEG mass in the name`);
    }
  }

  if (!Object.prototype.hasOwnProperty.call(product, "classDerived")) fail(`${label}: missing classDerived`);
  if (!Object.prototype.hasOwnProperty.call(product, "classDerivedSource")) fail(`${label}: missing classDerivedSource`);
  const derived = deriveClass(product.name, product.family, classRules);
  if (JSON.stringify(product.classDerived) !== JSON.stringify(derived)) {
    fail(`${label}: classDerived does not match data/class-rules.json`);
  }
  if (derived == null) {
    if (product.classDerivedSource != null) fail(`${label}: classDerivedSource set without a class`);
  } else if (product.classDerivedSource !== "name") {
    fail(`${label}: classDerivedSource must be "name"`);
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
const bySubfamily = {};
for (const product of products) {
  if (product && product.subfamily) bySubfamily[product.subfamily] = (bySubfamily[product.subfamily] || 0) + 1;
}
const expectedSubfamily = counts.bySubfamily || {};
const subKeys = new Set([...Object.keys(bySubfamily), ...Object.keys(expectedSubfamily)]);
for (const heading of subKeys) {
  if ((bySubfamily[heading] || 0) !== (expectedSubfamily[heading] || 0)) {
    fail(`subfamily ${JSON.stringify(heading)}: products.json has ${bySubfamily[heading] || 0}, counts.json has ${expectedSubfamily[heading] || 0}`);
  }
}
if (!countsMd.includes("## Subfamily")) fail("COUNTS.md is missing the Subfamily section");
if (!countsMd.includes("## Name-derived class")) fail("COUNTS.md is missing the Name-derived class section");
if (!countsMd.includes("## AMT documents and images")) fail("COUNTS.md is missing the AMT documents and images section");
const imageCount = products.filter((product) => product.structureImage).length;
const documentCount = products.filter((product) => Array.isArray(product.documents) && product.documents.length).length;
const conflictSkus = products.filter((product) => product.priceConflict === true).map((product) => product.sku);
if (!counts.amtImages || counts.amtImages.products !== imageCount) {
  fail(`counts.json amtImages.products does not match products.json (${imageCount})`);
}
if (!counts.documents || counts.documents.products !== documentCount) {
  fail(`counts.json documents.products does not match products.json (${documentCount})`);
}
if (JSON.stringify(counts.priceConflict || []) !== JSON.stringify(conflictSkus)) {
  fail("counts.json priceConflict does not match products.json");
}
const expectedClass = classCounts(products, classRules);
if (JSON.stringify(counts.classDerived) !== JSON.stringify(expectedClass)) {
  fail("counts.json classDerived does not match the name rules");
}
const pubchemDir = join(root, "assets/structures/pubchem");
if (existsSync(pubchemDir)) {
  const pngs = readdirSync(pubchemDir).filter((name) => name.endsWith(".png"));
  if (pngs.length) fail(`PubChem PNG assets still present (${pngs.length})`);
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
