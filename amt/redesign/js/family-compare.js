/**
 * Family compare page. The catalogue for this family is in
 * #family-compare-data. Selection is capped at four products.
 */
const MAX = 4;

function readRows() {
  const node = document.querySelector("#family-compare-data");
  if (!node) return [];
  try {
    const parsed = JSON.parse(node.textContent || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function selectedIds() {
  return [...document.querySelectorAll("[data-compare-choice]:checked")].map((input) => input.value);
}

function queryIds() {
  const raw = new URLSearchParams(window.location.search).get("ids") || "";
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX);
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text || "Not published";
  return td;
}

function packText(row) {
  if (!row.packs?.length) return "Not published";
  return row.packs.map((pack) => `${pack.size} ${pack.label}`).join("; ");
}

function renderTable(rows) {
  const host = document.querySelector("[data-compare-table]");
  const empty = document.querySelector("[data-compare-empty]");
  if (!host || !empty) return;
  host.replaceChildren();
  if (!rows.length) {
    host.hidden = true;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  host.hidden = false;
  const table = document.createElement("table");
  const caption = document.createElement("caption");
  caption.textContent = "Published specifications and prices";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  const corner = document.createElement("th");
  corner.scope = "col";
  corner.textContent = "Specification";
  headRow.append(corner);
  for (const row of rows) {
    const th = document.createElement("th");
    th.scope = "col";
    const link = document.createElement("a");
    link.href = `/amt/redesign/products/${encodeURIComponent(row.id)}/`;
    link.textContent = row.label || row.sku || row.id;
    th.append(link);
    headRow.append(th);
  }
  head.append(headRow);

  const specs = [
    ["Name", (row) => row.name || "Not published"],
    ["Catalogue number", (row) => row.sku || "Not published"],
    ["CAS", (row) => row.cas || "Not published"],
    ["Formula", (row) => row.formula || "Not published"],
    ["Molecular weight", (row) => row.mw || "Not published"],
    ["Purity", (row) => row.purity || "Not published"],
    ["Packs", packText],
  ];
  const body = document.createElement("tbody");
  for (const [label, value] of specs) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = label;
    tr.append(th);
    for (const row of rows) tr.append(cell(value(row)));
    body.append(tr);
  }

  const showPubchem = rows.some((row) => row.pubchem);
  if (showPubchem) {
    const pubchemRows = [
      ["Formula from PubChem", (row) => row.pubchem?.formula || ""],
      ["Molecular weight from PubChem", (row) => row.pubchem?.mw || ""],
    ];
    for (const [label, value] of pubchemRows) {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = label;
      tr.append(th);
      for (const row of rows) {
        const td = document.createElement("td");
        const text = value(row);
        td.textContent = text || "—";
        if (text) {
          const tag = document.createElement("span");
          tag.className = "pubchem-tag";
          tag.textContent = "from PubChem";
          td.append(" ", tag);
        }
        tr.append(td);
      }
      body.append(tr);
    }
    const linkRow = document.createElement("tr");
    const linkHead = document.createElement("th");
    linkHead.scope = "row";
    linkHead.textContent = "PubChem";
    linkRow.append(linkHead);
    for (const row of rows) {
      const td = document.createElement("td");
      if (row.pubchem?.href && row.pubchem.cid) {
        const link = document.createElement("a");
        link.href = row.pubchem.href;
        link.rel = "noopener noreferrer";
        link.textContent = `PubChem CID ${row.pubchem.cid}`;
        td.append(link);
      } else {
        td.textContent = "—";
      }
      linkRow.append(td);
    }
    body.append(linkRow);
  }

  table.append(caption, head, body);
  host.append(table);
}

function sync(rowsById) {
  const ids = selectedIds();
  const count = document.querySelector("[data-compare-count]");
  if (count) count.textContent = `${ids.length} of ${MAX}`;
  const limit = document.querySelector("[data-compare-limit]");
  if (limit) limit.textContent = ids.length >= MAX ? "Four products are selected. Clear one to add another." : "";
  for (const input of document.querySelectorAll("[data-compare-choice]")) {
    input.disabled = !input.checked && ids.length >= MAX;
  }
  const params = new URLSearchParams(window.location.search);
  if (ids.length) params.set("ids", ids.join(","));
  else params.delete("ids");
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
  window.history.replaceState(null, "", next);
  renderTable(ids.map((id) => rowsById.get(id)).filter(Boolean));
}

function renderChoices(rows, rowsById) {
  const list = document.querySelector("[data-compare-choices]");
  const filter = document.querySelector("[data-compare-filter]");
  if (!list) return;
  const preset = new Set(queryIds().filter((id) => rowsById.has(id)));
  list.replaceChildren();
  for (const row of rows) {
    const item = document.createElement("li");
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = row.id;
    input.dataset.compareChoice = "true";
    input.checked = preset.has(row.id);
    const text = document.createElement("span");
    const name = document.createElement("span");
    name.className = "compare-choice-name";
    name.textContent = row.label || row.id;
    const meta = document.createElement("span");
    meta.className = "compare-choice-meta";
    meta.textContent = [row.sku, row.cas].filter(Boolean).join(" · ");
    text.append(name, meta);
    label.append(input, text);
    item.append(label);
    item.dataset.compareHaystack = `${row.label || ""} ${row.sku || ""} ${row.cas || ""}`.toLowerCase();
    list.append(item);
  }
  list.addEventListener("change", (event) => {
    if (!event.target?.matches?.("[data-compare-choice]")) return;
    const ids = selectedIds();
    if (ids.length > MAX) {
      event.target.checked = false;
    }
    sync(rowsById);
  });
  filter?.addEventListener("input", () => {
    const query = filter.value.trim().toLowerCase();
    for (const item of list.querySelectorAll("li")) {
      const haystack = item.dataset.compareHaystack || "";
      const checked = item.querySelector("input")?.checked;
      item.hidden = Boolean(query) && !checked && !haystack.includes(query);
    }
  });
  sync(rowsById);
}

const rows = readRows();
const rowsById = new Map(rows.map((row) => [row.id, row]));
renderChoices(rows, rowsById);
