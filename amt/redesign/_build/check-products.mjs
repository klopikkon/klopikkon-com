/**
 * Confirms one product page per catalogue row, no broken internal links,
 * ranking badges, and the quote mailto builder.
 * Run: node amt/redesign/_build/check-products.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRankingIndex, loadProducts, loadRanking, matchProduct } from "./product-support.mjs";
import { addLine, buildMailto, emptyCart, totalQty } from "../js/cart.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const redesign = path.resolve(here, "..");
const repo = path.resolve(redesign, "..", "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

const build = spawnSync(process.execPath, [path.join(here, "build.mjs")], {
  cwd: repo,
  encoding: "utf8",
});
if (build.status !== 0) {
  console.error(build.stdout);
  console.error(build.stderr);
  console.error("build failed");
  process.exit(1);
}

const products = await loadProducts(redesign);
const ranking = await loadRanking(path.resolve(redesign, "..", "ranking-on-price"));

function assert(condition, message) {
  if (!condition) fail(message);
}

const ambiguous = buildRankingIndex([
  { sku: "AMT1-A", cas: ["111-11-1"], name: "Same", tone: "win", slug: "a", href: "/amt/ranking-on-price/a/", pillText: "AMT #1", note: "" },
  { sku: "AMT1-A", cas: ["111-11-1"], name: "Same", tone: "lose", slug: "b", href: "/amt/ranking-on-price/b/", pillText: "", note: "" },
]);
assert(matchProduct({ id: "x", sku: "AMT1-A", name: "Same", cas: "111-11-1", synonyms: [] }, ambiguous).row === null, "ambiguous SKU should not badge");

const byName = buildRankingIndex([
  { sku: "AMTZ9-Z", cas: [], name: "Only Name", tone: "split", slug: "only-name", href: "/amt/ranking-on-price/only-name/", pillText: "Split", note: "no peer" },
]);
const named = matchProduct({ id: "n", sku: "NOT-A-SKU", name: "Only Name", cas: null, synonyms: [] }, byName);
assert(named.via === "name" && named.row.slug === "only-name", "unique name should match");

const conflict = buildRankingIndex([
  { sku: "AMTZ8-Z", cas: ["50-00-0"], name: "Shared label", tone: "win", slug: "other-cas", href: "/amt/ranking-on-price/other-cas/", pillText: "", note: "" },
]);
assert(
  matchProduct({ id: "c", sku: "MISSING-1", name: "Shared label", cas: "99-99-9", synonyms: [] }, conflict).row === null,
  "name match must not cross CAS numbers",
);

let cart = addLine(emptyCart(), { id: "alc-0315", sku: "AMTGC903-AL21", pack: "1g", name: "ALC-0315" });
cart = addLine(cart, { id: "alc-0315", sku: "AMTGC903-AL21", pack: "1g", name: "ALC-0315" });
cart = addLine(cart, { id: "c16-200", sku: "AMTGC1487-IL25", pack: "100mg" });
assert(totalQty(cart) === 3, "quantities should add up");
const catalog = [
  { id: "alc-0315", sku: "AMTGC903-AL21", name: "ALC-0315", packs: [{ size: "1g", label: "$430.00" }] },
  { id: "c16-200", sku: "AMTGC1487-IL25", name: "C16-200 Ionic Lipid", packs: [{ size: "100mg", label: "Quote" }] },
];
const mailto = buildMailto({
  email: "sales@amtechpl.com",
  cart,
  fields: { name: "Ada", organisation: "", notes: "Please advise lead time" },
  catalog,
});
assert(mailto.startsWith("mailto:sales@amtechpl.com?"), "mailto uses the published sales address");
const body = decodeURIComponent(mailto.split("body=")[1]);
assert(body.includes("Name: Ada"), "name is copied into the email");
assert(!body.includes("Organisation:"), "blank organisation is left out");
assert(body.includes("Please advise lead time"), "notes are copied into the email");
assert(body.includes("ALC-0315 | AMTGC903-AL21 | 1g | $430.00 | qty 2"), "priced line is itemised");
assert(body.includes("C16-200 Ionic Lipid | AMTGC1487-IL25 | 100mg | Quote | qty 1"), "quote pack stays Quote");
assert(!body.includes("undefined"), "mailto body has no undefined fields");

const shellPrefixes = /^(catalogue|families|about|contact|compare|styleguide)(\/|$)/;
const shellFiles = new Set(["index.html", "css/tokens.css", "css/base.css", "css/components.css", "js/theme.js"]);

function linkOk(href) {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return true;
  if (/^https?:\/\//i.test(href)) return true;
  const pathOnly = href.split("#")[0].split("?")[0];
  if (!pathOnly.startsWith("/")) return false;
  if (pathOnly.startsWith("/amt/ranking-on-price/")) {
    const rest = pathOnly.slice("/amt/ranking-on-price/".length).replace(/\/$/, "");
    const file = rest
      ? path.join(repo, "amt/ranking-on-price", rest, "index.html")
      : path.join(repo, "amt/ranking-on-price/index.html");
    return existsSync(file);
  }
  if (!pathOnly.startsWith("/amt/redesign/") && pathOnly !== "/amt/redesign") return false;
  const rest = pathOnly.replace(/^\/amt\/redesign\/?/, "");
  if (rest === "" || shellPrefixes.test(rest) || shellFiles.has(rest)) return true;
  const abs = path.join(redesign, rest);
  if (rest.endsWith("/")) return existsSync(path.join(abs, "index.html"));
  if (existsSync(abs) && statSync(abs).isFile()) return true;
  if (existsSync(path.join(abs, "index.html"))) return true;
  return false;
}

const pages = new Map();
const productDirs = readdirSync(path.join(redesign, "products"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
assert(productDirs.length === products.length, `page dirs ${productDirs.length} != products ${products.length}`);
for (const product of products) {
  const file = path.join(redesign, "products", product.id, "index.html");
  assert(existsSync(file), `missing page for ${product.id}`);
  if (!existsSync(file)) continue;
  pages.set(product.id, readFileSync(file, "utf8"));
}
for (const dir of productDirs) {
  assert(products.some((product) => product.id === dir), `extra product page ${dir}`);
}

const quoteHtml = readFileSync(path.join(redesign, "quote/index.html"), "utf8");
const quoteItems = readFileSync(path.join(redesign, "quote/items.json"), "utf8");
assert(quoteHtml.includes("sales@amtechpl.com"), "quote page names the published sales email");
assert(quoteHtml.includes("noindex,nofollow"), "quote page is noindex");
assert(quoteHtml.includes('lang="en-AU"'), "quote page missing shell language");
assert(quoteHtml.includes("Concept redesign, not the official AMT site"), "quote page missing concept note");
assert(quoteHtml.includes("/css/quote.css"), "quote page missing quote.css");
assert(quoteHtml.includes("Nothing is sent to a server"), "quote page states it does not submit");
JSON.parse(quoteItems);

const report = readFileSync(path.join(redesign, "products/price-match.md"), "utf8");
assert(report.includes("Match order"), "price-match.md documents the matcher");
assert(report.includes("Matched:"), "price-match.md records the match rate");

function extractHrefs(html) {
  return [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((match) => match[1]);
}

for (const [id, html] of pages) {
  const product = products.find((item) => item.id === id);
  assert(html.includes('content="noindex,nofollow"'), `${id} missing noindex`);
  assert(html.includes('lang="en-AU"'), `${id} missing shell language`);
  assert(html.includes("Concept redesign, not the official AMT site"), `${id} missing concept note`);
  assert(html.includes('class="skip-link"'), `${id} missing skip link`);
  assert(html.includes('id="main"'), `${id} missing main`);
  assert(html.includes("/css/tokens.css"), `${id} missing tokens`);
  assert(html.includes("/css/product.css"), `${id} missing product.css`);
  assert(!/\.(css|js|png|webp|svg)\//.test(html), `${id} has a trailing slash on a file URL`);
  assert(html.includes('data-generated="amt-product"'), `${id} missing generated marker`);
  assert(html.includes(`data-product-id="${id}"`), `${id} missing product id`);
  assert(!/lorem|todo|example\.com/i.test(html), `${id} has placeholder copy`);
  for (const href of extractHrefs(html)) {
    if (!linkOk(href)) fail(`${id} broken link ${href}`);
  }
  const match = matchProduct(product, ranking);
  if (match.row) {
    assert(html.includes(`data-tone="${match.row.tone}"`), `${id} missing ${match.row.tone} badge`);
    assert(html.includes(match.row.href), `${id} missing breakdown link`);
  } else {
    assert(!html.includes("price-position"), `${id} should not show a price position`);
  }
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert(blocks.length === 1, `${id} should have one JSON-LD block`);
  if (blocks.length) {
    const data = JSON.parse(blocks[0]);
    assert(data["@type"] === "Product", `${id} JSON-LD type`);
    assert(data.name === product.name, `${id} JSON-LD name`);
    assert(data.sku === product.sku, `${id} JSON-LD sku`);
    assert(!data.review && !data.aggregateRating && !data.award, `${id} JSON-LD has a fabricated claim`);
    const offers = data.offers ? (Array.isArray(data.offers) ? data.offers : [data.offers]) : [];
    for (const offer of offers) {
      assert(typeof offer.price === "number", `${id} offer price is not a number`);
      assert(offer.priceCurrency, `${id} numeric offer is missing currency`);
    }
    const hasCurrency = (pack) => typeof pack.currency === "string" && pack.currency.trim() && !/^(n\/a|na|none|not published)$/i.test(pack.currency.trim());
    const quoted = (product.packs || []).filter((pack) => pack.price == null || String(pack.priceText || "").toLowerCase() === "quote");
    const priced = (product.packs || []).filter((pack) => typeof pack.price === "number" && String(pack.priceText || "").toLowerCase() !== "quote" && hasCurrency(pack));
    assert(offers.length === priced.length, `${id} JSON-LD offer count ${offers.length} != ${priced.length}`);
    if (!priced.length) assert(!data.offers, `${id} quoted product should omit offers`);
    if (quoted.length) {
      const dumped = JSON.stringify(data);
      for (const pack of quoted) assert(!dumped.includes(`"name":${JSON.stringify(pack.size)}`) || !data.offers, `${id} quoted pack leaked into offers`);
    }
    if (!product.structureImage) assert(!data.image, `${id} JSON-LD image without a published structure`);
    if (!product.cas) assert(!JSON.stringify(data.additionalProperty || []).includes("CAS"), `${id} JSON-LD invented a CAS`);
    if (!product.formula) assert(!JSON.stringify(data.additionalProperty || []).includes("Formula"), `${id} JSON-LD invented a formula`);
    if (product.mw == null) assert(!JSON.stringify(data.additionalProperty || []).includes("Molecular weight"), `${id} JSON-LD invented a molecular weight`);
  }
  if (product.purity) assert(html.includes(product.purity), `${id} purity was rewritten`);
  if (!product.storage) assert(!html.includes(">Storage<"), `${id} shows unpublished storage`);
  if (!product.appearance) assert(!html.includes(">Appearance<"), `${id} shows unpublished appearance`);
  if (!product.documents?.sds && !product.documents?.coa && !product.documents?.datasheet) {
    assert(!html.includes('class="documents"'), `${id} shows documents AMT did not publish`);
  }
  if (product.structureImage) assert(html.includes(product.structureImage), `${id} missing published structure image`);
  else assert(html.includes("No structure image published by AMT"), `${id} missing structure placeholder`);
  for (const pack of product.packs || []) {
    const label = pack.price == null || String(pack.priceText || "").toLowerCase() === "quote" ? "Quote" : pack.priceText;
    assert(html.includes(label), `${id} missing pack label ${label}`);
  }
}

for (const href of extractHrefs(quoteHtml)) {
  if (!linkOk(href)) fail(`quote broken link ${href}`);
}

if (failures.length) {
  console.error(`\n${failures.length} check failure(s):`);
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

const matched = products.filter((product) => matchProduct(product, ranking).row).length;
console.log(`ok: ${products.length} pages, ${matched} ranked, links and mailto checks passed`);
console.log(build.stdout.trim());
