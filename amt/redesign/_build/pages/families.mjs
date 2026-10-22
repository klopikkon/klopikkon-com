import { esc, paragraphs } from "../lib/html.mjs";
import { url } from "../lib/paths.mjs";
import { breadcrumbs, familyCatalogueLink, productTable, sourceLine } from "../lib/ui.mjs";

const SAMPLE = 12;

function rowsForFamily(products, familyId) {
  return products.filter((product) => product && product.family === familyId);
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function rowsForGroup(products, group) {
  return products.filter((product) => {
    if (!product || product.family !== "other") return false;
    const sub = slug(product.subfamily);
    return sub === group.id || product.subfamily === group.id || product.subfamily === group.name;
  });
}

function sampleNote(total) {
  if (total <= SAMPLE) return "";
  return `<p class="fine">Showing ${SAMPLE} of ${total} rows in the catalogue file.</p>`;
}

function catalogueBlock(rows, caption) {
  if (!rows.length) {
    return `<p>No rows for this heading are in the catalogue file yet.</p>`;
  }
  return `${sampleNote(rows.length)}\n${productTable(rows.slice(0, SAMPLE), caption)}`;
}

function brochureLine(brochure) {
  if (!brochure) return "";
  return `<p><a href="${esc(brochure.href)}" rel="noopener noreferrer">${esc(brochure.label)}</a></p>`;
}

function familyPage({ site, family, products }) {
  const rows = rowsForFamily(products, family.id);
  const quote = family.quote
    ? `<blockquote><p>${esc(family.quote)}</p></blockquote><p class="fine"><a href="${url("about/#incubating")}">About Us</a></p>`
    : "";
  return `<div class="wrap page-intro prose">
  ${breadcrumbs([
    { label: "Home", href: url("") },
    { label: "Products", href: url("#families") },
    { label: family.title },
  ])}
  <h1>${esc(family.title)}</h1>
  ${paragraphs(family.paragraphs)}
  ${quote}
  ${brochureLine(family.brochure)}
  ${familyCatalogueLink(family.id, `Browse ${family.title} in the catalogue`)}
  ${catalogueBlock(rows, family.title)}
  ${sourceLine(family.sourceLabel, family.sourceHref)}
</div>`;
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
      body: familyPage({ site, family, products }),
    });
    await writeFile(`${family.path}index.html`, html);
  }

  const groups = (site.otherGroups || [])
    .map((group) => {
      const rows = rowsForGroup(products, group);
      const lit = group.id === "organosilicons" ? literatureBlock(site.literature) : "";
      return `<section id="${esc(group.id)}">
        <h2>${esc(group.name)}</h2>
        <p><a class="btn btn-secondary" href="${url(`catalogue/?family=other&subfamily=${encodeURIComponent(group.id)}`)}">Browse ${esc(group.name)} in the catalogue</a></p>
        ${catalogueBlock(rows, group.name)}
        ${lit}
      </section>`;
    })
    .join("");

  const other = renderPage({
    title: "Other catalogues - Advanced Molecular Technologies",
    description: "General chemicals, organosilicons, nucleosides, halogenated organics, diaryls, catalysts and bioactives from the AMT catalogue.",
    path: "families/other/",
    body: `<div class="wrap page-intro prose">
      ${breadcrumbs([
        { label: "Home", href: url("") },
        { label: "Products", href: url("#families") },
        { label: "Other catalogues" },
      ])}
      <h1>Other catalogues</h1>
      <p>These catalogue headings are published on the AMT site, alongside lipids, PEG reagents and linkers, fluorophores and dyes, and organoborons.</p>
      ${groups}
      ${sourceLine("amtechpl.com", "https://www.amtechpl.com/")}
    </div>`,
  });
  await writeFile("families/other/index.html", other);
}
