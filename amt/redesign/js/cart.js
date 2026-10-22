/**
 * Quote cart. Stored in localStorage under amt-quote-cart.
 * Listens for CustomEvent amt:add-to-quote {id, sku, pack}.
 * Optional name on the detail is kept for the label; the catalogue event
 * does not need it. Nothing is posted to a server.
 */

export const CART_KEY = "amt-quote-cart";
export const RECENT_KEY = "amt-recent-products";
const QUOTE_PATH = "/amt/redesign/quote/";

export function emptyCart() {
  return { lines: [] };
}

export function normaliseCart(value) {
  const lines = Array.isArray(value?.lines) ? value.lines : [];
  return {
    lines: lines
      .filter((line) => line && line.id && line.pack)
      .map((line) => ({
        id: String(line.id),
        sku: String(line.sku || ""),
        pack: String(line.pack),
        name: String(line.name || ""),
        qty: Math.max(1, Math.round(Number(line.qty) || 1)),
      })),
  };
}

export function addLine(cart, detail) {
  const next = normaliseCart(cart);
  const id = String(detail?.id || "");
  const pack = String(detail?.pack || "");
  if (!id || !pack) return next;
  const sku = String(detail.sku || "");
  const name = String(detail.name || "");
  const found = next.lines.find((line) => line.id === id && line.pack === pack);
  if (found) {
    found.qty += 1;
    if (name && !found.name) found.name = name;
    if (sku && !found.sku) found.sku = sku;
  } else {
    next.lines.push({ id, sku, pack, name, qty: 1 });
  }
  return next;
}

export function setQty(cart, id, pack, qty) {
  const next = normaliseCart(cart);
  const line = next.lines.find((item) => item.id === id && item.pack === pack);
  if (!line) return next;
  const amount = Math.round(Number(qty));
  if (!Number.isFinite(amount) || amount < 1) {
    next.lines = next.lines.filter((item) => item !== line);
  } else {
    line.qty = amount;
  }
  return next;
}

export function removeLine(cart, id, pack) {
  const next = normaliseCart(cart);
  next.lines = next.lines.filter((line) => !(line.id === id && line.pack === pack));
  return next;
}

export function totalQty(cart) {
  return normaliseCart(cart).lines.reduce((sum, line) => sum + line.qty, 0);
}

export function readCatalog(root) {
  const node = root?.querySelector?.("#amt-quote-catalog");
  if (!node) return [];
  try {
    const parsed = JSON.parse(node.textContent || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function lookupItem(catalog, line) {
  return catalog.find((item) => item.id === line.id) || catalog.find((item) => item.sku && item.sku === line.sku) || null;
}

export function lineLabel(line, catalog) {
  if (line.name) return line.name;
  const item = lookupItem(catalog, line);
  return item?.name || line.sku || line.id;
}

export function linePrice(line, catalog) {
  const item = lookupItem(catalog, line);
  const pack = item?.packs?.find((entry) => entry.size === line.pack);
  return pack?.label || "";
}

export function buildMailto({ email, cart, fields, catalog }) {
  const lines = normaliseCart(cart).lines;
  const chunks = ["Quote request", ""];
  const name = String(fields?.name || "").trim();
  const organisation = String(fields?.organisation || "").trim();
  const notes = String(fields?.notes || "").trim();
  if (name) chunks.push(`Name: ${name}`);
  if (organisation) chunks.push(`Organisation: ${organisation}`);
  if (notes) chunks.push(`Notes: ${notes}`);
  if (name || organisation || notes) chunks.push("");
  chunks.push("Items:");
  if (!lines.length) {
    chunks.push("(none)");
  } else {
    lines.forEach((line, index) => {
      const label = lineLabel(line, catalog);
      const price = linePrice(line, catalog);
      const priceBit = price ? ` | ${price}` : "";
      chunks.push(`${index + 1}. ${label} | ${line.sku || "SKU not published"} | ${line.pack}${priceBit} | qty ${line.qty}`);
    });
  }
  chunks.push("");
  chunks.push("Composed in the browser from the AMT concept redesign. Nothing was sent until this email is sent from the mail app.");
  const subject = "AMT quote request";
  const body = chunks.join("\n");
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const isBrowser = typeof document !== "undefined" && typeof window !== "undefined";

function readCart() {
  try {
    return normaliseCart(JSON.parse(localStorage.getItem(CART_KEY) || "null"));
  } catch {
    return emptyCart();
  }
}

function writeCart(cart) {
  const next = normaliseCart(cart);
  localStorage.setItem(CART_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("amt:quote-changed", { detail: next }));
  return next;
}

if (isBrowser) {
const AmtQuoteCount = class extends HTMLElement {
  constructor() {
    super();
    this._onChange = () => this.render();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: inline-flex; font: inherit; color: inherit; }
        a {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          min-height: 44px;
          color: inherit;
          text-decoration: none;
          font: inherit;
        }
        a:focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }
        .badge {
          display: none;
          min-width: 1.25rem;
          padding: 0.05rem 0.4rem;
          border-radius: 999px;
          background: #0f6e56;
          color: #ffffff;
          font-size: 0.75rem;
          line-height: 1.4;
          text-align: center;
        }
        .badge[data-show="true"] { display: inline-block; }
      </style>
      <a href="${QUOTE_PATH}">Quote <span class="badge"></span></a>
    `;
  }

  connectedCallback() {
    this.render();
    window.addEventListener("amt:quote-changed", this._onChange);
    window.addEventListener("storage", this._onChange);
  }

  disconnectedCallback() {
    window.removeEventListener("amt:quote-changed", this._onChange);
    window.removeEventListener("storage", this._onChange);
  }

  render() {
    const count = totalQty(readCart());
    const badge = this.shadowRoot.querySelector(".badge");
    const link = this.shadowRoot.querySelector("a");
    badge.textContent = String(count);
    badge.dataset.show = count > 0 ? "true" : "false";
    link.setAttribute("aria-label", count === 1 ? "Quote, 1 item" : `Quote, ${count} items`);
  }
}

function ensureCount() {
  if (document.querySelector("amt-quote-count")) return;
  const el = document.createElement("amt-quote-count");
  const utility = document.querySelector("header .utility");
  const toggle = utility?.querySelector("[data-theme-toggle]");
  if (utility && toggle) {
    utility.insertBefore(el, toggle);
    return;
  }
  const host = document.querySelector("header nav") || document.querySelector("header");
  if (!host) return;
  host.appendChild(el);
}

function statusNode(scope) {
  return scope?.querySelector("[data-quote-status]") || null;
}

function renderQuotePage() {
  const page = document.querySelector("[data-quote-page]");
  if (!page) return;
  const catalog = readCatalog(document);
  const cart = readCart();
  const list = page.querySelector("[data-quote-lines]");
  const empty = page.querySelector("[data-quote-empty]");
  list.replaceChildren();
  empty.hidden = cart.lines.length > 0;
  for (const line of cart.lines) {
    const item = document.createElement("li");
    item.className = "quote-line";
    const title = document.createElement("p");
    title.className = "quote-line-title";
    const link = document.createElement("a");
    link.href = `/amt/redesign/products/${encodeURIComponent(line.id)}/`;
    link.textContent = lineLabel(line, catalog);
    title.append(link);
    const meta = document.createElement("p");
    meta.className = "quote-line-meta";
    const price = linePrice(line, catalog);
    meta.textContent = [line.sku, line.pack, price].filter(Boolean).join(" · ");
    const qtyLabel = document.createElement("label");
    qtyLabel.className = "quote-qty";
    const qtyText = document.createElement("span");
    qtyText.textContent = "Qty";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.step = "1";
    input.value = String(line.qty);
    input.setAttribute("aria-label", `Quantity for ${lineLabel(line, catalog)} ${line.pack}`);
    input.addEventListener("change", () => {
      writeCart(setQty(readCart(), line.id, line.pack, input.value));
      renderQuotePage();
    });
    qtyLabel.append(qtyText, input);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-secondary";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      writeCart(removeLine(readCart(), line.id, line.pack));
      renderQuotePage();
    });
    item.append(title, meta, qtyLabel, remove);
    list.append(item);
  }
  updateMailto(page, catalog);
}

function fieldValues(page) {
  const form = page.querySelector("[data-quote-details]");
  if (!form) return {};
  const data = new FormData(form);
  return {
    name: String(data.get("name") || ""),
    organisation: String(data.get("organisation") || ""),
    notes: String(data.get("notes") || ""),
  };
}

function updateMailto(page, catalog) {
  const link = page.querySelector("[data-quote-mailto]");
  if (!link) return;
  const email = page.getAttribute("data-email") || "";
  const cart = readCart();
  link.href = buildMailto({ email, cart, fields: fieldValues(page), catalog: catalog || readCatalog(document) });
  const disabled = cart.lines.length === 0;
  link.setAttribute("aria-disabled", disabled ? "true" : "false");
  link.tabIndex = disabled ? -1 : 0;
}

function onAdd(event) {
  const detail = event.detail || {};
  if (!detail.id || !detail.pack) return;
  writeCart(addLine(readCart(), detail));
  let form = null;
  try {
    form = document.querySelector(`[data-quote-form][data-id="${CSS.escape(String(detail.id))}"]`);
  } catch {
    form = null;
  }
  const status = statusNode(form || document);
  if (status) {
    const name = detail.name || detail.sku || detail.id;
    status.textContent = `Added ${detail.pack} of ${name} to the quote list.`;
  }
}

function readRecent() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.name) : [];
  } catch {
    return [];
  }
}

function rememberProduct() {
  const article = document.querySelector("[data-product-id]");
  const host = document.querySelector("[data-recent]");
  if (!article || !host) return;
  const id = article.getAttribute("data-product-id") || "";
  const name = article.querySelector("h1")?.textContent?.trim() || "";
  const sku = article.querySelector(".sku-value")?.textContent?.trim() || "";
  if (!id || !name) return;
  const previous = readRecent().filter((item) => item.id !== id);
  const next = [{ id, name, sku }, ...previous].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  const list = host.querySelector("[data-recent-list]");
  if (!list) return;
  list.replaceChildren();
  const shown = previous.slice(0, 5);
  if (!shown.length) {
    host.hidden = true;
    return;
  }
  for (const item of shown) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = `/amt/redesign/products/${encodeURIComponent(item.id)}/`;
    const nameEl = document.createElement("span");
    nameEl.className = "related-name";
    nameEl.textContent = item.name;
    const skuEl = document.createElement("span");
    skuEl.className = "related-sku";
    skuEl.textContent = item.sku || "";
    link.append(nameEl, skuEl);
    li.append(link);
    list.append(li);
  }
  host.hidden = false;
}

function init() {
  if (!customElements.get("amt-quote-count")) {
    customElements.define("amt-quote-count", AmtQuoteCount);
  }
  ensureCount();
  document.addEventListener("submit", (event) => {
    const form = event.target?.closest?.("[data-quote-form]");
    if (!form) return;
    event.preventDefault();
    const selected = form.querySelector('input[name="pack"]:checked');
    if (!selected) return;
    const detail = {
      id: form.getAttribute("data-id"),
      sku: form.getAttribute("data-sku") || "",
      pack: selected.value,
      name: form.getAttribute("data-name") || "",
    };
    window.dispatchEvent(new CustomEvent("amt:add-to-quote", { detail }));
  });
  window.addEventListener("amt:add-to-quote", onAdd);
  document.addEventListener("click", (event) => {
    const printButton = event.target?.closest?.("[data-print-spec]");
    if (!printButton) return;
    window.print();
  });
  document.addEventListener("click", async (event) => {
    const button = event.target?.closest?.("[data-copy]");
    if (!button) return;
    const value = button.getAttribute("data-copy") || "";
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = "Copied";
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      button.textContent = "Copied";
    }
    window.setTimeout(() => {
      button.textContent = original;
    }, 1500);
  });
  rememberProduct();
  const page = document.querySelector("[data-quote-page]");
  if (page) {
    const form = page.querySelector("[data-quote-details]");
    form?.addEventListener("input", () => updateMailto(page));
    page.querySelector("[data-quote-mailto]")?.addEventListener("click", (event) => {
      if (readCart().lines.length === 0) event.preventDefault();
    });
    renderQuotePage();
  }
}

init();
}
