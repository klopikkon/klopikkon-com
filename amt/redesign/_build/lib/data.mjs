import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function readJson(path) {
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

function isObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** Objects merge key by key. Arrays and scalars from `over` replace the base. */
function merge(base, over) {
  if (over == null) return base;
  if (Array.isArray(over) || !isObject(base) || !isObject(over)) return over;
  const out = { ...base };
  for (const [key, value] of Object.entries(over)) {
    out[key] = key in base ? merge(base[key], value) : value;
  }
  return out;
}

/**
 * Load catalogue rows and site copy.
 * `data/products.json` and `data/site.json` win when present.
 * Until the data agent lands them, fixtures in this folder are the source.
 */
export async function loadData(root) {
  const productsPath = join(root, "data", "products.json");
  const sitePath = join(root, "data", "site.json");
  const productsFixturePath = join(root, "_build", "fixtures", "products.json");
  const siteFixturePath = join(root, "_build", "fixtures", "site.json");

  const [productsFile, siteFile, productsFixture, siteFixture] = await Promise.all([
    readJson(productsPath),
    readJson(sitePath),
    readJson(productsFixturePath),
    readJson(siteFixturePath),
  ]);

  if (!siteFixture) {
    throw new Error("Missing _build/fixtures/site.json");
  }

  let products = Array.isArray(productsFixture) ? productsFixture : [];
  let productsSource = "fixture";
  if (Array.isArray(productsFile) && productsFile.length > 0) {
    products = productsFile;
    productsSource = "data/products.json";
  }

  let site = siteFixture;
  let siteSource = "fixture";
  if (isObject(siteFile)) {
    site = merge(siteFixture, siteFile);
    siteSource = "data/site.json";
    if (!Array.isArray(site.featured) || site.featured.length === 0) {
      site.featured = siteFixture.featured;
    }
  }

  return { products, site, productsSource, siteSource };
}
