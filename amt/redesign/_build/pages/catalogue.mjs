/**
 * Catalogue page generator.
 *
 * `node amt/redesign/_build/build.mjs` loads this with the shared layout.
 * Products come from `ctx.products` (`data/products.json` via the build).
 */

import { mkdir, writeFile as fsWriteFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { esc } from "../lib/html.mjs";
import { url } from "../lib/paths.mjs";
import { breadcrumbs } from "../lib/ui.mjs";
import { familyLabel, toCompact } from "../../js/search.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REDESIGN = path.resolve(__dirname, "../..");
const PAGE_SIZE = 40;
const FAMILY_ORDER = ["lipids", "peg", "fluorophores", "organoborons", "other"];

function moneyLabel(pack) {
  if (!pack || pack.price == null || pack.priceText === "quote") return "Quote";
  return pack.priceText || String(pack.price);
}

function productTitle(product) {
  return product.name || "Name not published";
}

function sortName(product) {
  return product.name || product.sku || "";
}

function cardHtml(product) {
  const packs = product.packs || [];
  const cas = product.cas && !/no\s*cas/i.test(product.cas) ? `CAS ${product.cas}` : "No CAS published";
  const href = url(`products/${encodeURIComponent(product.id)}/`);
  const source = product.source?.pdf
    ? `${product.source.pdf}${product.source.page ? `, page ${product.source.page}` : ""}`
    : "";
  const packItems = packs.map((pack) => {
    const size = pack.size || "Pack";
    return `<li><span>${esc(size)}</span> <span>${esc(moneyLabel(pack))}</span></li>`;
  }).join("");
  const options = packs.map((pack) => {
    const size = pack.size || "Pack";
    return `<option value="${esc(pack.size || "")}">${esc(size)} · ${esc(moneyLabel(pack))}</option>`;
  }).join("");
  const priced = packs.filter((pack) => typeof pack.price === "number");
  const min = priced.length ? priced.reduce((best, pack) => (pack.price < best.price ? pack : best)) : null;
  const price = min ? `From ${moneyLabel(min)}` : "Quote";
  const label = Array.isArray(product.homepageLabels) && product.homepageLabels[0]
    ? `<p><span class="badge">${esc(product.homepageLabels[0])}</span></p>`
    : "";
  const note = product.catalogueNote ? `<p class="hint">${esc(product.catalogueNote)}</p>` : "";
  return `<li class="card product-card" id="${esc(product.id)}">
    <div>
      <p class="kicker"${source ? ` title="${esc(source)}"` : ""}>${esc(familyLabel(product.family))}</p>
      <h2><a class="cat-name" href="${esc(href)}">${esc(productTitle(product))}</a></h2>
      <p class="sku">${esc(product.sku)}</p>
      <p class="cat-meta"><span>${esc(cas)}</span>${product.purity ? `<span>${esc(product.purity)}</span>` : ""}</p>
      ${label}
      ${note}
      ${packItems ? `<ul class="pack-list">${packItems}</ul>` : ""}
    </div>
    <div class="cat-buy" data-quote-root>
      <p class="cat-price">${esc(price)}</p>
      ${options ? `<label class="field"><span>Pack</span><select data-pack-select aria-label="Pack size for ${esc(productTitle(product))}">${options}</select></label>` : ""}
      <button type="button" class="btn btn-secondary" data-add-quote data-id="${esc(product.id)}" data-sku="${esc(product.sku)}" data-pack="${esc(packs[0]?.size || "")}">Add to quote</button>
    </div>
  </li>`;
}

function pagerHtml(family, page, pages) {
  if (pages <= 1) return "";
  const hrefFor = (n) => url(n === 1 ? `catalogue/${family}/` : `catalogue/${family}/page/${n}/`);
  const links = [];
  const add = (n, label) => {
    const current = n === page ? ` aria-current="page"` : "";
    links.push(`<a href="${esc(hrefFor(n))}"${current}>${esc(label)}</a>`);
  };
  add(Math.max(1, page - 1), "Previous");
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, page + 2);
  if (start > 1) add(1, "1");
  for (let n = start; n <= end; n += 1) add(n, String(n));
  if (end < pages) add(pages, String(pages));
  add(Math.min(pages, page + 1), "Next");
  return `<nav class="cat-pager" aria-label="Pages">${links.join("")}</nav>`;
}

function shell(ctx, { title, description, pagePath, body }) {
  return ctx.renderPage({
    title,
    description,
    path: pagePath,
    head: `<link rel="stylesheet" href="${esc(url("css/catalogue.css"))}">`,
    body: `${body}\n<script type="module" src="${esc(url("js/search.js"))}"></script>`,
  });
}

async function emit(ctx, rel, html) {
  if (typeof ctx.writeFile === "function") {
    await ctx.writeFile(rel, html);
    return;
  }
  const full = path.join(ctx.outDir || REDESIGN, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await fsWriteFile(full, html);
}

export async function build(ctx = {}) {
  if (!Array.isArray(ctx.products) || ctx.products.length === 0) {
    throw new Error("Catalogue build requires the product array from data/products.json");
  }
  if (typeof ctx.renderPage !== "function") {
    throw new Error("Catalogue build requires renderPage from _build/lib/layout.mjs");
  }

  const products = ctx.products;
  const seen = new Set();
  for (const product of products) {
    if (!product.id || !product.sku) {
      throw new Error(`Catalogue product is missing id or sku (${product.sku || product.id || "unknown"})`);
    }
    if (seen.has(product.id)) throw new Error(`Duplicate catalogue id ${product.id}`);
    seen.add(product.id);
  }

  const byFamily = new Map();
  for (const product of products) {
    const family = product.family || "other";
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family).push(product);
  }
  for (const list of byFamily.values()) {
    list.sort((a, b) => sortName(a).localeCompare(sortName(b), "en", { numeric: true, sensitivity: "base" }));
  }
  const families = [...byFamily.keys()].sort((a, b) => {
    const ai = FAMILY_ORDER.indexOf(a);
    const bi = FAMILY_ORDER.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  const hasMw = products.some((product) => typeof product.mw === "number");
  const bits = families.map((family) => `${byFamily.get(family).length.toLocaleString("en-AU")} ${familyLabel(family)}`);
  const intro = `${products.length.toLocaleString("en-AU")} products from the AMT catalogue extract: ${bits.join(", ")}. A price that was not printed is a quote.`;
  const items = products.map(toCompact);
  const index = { v: 2, n: items.length, items };
  const indexPath = path.join(ctx.outDir || REDESIGN, "catalogue/index.json");
  await mkdir(path.dirname(indexPath), { recursive: true });
  await fsWriteFile(indexPath, JSON.stringify(index));

  const familyCards = families.map((family) => {
    const count = byFamily.get(family).length;
    const href = url(`catalogue/${family}/`);
    return `<article class="card">
      <h2><a href="${esc(href)}">${esc(familyLabel(family))}</a></h2>
      <p>${count.toLocaleString("en-AU")} products</p>
      <p><a class="btn btn-secondary" href="${esc(href)}">Browse</a></p>
    </article>`;
  }).join("");

  const crumbs = breadcrumbs([
    { label: "Home", href: url("") },
    { label: "Catalogue" },
  ]);
  const indexBody = `<div class="wrap catalogue" id="catalogue" data-catalogue-app data-index="${esc(url("catalogue/index.json"))}" data-has-mw="${hasMw ? "1" : "0"}" data-product-base="${esc(url("products/"))}">
  <header class="page-intro">
    ${crumbs}
    <h1>Catalogue</h1>
    <p class="lede">${esc(intro)}</p>
  </header>
  <form id="cat-form" class="form" role="search" action="${esc(url("catalogue/"))}" method="get">
    <div class="cat-toolbar">
      <label class="field cat-search">
        <span>Search</span>
        <input id="cat-q" name="q" type="search" autocomplete="off" spellcheck="false" enterkeyhint="search" placeholder="Name, CAS, SKU, formula, mPEG 2k" aria-autocomplete="list" aria-controls="cat-results" aria-describedby="cat-hint">
      </label>
      <label class="field cat-sort">Sort
        <select id="cat-sort" name="sort" aria-label="Sort results">
          <option value="relevance">Relevance</option>
          <option value="name">Name</option>
          <option value="mw">Molecular weight</option>
          <option value="price">Price</option>
        </select>
      </label>
      <button type="button" class="btn btn-secondary cat-filter-open" aria-expanded="false" aria-controls="cat-filters">Filters</button>
    </div>
    <p id="cat-hint" class="hint">CAS works with or without hyphens. PEG3 is an oligomer length; PEG2000 and mPEG 2k are a nominal mass. Arrow keys move through results. <kbd>/</kbd> focuses search.</p>
    <div class="cat-layout">
      <aside id="cat-filters" class="cat-filters" aria-labelledby="cat-filter-title">
        <h2 id="cat-filter-title">Filters</h2>
        <p class="hint">Family, CAS, pack size, purity, and price load when you search.</p>
      </aside>
      <div>
        <p id="cat-live" class="cat-live" aria-live="polite">${esc(products.length.toLocaleString("en-AU"))} products. Search, or browse by family.</p>
        <div id="cat-chips" class="cat-chips"></div>
        <div id="cat-results">
          <noscript><p class="hint">Search runs in the browser. Each family page lists its products without JavaScript.</p></noscript>
        </div>
        <nav id="cat-pager" class="cat-pager" aria-label="Results pages"></nav>
        <p id="cat-quote-status" class="hint" aria-live="polite"></p>
      </div>
    </div>
  </form>
  <section class="section" aria-labelledby="cat-browse-title">
    <h2 id="cat-browse-title">Browse by family</h2>
    <div class="card-grid">${familyCards}</div>
  </section>
</div>`;

  await emit(ctx, "catalogue/index.html", shell(ctx, {
    title: "Catalogue",
    description: intro,
    pagePath: "catalogue/",
    body: indexBody,
  }));

  for (const family of families) {
    const list = byFamily.get(family);
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    for (let page = 1; page <= pages; page += 1) {
      const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      const pagePath = page === 1 ? `catalogue/${family}/` : `catalogue/${family}/page/${page}/`;
      const rel = page === 1 ? `catalogue/${family}/index.html` : `catalogue/${family}/page/${page}/index.html`;
      const familyCrumbs = breadcrumbs([
        { label: "Home", href: url("") },
        { label: "Catalogue", href: url("catalogue/") },
        { label: familyLabel(family) },
      ]);
      const body = `<div class="wrap catalogue" id="catalogue">
  <header class="page-intro">
    ${familyCrumbs}
    <h1>${esc(familyLabel(family))}</h1>
    <p class="lede">${list.length.toLocaleString("en-AU")} products, page ${page} of ${pages}. <a href="${esc(url(`catalogue/?family=${encodeURIComponent(family)}`))}">Search this family</a>.</p>
  </header>
  <ol class="cat-list">${slice.map((product) => cardHtml(product)).join("\n")}</ol>
  ${pagerHtml(family, page, pages)}
  <p id="cat-quote-status" class="hint" aria-live="polite"></p>
</div>`;
      await emit(ctx, rel, shell(ctx, {
        title: familyLabel(family),
        description: `${list.length} ${familyLabel(family)} from the AMT catalogue.`,
        pagePath,
        body,
      }));
    }
  }

  console.log(`catalogue: ${products.length} products from data/products.json`);
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const { loadData } = await import("../lib/data.mjs");
  const layout = await import("../lib/layout.mjs");
  const { products, site } = await loadData(REDESIGN);
  layout.configure({ site });
  build({ products, site, renderPage: layout.renderPage, outDir: REDESIGN }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
