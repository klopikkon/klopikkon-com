/**
 * Per-family compare view: pick up to four catalogue rows and read
 * published specs and prices side by side. PubChem extras stay labelled
 * as PubChem and are omitted when the row does not carry them.
 */
import { url } from "../lib/paths.mjs";
import { breadcrumbs } from "../lib/ui.mjs";
import { escapeHtml, familyLabel, packLabel, pubchemFields, publishedText } from "../product-support.mjs";

function safeFamily(id) {
  const text = String(id || "");
  if (!text || text.includes("..") || /[\\/]/.test(text)) {
    throw new Error(`Unsafe family id: ${id}`);
  }
  return text;
}

function displayName(product) {
  return publishedText(product.name) || publishedText(product.sku) || String(product.id || "");
}

function publishedCas(product) {
  const cas = publishedText(product.cas);
  if (!cas) return null;
  if (!/\d{2,7}-\d{2}-\d/.test(cas)) return null;
  return cas;
}

export function compareRecord(product) {
  const pubchem = pubchemFields(product);
  return {
    id: product.id,
    sku: product.sku || "",
    name: publishedText(product.name),
    label: displayName(product),
    cas: publishedCas(product),
    formula: publishedText(product.formula),
    mw: product.mw == null || product.mw === "" ? null : String(product.mw),
    purity: publishedText(product.purity),
    packs: (Array.isArray(product.packs) ? product.packs : []).map((pack) => ({
      size: publishedText(pack.size) || "Pack",
      label: packLabel(pack),
    })),
    pubchem: pubchem
      ? {
          formula: pubchem.formula,
          mw: pubchem.mw,
          image: pubchem.image,
          cid: pubchem.cid,
          href: pubchem.href,
        }
      : null,
  };
}

function familyTitle(site, familyId) {
  const rows = Array.isArray(site?.families) ? site.families : [];
  const match = rows.find((item) => item && item.id === familyId);
  return publishedText(match?.title) || (familyId === "other" ? "Other catalogues" : familyLabel(familyId));
}

export async function build(ctx) {
  const products = ctx.products || [];
  const site = ctx.site || {};
  const render = ctx.renderPage;
  const write = ctx.writeFile;
  if (typeof render !== "function" || typeof write !== "function") {
    throw new Error("family compare build needs ctx.renderPage and ctx.writeFile");
  }
  const ids = [...new Set(products.map((product) => product && product.family).filter(Boolean))];
  for (const familyId of ids) {
    const family = safeFamily(familyId);
    const title = familyTitle(site, family);
    const rows = products.filter((product) => product && product.family === family && product.id);
    const payload = JSON.stringify(rows.map(compareRecord)).replace(/</g, "\\u003c");
    const pathName = `families/${family}/compare/`;
    const body = `<div class="wrap page-intro">
      ${breadcrumbs([
        { label: "Home", href: url("") },
        { label: title, href: url(`families/${family}/`) },
        { label: "Compare" },
      ])}
      <article class="family-compare" data-family-compare data-family="${escapeHtml(family)}">
        <h1>Compare ${escapeHtml(title)}</h1>
        <p class="lede">Select up to 4 products. The table shows specifications and pack prices as published by AMT. A blank cell is a value AMT did not publish.</p>
        <div class="compare-layout">
          <form class="compare-picker" data-compare-picker>
            <div class="field">
              <label for="compare-filter-${escapeHtml(family)}">Find a product</label>
              <input id="compare-filter-${escapeHtml(family)}" type="search" data-compare-filter placeholder="Name, catalogue number, or CAS" autocomplete="off">
            </div>
            <fieldset>
              <legend>Products <span data-compare-count>0 of 4</span></legend>
              <ul class="compare-choices" data-compare-choices></ul>
            </fieldset>
            <p class="compare-limit" data-compare-limit role="status"></p>
          </form>
          <div class="compare-result">
            <p class="compare-empty" data-compare-empty>Select at least one product to compare.</p>
            <div class="table-scroll" data-compare-table hidden></div>
          </div>
        </div>
        <script type="application/json" id="family-compare-data">${payload}</script>
        <script type="module" src="${url("js/family-compare.js")}"></script>
      </article>
    </div>`;
    const html = render({
      title: `Compare ${title}`,
      description: `Compare up to four ${title} products from the Advanced Molecular Technologies catalogue. Prices and specifications are the published values.`,
      path: pathName,
      head: `<link rel="stylesheet" href="${url("css/family-compare.css")}">`,
      body,
    });
    await write(`families/${family}/compare/index.html`, html);
  }
}
