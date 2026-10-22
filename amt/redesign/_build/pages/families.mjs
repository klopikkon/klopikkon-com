import { rm } from "node:fs/promises";
import { join } from "node:path";
import { esc, paragraphs } from "../lib/html.mjs";
import { url } from "../lib/paths.mjs";
import { breadcrumbs, familyCatalogueLink, motif, productTable, sourceLine } from "../lib/ui.mjs";

const PAGE_SIZE = 40;

function anchorId(value) {
  let slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) slug = "group";
  if (/^[0-9]/.test(slug)) slug = `sub-${slug}`;
  return slug;
}

function uniqueId(id, seen) {
  let next = id;
  let n = 2;
  while (seen.has(next)) next = `${id}-${n++}`;
  seen.add(next);
  return next;
}

function declaredSubfamilies(family) {
  const list = Array.isArray(family.subfamilies) ? family.subfamilies : [];
  return list
    .map((item) => {
      if (item && typeof item === "object") {
        const name = String(item.name || item.label || item.id || "").trim();
        const id = anchorId(item.id || name);
        return { name, id };
      }
      const name = String(item || "").trim();
      return { name, id: anchorId(name) };
    })
    .filter((item) => item.name);
}

function matchesGroup(product, group) {
  const raw = String(product.subfamily || "").trim();
  if (!raw || repeatsFamily(raw, group.family)) return false;
  return raw === group.name || raw === group.id || anchorId(raw) === group.id;
}

function sameFamilyLabel(left, right) {
  if (!left || !right || left === "group" || right === "group") return false;
  if (left === right) return true;
  if (right.startsWith(`${left}-`) || left.startsWith(`${right}-`)) return true;
  if (right === `${left}s` || left === `${right}s`) return true;
  return false;
}

/** PDF running headers repeat the family name. Those are not chemical classes. */
export function repeatsFamily(subfamily, family) {
  if (!family) return false;
  const sub = anchorId(subfamily);
  return sameFamilyLabel(sub, anchorId(family.id)) || sameFamilyLabel(sub, anchorId(family.title));
}

function classLabel(product) {
  const value = product?.classDerived;
  if (value == null || value === false) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const label = classLabel({ classDerived: item });
      if (label) return label;
    }
    return "";
  }
  if (typeof value === "object") return String(value.label || value.name || value.value || "").trim();
  return String(value).trim();
}

function groupsFromLabels(rows, labelOf) {
  const buckets = new Map();
  const rest = [];
  for (const product of rows) {
    const raw = labelOf(product);
    if (!raw) {
      rest.push(product);
      continue;
    }
    if (!buckets.has(raw)) buckets.set(raw, []);
    buckets.get(raw).push(product);
  }
  const seen = new Set();
  const named = [...buckets.keys()]
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((name) => ({
      name,
      id: uniqueId(anchorId(name), seen),
      rows: buckets.get(name),
    }));
  return { named, rest };
}

export function groupFamily(rows, family) {
  if (rows.some((product) => classLabel(product))) {
    const grouped = groupsFromLabels(rows, (product) => classLabel(product));
    return { ...grouped, derived: true };
  }
  const declared = declaredSubfamilies(family).map((group) => ({ ...group, family, rows: [] }));
  const declaredNames = new Set(declared.map((group) => group.name));
  const extras = new Map();
  const rest = [];
  for (const product of rows) {
    const raw = String(product.subfamily || "").trim();
    const declaredGroup = declared.find((group) => matchesGroup(product, group));
    if (declaredGroup) declaredGroup.rows.push(product);
    else if (raw && !repeatsFamily(raw, family) && !declaredNames.has(raw)) {
      if (!extras.has(raw)) extras.set(raw, []);
      extras.get(raw).push(product);
    } else rest.push(product);
  }
  const seen = new Set(declared.map((group) => group.id));
  const extraGroups = [...extras.keys()]
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((name) => ({
      name,
      id: uniqueId(anchorId(name), seen),
      rows: extras.get(name),
    }));
  const named = [...declared, ...extraGroups].filter((group) => group.rows.length || declared.includes(group));
  return { named, rest, derived: false };
}

function catalogueUrl(familyId, subfamily) {
  const params = new URLSearchParams();
  params.set("family", familyId);
  if (subfamily) params.set("subfamily", subfamily);
  return url(`catalogue/?${params.toString()}`);
}

function pagePath(base, page) {
  const root = String(base || "").endsWith("/") ? String(base || "") : `${base}/`;
  if (page <= 1) return root;
  return `${root}page/${page}/`;
}

function pageWindow(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const keep = new Set([1, pages, page, page - 1, page + 1]);
  const nums = [];
  let previous = 0;
  for (let n = 1; n <= pages; n += 1) {
    if (!keep.has(n)) continue;
    if (previous && n - previous > 1) nums.push("gap");
    nums.push(n);
    previous = n;
  }
  return nums;
}

function pager(base, page, pages) {
  if (pages <= 1) return "";
  const href = (n) => url(pagePath(base, n));
  const prev = page > 1
    ? `<a rel="prev" href="${href(page - 1)}">Previous</a>`
    : `<span aria-disabled="true">Previous</span>`;
  const next = page < pages
    ? `<a rel="next" href="${href(page + 1)}">Next</a>`
    : `<span aria-disabled="true">Next</span>`;
  const nums = pageWindow(page, pages).map((item) => {
    if (item === "gap") return `<li><span class="pager-gap" aria-hidden="true">…</span></li>`;
    if (item === page) return `<li><span aria-current="page">${item}</span></li>`;
    return `<li><a href="${href(item)}">${item}</a></li>`;
  }).join("");
  return `<nav class="pager" aria-label="Pagination">${prev}<ol>${nums}</ol>${next}<p class="fine">Page ${page} of ${pages}</p></nav>`;
}

function buildPages(groups) {
  const rowItems = [];
  const empties = [];
  for (const group of groups) {
    if (!group.rows.length) {
      empties.push(group);
      continue;
    }
    group.rows.forEach((row, index) => {
      rowItems.push({ group, row, first: index === 0 });
    });
  }
  const slices = [];
  if (!rowItems.length) slices.push([]);
  for (let index = 0; index < rowItems.length; index += PAGE_SIZE) {
    slices.push(rowItems.slice(index, index + PAGE_SIZE));
  }
  const starts = new Map();
  for (const group of groups) {
    const at = rowItems.findIndex((item) => item.group === group);
    starts.set(group.id, at === -1 ? 1 : Math.floor(at / PAGE_SIZE) + 1);
  }
  const pages = slices.map((slice, index) => {
    const sections = [];
    for (const item of slice) {
      let section = sections[sections.length - 1];
      if (!section || section.group !== item.group) {
        section = {
          group: item.group,
          rows: [],
          continued: !item.first,
          showId: item.first,
        };
        sections.push(section);
      }
      section.rows.push(item.row);
    }
    return {
      page: index + 1,
      pages: slices.length,
      sections,
      empties: index === 0 ? empties : [],
    };
  });
  return { pages, starts };
}

function sectionHtml(section) {
  const { group, rows, continued, showId } = section;
  const caption = continued ? `${group.name}, continued` : group.name;
  const id = showId && group.headingId ? ` id="${esc(group.headingId)}"` : "";
  const heading = group.headingId || continued ? `<h2${id}>${esc(caption)}</h2>` : "";
  const browse = showId && group.subfamily
    ? `<p><a class="btn btn-secondary" href="${catalogueUrl(group.familyId, group.subfamily)}">Browse ${esc(group.subfamily)} in the catalogue</a></p>`
    : "";
  const extra = showId && group.extra ? group.extra : "";
  if (!rows.length) {
    return `<section class="family-group">
      ${heading}
      <p>No rows for this heading are in the catalogue file yet.</p>
      ${browse}
      ${extra}
    </section>`;
  }
  return `<section class="family-group">
    ${heading}
    ${browse}
    ${productTable(rows, caption, { hideSubfamily: group.hideSubfamily })}
    ${extra}
  </section>`;
}

function chips(groups, starts, base) {
  if (!groups.length) return "";
  const items = groups
    .map((group) => {
      const page = starts.get(group.id) || 1;
      const href = url(`${pagePath(base, page)}#${group.headingId || group.id}`);
      return `<li><a class="chip" href="${href}">${esc(group.name)} (${group.rows.length})</a></li>`;
    })
    .join("");
  return `<ul class="chip-row">${items}</ul>`;
}

function brochureLine(brochure) {
  if (!brochure) return "";
  return `<p><a href="${esc(brochure.href)}" rel="noopener noreferrer">${esc(brochure.label)}</a></p>`;
}

const DERIVED_NOTE = "These groups are derived from the product name. They are not headings from the AMT catalogue.";

function catalogueGroups(family, rows) {
  const { named, rest, derived } = groupFamily(rows, family);
  if (!named.length) {
    return {
      named,
      derived: false,
      groups: [{
        id: "all",
        name: family.title,
        headingId: "",
        rows,
        familyId: family.id,
        subfamily: "",
        hideSubfamily: false,
        extra: "",
      }],
    };
  }
  const groups = named.map((group) => ({
    id: group.id,
    name: group.name,
    headingId: group.id,
    rows: group.rows,
    familyId: family.id,
    subfamily: derived ? "" : group.name,
    hideSubfamily: true,
    extra: "",
  }));
  if (rest.length) {
    groups.push({
      id: "rest",
      name: family.title,
      headingId: "rest",
      rows: rest,
      familyId: family.id,
      subfamily: "",
      hideSubfamily: true,
      extra: "",
    });
  }
  return { named, groups, derived };
}

function familyPage({ family, pageModel, named, starts, derived }) {
  const quote = family.quote
    ? `<blockquote><p>${esc(family.quote)}</p></blockquote><p class="fine"><a href="${url("about/#incubating")}">About Us</a></p>`
    : "";
  const derivedNote = derived ? `<p class="fine">${esc(DERIVED_NOTE)}</p>` : "";
  const intro = pageModel.page === 1
    ? [paragraphs(family.paragraphs), quote, brochureLine(family.brochure), derivedNote, chips(named, starts, family.path)]
      .filter(Boolean)
      .join("\n    ")
    : [pageModel.pages > 1 ? `<p class="fine">Page ${pageModel.page} of ${pageModel.pages}</p>` : "", derivedNote]
      .filter(Boolean)
      .join("\n    ");
  const crumbs = [
    { label: "Home", href: url("") },
    { label: "Products", href: url("#families") },
    pageModel.page === 1
      ? { label: family.title }
      : { label: family.title, href: url(family.path) },
  ];
  if (pageModel.page > 1) crumbs.push({ label: `Page ${pageModel.page}` });
  const listings = [
    ...pageModel.empties.map((group) => sectionHtml({ group, rows: [], continued: false, showId: true })),
    ...pageModel.sections.map((section) => sectionHtml(section)),
  ].join("\n");
  const nav = pager(family.path, pageModel.page, pageModel.pages);
  return `<section class="family-hero">
  ${motif(`motif-${family.id}`)}
  <div class="wrap page-intro prose">
    ${breadcrumbs(crumbs)}
    <h1>${esc(family.title)}</h1>
    ${intro}
    ${familyCatalogueLink(family.id)}
  </div>
</section>
<div class="wrap prose">
  ${nav}
  ${listings}
  ${nav}
  ${sourceLine(family.sourceLabel, family.sourceHref)}
</div>`;
}

function listable(rows) {
  return rows
    .filter((product) => product && product.id && (String(product.name || "").trim() || String(product.sku || "").trim()))
    .map((product) => (String(product.name || "").trim() ? product : { ...product, name: product.sku }));
}

function rowsForGroup(products, group) {
  return listable(products.filter((product) => {
    if (product.family !== "other") return false;
    const sub = anchorId(product.subfamily);
    return sub === group.id || product.subfamily === group.id || product.subfamily === group.name;
  }));
}

function literatureBlock(literature) {
  if (!literature) return "";
  const items = (literature.items || [])
    .map((item) => {
      const lines = (item.lines || []).map((line) => esc(line)).join("<br>\n");
      const link = item.link
        ? `<a href="${esc(item.link.href)}" rel="noopener noreferrer">${esc(item.link.label)}</a>`
        : "";
      return `<li><p><strong>${esc(item.title)}</strong><br>${lines ? `${lines}<br>` : ""}${link}</p></li>`;
    })
    .join("");
  return `<section>
    <h3>${esc(literature.heading)}</h3>
    <ul>${items}</ul>
  </section>`;
}

function pageLinks(base, page, pages) {
  return [
    page > 1 ? `<link rel="prev" href="${url(pagePath(base, page - 1))}">` : "",
    page < pages ? `<link rel="next" href="${url(pagePath(base, page + 1))}">` : "",
  ].join("\n");
}

export async function build({ site, products, renderPage, writeFile, outDir }) {
  for (const family of site.families) {
    if (outDir) await rm(join(outDir, family.path, "page"), { recursive: true, force: true });
    const rows = listable(products.filter((product) => product && product.family === family.id));
    const { named, groups, derived } = catalogueGroups(family, rows);
    const { pages, starts } = buildPages(groups);
    for (const pageModel of pages) {
      const path = pagePath(family.path, pageModel.page);
      const title = pageModel.pages > 1
        ? `${family.title} (page ${pageModel.page} of ${pageModel.pages}) - Advanced Molecular Technologies`
        : `${family.title} - Advanced Molecular Technologies`;
      const html = renderPage({
        title,
        description: family.description,
        path,
        head: pageLinks(family.path, pageModel.page, pageModel.pages),
        body: familyPage({ family, pageModel, named, starts, derived }),
      });
      await writeFile(`${path}index.html`, html);
    }
  }

  const otherGroups = site.otherGroups || [];
  const matched = new Set();
  for (const group of otherGroups) {
    for (const row of rowsForGroup(products, group)) matched.add(row.id);
  }
  const unfiled = listable(products.filter((product) => product.family === "other" && !matched.has(product.id)));
  const unfiledBlock = unfiled.length
    ? `<section id="rest">
        <h2>Without a catalogue heading</h2>
        <p class="fine">These rows are filed as other and have no subfamily in the catalogue file.</p>
        ${productTable(unfiled, "Other catalogues", { hideSubfamily: true })}
      </section>`
    : "";

  const groups = otherGroups
    .map((group) => {
      const rows = rowsForGroup(products, group);
      const lit = group.id === "organosilicons" ? literatureBlock(site.literature) : "";
      const table = rows.length
        ? productTable(rows, group.name)
        : `<p>No rows for this heading are in the catalogue file yet.</p>`;
      return `<section id="${esc(group.id)}">
        <h2>${esc(group.name)}</h2>
        <p><a class="btn btn-secondary" href="${catalogueUrl("other", group.id)}">Browse ${esc(group.name)} in the catalogue</a></p>
        ${table}
        ${lit}
      </section>`;
    })
    .join("");

  const other = renderPage({
    title: "Other catalogues - Advanced Molecular Technologies",
    description: "General chemicals, organosilicons, nucleosides, halogenated organics, diaryls, catalysts and bioactives from the AMT catalogue.",
    path: "families/other/",
    body: `<section class="family-hero">
      ${motif("motif-other")}
      <div class="wrap page-intro prose">
        ${breadcrumbs([
          { label: "Home", href: url("") },
          { label: "Products", href: url("#families") },
          { label: "Other catalogues" },
        ])}
        <h1>Other catalogues</h1>
        <p>These catalogue headings are published on the AMT site, alongside lipids, PEG reagents and linkers, fluorophores and dyes, and organoborons.</p>
        ${familyCatalogueLink("other")}
      </div>
    </section>
    <div class="wrap prose">
      ${groups}
      ${unfiledBlock}
      ${sourceLine("amtechpl.com", "https://www.amtechpl.com/")}
    </div>`,
  });
  await writeFile("families/other/index.html", other);
}
