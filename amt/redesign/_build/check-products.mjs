/**
 * Confirms one product page per catalogue row, no broken internal links,
 * ranking badges, and the quote mailto builder.
 * Run: node amt/redesign/_build/check-products.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareRecord } from "./pages/family-compare.mjs";
import { buildRankingIndex, formatPerMg, hasTechnicalTab, isQuotedPack, loadIdentifierCache, loadProducts, loadRanking, matchProduct, packMassMg, pricePerMg, pubchemFields, technicalIdentifiers } from "./product-support.mjs";
import { addLine, buildMailto, buildQuoteCsv, emptyCart, quoteSummary, requestText, totalQty } from "../js/cart.js";

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
const identifierCache = await loadIdentifierCache(path.join(here, "pubchem-identifiers.json"));

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

assert(packMassMg("500 mg") === 500, "500 mg");
assert(packMassMg("500mg") === 500, "500mg");
assert(packMassMg("1 g") === 1000, "1 g");
assert(packMassMg("1g") === 1000, "1g");
assert(packMassMg("kit") === null, "unparsed size has no mass");
assert(pricePerMg({ size: "500 mg", price: 310, priceText: "$310" }) === 0.62, "310 per 500 mg");
assert(pricePerMg({ size: "1 g", price: 470, priceText: "$470" }) === 0.47, "470 per 1 g");
assert(pricePerMg({ size: "100mg", price: null, priceText: "quote" }) === null, "quote pack has no per-mg price");
assert(pricePerMg({ size: "100mg", price: null, priceText: "Quote" }) === null, "Quote label has no per-mg price");
assert(pricePerMg({ size: "pack", price: 10, priceText: "$10" }) === null, "non-mass pack has no per-mg price");
assert(formatPerMg({ size: "500 mg", price: 310, priceText: "$310" }) === "$0.62/mg", "formatted per mg");
assert(formatPerMg({ size: "1 g", price: 595, priceText: "$595.00" }) === "$0.595/mg", "keeps the third decimal");
assert(pubchemFields({ formula: "C2H6", formulaExternal: null }) === null, "AMT formula is not a PubChem field");
const pubchem = pubchemFields({
  formula: null,
  formulaExternal: "C27H51NO2",
  mwExternal: 421.7,
  structureImageExternal: "https://pubchem.ncbi.nlm.nih.gov/image/imgsrv.fcgi?cid=1",
  pubchemCid: 122689,
});
assert(pubchem.formula === "C27H51NO2" && pubchem.mw === "421.7", "PubChem formula and mw stay on the external fields");
assert(pubchem.href === "https://pubchem.ncbi.nlm.nih.gov/compound/122689", "PubChem CID link");
assert(pubchemFields({ cidExternal: "15" }).cid === "15", "cidExternal is accepted");
assert(pubchemFields({ externalSource: { name: "PubChem", cid: 172871935 } }).cid === "172871935", "externalSource.cid is accepted");
assert(pubchemFields({ pubchemCid: "not-a-cid", formulaExternal: "C" }).href === null, "a non-numeric CID is not linked");
assert(hasTechnicalTab({ formula: null, mw: null, structureImage: null }) === false, "no technical tab without data");
assert(hasTechnicalTab({ structureImage: "assets/structures/a.png" }) === true, "AMT structure opens the technical tab");
assert(hasTechnicalTab({ formulaExternal: "C2H6" }) === true, "PubChem formula opens the technical tab");
assert(
  technicalIdentifiers({ externalSource: { cid: 15 } }, { 15: { smiles: "CCO", inchiKey: "LFQSCWFLJHTTHZ-UHFFFAOYSA-N" } }).smiles === "CCO",
  "cache supplies SMILES",
);
assert(technicalIdentifiers({ smilesExternal: "CCO" }).smiles === "CCO", "a later product SMILES field is used");
assert(
  technicalIdentifiers({ externalSource: { cid: 1 } }, { 1: { smiles: "C", inchiKey: "nope" } }).inchiKey === null,
  "invalid InChIKey is dropped",
);
const compared = compareRecord({
  id: "sample",
  sku: "AMT1-A",
  name: "Sample",
  cas: "No CAS#",
  formula: null,
  mw: null,
  purity: "≥ 98%",
  packs: [{ size: "1g", price: 10, priceText: "$10", currency: "USD" }],
  formulaExternal: "C2H6O",
  pubchemCid: 702,
});
assert(compared.cas === null, "No CAS# is not treated as a CAS in compare");
assert(compared.formula === null, "compare formula is the AMT field");
assert(compared.pubchem.formula === "C2H6O", "compare keeps the PubChem formula separate");
assert(compared.pubchem.href.endsWith("/702"), "compare CID link");

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
assert(body.includes("Indicative total, ex GST: $860.00"), "mailto states the indicative total");
assert(body.includes("Quote lines are not included."), "mailto says Quote lines are excluded");
assert(!body.includes("undefined"), "mailto body has no undefined fields");
const summary = quoteSummary(cart, catalog);
assert(summary.total === 860 && summary.totalLabel === "$860.00", "priced lines sum and Quote lines are excluded");
assert(summary.lines[1].lineTotal === null, "a Quote line has no line total");
const quotedOnly = quoteSummary({ lines: [{ id: "c16-200", sku: "AMTGC1487-IL25", pack: "100mg", qty: 1 }] }, catalog);
assert(quotedOnly.total === null && quotedOnly.totalLabel === null, "an all-Quote list has no numeric total");
const text = requestText({ cart, fields: { name: "Ada", organisation: "", notes: "Please advise lead time" }, catalog });
assert(decodeURIComponent(mailto.split("body=")[1]) === text, "copy text matches the mailto body");
const csv = buildQuoteCsv(cart, catalog);
assert(csv.startsWith("name,sku,pack,published price,qty,line total\r\n"), "CSV header");
assert(csv.includes("ALC-0315,AMTGC903-AL21,1g,$430.00,2,$860.00"), "CSV line total for a published price");
assert(csv.includes("C16-200 Ionic Lipid,AMTGC1487-IL25,100mg,Quote,1,\r\n"), "CSV leaves the Quote line total blank");
assert(csv.includes('"Indicative total, ex GST",,,,,$860.00'), "CSV repeats the indicative total");
const quotedCsv = buildQuoteCsv({ lines: [{ id: "c16-200", sku: "AMTGC1487-IL25", pack: "100mg", name: "C16-200 Ionic Lipid", qty: 1 }] }, catalog);
assert(!quotedCsv.includes("$"), "an all-Quote CSV has no invented amount");

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
assert(quoteHtml.includes("data-quote-summary"), "quote page has a summary step");
assert(quoteHtml.includes("data-quote-copy"), "quote page can copy the request");
assert(quoteHtml.includes("data-quote-csv"), "quote page can download a CSV");
assert(quoteHtml.includes("ex GST"), "quote page labels the total ex GST");
JSON.parse(quoteItems);

const worker = readFileSync(path.join(redesign, "sw.js"), "utf8");
const registration = readFileSync(path.join(redesign, "js/sw-register.js"), "utf8");
assert(worker.includes('const CACHE = "amt-redesign-v1"'), "service worker cache is versioned");
assert(worker.includes("mailto:"), "service worker mentions mailto");
assert(worker.includes("function networkFirst"), "service worker uses network-first HTML");
assert(worker.includes('"/amt/redesign/catalogue/"'), "service worker precaches the catalogue index");
assert(worker.includes('url.protocol === "mailto:"'), "service worker does not cache mailto");
assert(registration.includes('"/amt/redesign/sw.js"'), "register script points at the worker");
assert(registration.includes('scope: SCOPE') || registration.includes('"/amt/redesign/"'), "register script sets the redesign scope");
assert(quoteHtml.includes('src="/amt/redesign/js/sw-register.js"'), "quote page missing service worker registration");

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
  assert(html.includes('src="/amt/redesign/js/sw-register.js"'), `${id} missing service worker registration`);
  assert(html.includes('property="og:image"'), `${id} missing Open Graph image`);
  assert(html.includes(`https://klopikkon.com/amt/redesign/og/${id}.png`), `${id} og image path`);
  const ogFile = path.join(redesign, "og", `${id}.png`);
  assert(existsSync(ogFile), `${id} missing preview image`);
  if (existsSync(ogFile)) {
    const header = readFileSync(ogFile).subarray(0, 24);
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    assert(width === 1200 && height === 630, `${id} preview is ${width}x${height}`);
  }
  assert(html.includes('name="twitter:card" content="summary_large_image"'), `${id} missing Twitter card`);
  const ogDesc = html.match(/property="og:description" content="([^"]*)"/)?.[1] || "";
  assert(ogDesc.length > 0 && !ogDesc.includes("$") && !/quote/i.test(ogDesc), `${id} preview text includes a price`);
  assert(!html.includes(`og/${id}.png/`), `${id} og image has a trailing slash`);
  if ((product.packs || []).some((pack) => isQuotedPack(pack))) {
    assert(html.includes("price not published"), `${id} Quote price has no screen-reader explanation`);
  }
  if (html.includes("price-position-badge")) {
    assert(html.includes('class="price-position-badge" aria-hidden="true"'), `${id} price badge is exposed without the plain-language line`);
  }
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
    assert(data.name === (product.name || product.sku), `${id} JSON-LD name`);
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
  for (const img of html.matchAll(/<img src="([^"]*\/assets\/structures\/[^"]+)"([^>]*)>/g)) {
    assert(/\ssrcset="[^"]+\s1x"/.test(img[2]), `${id} structure image missing srcset`);
    assert(/\swidth="\d+"/.test(img[2]) && /\sheight="\d+"/.test(img[2]), `${id} structure image missing width and height`);
    assert(!(/width="480"/.test(img[2]) && /height="360"/.test(img[2])), `${id} structure image uses a placeholder box`);
  }
  for (const pack of product.packs || []) {
    const label = pack.price == null || String(pack.priceText || "").toLowerCase() === "quote" ? "Quote" : pack.priceText;
    assert(html.includes(label), `${id} missing pack label ${label}`);
  }
  const compare = html.match(/<section class="pack-compare"[\s\S]*?<\/section>/);
  const comparable = (product.packs || []).map((pack) => formatPerMg(pack)).filter(Boolean);
  if (!comparable.length) {
    assert(!compare, `${id} shows a per-mg table without a published mass price`);
  } else {
    assert(compare, `${id} missing price-per-mg table`);
    for (const label of comparable) assert(compare[0].includes(label), `${id} missing ${label}`);
  }
  const packs = product.packs || [];
  const quoteOnly = packs.length > 0 && packs.every((pack) => isQuotedPack(pack));
  if (quoteOnly) assert(html.includes("pack-quote-only"), `${id} missing quote-only empty state`);
  else assert(!html.includes("pack-quote-only"), `${id} shows a quote-only note beside published prices`);
  if (!product.name) assert(html.includes("has not published a name"), `${id} missing unpublished-name note`);
  if (product.sku) assert(html.includes(`data-copy="${product.sku}"`), `${id} missing copy-SKU button`);
  if (product.family) assert(html.includes(`/families/${product.family}/compare/?ids=${encodeURIComponent(id)}`), `${id} missing family compare link`);
  const external = pubchemFields(product);
  const identifiers = technicalIdentifiers(product, identifierCache);
  if (external?.cid) {
    assert(identifierCache[external.cid]?.smiles && identifierCache[external.cid]?.inchiKey, `${id} CID ${external.cid} is missing cached PubChem identifiers`);
  }
  if (hasTechnicalTab(product, identifierCache)) {
    assert(html.includes("data-detail-tabs"), `${id} missing technical tabs`);
    assert(html.includes(">Technical<"), `${id} missing Technical tab`);
    assert(html.includes('role="tablist"'), `${id} missing tab list`);
  } else {
    assert(!html.includes("data-detail-tabs"), `${id} shows a technical tab without data`);
    assert(!html.includes(">Technical<"), `${id} shows a Technical heading without data`);
    assert(!html.includes("data-technical"), `${id} shows a technical panel without data`);
  }
  const showPubchem = Boolean(external && (external.formula || external.mw || external.image));
  if (showPubchem) {
    assert(html.includes("From PubChem"), `${id} missing PubChem heading`);
    assert(html.includes("from PubChem"), `${id} missing PubChem label`);
    if (external.href) assert(html.includes(external.href), `${id} missing PubChem CID link`);
    if (external.formula) assert(html.includes(`${external.formula} <span class="pubchem-tag">from PubChem</span>`), `${id} PubChem formula is unlabelled`);
    if (!product.formula) {
      const specs = html.match(/<section class="specs-section"[\s\S]*?<\/section>/);
      assert(specs && specs[0].includes(">Formula</th><td>Not published</td>"), `${id} AMT formula row used a PubChem value`);
      const dataBlock = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (dataBlock) assert(!JSON.parse(dataBlock[1]).additionalProperty?.some((item) => item.name === "Formula"), `${id} JSON-LD used a PubChem formula`);
    }
  } else {
    assert(!html.includes("From PubChem") && !html.includes("from PubChem"), `${id} shows PubChem without external fields`);
  }
  const dataBlock = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (identifiers.smiles) {
    assert(html.includes(`data-copy="${identifiers.smiles}"`), `${id} missing SMILES copy value`);
    assert(html.includes('aria-label="Copy SMILES from PubChem"'), `${id} SMILES button is not labelled from PubChem`);
    assert(dataBlock && !dataBlock[1].includes(identifiers.smiles) && !dataBlock[1].includes("SMILES"), `${id} JSON-LD includes a PubChem SMILES`);
  } else {
    assert(!html.includes("Copy SMILES from PubChem"), `${id} shows a SMILES button without a PubChem value`);
  }
  if (identifiers.inchiKey) {
    assert(html.includes(`data-copy="${identifiers.inchiKey}"`), `${id} missing InChIKey copy value`);
    assert(html.includes('aria-label="Copy InChIKey from PubChem"'), `${id} InChIKey button is not labelled from PubChem`);
    assert(dataBlock && !dataBlock[1].includes(identifiers.inchiKey), `${id} JSON-LD includes a PubChem InChIKey`);
  } else {
    assert(!html.includes("Copy InChIKey from PubChem"), `${id} shows an InChIKey button without a PubChem value`);
  }
  assert(html.includes("data-print-spec"), `${id} missing print spec sheet`);
  assert(html.includes("data-recent"), `${id} missing recently viewed`);
  assert(html.includes(`data-copy="https://klopikkon.com/amt/redesign/products/${id}/"`), `${id} missing share link`);
}

const families = [...new Set(products.map((product) => product.family).filter(Boolean))];
for (const family of families) {
  const file = path.join(redesign, "families", family, "compare", "index.html");
  assert(existsSync(file), `missing compare page for ${family}`);
  if (!existsSync(file)) continue;
  const html = readFileSync(file, "utf8");
  assert(html.includes('content="noindex,nofollow"'), `${family} compare missing noindex`);
  assert(html.includes("Select up to 4"), `${family} compare missing the four-product limit`);
  assert(html.includes("family-compare.js"), `${family} compare missing script`);
  const sample = products.find((product) => product.family === family);
  assert(html.includes(`"id":${JSON.stringify(sample.id)}`), `${family} compare data missing ${sample.id}`);
}

for (const href of extractHrefs(quoteHtml)) {
  if (!linkOk(href)) fail(`quote broken link ${href}`);
}

function runBuild() {
  const result = spawnSync(process.execPath, [path.join(here, "build.mjs")], {
    cwd: repo,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(result.stderr || result.stdout || "rebuild failed");
  }
  return result;
}

const dataFile = path.join(redesign, "data", "products.json");
if (!existsSync(dataFile)) {
  const sample = [
    {
      id: "regen-check-row",
      sku: "AMTREGEN-1",
      name: "Regen Check Row",
      synonyms: [],
      family: "other",
      subfamily: null,
      cas: null,
      formula: null,
      mw: null,
      purity: null,
      packs: [{ size: "100mg", price: null, currency: null, priceText: "quote" }],
      structureImage: null,
      documents: { sds: null, coa: null, datasheet: null },
      source: { url: "https://www.amtechpl.com/", pdf: null, page: "check" },
    },
    {
      id: "regen-priced-row",
      sku: "AMTREGEN-2",
      name: "Regen Priced Row",
      synonyms: [],
      family: "other",
      subfamily: null,
      cas: null,
      formula: null,
      mw: null,
      purity: null,
      packs: [
        { size: "200 mg", price: 50, currency: "USD", priceText: "$50.00" },
        { size: "1 g", price: 180, currency: "USD", priceText: "$180.00" },
      ],
      structureImage: null,
      documents: { sds: null, coa: null, datasheet: null },
      source: { url: "https://www.amtechpl.com/", pdf: null, page: "check" },
    },
  ];
  mkdirSync(path.dirname(dataFile), { recursive: true });
  try {
    writeFileSync(dataFile, JSON.stringify(sample));
    const regen = runBuild();
    if (regen.status === 0) {
      const quoteOnly = readFileSync(path.join(redesign, "products/regen-check-row/index.html"), "utf8");
      const priced = readFileSync(path.join(redesign, "products/regen-priced-row/index.html"), "utf8");
      assert(quoteOnly.includes("pack-quote-only"), "data/products.json quote row missing empty state");
      assert(!quoteOnly.includes("pack-compare"), "data/products.json quote row invented a per-mg price");
      assert(!quoteOnly.includes("/mg"), "data/products.json quote row contains a per-mg figure");
      assert(priced.includes("$0.25/mg"), "data/products.json priced row missing $0.25/mg");
      assert(priced.includes("$0.18/mg"), "data/products.json priced row missing $0.18/mg");
      assert(priced.includes('"priceCurrency":"USD"'), "data/products.json offer dropped published currency");
      assert(priced.includes("Regen Priced Row"), "data/products.json name was not regenerated");
    }
  } finally {
    rmSync(dataFile, { force: true });
    try {
      rmSync(path.dirname(dataFile));
    } catch {
      // The data directory is kept when it still holds the data agent's files.
    }
    runBuild();
    assert(!existsSync(path.join(redesign, "products/regen-check-row/index.html")), "temporary data row was left on disk");
    assert(existsSync(path.join(redesign, "products", products[0].id, "index.html")), "fixture pages were not restored");
  }
}

if (failures.length) {
  console.error(`\n${failures.length} check failure(s):`);
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

const matched = products.filter((product) => matchProduct(product, ranking).row).length;
console.log(`ok: ${products.length} pages, ${matched} ranked, links and mailto checks passed`);
console.log(build.stdout.trim());
