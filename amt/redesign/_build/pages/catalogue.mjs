/**
 * Catalogue page generator.
 *
 * Export `build(ctx)` for `_build/build.mjs`. Run this file directly until
 * that shell exists: `node amt/redesign/_build/pages/catalogue.mjs`.
 *
 * Reads `data/products.json` when it is a non-empty array, otherwise the
 * fixture in `_build/fixtures/catalogue.json` (real AMT list rows).
 * If `_build/lib/layout.mjs` is missing, a minimal noindex shell in this
 * file is used so the integrator can swap in `renderPage` later.
 */

import { readFile, mkdir, writeFile as fsWriteFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { prepareRecord, familyLabel } from "../../js/search.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REDESIGN = path.resolve(__dirname, "../..");
const PAGE_SIZE = 40;
const FAMILY_ORDER = ["lipids", "peg", "fluorophores", "organoborons", "other"];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function moneyLabel(pack) {
  if (!pack || pack.price == null || pack.priceText === "quote") return "Quote";
  return pack.priceText || String(pack.price);
}

function rel(fromDir, target) {
  let out = path.relative(fromDir, target).split(path.sep).join("/");
  if (!out || out === "") return "./";
  if (!out.startsWith(".")) out = `./${out}`;
  return out;
}

function relDir(fromDir, targetDir) {
  const out = rel(fromDir, targetDir);
  return out.endsWith("/") ? out : `${out}/`;
}

async function loadProducts(root) {
  const dataPath = path.join(root, "data/products.json");
  try {
    const parsed = JSON.parse(await readFile(dataPath, "utf8"));
    if (Array.isArray(parsed) && parsed.length) {
      return { products: parsed, source: "data/products.json" };
    }
  } catch {
    /* fixture until the data agent lands products.json */
  }
  const fixture = JSON.parse(await readFile(path.join(root, "_build/fixtures/catalogue.json"), "utf8"));
  return { products: fixture, source: "fixture" };
}

async function resolveRender(ctx) {
  if (typeof ctx.renderPage === "function") return { renderPage: ctx.renderPage, fallback: false };
  try {
    const mod = await import("../lib/layout.mjs");
    if (typeof mod.renderPage === "function") return { renderPage: mod.renderPage, fallback: false };
  } catch {
    /* design shell is owned by another agent and may not be on this branch */
  }
  return { renderPage: null, fallback: true };
}

function fallbackRender(fromDir) {
  const home = relDir(fromDir, ".");
  const catalogue = relDir(fromDir, "catalogue");
  return function renderPage({ title, description, body, head }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${esc(description)}">
<title>${esc(title)}</title>
${head || ""}
</head>
<body>
<!-- layout fallback: _build/lib/layout.mjs was not available. catalogue.mjs supplied this shell for the integrator. -->
<a class="cat-skip" href="#catalogue">Skip to catalogue</a>
<header class="cat-shell">
  <div class="cat-shell-inner">
    <a class="cat-brand" href="${esc(home)}"><span>AMT</span> <small>Concept redesign</small></a>
    <nav aria-label="Primary">
      <a href="${esc(catalogue)}" aria-current="page">Catalogue</a>
    </nav>
    <button type="button" data-theme-toggle>Theme</button>
  </div>
</header>
${body}
<footer class="cat-shell-foot">
  <p>Concept redesign, not the official AMT site. Names, CAS numbers and prices are copied from Advanced Molecular Technologies’ published lists. Unpublished prices are quotes.</p>
</footer>
<script>
(function () {
  var key = "amt-theme";
  var saved = null;
  try { saved = localStorage.getItem(key); } catch (err) { saved = null; }
  if (saved === "light" || saved === "dark") {
    document.documentElement.setAttribute("data-theme", saved);
    document.documentElement.style.colorScheme = saved;
  }
  document.addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("[data-theme-toggle]");
    if (!button) return;
    var current = document.documentElement.getAttribute("data-theme");
    if (current !== "light" && current !== "dark") {
      current = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    var next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.style.colorScheme = next;
    try { localStorage.setItem(key, next); } catch (err) {}
  });
})();
</script>
</body>
</html>`;
  };
}

function cardHtml(product, href) {
  const packs = product.packs || [];
  const cas = product.cas ? `CAS ${product.cas}` : "No CAS published";
  const syn = (product.synonyms || []).slice(0, 2).join(" · ");
  const kicker = `${familyLabel(product.family)}${product.subfamily ? ` · ${product.subfamily}` : ""}`;
  const source = product.source?.pdf
    ? `${product.source.pdf}${product.source.page ? `, page ${product.source.page}` : ""}`
    : "";
  const packItems = packs.map((pack) => `<li>${esc(pack.size)} · ${esc(moneyLabel(pack))}</li>`).join("");
  const options = packs.map((pack) => (
    `<option value="${esc(pack.size)}">${esc(pack.size)} · ${esc(moneyLabel(pack))}</option>`
  )).join("");
  const priced = packs.filter((pack) => typeof pack.price === "number");
  const min = priced.length ? priced.reduce((best, pack) => (pack.price < best.price ? pack : best)) : null;
  const price = min ? `From ${moneyLabel(min)}` : "Quote";
  return `<li class="cat-card" id="${esc(product.id)}">
    <div class="cat-card-main">
      <p class="cat-kicker"${source ? ` title="${esc(source)}"` : ""}>${esc(kicker)}</p>
      <h2><a class="cat-name" href="${esc(href)}">${esc(product.name)}</a></h2>
      <p class="cat-meta">
        <span class="cat-sku">${esc(product.sku)}</span>
        <span class="cat-cas">${esc(cas)}</span>
        ${product.purity ? `<span class="cat-pur">${esc(product.purity)}</span>` : ""}
        ${product.formula ? `<span class="cat-formula">${esc(product.formula)}</span>` : ""}
        ${typeof product.mw === "number" ? `<span class="cat-mw">${esc(product.mw)} Da</span>` : ""}
      </p>
      ${syn ? `<p class="cat-syn">${esc(syn)}</p>` : ""}
      ${packItems ? `<ul class="cat-packs">${packItems}</ul>` : ""}
    </div>
    <div class="cat-buy" data-quote-root>
      <p class="cat-price">${esc(price)}</p>
      ${options ? `<label class="cat-pack-label"><span>Pack</span><select data-pack-select aria-label="Pack size for ${esc(product.name)}">${options}</select></label>` : ""}
      <button type="button" class="cat-quote" data-add-quote data-id="${esc(product.id)}" data-sku="${esc(product.sku)}" data-pack="${esc(packs[0]?.size || "")}">Add to quote</button>
    </div>
  </li>`;
}

function pagerHtml(fromDir, family, page, pages) {
  if (pages <= 1) return "";
  const hrefFor = (n) => {
    const dir = n === 1 ? `catalogue/${family}` : `catalogue/${family}/page/${n}`;
    return relDir(fromDir, dir);
  };
  const links = [];
  const add = (n, label) => {
    const current = n === page ? ` aria-current="page"` : "";
    links.push(`<a href="${esc(hrefFor(n))}"${current}>${esc(label)}</a>`);
  };
  if (page > 1) add(page - 1, "Previous");
  for (let n = 1; n <= pages; n += 1) add(n, String(n));
  if (page < pages) add(page + 1, "Next");
  return `<nav class="cat-pager" aria-label="Pages">${links.join("")}</nav>`;
}

function lede(products, source) {
  const counts = new Map();
  for (const product of products) counts.set(product.family, (counts.get(product.family) || 0) + 1);
  const bits = FAMILY_ORDER.filter((family) => counts.has(family))
    .map((family) => `${counts.get(family)} ${familyLabel(family).toLowerCase()}`);
  if (source === "fixture") {
    return `${products.length} products copied from the published AMT lists: lipids (26 Aug 2026), PEG reagents and linkers (3 Sep 2026), fluorophores and dyes (2026), and organoborons (21 Apr 2026). ${bits.join(", ")}. A price that was not printed is a quote.`;
  }
  return `${products.length} products from the catalogue extract. ${bits.join(", ")}. A price that was not printed is a quote.`;
}

function pageShell({ title, description, fromDir, body, renderPage, fallback }) {
  const css = rel(fromDir, "css/catalogue.css");
  const js = rel(fromDir, "js/search.js");
  const head = `<link rel="stylesheet" href="${esc(css)}">`;
  const fullBody = `${body}\n<script type="module" src="${esc(js)}"></script>`;
  const render = fallback ? fallbackRender(fromDir) : renderPage;
  return render({
    title,
    description,
    path: `${fromDir}/`,
    body: fullBody,
    head,
  });
}

export async function build(ctx = {}) {
  const root = ctx.root || REDESIGN;
  const outDir = ctx.outDir || root;
  const write = ctx.writeFile || (async (file, contents) => {
    await mkdir(path.dirname(file), { recursive: true });
    await fsWriteFile(file, contents);
  });

  let products;
  let source;
  if (Array.isArray(ctx.products) && ctx.products.length) {
    products = ctx.products;
    source = "ctx.products";
  } else {
    ({ products, source } = await loadProducts(root));
  }
  for (const product of products) {
    if (!product.id || !product.sku || !product.name) {
      throw new Error(`Catalogue product is missing id, sku, or name (${product.sku || product.id || "unknown"})`);
    }
  }

  const { renderPage, fallback } = await resolveRender(ctx);
  const intro = lede(products, source);
  const hasMw = products.some((product) => typeof product.mw === "number");
  const byFamily = new Map();
  for (const product of products) {
    const family = product.family || "other";
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family).push(product);
  }
  for (const list of byFamily.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }));
  }
  const families = [...byFamily.keys()].sort((a, b) => {
    const ai = FAMILY_ORDER.indexOf(a);
    const bi = FAMILY_ORDER.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  const records = products.map(prepareRecord);
  const index = {
    v: 1,
    source,
    count: records.length,
    hasMw,
    items: records,
  };
  await write(path.join(outDir, "catalogue/index.json"), `${JSON.stringify(index)}\n`);

  const fromIndex = "catalogue";
  const familyLinks = families.map((family) => {
    const href = relDir(fromIndex, `catalogue/${family}`);
    return `<a class="cat-family-link" href="${esc(href)}"><span>${esc(familyLabel(family))}</span><span class="cat-count">${byFamily.get(family).length}</span></a>`;
  }).join("");
  const indexBody = `<main class="catalogue" id="catalogue" data-catalogue-app data-index="index.json" data-has-mw="${hasMw ? "1" : "0"}" data-product-base="${esc(relDir(fromIndex, "products"))}">
  <header class="cat-intro">
    <p class="cat-eyebrow">Catalogue</p>
    <h1>Search the AMT list</h1>
    <p class="cat-lede">${esc(intro)}</p>
  </header>
  <form id="cat-form" role="search" action="" method="get">
    <div class="cat-toolbar">
      <label class="cat-search">
        <span>Search</span>
        <input id="cat-q" name="q" type="search" autocomplete="off" spellcheck="false" enterkeyhint="search" placeholder="Name, CAS, SKU, formula, mPEG 2k" aria-autocomplete="list" aria-controls="cat-results" aria-describedby="cat-hint">
      </label>
      <label class="cat-sort">Sort
        <select id="cat-sort" name="sort">
          <option value="relevance">Relevance</option>
          <option value="name">Name</option>
          <option value="mw">Molecular weight</option>
          <option value="price">Price</option>
        </select>
      </label>
      <button type="button" class="cat-filter-open" aria-expanded="false" aria-controls="cat-filters">Filters</button>
    </div>
    <p id="cat-hint" class="cat-hint">CAS works with or without hyphens. PEG3 is an oligomer length; PEG2000 and mPEG 2k are a nominal mass. Arrow keys move through results. <kbd>/</kbd> focuses search.</p>
    <div class="cat-layout">
      <aside id="cat-filters" class="cat-filters" aria-labelledby="cat-filter-title"></aside>
      <div>
        <p id="cat-live" class="cat-live" aria-live="polite">Loading the catalogue index.</p>
        <div id="cat-chips" class="cat-chips"></div>
        <div id="cat-results">
          <p class="cat-empty">The searchable list loads in the browser. The family pages below list every product without JavaScript.</p>
        </div>
        <nav id="cat-pager" class="cat-pager" aria-label="Results pages"></nav>
        <p id="cat-quote-status" class="cat-quote-status" aria-live="polite"></p>
      </div>
    </div>
  </form>
  <section class="cat-families" aria-labelledby="cat-browse-title">
    <h2 id="cat-browse-title">Browse by family</h2>
    ${familyLinks}
  </section>
</main>`;

  await write(
    path.join(outDir, "catalogue/index.html"),
    pageShell({
      title: "Catalogue · AMT concept redesign",
      description: intro,
      fromDir: fromIndex,
      body: indexBody,
      renderPage,
      fallback,
    }),
  );

  for (const family of families) {
    const list = byFamily.get(family);
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    for (let page = 1; page <= pages; page += 1) {
      const fromDir = page === 1 ? `catalogue/${family}` : `catalogue/${family}/page/${page}`;
      const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      const productBase = relDir(fromDir, "products");
      const cards = slice.map((product) => cardHtml(product, `${productBase}${encodeURIComponent(product.id)}/`)).join("\n");
      const catalogueHome = relDir(fromDir, "catalogue");
      const body = `<main class="catalogue" id="catalogue">
  <header class="cat-intro">
    <p class="cat-eyebrow"><a href="${esc(catalogueHome)}">Catalogue</a></p>
    <h1>${esc(familyLabel(family))}</h1>
    <p class="cat-lede">${list.length} products, page ${page} of ${pages}. <a href="${esc(`${catalogueHome}?family=${encodeURIComponent(family)}`)}">Search this family</a>.</p>
  </header>
  <ol class="cat-list">${cards}</ol>
  ${pagerHtml(fromDir, family, page, pages)}
  <p id="cat-quote-status" class="cat-quote-status" aria-live="polite"></p>
</main>`;
      await write(
        path.join(outDir, fromDir, "index.html"),
        pageShell({
          title: `${familyLabel(family)} · Catalogue · AMT concept redesign`,
          description: `${list.length} ${familyLabel(family)} from the AMT catalogue.`,
          fromDir,
          body,
          renderPage,
          fallback,
        }),
      );
    }
  }

  return { count: products.length, source, fallback, families: families.map((family) => [family, byFamily.get(family).length]) };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  build().then((result) => {
    console.log(JSON.stringify(result));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
