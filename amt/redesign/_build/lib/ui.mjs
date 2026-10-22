import { esc, rich } from "./html.mjs";
import { url } from "./paths.mjs";

/** Decorative lattice. Not a catalogue structure. */
export function motif(id = "lattice") {
  return `<div class="hero-motif" aria-hidden="true">
    <svg viewBox="0 0 720 320" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="${esc(id)}" width="36" height="62.35" patternUnits="userSpaceOnUse">
          <path d="M18 1.5 L34 11 L34 30 L18 39.5 L2 30 L2 11 Z" fill="none" stroke="currentColor" stroke-width="0.7"/>
        </pattern>
      </defs>
      <rect width="720" height="320" fill="url(#${esc(id)})"/>
      <g class="motif-molecule" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M470 78 H530 L575 48 H650"/>
        <path d="M530 78 L555 118 H620"/>
        <path d="M575 48 L600 88"/>
        <circle cx="470" cy="78" r="5" fill="currentColor" stroke="none"/>
        <circle cx="530" cy="78" r="4" fill="currentColor" stroke="none"/>
        <circle cx="575" cy="48" r="4" fill="currentColor" stroke="none"/>
        <circle cx="650" cy="48" r="5" fill="currentColor" stroke="none"/>
        <circle cx="555" cy="118" r="4" fill="currentColor" stroke="none"/>
        <circle cx="620" cy="118" r="5" fill="currentColor" stroke="none"/>
        <circle cx="600" cy="88" r="3.5" fill="currentColor" stroke="none"/>
      </g>
    </svg>
  </div>`;
}

export function breadcrumbs(items) {
  const parts = items.map((item, index) => {
    const last = index === items.length - 1;
    if (last || !item.href) {
      return `<li${last ? ' aria-current="page"' : ""}>${esc(item.label)}</li>`;
    }
    return `<li><a href="${esc(item.href)}">${esc(item.label)}</a></li>`;
  });
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${parts.join("")}</ol></nav>`;
}

export function priceBadge(position) {
  const map = {
    green: ["badge badge-green", "Price: lower"],
    amber: ["badge badge-amber", "Price: split"],
    red: ["badge badge-red", "Price: higher"],
  };
  const entry = map[position];
  if (!entry) return `<span class="badge">${esc(position)}</span>`;
  return `<span class="${entry[0]}">${entry[1]}</span>`;
}

function packItems(packs) {
  if (!Array.isArray(packs) || packs.length === 0) {
    return `<li><span>Pack</span> <span>quote</span></li>`;
  }
  return packs
    .map((pack) => {
      const size = pack.size ? esc(pack.size) : "Pack";
      const price = pack.priceText || (pack.price == null ? "quote" : String(pack.price));
      return `<li><span>${size}</span> <span>${esc(price)}</span></li>`;
    })
    .join("");
}

export function featuredCard(item) {
  const query = url(`catalogue/?q=${encodeURIComponent(item.sku || item.name || "")}`);
  const familyHref = item.familyPath ? url(item.familyPath) : "";
  const family = item.familyLabel
    ? familyHref
      ? `<p class="kicker"><a href="${familyHref}">${esc(item.familyLabel)}</a></p>`
      : `<p class="kicker">${esc(item.familyLabel)}</p>`
    : "";
  const note = item.note ? `<p><span class="badge">${esc(item.note)}</span></p>` : "";
  const image = item.image
    ? `<img class="structure" src="${url(item.image.src)}" width="${item.image.w}" height="${item.image.h}" alt="" style="--photo-w:${Math.floor(item.image.w / 1.5)}px" loading="lazy" decoding="async">`
    : "";
  return `<article class="card product-card">
    ${family}
    ${image}
    <h3><a href="${query}">${esc(item.name)}</a></h3>
    <p class="sku">${esc(item.sku || "")}</p>
    ${note}
    <ul class="pack-list">${packItems(item.packs)}</ul>
  </article>`;
}

export function productTable(products, caption, options = {}) {
  const rows = Array.isArray(products) ? products : [];
  const showCas = rows.some((row) => row.cas);
  const showPurity = rows.some((row) => row.purity);
  const showSub = !options.hideSubfamily && rows.some((row) => row.subfamily);
  const head = [
    "<th scope=\"col\">Name</th>",
    "<th scope=\"col\">Catalogue number</th>",
    showCas ? "<th scope=\"col\">CAS</th>" : "",
    showPurity ? "<th scope=\"col\">Purity</th>" : "",
    showSub ? "<th scope=\"col\">Note</th>" : "",
    "<th scope=\"col\">Packs</th>",
  ].filter(Boolean);
  const body = rows
    .map((product) => {
      const id = product.id || product.sku || "";
      const href = id ? url(`products/${encodeURIComponent(id)}/`) : url("catalogue/");
      const cells = [
        `<th scope="row"><a href="${href}">${esc(product.name || "")}</a></th>`,
        `<td class="sku">${esc(product.sku || "")}</td>`,
        showCas ? `<td>${esc(product.cas || "")}</td>` : "",
        showPurity ? `<td>${esc(product.purity || "")}</td>` : "",
        showSub ? `<td>${esc(product.subfamily || "")}</td>` : "",
        `<td><ul class="pack-list">${packItems(product.packs)}</ul></td>`,
      ].filter((cell) => cell !== "");
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("\n");
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="${esc(caption)}">
    <table>
      <caption>${esc(caption)}</caption>
      <thead><tr>${head.join("")}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

export function familyCatalogueLink(familyId) {
  const href = url(`catalogue/?family=${encodeURIComponent(familyId)}`);
  return `<p><a class="btn btn-secondary" href="${href}">Search and filter this family</a></p>`;
}

export function sourceLine(label, href) {
  return `<p class="source-line">Published text from <a href="${esc(href)}" rel="noopener noreferrer">${rich(label)}</a>.</p>`;
}
