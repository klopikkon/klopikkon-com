/**
 * Product pages: one products/<id>/index.html per catalogue row.
 * Loaded by the shell _build/build.mjs. HTML goes through ctx.writeFile.
 */
import { readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile as fsWriteFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { canonical, url } from "../lib/paths.mjs";
import { breadcrumbs, priceBadge } from "../lib/ui.mjs";
import {
  absoluteUrl,
  casNumbers,
  escapeHtml,
  familyLabel,
  formatPerMg,
  isQuotedPack,
  loadIdentifierCache,
  loadRanking,
  matchProduct,
  documentEntries,
  packLabel,
  priceConflictView,
  pricePositionCopy,
  pubchemFields,
  publishedAmtTechnical,
  publishedText,
  renderPriceMatchMarkdown,
  summariseMatches,
  technicalIdentifiers,
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

function sourceRow(label, value, tag, tagClass) {
  return `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)} <span class="${tagClass}">${escapeHtml(tag)}</span></td></tr>`;
}

function renderIdentifier(label, value, ariaLabel, buttonLabel) {
  return `<div class="identifier">
    <h3>${escapeHtml(label)} <span class="pubchem-tag">from PubChem</span></h3>
    <p class="identifier-value">${escapeHtml(value)}</p>
    <button type="button" class="btn btn-secondary copy-identifier" data-copy="${escapeHtml(value)}" aria-label="${escapeHtml(ariaLabel)}">${escapeHtml(buttonLabel)}</button>
  </div>`;
}

function renderTechnical(product, id, cache) {
  const amt = publishedAmtTechnical(product);
  const fields = pubchemFields(product);
  const ids = technicalIdentifiers(product, cache);
  const showPubchem = Boolean(fields && (fields.formula || fields.mw || fields.image || ids.smiles || ids.inchiKey));
  if (!amt && !showPubchem) return "";
  const amtRows = [];
  if (amt?.formula) amtRows.push(sourceRow("Formula", amt.formula, "Published by AMT", "source-tag"));
  if (amt?.mw) amtRows.push(sourceRow("Molecular weight", amt.mw, "Published by AMT", "source-tag"));
  const amtImage = amt?.image
    ? `<figure class="structure">
        ${structureImg(structureUrl(product), `Structure of ${displayName(product)} published by Advanced Molecular Technologies`)}
        <figcaption>Structure published by AMT</figcaption>
      </figure>`
    : "";
  const amtBlock =
    amtRows.length || amtImage
      ? `<div class="technical-amt">
          <h3>Published by AMT</h3>
          ${
            amtRows.length
              ? `<div class="table-scroll"><table class="specs"><caption>Values published by AMT.</caption><tbody>${amtRows.join("")}</tbody></table></div>`
              : ""
          }
          ${amtImage}
        </div>`
      : "";
  const pubRows = [];
  if (fields?.formula) pubRows.push(sourceRow("Formula", fields.formula, "from PubChem", "pubchem-tag"));
  if (fields?.mw) pubRows.push(sourceRow("Molecular weight", fields.mw, "from PubChem", "pubchem-tag"));
  const pubImage = fields?.image
    ? `<figure class="structure pubchem-structure">
        ${structureImg(structureUrl({ structureImage: fields.image }) || fields.image, `Structure of ${displayName(product)} from PubChem`)}
        <figcaption>Structure from PubChem${fields.cid ? `, CID ${escapeHtml(fields.cid)}` : ""}</figcaption>
      </figure>`
    : "";
  const identifiers = [
    ids.smiles ? renderIdentifier("SMILES", ids.smiles, "Copy SMILES from PubChem", "Copy SMILES") : "",
    ids.inchiKey ? renderIdentifier("InChIKey", ids.inchiKey, "Copy InChIKey from PubChem", "Copy InChIKey") : "",
  ].join("");
  const link = fields?.href
    ? `<p><a href="${escapeHtml(fields.href)}" rel="noopener noreferrer">PubChem CID ${escapeHtml(fields.cid)}</a></p>`
    : "";
  const pubBlock = showPubchem
    ? `<div class="technical-pubchem">
        <h3>From PubChem</h3>
        <p class="fine">Not printed in the AMT catalogue.</p>
        ${
          pubRows.length
            ? `<div class="table-scroll"><table class="specs"><caption>Values from PubChem, not from the AMT catalogue.</caption><tbody>${pubRows.join("")}</tbody></table></div>`
            : ""
        }
        ${pubImage}
        ${identifiers}
        ${link}
      </div>`
    : "";
  return `<section class="technical" data-technical aria-labelledby="technical-${escapeHtml(id)}">
    <h2 id="technical-${escapeHtml(id)}">Technical</h2>
    ${amtBlock}
    ${pubBlock}
  </section>`;
}

function renderSpecs(product, id) {
  const specs = specRows(product)
    .map((row) => {
      const value = row.value ? escapeHtml(row.value) : "Not published";
      const copy = row.copy
        ? ` <button type="button" class="btn btn-secondary copy-cas" data-copy="${escapeHtml(row.copy)}" aria-label="Copy CAS ${escapeHtml(row.copy)}">Copy</button>`
        : "";
      return `<tr><th scope="row">${escapeHtml(row.key)}</th><td>${value}${copy}</td></tr>`;
    })
    .join("");
  return `<section class="specs-section" aria-labelledby="specs-${escapeHtml(id)}">
      <h2 id="specs-${escapeHtml(id)}">Specifications</h2>
      <div class="table-scroll">
      <table class="specs">
        <caption>Values as published by AMT. Unpublished fields stay blank.</caption>
        <tbody>${specs}</tbody>
      </table>
      </div>
    </section>`;
}

function renderDetails(product, id, cache) {
  const specs = renderSpecs(product, id);
  const technical = renderTechnical(product, id, cache);
  if (!technical) return specs;
  return `<div class="detail-tabs" data-detail-tabs>
    <div class="detail-tablist" role="tablist" aria-label="Product details">
      <button type="button" role="tab" id="specs-tab-${escapeHtml(id)}" aria-controls="specs-panel-${escapeHtml(id)}" aria-selected="true">Specifications</button>
      <button type="button" role="tab" id="tech-tab-${escapeHtml(id)}" aria-controls="tech-panel-${escapeHtml(id)}" aria-selected="false" tabindex="-1">Technical</button>
    </div>
    <div role="tabpanel" id="specs-panel-${escapeHtml(id)}" aria-labelledby="specs-tab-${escapeHtml(id)}">
      ${specs}
    </div>
    <div role="tabpanel" id="tech-panel-${escapeHtml(id)}" aria-labelledby="tech-tab-${escapeHtml(id)}">
      ${technical}
    </div>
  </div>`;
}

function structureUrl(product) {
  const src = publishedText(product.structureImage);
  if (!src || src.includes("..")) return null;
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("/")) return src;
  return url(src);
}

const redesignRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function structureSize(src) {
  if (!src || /^https?:\/\//i.test(src)) return null;
  let rel = String(src).split("?")[0].split("#")[0];
  if (rel.startsWith("/amt/redesign/")) rel = rel.slice("/amt/redesign/".length);
  else if (rel.startsWith("/")) return null;
  if (!rel || rel.includes("..")) return null;
  let buf;
  try {
    buf = readFileSync(path.join(redesignRoot, rel));
  } catch {
    return null;
  }
  if (buf.length >= 24 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (width > 0 && height > 0) return { width, height };
  }
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF") {
    const width = buf.readUInt16LE(6);
    const height = buf.readUInt16LE(8);
    if (width > 0 && height > 0) return { width, height };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length - 8) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const length = buf.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        if (width > 0 && height > 0) return { width, height };
      }
      offset += 2 + length;
    }
  }
  const tag = buf.subarray(0, 500).toString("utf8").match(/<svg\b[^>]*>/i)?.[0];
  if (!tag) return null;
  const attr = (name) => {
    const match = tag.match(new RegExp(`\\b${name}="([\\d.]+)"`));
    const value = match ? Math.round(Number(match[1])) : 0;
    return value > 0 ? value : null;
  };
  const width = attr("width");
  const height = attr("height");
  if (width && height) return { width, height };
  const box = tag.match(/viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/);
  if (!box) return null;
  const boxWidth = Math.round(Number(box[1]));
  const boxHeight = Math.round(Number(box[2]));
  if (boxWidth > 0 && boxHeight > 0) return { width: boxWidth, height: boxHeight };
  return null;
}

function structureImg(src, alt) {
  const size = structureSize(src);
  const safeSrc = escapeHtml(src);
  const responsive = size
    ? ` srcset="${safeSrc} 1x" width="${size.width}" height="${size.height}"`
    : "";
  return `<img src="${safeSrc}"${responsive} alt="${escapeHtml(alt)}">`;
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

function renderDocuments(product, id) {
  const docs = documentEntries(product);
  if (!docs.length) return "";
  return `<section class="documents" aria-labelledby="docs-${escapeHtml(id)}">
        <h2 id="docs-${escapeHtml(id)}">Documents</h2>
        <ul>${docs
          .map(
            (doc) =>
              `<li><a href="${escapeHtml(doc.href)}" rel="noopener noreferrer">${escapeHtml(doc.label)}</a></li>`,
          )
          .join("")}</ul>
      </section>`;
}

function renderPriceConflict(product) {
  const view = priceConflictView(product);
  if (!view) return "";
  const list = (title, rows) => {
    if (!rows.length) return "";
    return `<div class="price-conflict-set"><h3>${escapeHtml(title)}</h3><ul>${rows
      .map((row) => `<li><span class="price-conflict-size">${escapeHtml(row.size)}</span> <span class="price-conflict-price">${escapeHtml(row.price)}</span></li>`)
      .join("")}</ul></div>`;
  };
  return `<aside class="price-conflict" role="note">
    <p>${escapeHtml(view.note)}</p>
    ${list("Catalogue", view.catalogue)}
    ${list("Website", view.website)}
  </aside>`;
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
  return `${quoteNote}${renderPriceConflict(product)}<form class="pack-form" data-quote-form data-id="${escapeHtml(product.id)}" data-sku="${escapeHtml(product.sku || "")}" data-name="${escapeHtml(product.name || "")}">
    <fieldset>
      <legend>Pack size</legend>
      <div class="pack-options">${options}</div>
    </fieldset>
    <button class="btn btn-primary" type="submit">Add to quote</button>
    <p class="quote-status" data-quote-status role="status" aria-live="polite"></p>
  </form>
  ${renderPackCompare(product)}`;
}

function renderProduct(product, all, match, site, cache) {
  const id = safeId(product.id);
  const family = product.family || "other";
  const familyText = familyTitle(site, family);
  const sub = publishedText(product.subfamily);
  const showSub = sub && sub.toLowerCase() !== familyText.toLowerCase();
  const synonyms = synonymsOf(product);
  const image = structureUrl(product);
  const figure = image
    ? `<figure class="structure">
        ${structureImg(image, `Structure of ${displayName(product)} published by Advanced Molecular Technologies`)}
      </figure>`
    : `<figure class="structure structure-placeholder">
        <svg viewBox="0 0 160 100" aria-hidden="true" focusable="false">
          <rect x="8" y="8" width="144" height="84" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4"></rect>
        </svg>
        <figcaption>No structure image published by AMT</figcaption>
      </figure>`;
  const documents = renderDocuments(product, id);
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
    ${renderDetails(product, id, cache)}
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
  const identifiers = await loadIdentifierCache(new URL("../pubchem-identifiers.json", import.meta.url));
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
      body: renderProduct(product, products, match, site, identifiers),
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
