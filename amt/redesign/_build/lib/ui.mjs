import { esc, rich } from "./html.mjs";
import { url } from "./paths.mjs";

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
  return `<article class="card product-card">
    ${family}
    <h3><a href="${query}">${esc(item.name)}</a></h3>
    <p class="sku">${esc(item.sku || "")}</p>
    ${note}
    <ul class="pack-list">${packItems(item.packs)}</ul>
  </article>`;
}

export function productTable(products, caption) {
  const rows = Array.isArray(products) ? products : [];
  const showCas = rows.some((row) => row.cas);
  const showPurity = rows.some((row) => row.purity);
  const showSub = rows.some((row) => row.subfamily);
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

export function familyCatalogueLink(familyId, label) {
  const href = url(`catalogue/?family=${encodeURIComponent(familyId)}`);
  return `<p><a class="btn btn-secondary" href="${href}">${esc(label)}</a></p>`;
}

export function sourceLine(label, href) {
  return `<p class="source-line">Published text from <a href="${esc(href)}" rel="noopener noreferrer">${rich(label)}</a>.</p>`;
}
