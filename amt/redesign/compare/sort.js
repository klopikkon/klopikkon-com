const table = document.querySelector("[data-sort-table]");
if (table) {
  const buttons = [...table.querySelectorAll("thead button[data-sort]")];
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      const next = button.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
      buttons.forEach((other) => other.removeAttribute("aria-sort"));
      button.setAttribute("aria-sort", next);
      const tbody = table.tBodies[0];
      const rows = [...tbody.rows];
      const kind = button.getAttribute("data-sort");
      rows.sort((a, b) => compareCells(a.cells[index], b.cells[index], kind, next));
      rows.forEach((row) => tbody.appendChild(row));
    });
  });
}

function compareCells(a, b, kind, direction) {
  const av = a?.getAttribute("data-sort-value") ?? "";
  const bv = b?.getAttribute("data-sort-value") ?? "";
  const aEmpty = av === "";
  const bEmpty = bv === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  let delta = 0;
  if (kind === "number") {
    delta = Number(av) - Number(bv);
  } else {
    delta = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
  }
  return direction === "ascending" ? delta : -delta;
}
