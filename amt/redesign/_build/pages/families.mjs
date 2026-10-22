import { esc, paragraphs } from "../lib/html.mjs";
import { url } from "../lib/paths.mjs";
import { breadcrumbs, familyCatalogueLink, motif, productTable, sourceLine } from "../lib/ui.mjs";

const PER_GROUP = 24;
const SHOW_ALL_AT = 48;

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
  if (!raw) return false;
  return raw === group.name || raw === group.id || anchorId(raw) === group.id;
}

function groupFamily(rows, family) {
  const declared = declaredSubfamilies(family).map((group) => ({ ...group, rows: [] }));
  const extras = new Map();
  const rest = [];
  for (const product of rows) {
    const raw = String(product.subfamily || "").trim();
    const declaredGroup = declared.find((group) => matchesGroup(product, group));
    if (declaredGroup) {
      declaredGroup.rows.push(product);
    } else if (raw) {
      if (!extras.has(raw)) extras.set(raw, []);
      extras.get(raw).push(product);
    } else {
      rest.push(product);
    }
  }
  const seen = new Set(declared.map((group) => group.id));
  const extraGroups = [...extras.keys()]
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((name) => ({
      name,
      id: uniqueId(anchorId(name), seen),
      rows: extras.get(name),
    }));
  return { named: [...declared, ...extraGroups], rest };
}

function catalogueUrl(familyId, subfamily) {
  const params = new URLSearchParams();
  params.set("family", familyId);
  if (subfamily) params.set("subfamily", subfamily);
  return url(`catalogue/?${params.toString()}`);
}

function visibleRows(rows, total) {
  if (total <= SHOW_ALL_AT) return rows;
  return rows.slice(0, PER_GROUP);
}

function groupBlock({ rows, caption, familyId, subfamily, total, headingId, hideSubfamily }) {
  const heading = headingId ? `<h2 id="${esc(headingId)}">${esc(caption)}</h2>` : "";
  const browse = subfamily
    ? `<p><a class="btn btn-secondary" href="${catalogueUrl(familyId, subfamily)}">Browse ${esc(subfamily)} in the catalogue</a></p>`
    : "";
  if (!rows.length) {
    return `<section class="family-group">
      ${heading}
      <p>No rows for this heading are in the catalogue file yet.</p>
      ${browse}
    </section>`;
  }
  const shown = visibleRows(rows, total);
  const note = shown.length < rows.length
    ? `<p class="fine">Showing ${shown.length} of ${rows.length}.</p>`
    : "";
  return `<section class="family-group">
    ${heading}
    ${note}
    ${browse}
    ${productTable(shown, caption, { hideSubfamily })}
  </section>`;
}

function chips(groups) {
  if (!groups.length) return "";
  const items = groups
    .map((group) => `<li><a class="chip" href="#${esc(group.id)}">${esc(group.name)} (${group.rows.length})</a></li>`)
    .join("");
  return `<ul class="chip-row">${items}</ul>`;
}

function brochureLine(brochure) {
  if (!brochure) return "";
  return `<p><a href="${esc(brochure.href)}" rel="noopener noreferrer">${esc(brochure.label)}</a></p>`;
}

function familyListings(family, rows) {
  const { named, rest } = groupFamily(rows, family);
  if (!named.length) {
    return {
      named,
      html: groupBlock({
        rows,
        caption: family.title,
        familyId: family.id,
        subfamily: "",
        total: rows.length,
        headingId: "",
        hideSubfamily: false,
      }),
    };
  }
  const sections = named.map((group) => groupBlock({
    rows: group.rows,
    caption: group.name,
    familyId: family.id,
    subfamily: group.name,
    total: rows.length,
    headingId: group.id,
    hideSubfamily: true,
  }));
  if (rest.length) {
    sections.push(groupBlock({
      rows: rest,
      caption: family.title,
      familyId: family.id,
      subfamily: "",
      total: rows.length,
      headingId: "rest",
      hideSubfamily: true,
    }));
  }
  return { named, html: sections.join("\n") };
}

function familyPage({ family, products }) {
  const rows = listable(products.filter((product) => product && product.family === family.id));
  const { named, html } = familyListings(family, rows);
  const quote = family.quote
    ? `<blockquote><p>${esc(family.quote)}</p></blockquote><p class="fine"><a href="${url("about/#incubating")}">About Us</a></p>`
    : "";
  return `<section class="family-hero">
  ${motif(`motif-${family.id}`)}
  <div class="wrap page-intro prose">
    ${breadcrumbs([
      { label: "Home", href: url("") },
      { label: "Products", href: url("#families") },
      { label: family.title },
    ])}
    <h1>${esc(family.title)}</h1>
    ${paragraphs(family.paragraphs)}
    ${quote}
    ${brochureLine(family.brochure)}
    ${chips(named)}
    ${familyCatalogueLink(family.id, `Browse ${family.title} in the catalogue`)}
  </div>
</section>
<div class="wrap prose">
  ${html}
  ${sourceLine(family.sourceLabel, family.sourceHref)}
</div>`;
}

function listable(rows) {
  return rows.filter((product) => product && product.id && String(product.name || "").trim());
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

export async function build({ site, products, renderPage, writeFile }) {
  for (const family of site.families) {
    const html = renderPage({
      title: `${family.title} - Advanced Molecular Technologies`,
      description: family.description,
      path: family.path,
      body: familyPage({ family, products }),
    });
    await writeFile(`${family.path}index.html`, html);
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
        ${groupBlock({
          rows: unfiled,
          caption: "Other catalogues",
          familyId: "other",
          subfamily: "",
          total: unfiled.length,
          headingId: "",
          hideSubfamily: true,
        })}
      </section>`
    : "";

  const groups = otherGroups
    .map((group) => {
      const rows = rowsForGroup(products, group);
      const lit = group.id === "organosilicons" ? literatureBlock(site.literature) : "";
      const shown = visibleRows(rows, rows.length);
      const note = shown.length < rows.length
        ? `<p class="fine">Showing ${shown.length} of ${rows.length}.</p>`
        : "";
      const table = rows.length
        ? `${note}\n${productTable(shown, group.name)}`
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
