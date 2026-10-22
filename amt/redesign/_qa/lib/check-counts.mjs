import fs from "node:fs";
import path from "node:path";
import { help, isHtmlFile, locate, parseArgs, relTo, report, visibleText, walkFiles } from "./common.mjs";

const FAMILIES = ["lipids", "peg", "fluorophores", "organoborons", "other"];

const KEY_ALIASES = new Map([
  ["products", "products"],
  ["product", "products"],
  ["total", "products"],
  ["total products", "products"],
  ["all products", "products"],
  ["source count", "products"],
  ["source counts", "products"],
  ["lipids", "lipids"],
  ["lipid", "lipids"],
  ["peg", "peg"],
  ["peg reagents", "peg"],
  ["peg reagents and linkers", "peg"],
  ["fluorophores", "fluorophores"],
  ["fluorophores and dyes", "fluorophores"],
  ["dyes", "fluorophores"],
  ["organoborons", "organoborons"],
  ["organoboron", "organoborons"],
  ["other", "other"],
]);

function appearances(haystack, needle) {
  if (!needle) return 0;
  if (/^quote$/i.test(needle)) return (haystack.match(/\bquote\b/gi) || []).length;
  let count = 0;
  let from = 0;
  while (from < haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    const next = haystack[at + needle.length] || "";
    const afterNext = haystack[at + needle.length + 1] || "";
    const longerNumber = /\d/.test(next) || (next === "." && !needle.includes(".")) || (next === "," && /\d/.test(afterNext));
    if (!longerNumber) count += 1;
    from = at + needle.length;
  }
  return count;
}

/** Parse the totals table / `key: N` lines described in QA.md. */
export function parseCounts(markdown) {
  const found = {};
  const conflicts = [];
  for (const raw of markdown.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    line = line.replace(/^[-*]\s+/, "");
    let cells = line.split("|").map((cell) => cell.replace(/\*+/g, "").trim()).filter(Boolean);
    if (cells.length !== 2) {
      const match = line.match(/^([A-Za-z][A-Za-z ]*?)\s*:\s*([\d,]+)\s*$/);
      cells = match ? [match[1], match[2]] : [];
    }
    if (cells.length !== 2) continue;
    const key = KEY_ALIASES.get(cells[0].toLowerCase());
    const num = cells[1].replace(/,/g, "");
    if (!key || !/^\d+$/.test(num)) continue;
    const value = Number(num);
    if (Object.prototype.hasOwnProperty.call(found, key) && found[key] !== value) {
      conflicts.push(`${key} is both ${found[key]} and ${value}`);
    }
    found[key] = value;
  }
  return { found, conflicts };
}

function productIdFromFile(productsDir, file) {
  const rel = relTo(productsDir, file);
  if (rel === "index.html") return null;
  if (rel.endsWith("/index.html")) return rel.slice(0, -"/index.html".length);
  if (!rel.includes("/") && rel.endsWith(".html")) return rel.slice(0, -".html".length);
  return rel;
}

function pageFileFor(productsDir, id) {
  const asDir = path.join(productsDir, ...id.split("/"), "index.html");
  const asFile = path.join(productsDir, `${id}.html`);
  if (fs.existsSync(asDir)) return asDir;
  if (fs.existsSync(asFile)) return asFile;
  return null;
}

function labeledCas(text) {
  const match = text.match(/\bCAS(?:\s+(?:number|no\.?))?\s*[:#]?\s*(\d{2,7}-\d{2}-\d)\b/i);
  return match ? match[1] : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(help("check-counts"));
    return;
  }
  const located = locate(args);
  const dataFile = path.join(located.scanRedesign, "data", "products.json");
  const countsFile = path.join(located.scanRedesign, "data", "COUNTS.md");
  const productsDir = path.join(located.scanRedesign, "products");
  const fixture = path.join(located.scanRedesign, "_build", "fixtures", "products.json");
  const failures = [];
  const skips = [];
  const notes = [];

  const hasData = fs.existsSync(dataFile);
  const hasCounts = fs.existsSync(countsFile);
  const hasPages = fs.existsSync(productsDir);
  if (!hasData && !hasCounts && !hasPages) {
    if (fs.existsSync(fixture)) {
      try {
        const fixtureProducts = JSON.parse(fs.readFileSync(fixture, "utf8"));
        const count = Array.isArray(fixtureProducts) ? fixtureProducts.length : 0;
        notes.push(`fixture _build/fixtures/products.json has ${count} rows; it is not the source of record`);
      } catch {
        notes.push("fixture _build/fixtures/products.json is not valid JSON");
      }
    }
    report(located, {
      name: "check-counts",
      status: "skip",
      skips: ["data/products.json, data/COUNTS.md, and products/ are not in this tree yet"],
      notes,
    });
    return;
  }

  let products = null;
  if (!hasData) {
    skips.push("data/products.json is not in this tree yet");
  } else {
    try {
      products = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    } catch (error) {
      failures.push(`data/products.json is not valid JSON (${error.message})`);
    }
    if (products && !Array.isArray(products)) {
      failures.push("data/products.json must be an array");
      products = null;
    }
  }

  let counts = null;
  if (!hasCounts) skips.push("data/COUNTS.md is not in this tree yet");
  else {
    const parsed = parseCounts(fs.readFileSync(countsFile, "utf8"));
    failures.push(...parsed.conflicts.map((item) => `data/COUNTS.md ${item}`));
    if (!Object.prototype.hasOwnProperty.call(parsed.found, "products")) {
      failures.push(
        "data/COUNTS.md has no products total. Use a row `| products | N |` or a line `products: N`.",
      );
    } else {
      counts = parsed.found;
      if (!products) notes.push(`COUNTS.md products total is ${counts.products}`);
    }
  }

  const pageFiles = hasPages
    ? await walkFiles(productsDir, (_file, name) => isHtmlFile(name), {
        skipDirNames: new Set([".git", "node_modules"]),
      })
    : [];
  const rendered = new Map();
  if (!hasPages) skips.push("products/ is not in this tree yet");
  else {
    for (const file of pageFiles) {
      const id = productIdFromFile(productsDir, file);
      if (!id) continue;
      if (rendered.has(id)) failures.push(`duplicate rendered page for ${id}`);
      rendered.set(id, file);
    }
    notes.push(`${rendered.size} rendered product page(s)`);
  }

  if (products) {
    notes.push(`data/products.json has ${products.length} product(s)`);
    const ids = new Set();
    const skus = new Set();
    const familyCounts = Object.fromEntries(FAMILIES.map((family) => [family, 0]));
    for (const product of products) {
      const id = product && product.id != null ? String(product.id) : "";
      const sku = product && product.sku != null ? String(product.sku) : "";
      if (!id) {
        failures.push("a product is missing id");
        continue;
      }
      if (id.includes("..") || id.startsWith("/") || id.includes("\\")) {
        failures.push(`${id}: invalid id`);
        continue;
      }
      if (ids.has(id)) failures.push(`duplicate product id ${id}`);
      ids.add(id);
      if (!sku) failures.push(`${id}: missing sku`);
      else if (skus.has(sku)) failures.push(`duplicate sku ${sku}`);
      else skus.add(sku);
      if (product.family && Object.prototype.hasOwnProperty.call(familyCounts, product.family)) {
        familyCounts[product.family] += 1;
      }
      if (hasPages) {
        const file = rendered.get(id) || pageFileFor(productsDir, id);
        if (!file) failures.push(`${id}: no rendered page at products/${id}/index.html`);
        else checkPage(id, product, file, failures);
      }
    }
    if (hasPages) {
      if (rendered.size !== products.length) {
        failures.push(`product page count ${rendered.size} != products.json count ${products.length}`);
      }
      for (const id of rendered.keys()) {
        if (!ids.has(id)) failures.push(`rendered page products/${id}/ is not in products.json`);
      }
    }
    if (counts) {
      if (counts.products !== products.length) {
        failures.push(`COUNTS.md products ${counts.products} != products.json ${products.length}`);
      } else notes.push(`COUNTS.md products matches products.json (${products.length})`);
      for (const family of FAMILIES) {
        if (!Object.prototype.hasOwnProperty.call(counts, family)) continue;
        if (counts[family] !== familyCounts[family]) {
          failures.push(
            `COUNTS.md ${family} ${counts[family]} != products.json ${familyCounts[family]}`,
          );
        }
      }
    }
    if (hasPages && counts && rendered.size !== counts.products) {
      failures.push(`product page count ${rendered.size} != COUNTS.md products ${counts.products}`);
    }
  }

  const skippedAll = !products && !counts && !hasPages;
  report(located, {
    name: "check-counts",
    status: failures.length ? "fail" : skippedAll ? "skip" : "pass",
    failures,
    skips,
    notes,
  });
}

function checkPage(id, product, file, failures) {
  const text = visibleText(fs.readFileSync(file, "utf8"));
  const sku = String(product.sku);
  if (!text.includes(sku)) failures.push(`${id}: page does not show sku ${sku}`);
  const cas = product.cas == null ? "" : String(product.cas).trim();
  const shown = labeledCas(text);
  if (cas) {
    if (!text.includes(cas)) failures.push(`${id}: page does not show CAS ${cas}`);
    if (shown && shown !== cas) failures.push(`${id}: page CAS ${shown} != data ${cas}`);
  } else if (shown) {
    failures.push(`${id}: data CAS is empty but the page shows CAS ${shown}`);
  }
  const packs = Array.isArray(product.packs) ? product.packs : null;
  if (!packs) {
    failures.push(`${id}: packs must be an array`);
    return;
  }
  if (!packs.length) {
    if (!appearances(text, "quote")) failures.push(`${id}: no packs in data, page should say quote`);
    return;
  }
  const expected = new Map();
  for (const pack of packs) {
    const priceText = pack && pack.priceText != null ? String(pack.priceText).trim() : "";
    const label = priceText || (pack && pack.price == null ? "quote" : String(pack.price));
    expected.set(label, (expected.get(label) || 0) + 1);
    if (pack && pack.size) {
      const size = String(pack.size);
      if (!text.includes(size)) failures.push(`${id}: page does not show pack size ${JSON.stringify(size)}`);
    }
    if (pack && typeof pack.price === "number" && priceText && !/^quote$/i.test(priceText)) {
      const digits = String(pack.price);
      if (!priceText.includes(digits) && !priceText.includes(pack.price.toFixed(2))) {
        failures.push(`${id}: priceText ${JSON.stringify(priceText)} does not contain price ${digits}`);
      }
    }
  }
  for (const [label, times] of expected) {
    const found = appearances(text, label);
    if (found < times) {
      failures.push(
        `${id}: expected ${JSON.stringify(label)} ${times} time(s) on the page, found ${found}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(`FAIL check-counts\n  ${error.stack || error.message}`);
  process.exitCode = 1;
});
