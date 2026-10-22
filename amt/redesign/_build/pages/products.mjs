/**
 * Product pages: one products/<id>/index.html per catalogue row.
 * Loaded by the shell _build/build.mjs. HTML goes through ctx.writeFile.
 */
import { mkdir, readdir, readFile, rm, writeFile as fsWriteFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { url } from "../lib/paths.mjs";
import { breadcrumbs, priceBadge } from "../lib/ui.mjs";
import {
  absoluteUrl,
  casNumbers,
  escapeHtml,
  familyLabel,
  isQuotedPack,
  loadRanking,
  matchProduct,
  packLabel,
  pricePositionCopy,
  publishedText,
  renderPriceMatchMarkdown,
  summariseMatches,
} from "../product-support.mjs";

function safeId(id) {
  const text = String(id || "");
  if (!text || text.includes("..") || /[\\/]/.test(text) || text !== text.trim()) {
    throw new Error(`Unsafe product id: ${id}`);
  }
  return text;
}

function packsOf(product) {
  return Array.isArray(product.packs) ? product.packs : [];
}

function synonymsOf(product) {
  return (Array.isArray(product.synonyms) ? product.synonyms : []).map((item) => publishedText(item)).filter(Boolean);
}

function structureUrl(product) {
  const src = publishedText(product.structureImage);
  if (!src) return null;
  if (!/^https?:\/\//i.test(src) && !src.startsWith("/")) return null;
  return src;
}

function familyTitle(site, family) {
  const rows = Array.isArray(site?.families) ? site.families : [];
  const match = rows.find((item) => item && item.id === family);
  return publishedText(match?.title) || familyLabel(family);
}

function sourceLinks(product) {
  const source = product.source || {};
  const links = [];
  if (publishedText(source.pdf)) links.push({ href: source.pdf, label: "Catalogue PDF" });
  if (publishedText(source.url)) links.push({ href: source.url, label: "AMT page" });
  return links;
}

function documentLinks(product) {
  const docs = product.documents || {};
  const items = [
    ["sds", "SDS"],
    ["coa", "COA"],
    ["datasheet", "Datasheet"],
  ];
  return items
    .map(([key, label]) => {
      const href = publishedText(docs[key]);
      return href ? { href, label } : null;
    })
    .filter(Boolean);
}

function specRows(product) {
  const cas = publishedText(product.cas);
  const casOk = cas && casNumbers(cas).length > 0 ? cas : null;
  const formula = publishedText(product.formula);
  const mw = product.mw == null || product.mw === "" ? null : String(product.mw);
  const purity = publishedText(product.purity);
  const rows = [
    { key: "CAS", value: casOk, copy: casOk },
    { key: "Formula", value: formula },
    { key: "Molecular weight", value: mw },
    { key: "Purity", value: purity },
  ];
  const storage = publishedText(product.storage);
  const appearance = publishedText(product.appearance);
  if (storage) rows.push({ key: "Storage", value: storage });
  if (appearance) rows.push({ key: "Appearance", value: appearance });
  return rows;
}

function pricedOffers(product) {
  return packsOf(product).filter((pack) => {
    if (typeof pack.price !== "number" || !Number.isFinite(pack.price) || isQuotedPack(pack)) return false;
    return Boolean(publishedText(pack.currency));
  });
}

function jsonLd(product, pagePath) {
  const pageUrl = absoluteUrl(pagePath);
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    url: pageUrl,
    brand: { "@type": "Brand", name: "Advanced Molecular Technologies" },
  };
  if (product.family) data.category = familyLabel(product.family);
  const image = structureUrl(product);
  if (image) data.image = /^https?:\/\//i.test(image) ? image : `https://klopikkon.com${image}`;
  const props = [];
  const cas = publishedText(product.cas);
  if (cas && casNumbers(cas).length) props.push({ "@type": "PropertyValue", name: "CAS", value: cas });
  if (publishedText(product.formula)) props.push({ "@type": "PropertyValue", name: "Formula", value: publishedText(product.formula) });
  if (product.mw != null && product.mw !== "") props.push({ "@type": "PropertyValue", name: "Molecular weight", value: String(product.mw) });
  if (publishedText(product.purity)) props.push({ "@type": "PropertyValue", name: "Purity", value: publishedText(product.purity) });
  if (props.length) data.additionalProperty = props;
  const offers = pricedOffers(product).map((pack) => ({
    "@type": "Offer",
    price: pack.price,
    priceCurrency: publishedText(pack.currency),
    name: pack.size,
    url: pageUrl,
  }));
  if (offers.length === 1) data.offers = offers[0];
  else if (offers.length > 1) data.offers = offers;
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function renderPosition(match) {
  if (!match?.row) return "";
  const copy = pricePositionCopy(match.row);
  const position = { win: "green", lose: "red", split: "amber" }[copy.tone] || "amber";
  return `<aside class="price-position" data-tone="${escapeHtml(copy.tone)}" aria-label="Price position">
    <p class="price-position-badge">${priceBadge(position)}</p>
    <p class="price-position-line">${escapeHtml(copy.line)}</p>
    <p class="price-position-link"><a href="${escapeHtml(match.row.href)}">Price breakdown</a></p>
  </aside>`;
}

function renderPacks(product) {
  const packs = packsOf(product);
  if (!packs.length) {
    return `<p class="pack-missing">Pack sizes are not published for this catalogue row.</p>`;
  }
  const options = packs
    .map((pack, index) => {
      const size = publishedText(pack.size) || "Pack";
      const id = `${safeId(product.id)}-pack-${index}`;
      return `<label class="pack-option" for="${escapeHtml(id)}">
        <input type="radio" name="pack" id="${escapeHtml(id)}" value="${escapeHtml(size)}"${index === 0 ? " checked" : ""}>
        <span class="pack-size">${escapeHtml(size)}</span>
        <span class="pack-price">${escapeHtml(packLabel(pack))}</span>
      </label>`;
    })
    .join("");
  return `<form class="pack-form" data-quote-form data-id="${escapeHtml(product.id)}" data-sku="${escapeHtml(product.sku || "")}" data-name="${escapeHtml(product.name || "")}">
    <fieldset>
      <legend>Pack size</legend>
      <div class="pack-options">${options}</div>
    </fieldset>
    <button class="btn btn-primary" type="submit">Add to quote</button>
    <p class="quote-status" data-quote-status role="status" aria-live="polite"></p>
  </form>`;
}

function renderProduct(product, all, match, site) {
  const id = safeId(product.id);
  const family = product.family || "other";
  const familyText = familyTitle(site, family);
  const sub = publishedText(product.subfamily);
  const showSub = sub && sub.toLowerCase() !== familyText.toLowerCase();
  const synonyms = synonymsOf(product);
  const image = structureUrl(product);
  const figure = image
    ? `<figure class="structure">
        <img src="${escapeHtml(image)}" alt="Structure of ${escapeHtml(product.name)} published by Advanced Molecular Technologies" width="480" height="360">
      </figure>`
    : `<figure class="structure structure-placeholder">
        <svg viewBox="0 0 160 100" aria-hidden="true" focusable="false">
          <rect x="8" y="8" width="144" height="84" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4"></rect>
        </svg>
        <figcaption>No structure image published by AMT</figcaption>
      </figure>`;
  const specs = specRows(product)
    .map((row) => {
      const value = row.value ? escapeHtml(row.value) : "Not published";
      const copy = row.copy
        ? ` <button type="button" class="btn btn-secondary copy-cas" data-copy="${escapeHtml(row.copy)}" aria-label="Copy CAS ${escapeHtml(row.copy)}">Copy</button>`
        : "";
      return `<tr><th scope="row">${escapeHtml(row.key)}</th><td>${value}${copy}</td></tr>`;
    })
    .join("");
  const docs = documentLinks(product);
  const documents = docs.length
    ? `<section class="documents" aria-labelledby="docs-${escapeHtml(id)}">
        <h2 id="docs-${escapeHtml(id)}">Documents</h2>
        <ul>${docs.map((doc) => `<li><a href="${escapeHtml(doc.href)}" rel="noopener noreferrer">${escapeHtml(doc.label)}</a></li>`).join("")}</ul>
      </section>`
    : "";
  const related = all
    .filter((item) => item.id !== product.id && publishedText(item.subfamily) && publishedText(item.subfamily) === sub)
    .slice(0, 6);
  const relatedHtml = related.length
    ? `<section class="related" aria-labelledby="related-${escapeHtml(id)}">
        <h2 id="related-${escapeHtml(id)}">Related in ${escapeHtml(sub)}</h2>
        <ul>${related
          .map(
            (item) =>
              `<li><a href="${url(`products/${safeId(item.id)}/`)}"><span class="related-name">${escapeHtml(item.name)}</span> <span class="related-sku">${escapeHtml(item.sku || "")}</span></a></li>`,
          )
          .join("")}</ul>
      </section>`
    : "";
  const sources = sourceLinks(product);
  const sourceHtml = sources.length
    ? `<p class="source-line">Published source: ${sources
        .map((link) => `<a href="${escapeHtml(link.href)}" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`)
        .join(" · ")}</p>`
    : "";
  const synonymHtml = synonyms.length
    ? `<p class="synonyms"><span class="synonyms-label">Also called</span> ${synonyms.map((item) => escapeHtml(item)).join(", ")}</p>`
    : "";
  const pagePath = `products/${id}/`;
  const crumbs = breadcrumbs([
    { label: "Home", href: url("") },
    { label: familyText, href: url(`families/${family}/`) },
    { label: product.name },
  ]);
  return `<div class="wrap page-intro">
    ${crumbs}
    <article class="product" data-generated="amt-product" data-product-id="${escapeHtml(id)}">
    <div class="product-grid">
      ${figure}
      <div class="product-summary">
        <p class="kicker"><a href="${url(`families/${family}/`)}">${escapeHtml(familyText)}</a>${showSub ? ` <span class="subfamily">${escapeHtml(sub)}</span>` : ""}</p>
        <h1>${escapeHtml(product.name)}</h1>
        <p class="sku"><span class="sku-label">Catalogue number</span> <span class="sku-value">${escapeHtml(product.sku || "Not published")}</span></p>
        ${synonymHtml}
        ${renderPosition(match)}
        ${renderPacks(product)}
        ${sourceHtml}
      </div>
    </div>
    <section class="specs-section" aria-labelledby="specs-${escapeHtml(id)}">
      <h2 id="specs-${escapeHtml(id)}">Specifications</h2>
      <div class="table-scroll">
      <table class="specs">
        <caption>Values as published by AMT. Unpublished fields stay blank.</caption>
        <tbody>${specs}</tbody>
      </table>
      </div>
    </section>
    ${documents}
    ${relatedHtml}
    <script type="application/ld+json">${jsonLd(product, pagePath)}</script>
    <script type="module" src="${url("js/cart.js")}"></script>
    </article>
  </div>`;
}

async function removeStaleProducts(productsDir, ids) {
  let entries = [];
  try {
    entries = await readdir(productsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (ids.has(entry.name)) continue;
    const indexPath = path.join(productsDir, entry.name, "index.html");
    let html = "";
    try {
      html = await readFile(indexPath, "utf8");
    } catch {
      continue;
    }
    if (html.includes('data-generated="amt-product"')) {
      await rm(path.join(productsDir, entry.name), { recursive: true, force: true });
    }
  }
}

async function catalogueSourceLabel(outDir) {
  try {
    const parsed = JSON.parse(await readFile(path.join(outDir, "data", "products.json"), "utf8"));
    if (Array.isArray(parsed) && parsed.length > 0) return "data/products.json";
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  return "_build/fixtures/products.json";
}

export async function build(ctx) {
  const products = ctx.products;
  const site = ctx.site || {};
  const render = ctx.renderPage;
  const outDir = ctx.outDir;
  const write = ctx.writeFile;
  if (typeof render !== "function" || typeof write !== "function") {
    throw new Error("products build needs ctx.renderPage and ctx.writeFile");
  }
  const ranking = await loadRanking(path.resolve(outDir, "..", "ranking-on-price"));
  const summary = summariseMatches(products, ranking);
  const productsDir = path.join(outDir, "products");
  await mkdir(productsDir, { recursive: true });
  const ids = new Set();
  for (const product of products) {
    if (!product || !product.id || !product.name) {
      throw new Error("Each product needs an id and a name");
    }
    const id = safeId(product.id);
    ids.add(id);
    const match = matchProduct(product, ranking);
    const pagePath = `products/${id}/`;
    const description = `${product.name} (${product.sku || "catalogue"}). Concept redesign of an Advanced Molecular Technologies catalogue page.`;
    const html = render({
      title: `${product.name} · ${product.sku || "AMT"}`,
      description,
      path: pagePath,
      head: `<link rel="stylesheet" href="${url("css/product.css")}">`,
      body: renderProduct(product, products, match, site),
    });
    await write(`products/${id}/index.html`, html);
  }
  await removeStaleProducts(productsDir, ids);
  const markdown = renderPriceMatchMarkdown(summary, await catalogueSourceLabel(outDir));
  await fsWriteFile(path.join(productsDir, "price-match.md"), markdown);
}

async function runStandalone() {
  const outDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
  const { loadData } = await import("../lib/data.mjs");
  const layout = await import("../lib/layout.mjs");
  const { products, site } = await loadData(outDir);
  layout.configure({ site });
  await build({
    products,
    site,
    renderPage: layout.renderPage,
    outDir,
    writeFile: async (rel, html) => {
      const full = path.join(outDir, rel);
      await mkdir(path.dirname(full), { recursive: true });
      await fsWriteFile(full, html);
    },
  });
  console.log(`products: ${products.length} pages`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  runStandalone().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
