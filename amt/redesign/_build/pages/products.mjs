/**
 * Product pages: one products/<id>/index.html per catalogue row.
 * Loaded by the shell _build/build.mjs. HTML goes through ctx.writeFile.
 */
import { mkdir, readdir, readFile, rm, writeFile as fsWriteFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonical, url } from "../lib/paths.mjs";
import { breadcrumbs, priceBadge } from "../lib/ui.mjs";
import {
  absoluteUrl,
  casNumbers,
  escapeHtml,
  familyLabel,
  formatPerMg,
  isQuotedPack,
  loadRanking,
  matchProduct,
  packLabel,
  pricePositionCopy,
  pubchemFields,
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

function displayName(product) {
  return publishedText(product.name) || publishedText(product.sku) || String(product.id || "");
}

export function renderPubchem(product, id) {
  const fields = pubchemFields(product);
  if (!fields) return "";
  const rows = [];
  if (fields.formula) {
    rows.push(`<tr><th scope="row">Formula</th><td>${escapeHtml(fields.formula)} <span class="pubchem-tag">from PubChem</span></td></tr>`);
  }
  if (fields.mw) {
    rows.push(`<tr><th scope="row">Molecular weight</th><td>${escapeHtml(fields.mw)} <span class="pubchem-tag">from PubChem</span></td></tr>`);
  }
  const link = fields.href
    ? `<p><a href="${escapeHtml(fields.href)}" rel="noopener noreferrer">PubChem CID ${escapeHtml(fields.cid)}</a></p>`
    : "";
  const image = fields.image
    ? `<figure class="structure pubchem-structure">
        <img src="${escapeHtml(structureUrl({ structureImage: fields.image }) || fields.image)}" alt="Structure of ${escapeHtml(displayName(product))} from PubChem" width="480" height="360">
        <figcaption>Structure from PubChem${fields.cid ? `, CID ${escapeHtml(fields.cid)}` : ""}</figcaption>
      </figure>`
    : "";
  const table = rows.length
    ? `<div class="table-scroll"><table class="specs"><caption>Values from PubChem, not from the AMT catalogue.</caption><tbody>${rows.join("")}</tbody></table></div>`
    : "";
  return `<section class="pubchem" aria-labelledby="pubchem-${escapeHtml(id)}">
    <h2 id="pubchem-${escapeHtml(id)}">From PubChem</h2>
    <p class="fine">Not printed in the AMT catalogue.</p>
    ${table}
    ${image}
    ${link}
  </section>`;
}

function structureUrl(product) {
  const src = publishedText(product.structureImage);
  if (!src || src.includes("..")) return null;
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("/")) return src;
  return url(src);
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
    name: displayName(product),
    sku: product.sku,
    url: pageUrl,
    brand: { "@type": "Brand", name: "Advanced Molecular Technologies" },
  };
  if (product.family) data.category = familyLabel(product.family);
  const image = structureUrl(product);
  if (image) data.image = /^https?:\/\//i.test(image) ? image : `https://klopikkon.com${image.startsWith("/") ? image : `/${image}`}`;
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
    <p class="price-position-badge" aria-hidden="true">${priceBadge(position)}</p>
    <p class="price-position-line">${escapeHtml(copy.line)}</p>
    <p class="price-position-link"><a href="${escapeHtml(match.row.href)}">Price breakdown</a></p>
  </aside>`;
}

function publishedCas(product) {
  const cas = publishedText(product.cas);
  if (cas && casNumbers(cas).length) return cas;
  return "Not published";
}

function socialMeta(product, pagePath, site) {
  const name = displayName(product);
  const sku = product.sku || "Not published";
  const cas = publishedCas(product);
  const family = familyTitle(site, product.family || "other");
  const image = absoluteUrl(`og/${safeId(product.id)}.png`);
  const page = canonical(pagePath);
  const description = `SKU ${sku}. CAS ${cas}. ${family}.`;
  const alt = `${name}. SKU ${sku}. CAS ${cas}. ${family}.`;
  const tag = (property, content) => `<meta property="${property}" content="${escapeHtml(content)}">`;
  const nameTag = (key, content) => `<meta name="${key}" content="${escapeHtml(content)}">`;
  return [
    tag("og:type", "website"),
    tag("og:site_name", "Advanced Molecular Technologies"),
    tag("og:title", name),
    tag("og:description", description),
    tag("og:url", page),
    tag("og:image", image),
    tag("og:image:alt", alt),
    tag("og:image:width", "1200"),
    tag("og:image:height", "630"),
    nameTag("twitter:card", "summary_large_image"),
    nameTag("twitter:title", name),
    nameTag("twitter:description", description),
    nameTag("twitter:image", image),
    nameTag("twitter:image:alt", alt),
  ].join("\n");
}

function renderPackCompare(product) {
  const rows = packsOf(product)
    .map((pack) => {
      const per = formatPerMg(pack);
      if (!per) return "";
      const size = publishedText(pack.size) || "Pack";
      return `<tr><th scope="row">${escapeHtml(size)}</th><td>${escapeHtml(packLabel(pack))}</td><td>${escapeHtml(per)}</td></tr>`;
    })
    .filter(Boolean);
  if (!rows.length) return "";
  return `<section class="pack-compare" aria-labelledby="compare-${escapeHtml(safeId(product.id))}">
    <h2 id="compare-${escapeHtml(safeId(product.id))}">Price per mg</h2>
    <p class="fine">Each figure is that pack’s published price divided by its published mass. Packs without a published price, or without a mass, are left out.</p>
    <div class="table-scroll">
      <table>
        <caption>Published price per milligram</caption>
        <thead><tr><th scope="col">Pack</th><th scope="col">Published price</th><th scope="col">Per mg</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>
  </section>`;
}

function renderPacks(product) {
  const packs = packsOf(product);
  if (!packs.length) {
    return `<p class="pack-missing">Pack sizes are not published for this catalogue row.</p>`;
  }
  const quoteOnly = packs.every((pack) => isQuotedPack(pack));
  const quoteNote = quoteOnly
    ? `<p class="pack-quote-only">No price is published for this item. Choose a pack and add it to the quote list. The email asks AMT to price it. Nothing is sent until you send that email.</p>`
    : "";
  const options = packs
    .map((pack, index) => {
      const size = publishedText(pack.size) || "Pack";
      const id = `${safeId(product.id)}-pack-${index}`;
      return `<label class="pack-option" for="${escapeHtml(id)}">
        <input type="radio" name="pack" id="${escapeHtml(id)}" value="${escapeHtml(size)}"${index === 0 ? " checked" : ""}>
        <span class="pack-size">${escapeHtml(size)}</span>
        <span class="pack-price"${isQuotedPack(pack) ? ` aria-label="Quote, price not published"` : ""}>${isQuotedPack(pack) ? "Quote" : escapeHtml(packLabel(pack))}</span>
      </label>`;
    })
    .join("");
  return `${quoteNote}<form class="pack-form" data-quote-form data-id="${escapeHtml(product.id)}" data-sku="${escapeHtml(product.sku || "")}" data-name="${escapeHtml(product.name || "")}">
    <fieldset>
      <legend>Pack size</legend>
      <div class="pack-options">${options}</div>
    </fieldset>
    <button class="btn btn-primary" type="submit">Add to quote</button>
    <p class="quote-status" data-quote-status role="status" aria-live="polite"></p>
  </form>
  ${renderPackCompare(product)}`;
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
        <img src="${escapeHtml(image)}" alt="Structure of ${escapeHtml(displayName(product))} published by Advanced Molecular Technologies" width="480" height="360">
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
              `<li><a href="${url(`products/${safeId(item.id)}/`)}"><span class="related-name">${escapeHtml(displayName(item))}</span> <span class="related-sku">${escapeHtml(item.sku || "")}</span></a></li>`,
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
    { label: displayName(product) },
  ]);
  return `<div class="wrap page-intro">
    ${crumbs}
    <article class="product" data-generated="amt-product" data-product-id="${escapeHtml(id)}">
    <div class="product-grid">
      ${figure}
      <div class="product-summary">
        <p class="kicker"><a href="${url(`families/${family}/`)}">${escapeHtml(familyText)}</a>${showSub ? ` <span class="subfamily">${escapeHtml(sub)}</span>` : ""}</p>
        <h1>${escapeHtml(displayName(product))}</h1>
        ${publishedText(product.name) ? "" : `<p class="name-missing">AMT has not published a name for this catalogue number.</p>`}
        <p class="sku"><span class="sku-label">Catalogue number</span> <span class="sku-value">${escapeHtml(product.sku || "Not published")}</span>${
          product.sku
            ? ` <button type="button" class="btn btn-secondary copy-cas" data-copy="${escapeHtml(product.sku)}" aria-label="Copy catalogue number ${escapeHtml(product.sku)}">Copy</button>`
            : ""
        }</p>
        <p class="product-actions">
          <button type="button" class="btn btn-secondary" data-copy="${escapeHtml(canonical(pagePath))}" data-share>Copy link</button>
          <button type="button" class="btn btn-secondary" data-print-spec>Print spec sheet</button>
          <a class="btn btn-secondary" href="${url(`families/${family}/compare/?ids=${encodeURIComponent(id)}`)}">Compare in ${escapeHtml(familyText)}</a>
        </p>
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
    ${renderPubchem(product, id)}
    ${documents}
    ${relatedHtml}
    <section class="recent" data-recent hidden>
      <h2>Recently viewed</h2>
      <ul data-recent-list></ul>
    </section>
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
    if (!product || !product.id || !displayName(product)) {
      throw new Error("Each product needs an id and a name or catalogue number");
    }
    const id = safeId(product.id);
    ids.add(id);
    const match = matchProduct(product, ranking);
    const pagePath = `products/${id}/`;
    const description = `${displayName(product)} (${product.sku || "catalogue"}). Concept redesign of an Advanced Molecular Technologies catalogue page.`;
    const html = render({
      title: publishedText(product.name) ? `${product.name} · ${product.sku || "AMT"}` : displayName(product),
      description,
      path: pagePath,
      head: `${socialMeta(product, pagePath, site)}\n<link rel="stylesheet" href="${url("css/product.css")}">`,
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
