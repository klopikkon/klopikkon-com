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

/** A published currency amount, or null for Quote and anything unparsed. */
export function parsePublishedPrice(label) {
  const text = String(label || "").trim().replace(/,/g, "");
  if (!text || /^quote$/i.test(text)) return null;
  const match = text.match(/^(USD|US\$|A\$|AU\$|\$|€|£)\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  const amount = Number(match[2]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const token = match[1];
  const symbol = /^usd$/i.test(token) ? "USD " : token;
  return { amount, symbol };
}

export function formatMoney(amount, symbol) {
  const rounded = (Math.round(Number(amount) * 100) / 100).toFixed(2);
  return symbol === "USD " ? `USD ${rounded}` : `${symbol}${rounded}`;
}

export const INDICATIVE_LABEL = "Indicative total, ex GST";

/**
 * Line totals only for packs with a published price.
 * Quote lines stay in the list and are left out of the total.
 */
export function quoteSummary(cart, catalog) {
  const lines = normaliseCart(cart).lines.map((line) => {
    const priceLabel = linePrice(line, catalog);
    const parsed = parsePublishedPrice(priceLabel);
    return {
      name: lineLabel(line, catalog),
      sku: line.sku,
      pack: line.pack,
      qty: line.qty,
      priceLabel,
      symbol: parsed ? parsed.symbol : null,
      lineTotal: parsed ? parsed.amount * line.qty : null,
    };
  });
  const priced = lines.filter((line) => line.lineTotal != null);
  const symbols = [...new Set(priced.map((line) => line.symbol))];
  const singleCurrency = symbols.length === 1;
  const total = priced.length && singleCurrency ? priced.reduce((sum, line) => sum + line.lineTotal, 0) : null;
  const quoteCount = lines.length - priced.length;
  let note = "";
  if (lines.length && !priced.length) {
    note = "Every line is Quote, so there is no indicative total.";
  } else if (priced.length && !singleCurrency) {
    note = "Published prices use more than one currency, so they are not added together.";
  } else if (quoteCount) {
    note = "Quote lines are not included.";
  }
  return {
    lines,
    total,
    totalLabel: total == null ? null : formatMoney(total, symbols[0]),
    quoteCount,
    note,
  };
}

export function requestText({ cart, fields, catalog }) {
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
  const summary = quoteSummary(cart, catalog);
  if (summary.totalLabel) {
    chunks.push("");
    chunks.push(`${INDICATIVE_LABEL}: ${summary.totalLabel}`);
    if (summary.quoteCount) chunks.push("Quote lines are not included.");
  } else if (summary.lines.length && summary.quoteCount === summary.lines.length) {
    chunks.push("");
    chunks.push("Every line is Quote, so there is no indicative total.");
  } else if (summary.note) {
    chunks.push("");
    chunks.push(summary.note);
  }
  chunks.push("");
  chunks.push("Composed in the browser from the AMT concept redesign. Nothing was sent until this email is sent from the mail app.");
  return chunks.join("\n");
}

export function buildMailto({ email, cart, fields, catalog }) {
  const subject = "AMT quote request";
  const body = requestText({ cart, fields, catalog });
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

/** Client-side CSV. Quote line totals are blank. Nothing is uploaded. */
export function buildQuoteCsv(cart, catalog) {
  const summary = quoteSummary(cart, catalog);
  const rows = [["name", "sku", "pack", "published price", "qty", "line total"]];
  for (const line of summary.lines) {
    rows.push([
      line.name,
      line.sku || "",
      line.pack,
      line.priceLabel || "",
      String(line.qty),
      line.lineTotal == null ? "" : formatMoney(line.lineTotal, line.symbol),
    ]);
  }
  if (summary.totalLabel) {
    rows.push([INDICATIVE_LABEL, "", "", "", "", summary.totalLabel]);
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
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
    link.setAttribute("aria-label", quoteCountLabel(count));
  }
}

function quoteCountLabel(count) {
  if (count === 0) return "Quote list, no items yet";
  if (count === 1) return "Quote list, 1 item";
  return `Quote list, ${count} items`;
}

function paintShellQuoteCount() {
  const link = document.querySelector("[data-quote-count]");
  if (!link) return false;
  const count = totalQty(readCart());
  link.textContent = `Quote (${count})`;
  link.setAttribute("aria-label", quoteCountLabel(count));
  return true;
}

function ensureCount() {
  paintShellQuoteCount();
  if (document.querySelector("[data-quote-count]") || document.querySelector("amt-quote-count")) return;
  const el = document.createElement("amt-quote-count");
  const toggle = document.querySelector("header [data-theme-toggle]");
  if (toggle?.parentElement) {
    toggle.parentElement.insertBefore(el, toggle);
    return;
  }
  const host = document.querySelector("header .utility") || document.querySelector("header");
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
    const bits = [line.sku, line.pack].filter(Boolean);
    meta.append(document.createTextNode(bits.join(" · ")));
    if (price) {
      meta.append(document.createTextNode(bits.length ? " · " : ""));
      meta.append(document.createTextNode(price));
      if (/^quote$/i.test(price)) {
        const note = document.createElement("span");
        note.className = "visually-hidden";
        note.textContent = " means the price is not published.";
        meta.append(note);
      }
    }
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
  renderSummary(page, catalog);
  updateActions(page, catalog);
}

function renderSummary(page, catalog) {
  const box = page.querySelector("[data-quote-summary]");
  if (!box) return;
  const summary = quoteSummary(readCart(), catalog);
  box.hidden = summary.lines.length === 0;
  const list = box.querySelector("[data-quote-summary-lines]");
  if (list) {
    list.replaceChildren();
    for (const line of summary.lines) {
      const item = document.createElement("li");
      item.className = "quote-summary-line";
      const name = document.createElement("span");
      name.textContent = `${line.name} · ${line.pack} · qty ${line.qty}`;
      const amount = document.createElement("span");
      amount.className = "quote-summary-amount";
      if (line.lineTotal == null) {
        amount.textContent = "Quote, not included.";
        const note = document.createElement("span");
        note.className = "visually-hidden";
        note.textContent = "The price is not published.";
        amount.append(note);
      } else {
        const note = document.createElement("span");
        note.className = "visually-hidden";
        note.textContent = "Line total";
        amount.append(note, document.createTextNode(formatMoney(line.lineTotal, line.symbol)));
      }
      item.append(name, amount);
      list.append(item);
    }
  }
  const total = box.querySelector("[data-quote-total]");
  if (total) {
    total.textContent = summary.totalLabel ? `${INDICATIVE_LABEL} ${summary.totalLabel}` : "";
  }
  const note = box.querySelector("[data-quote-summary-note]");
  if (note) note.textContent = summary.note;
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

function updateActions(page, catalog) {
  updateMailto(page, catalog);
  const disabled = readCart().lines.length === 0;
  for (const button of page.querySelectorAll("[data-quote-copy], [data-quote-csv]")) {
    button.disabled = disabled;
  }
}

async function copyRequest(page) {
  if (readCart().lines.length === 0) return;
  const text = requestText({
    cart: readCart(),
    fields: fieldValues(page),
    catalog: readCatalog(document),
  });
  const button = page.querySelector("[data-quote-copy]");
  const original = button?.textContent || "Copy request";
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  const status = page.querySelector("[data-quote-status]");
  if (status) status.textContent = "Request copied.";
  if (button) {
    button.textContent = "Copied";
    window.setTimeout(() => {
      button.textContent = original;
    }, 1500);
  }
}

function downloadCsv(page) {
  if (readCart().lines.length === 0) return;
  const csv = buildQuoteCsv(readCart(), readCatalog(document));
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = "amt-quote.csv";
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
  const status = page.querySelector("[data-quote-status]");
  if (status) status.textContent = "CSV downloaded.";
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

function initDetailTabs() {
  for (const host of document.querySelectorAll("[data-detail-tabs]")) {
    const tabs = [...host.querySelectorAll('[role="tab"]')];
    if (tabs.length < 2) continue;
    const select = (tab) => {
      for (const item of tabs) {
        const on = item === tab;
        item.setAttribute("aria-selected", on ? "true" : "false");
        item.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(item.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      }
    };
    select(tabs.find((tab) => tab.getAttribute("aria-selected") === "true") || tabs[0]);
    host.addEventListener("click", (event) => {
      const tab = event.target?.closest?.('[role="tab"]');
      if (!tab || !host.contains(tab)) return;
      select(tab);
    });
    host.addEventListener("keydown", (event) => {
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[next].focus();
      select(tabs[next]);
    });
  }
}

function init() {
  if (!customElements.get("amt-quote-count")) {
    customElements.define("amt-quote-count", AmtQuoteCount);
  }
  ensureCount();
  window.addEventListener("amt:quote-changed", paintShellQuoteCount);
  window.addEventListener("storage", paintShellQuoteCount);
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
  initDetailTabs();
  const page = document.querySelector("[data-quote-page]");
  if (page) {
    const form = page.querySelector("[data-quote-details]");
    form?.addEventListener("input", () => updateActions(page));
    page.querySelector("[data-quote-mailto]")?.addEventListener("click", (event) => {
      if (readCart().lines.length === 0) event.preventDefault();
    });
    page.querySelector("[data-quote-copy]")?.addEventListener("click", () => {
      copyRequest(page);
    });
    page.querySelector("[data-quote-csv]")?.addEventListener("click", () => {
      downloadCsv(page);
    });
    renderQuotePage();
  }
}

init();
}
