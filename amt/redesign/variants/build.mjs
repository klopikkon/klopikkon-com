/**
 * Concept directions for the AMT redesign.
 * Run: node amt/redesign/variants/build.mjs
 * Reads the same catalogue and site copy as the shell. Writes only under variants/.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadData } from "../_build/lib/data.mjs";
import { esc, paragraphs, rich } from "../_build/lib/html.mjs";
import { canonical, url } from "../_build/lib/paths.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const redesign = join(here, "..");
const FLYER_ID = "new-products-20250516";
const ASSET = "/amt/redesign";
const SHOWCASE_ID = "amtgc1533-lp25";

const LOOKS = {
  a: {
    id: "a",
    name: "Swiss grid",
    line: "Clinical and minimal. A numbered margin, hairline rules, and the catalogue set out like a specification.",
  },
  b: {
    id: "b",
    name: "Lab readout",
    line: "Dark-first instrument panel. Lime accent, catalogue counts as bars, and a decorative trace that is not a measurement.",
  },
  c: {
    id: "c",
    name: "Editorial",
    line: "Warm paper and large serif type. Plates are images AMT published: the delivery drawing, partner marks, and lipid structures.",
  },
};

const PARTNER_LOGOS = {
  "Scaled Organics": ["assets/logos/Scaled-Organics.jpg", 180, 100],
  "AK Scientific": ["assets/logos/AK-Scientific.jpg", 180, 100],
  "Key Organics": ["assets/logos/Key-Organics.jpg", 180, 100],
  "Frontier Specialty Chemicals": ["assets/logos/Frontier-logo.png", 200, 200],
};

const FAMILY_LABEL = {
  lipids: "Lipids",
  peg: "PEG reagents",
  fluorophores: "Fluorophores",
  organoborons: "Organoborons",
  other: "Other",
};

const BOOT = `<script>
(function () {
  var root = document.documentElement;
  var look = root.getAttribute("data-look");
  if (!look) {
    look = "a";
    try {
      var savedLook = localStorage.getItem("amt-look");
      if (savedLook === "a" || savedLook === "b" || savedLook === "c") look = savedLook;
    } catch (e) {}
    root.setAttribute("data-look", look);
  }
  var theme = look === "b" ? "dark" : "light";
  try {
    var stored = localStorage.getItem("amt-theme");
    if (stored === "light" || stored === "dark") theme = stored;
    else if (look !== "b" && window.matchMedia("(prefers-color-scheme: dark)").matches) theme = "dark";
  } catch (e) {}
  root.setAttribute("data-theme", theme);
  var colors = { a: { light: "#f7f7f4", dark: "#111111" }, b: { light: "#f2f6f3", dark: "#07141c" }, c: { light: "#f3eadf", dark: "#1c130e" } };
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", colors[look][theme]);
})();
</script>`;

function packs(list) {
  if (!Array.isArray(list) || !list.length) return `<li><span>Pack</span> <span>quote</span></li>`;
  return list
    .map((pack) => {
      const size = pack.size ? esc(pack.size) : "Pack";
      const price = pack.priceText || "quote";
      return `<li><span>${size}</span> <span>${esc(price)}</span></li>`;
    })
    .join("");
}

function flyerRows(products) {
  const rows = [];
  for (const product of products || []) {
    if (!product || !product.id) continue;
    const bags = [...(product.listings || []), ...(product.alsoListedIn || [])];
    const flyer = bags.find((item) => item && item.sourceId === FLYER_ID);
    if (!flyer) continue;
    rows.push({ product, flyer });
  }
  rows.sort((a, b) => String(a.product.sku || "").localeCompare(String(b.product.sku || ""), "en"));
  return rows;
}

function countsOf(products) {
  const totals = new Map();
  for (const product of products) {
    const family = product && product.family;
    if (!family) continue;
    totals.set(family, (totals.get(family) || 0) + 1);
  }
  const rows = [...totals.entries()]
    .map(([id, count]) => ({ id, count, label: FAMILY_LABEL[id] || id }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "en"));
  const max = rows.reduce((hi, row) => Math.max(hi, row.count), 1);
  return rows.map((row) => ({ ...row, width: `${Math.max(4, Math.round((row.count / max) * 100))}%` }));
}

function productHref(product, look) {
  if (look && product.id === SHOWCASE_ID) return `${ASSET}/variants/${look}/products/${SHOWCASE_ID}/`;
  return url(`products/${encodeURIComponent(product.id)}/`);
}

function featuredHref(item, look) {
  if (item.sku === "AMTGC1533-LP25") return `${ASSET}/variants/${look}/products/${SHOWCASE_ID}/`;
  return url(`catalogue/?q=${encodeURIComponent(item.sku || item.name || "")}`);
}

function lipidHref(look) {
  return `${ASSET}/variants/${look}/lipids/`;
}

async function writePage(rel, html) {
  const path = join(here, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, html);
}

function page({ look, title, description, path, css, body, index = false }) {
  const lookAttr = index ? "" : ` data-look="${look}"`;
  const sheets = css.map((file) => `<link rel="stylesheet" href="${ASSET}/variants/${file}">`).join("\n  ");
  return `<!DOCTYPE html>
<html lang="en-AU"${lookAttr}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="noindex,nofollow">
  <link rel="canonical" href="${esc(canonical(path))}">
  <meta name="theme-color" content="#f7f7f4">
  <link rel="icon" href="${ASSET}/assets/amt-logo.png" type="image/png">
  ${BOOT}
  ${sheets}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  ${body}
  <script src="${ASSET}/variants/theme.js"></script>
</body>
</html>
`;
}

function brand(site, href) {
  const logo = `${ASSET}/assets/amt-logo.png`;
  const logo2 = `${ASSET}/assets/amt-logo@2x.png`;
  return `<a class="brand" href="${href}">
      <img src="${logo}" srcset="${logo} 183w, ${logo2} 464w" sizes="5.5rem" width="183" height="99" alt="">
      <span>${esc(site.name)}</span>
    </a>`;
}

function searchForm(id, label = "Search") {
  return `<form class="search" role="search" action="${url("catalogue/")}" method="get">
      <label class="visually-hidden" for="${id}">Search catalogue</label>
      <input id="${id}" name="q" type="search" placeholder="Name / Formula / CAS" enterkeyhint="search" autocomplete="off">
      <button type="submit">${esc(label)}</button>
    </form>`;
}

function themeButton() {
  return `<button type="button" class="theme-toggle" data-theme-toggle aria-pressed="false" aria-label="Switch to dark theme">
      <span class="when-light">Dark theme</span>
      <span class="when-dark">Light theme</span>
    </button>`;
}

function nav(look, current) {
  const home = `${ASSET}/variants/${look}/`;
  const items = [
    ["/amt/redesign/variants/", "All variants"],
    [home, "Home"],
    [`${home}lipids/`, "Lipids"],
    [url("catalogue/"), "Catalogue"],
    [url("contact/"), "Contact"],
  ];
  return `<nav class="site-nav" aria-label="Primary"><ul class="nav-list">${items
    .map(([href, label]) => {
      const currentAttr = href === current ? ' aria-current="page"' : "";
      const external = href.startsWith("http") ? ' rel="noopener noreferrer"' : "";
      return `<li><a href="${href}"${currentAttr}${external}>${esc(label)}</a></li>`;
    })
    .join("")}</ul></nav>`;
}

function utility(site) {
  const phone = `tel:${String(site.contact.phoneTel || "").replace(/\s+/g, "")}`;
  return `<div class="utility">
    <p><a href="${esc(phone)}">${esc(site.contact.phoneAu)}</a> · <a href="mailto:${esc(site.contact.emailEnquiries)}">${esc(site.contact.emailEnquiries)}</a></p>
    ${themeButton()}
  </div>`;
}

function footer(site) {
  const contact = site.contact;
  const phone = `tel:${String(contact.phoneTel || "").replace(/\s+/g, "")}`;
  return `<footer class="site-footer">
  <div class="wrap">
    <p class="concept-note">${esc(site.conceptNote)} <a href="${esc(site.officialUrl)}" rel="noopener noreferrer">Official AMT site</a></p>
    <div class="footer-grid">
      <div>
        <p class="footer-name">${esc(site.legalName)}</p>
        <address>${esc(contact.street[0])}<br>${esc(contact.street[1])}<br>${esc(contact.street[2])}</address>
        <p><a href="${esc(contact.mapUrl)}" rel="noopener noreferrer">Locate us</a></p>
      </div>
      <div>
        <p><span class="footer-label">Within Australia</span><br><a href="${esc(phone)}">${esc(contact.phoneAu)}</a></p>
        <p><span class="footer-label">International</span><br><a href="${esc(phone)}">${esc(contact.phoneIntl)}</a></p>
        <p><span class="footer-label">Email</span><br><a href="mailto:${esc(contact.emailEnquiries)}">${esc(contact.emailEnquiries)}</a><br><a href="mailto:${esc(contact.emailSales)}">${esc(contact.emailSales)}</a></p>
      </div>
      <p class="direction">Concept direction. Prices and names are the published catalogue values.</p>
    </div>
    <p class="copyright">${esc(site.copyright)}</p>
  </div>
</footer>`;
}

function header(site, look, current) {
  return `<header class="site-header">
  ${utility(site)}
  <div class="brand-row">
    ${brand(site, `${ASSET}/variants/${look}/`)}
    ${searchForm("site-search")}
    <p class="direction">${esc(LOOKS[look].name)}</p>
  </div>
  ${nav(look, current)}
</header>`;
}

function familyLink(look, card) {
  if (card.path === "families/lipids/" || card.name === "Lipids") return lipidHref(look);
  return url(card.path);
}

function heroCategories(site, look) {
  return (site.hero.categories || [])
    .map((item) => {
      const href = item.path === "families/lipids/" ? lipidHref(look) : url(item.path);
      return `<li><a href="${href}">${esc(item.label)}</a></li>`;
    })
    .join("");
}

function brochureList(site) {
  return (site.brochures || [])
    .map((item) => `<li><a href="${esc(item.href)}" rel="noopener noreferrer">${esc(item.label)}</a></li>`)
    .join("");
}

function whatsNewEntries(rows) {
  return rows.map(({ product, flyer }) => {
    const published = String(product.name || "").trim();
    const heading = published || product.sku || product.id;
    const missing = published ? "" : `<p class="fine">AMT has not published a name for this catalogue number.</p>`;
    const cas = flyer.cas || product.cas || "";
    return {
      href: productHref(product),
      heading,
      sku: product.sku || "",
      missing,
      cas: cas ? `CAS ${cas}` : "",
      packs: packs(flyer.packs),
    };
  });
}

function newsHtml(site) {
  return (site.news || [])
    .map((article) => `<article id="${esc(article.id)}">
      <h3>${esc(article.title)}</h3>
      <p class="fine">${esc(article.date)}</p>
      ${paragraphs(article.paragraphs)}
    </article>`)
    .join("");
}

function partnerHtml(site) {
  return (site.partners || [])
    .map((item) => {
      const logo = PARTNER_LOGOS[item.name];
      const img = logo
        ? `<img src="${ASSET}/${logo[0]}" width="${logo[1]}" height="${logo[2]}" alt="">`
        : "";
      return `<li><a href="${esc(item.href)}" rel="noopener noreferrer">${img}<span>${esc(item.name)}</span></a></li>`;
    })
    .join("");
}

function pngSize(bytes) {
  if (bytes.length < 24 || bytes[0] !== 0x89) return null;
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

function structureFigure(row) {
  const size = row._imageSize || [566, 148];
  return `<figure>
      <img src="${ASSET}/${esc(row.structureImage)}" width="${size[0]}" height="${size[1]}" alt="">
      <figcaption>Structure drawing of ${esc(row.name)}, catalogue number ${esc(row.sku)}.</figcaption>
    </figure>`;
}

function platesHtml(lipids) {
  const truck = `<figure>
      <img class="drawing" src="${ASSET}/assets/logos/Delivery-Truck-e1599703368301.png" width="256" height="171" alt="">
      <figcaption>Delivery drawing published with AMT's Australian offers.</figcaption>
    </figure>`;
  const structures = lipids.filter((row) => row.structureImage).map((row) => structureFigure(row));
  return [truck, ...structures].join("");
}

function tableHtml(rows, caption, look) {
  const body = rows
    .map((product) => `<tr>
        <th scope="row"><a href="${productHref(product, look)}">${esc(product.name || product.sku || "")}</a></th>
        <td class="sku">${esc(product.sku || "")}</td>
        <td>${esc(product.cas || "")}</td>
        <td>${esc(product.purity || "")}</td>
        <td><ul class="pack-list">${packs(product.packs)}</ul></td>
      </tr>`)
    .join("");
  return `<div class="table-scroll catalogue" tabindex="0" role="region" aria-label="${esc(caption)}">
    <table>
      <caption>${esc(caption)}</caption>
      <thead><tr>
        <th scope="col">Name</th>
        <th scope="col">Catalogue number</th>
        <th scope="col">CAS</th>
        <th scope="col">Purity</th>
        <th scope="col">Packs</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function homeA(model) {
  const { site, look, entries } = model;
  const cards = (site.familyCards || [])
    .map((card, index) => `<li><a href="${familyLink(look, card)}"><span>${String(index + 1).padStart(2, "0")}</span> ${esc(card.name)}</a></li>`)
    .join("");
  const featured = (site.featured || [])
    .map((item) => `<article class="entry">
        <div>
          <h3><a href="${featuredHref(item, look)}">${esc(item.name)}</a></h3>
          <p class="meta">${esc(item.familyLabel || "")} · <span class="sku">${esc(item.sku || "")}</span>${item.note ? ` · <span class="note">${esc(item.note)}</span>` : ""}</p>
        </div>
        <ul class="pack-list">${packs(item.packs)}</ul>
      </article>`)
    .join("");
  const fresh = entries
    .map((item) => `<article class="entry">
        <div>
          <h3><a href="${item.href}">${esc(item.heading)}</a></h3>
          <p class="meta"><span class="sku">${esc(item.sku)}</span>${item.cas ? ` · ${esc(item.cas)}` : ""}</p>
          ${item.missing}
        </div>
        <ul class="pack-list">${item.packs}</ul>
      </article>`)
    .join("");
  return `${header(site, look, `${ASSET}/variants/a/`)}
<main id="main">
  <section class="hero">
    <p class="idx">01</p>
    <div class="hero-split">
      <div>
        <p class="eyebrow">${esc(site.hero.eyebrow)}</p>
        <h1>${esc(site.hero.title)}</h1>
        <p class="lede">${esc(site.hero.lede)}</p>
      </div>
      <div>
        <ol class="toc">${heroCategories(site, look)}</ol>
        <ul class="facts">${(site.facts || []).map((fact) => `<li>${rich(fact)}</li>`).join("")}</ul>
      </div>
    </div>
  </section>
  <section class="block" id="australia">
    <p class="idx">02</p>
    <div>
      <h2>${esc(site.offers.heading)}</h2>
      <ul class="plain-list">${(site.offers.items || []).map((item) => `<li>${rich(item)}</li>`).join("")}</ul>
      <p><a href="${url("contact/")}">${esc(site.offers.close)}</a></p>
    </div>
  </section>
  <section class="block" id="search">
    <p class="idx">03</p>
    <div>
      <h2>Catalogue search</h2>
      ${searchForm("catalogue-search", "Search Chemical")}
      <p class="fine">Structure search stays on the <a href="https://www.amtechpl.com/structure-search/" rel="noopener noreferrer">AMT site</a>.</p>
    </div>
  </section>
  <section class="block" id="brochures">
    <p class="idx">04</p>
    <div class="split">
      <div>
        <h2>Recent AMT Brochures</h2>
        <ul class="plain-list">${brochureList(site)}</ul>
      </div>
      <div>
        <h2>Product families</h2>
        <ul class="toc">${cards}</ul>
      </div>
    </div>
  </section>
  <section class="block" id="whats-new">
    <p class="idx">05</p>
    <div>
      <p class="eyebrow">16 May 2025</p>
      <h2>What's new</h2>
      <p class="lede">NEW PRODUCTS MAY 2025</p>
      <p class="fine">Prices in US dollars, from the 16 May 2025 new-products list.</p>
      ${fresh}
    </div>
  </section>
  <section class="block" id="featured">
    <p class="idx">06</p>
    <div>
      <h2>Featured Products</h2>
      ${featured}
    </div>
  </section>
  <section class="block prose" id="services">
    <p class="idx">07</p>
    <div>
      <h2>${esc(site.services.heading)}</h2>
      ${paragraphs(site.services.paragraphs)}
      <p>${rich(site.services.equipment)}</p>
    </div>
  </section>
  <section class="block" id="partners">
    <p class="idx">08</p>
    <div>
      <h2>Partners</h2>
      <ul class="plain-list">${(site.partners || []).map((item) => `<li><a href="${esc(item.href)}" rel="noopener noreferrer">${esc(item.name)}</a></li>`).join("")}</ul>
    </div>
  </section>
  <section class="block news" id="news">
    <p class="idx">09</p>
    <div>
      <h2>News</h2>
      ${newsHtml(site)}
    </div>
  </section>
  <section class="block" id="quote">
    <p class="idx">10</p>
    <div>
      <h2>${esc(site.quote.heading)}</h2>
      <p>${esc(site.quote.line)}</p>
      <p><a class="btn" href="tel:${esc(site.contact.phoneTel)}">${esc(site.contact.phoneAu)}</a></p>
      <p><a href="mailto:${esc(site.contact.emailEnquiries)}">${esc(site.contact.emailEnquiries)}</a></p>
    </div>
  </section>
</main>
${footer(site)}`;
}

function homeB(model) {
  const { site, look, entries, counts } = model;
  const bars = counts
    .map((row) => `<li><span>${esc(row.label)}</span><span class="count-bar" aria-hidden="true"><span style="--w:${row.width}"></span></span><span>${row.count}</span></li>`)
    .join("");
  const cards = (site.familyCards || [])
    .map((card) => `<article class="card"><h3><a href="${familyLink(look, card)}">${esc(card.name)}</a></h3></article>`)
    .join("");
  const fresh = entries
    .map((item) => `<article class="card">
        <h3><a href="${item.href}">${esc(item.heading)}</a></h3>
        <p class="sku">${esc(item.sku)}</p>
        ${item.missing}
        ${item.cas ? `<p class="meta">${esc(item.cas)}</p>` : ""}
        <ul class="pack-list">${item.packs}</ul>
      </article>`)
    .join("");
  const featured = (site.featured || [])
    .map((item) => `<article class="card">
        <p class="eyebrow">${esc(item.familyLabel || "")}</p>
        <h3><a href="${featuredHref(item, look)}">${esc(item.name)}</a></h3>
        <p class="sku">${esc(item.sku || "")}</p>
        ${item.note ? `<p class="meta">${esc(item.note)}</p>` : ""}
        <ul class="pack-list">${packs(item.packs)}</ul>
      </article>`)
    .join("");
  return `${header(site, look, `${ASSET}/variants/b/`)}
<main id="main">
  <section class="deck">
    <div>
      <p class="status">Scoresby · VIC · 3179</p>
      <p class="eyebrow">${esc(site.hero.eyebrow)}</p>
      <h1>${esc(site.hero.title)}</h1>
      <p class="readout">${esc(site.hero.lede)}</p>
      <ul class="facts">${(site.facts || []).map((fact) => `<li>${rich(fact)}</li>`).join("")}</ul>
    </div>
    <div class="panel">
      <h2>Catalogue rows</h2>
      <ul class="counts">${bars}</ul>
      <svg class="trace" viewBox="0 0 400 72" aria-hidden="true" focusable="false">
        <polyline points="0,58 36,56 62,60 84,18 108,62 150,54 188,58 214,14 232,64 280,52 318,48 344,16 368,50 400,44" fill="none" stroke="currentColor" stroke-width="1.6"/>
      </svg>
      <p class="motif-label">Decorative trace. Not a measurement.</p>
    </div>
  </section>
  <section class="section" id="australia">
    <h2>${esc(site.offers.heading)}</h2>
    <ul>${(site.offers.items || []).map((item) => `<li>${rich(item)}</li>`).join("")}</ul>
    <p><a href="${url("contact/")}">${esc(site.offers.close)}</a></p>
  </section>
  <section class="section" id="search">
    <h2>Catalogue search</h2>
    ${searchForm("catalogue-search", "Search Chemical")}
    <p class="fine">Structure search stays on the <a href="https://www.amtechpl.com/structure-search/" rel="noopener noreferrer">AMT site</a>.</p>
  </section>
  <section class="section mosaic" id="families">
    <div>
      <h2>Product families</h2>
      <div class="card-grid">${cards}</div>
    </div>
    <div id="brochures">
      <h2>Recent AMT Brochures</h2>
      <ul class="plain-list">${brochureList(site)}</ul>
    </div>
  </section>
  <section class="section" id="whats-new">
    <p class="eyebrow">16 May 2025</p>
    <h2>What's new</h2>
    <p>NEW PRODUCTS MAY 2025</p>
    <p class="fine">Prices in US dollars, from the 16 May 2025 new-products list.</p>
    <div class="card-grid">${fresh}</div>
  </section>
  <section class="section" id="featured">
    <h2>Featured Products</h2>
    <div class="card-grid">${featured}</div>
  </section>
  <section class="section prose" id="services">
    <h2>${esc(site.services.heading)}</h2>
    ${paragraphs(site.services.paragraphs)}
    <p>${rich(site.services.equipment)}</p>
  </section>
  <section class="section" id="partners">
    <h2>Partners</h2>
    <ul class="partner-row">${partnerHtml(site)}</ul>
  </section>
  <section class="section news" id="news">
    <h2>News</h2>
    ${newsHtml(site)}
  </section>
  <section class="section quote-band" id="quote">
    <h2>${esc(site.quote.heading)}</h2>
    <p>${esc(site.quote.line)}</p>
    <p><a class="btn" href="tel:${esc(site.contact.phoneTel)}">${esc(site.contact.phoneAu)}</a></p>
    <p><a href="mailto:${esc(site.contact.emailEnquiries)}">${esc(site.contact.emailEnquiries)}</a></p>
  </section>
</main>
${footer(site)}`;
}

function homeC(model) {
  const { site, look, entries, lipids } = model;
  const stories = entries
    .map((item) => `<article class="story">
        <h3><a href="${item.href}">${esc(item.heading)}</a></h3>
        <p class="fine"><span class="sku">${esc(item.sku)}</span>${item.cas ? ` · ${esc(item.cas)}` : ""}</p>
        ${item.missing}
        <ul class="pack-list">${item.packs}</ul>
      </article>`)
    .join("");
  const featured = (site.featured || [])
    .map((item) => `<article class="story">
        <p class="eyebrow">${esc(item.familyLabel || "")}</p>
        <h3><a href="${featuredHref(item, look)}">${esc(item.name)}</a></h3>
        <p class="fine"><span class="sku">${esc(item.sku || "")}</span>${item.note ? ` · ${esc(item.note)}` : ""}</p>
        <ul class="pack-list">${packs(item.packs)}</ul>
      </article>`)
    .join("");
  return `${header(site, look, `${ASSET}/variants/c/`)}
<main id="main">
  <section class="spread">
    <p class="eyebrow">${esc(site.hero.eyebrow)}</p>
    <h1>${esc(site.hero.title)}</h1>
    <p class="deck-lede">${esc(site.hero.lede)}</p>
    <div class="plates">${platesHtml(lipids)}</div>
  </section>
  <section class="section" id="australia">
    <h2>${esc(site.offers.heading)}</h2>
    <ul>${(site.offers.items || []).map((item) => `<li>${rich(item)}</li>`).join("")}</ul>
    <p><a href="${url("contact/")}">${esc(site.offers.close)}</a></p>
  </section>
  <section class="section" id="search">
    <h2>Catalogue search</h2>
    ${searchForm("catalogue-search", "Search Chemical")}
    <p class="fine">Structure search stays on the <a href="https://www.amtechpl.com/structure-search/" rel="noopener noreferrer">AMT site</a>.</p>
  </section>
  <section class="section" id="families">
    <h2>Product families</h2>
    <ul class="plain-list">${(site.familyCards || []).map((card) => `<li><a href="${familyLink(look, card)}">${esc(card.name)}</a></li>`).join("")}</ul>
  </section>
  <section class="section" id="brochures">
    <h2>Recent AMT Brochures</h2>
    <ul class="plain-list">${brochureList(site)}</ul>
  </section>
  <section class="section" id="whats-new">
    <p class="eyebrow">16 May 2025</p>
    <h2>What's new</h2>
    <p class="deck-lede">NEW PRODUCTS MAY 2025</p>
    <p class="fine">Prices in US dollars, from the 16 May 2025 new-products list.</p>
    ${stories}
  </section>
  <section class="section" id="featured">
    <h2>Featured Products</h2>
    ${featured}
  </section>
  <section class="section prose" id="services">
    <blockquote class="pull"><p>${esc(site.quote.line)}</p></blockquote>
    <h2>${esc(site.services.heading)}</h2>
    ${paragraphs(site.services.paragraphs)}
    <p>${rich(site.services.equipment)}</p>
  </section>
  <section class="section" id="partners">
    <h2>Partners</h2>
    <ul class="partner-row">${partnerHtml(site)}</ul>
  </section>
  <section class="section news" id="news">
    <h2>News</h2>
    ${newsHtml(site)}
  </section>
  <section class="section" id="quote">
    <h2>${esc(site.quote.heading)}</h2>
    <p><a class="btn" href="tel:${esc(site.contact.phoneTel)}">${esc(site.contact.phoneAu)}</a></p>
    <p><a href="mailto:${esc(site.contact.emailSales)}">${esc(site.contact.emailSales)}</a></p>
  </section>
</main>
${footer(site)}`;
}

function familyPage(model, look) {
  const { site, family, lipids } = model;
  const intro = `${paragraphs(family.paragraphs)}
    <p><a href="${esc(family.brochure.href)}" rel="noopener noreferrer">${esc(family.brochure.label)}</a></p>
    <p><a class="btn" href="${url("catalogue/?family=lipids")}">Search and filter this family</a></p>`;
  const structurePlates = look === "c"
    ? `<div class="plates lead-plates">${lipids.filter((row) => row.structureImage).map((row) => structureFigure(row)).join("")}</div>`
    : "";
  const current = `${ASSET}/variants/${look}/lipids/`;
  return `${header(site, look, current)}
<main id="main">
  <section class="family-open">
    ${look === "a" ? `<p class="idx">01</p>` : ""}
    <div class="family-copy">
      <p class="eyebrow">26 August 2026</p>
      <h1>${esc(family.title)}</h1>
      ${intro}
    </div>
    ${structurePlates}
  </section>
  <section class="section block" id="catalogue">
    ${look === "a" ? `<p class="idx">02</p><div>` : ""}
    <h2>${lipids.length} published lipid rows</h2>
    ${tableHtml(lipids, "Lipids", look)}
    <p class="fine">Published text from <a href="${esc(family.sourceHref)}" rel="noopener noreferrer">${esc(family.sourceLabel)}</a>.</p>
    ${look === "a" ? `</div>` : ""}
  </section>
</main>
${footer(site)}`;
}

function productPage(model, look) {
  const { site, family, showcase } = model;
  const facts = [
    ["CAS", showcase.cas],
    ["Purity", showcase.purity],
  ].filter(([, value]) => value);
  const dl = `<dl class="spec">${facts
    .map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`)
    .join("")}</dl>`;
  const label = Array.isArray(showcase.homepageLabels) && showcase.homepageLabels[0]
    ? `<p class="note">${esc(showcase.homepageLabels[0])}</p>`
    : "";
  const figure = showcase.structureImage
    ? `<div class="structure">${structureFigure(showcase)}</div>`
    : "";
  const quote = `<p><a class="btn" href="mailto:${esc(site.contact.emailSales)}?subject=${encodeURIComponent(`Quote ${showcase.sku}`)}">Request a quote</a></p>`;
  const current = `${ASSET}/variants/${look}/products/${SHOWCASE_ID}/`;
  return `${header(site, look, current)}
<main id="main">
  <article class="product-sheet ${look === "a" ? "family-open" : "section"}">
    ${look === "a" ? `<p class="idx">01</p>` : ""}
    <div class="family-copy">
      <p class="eyebrow"><a href="${lipidHref(look)}">${esc(family.title)}</a></p>
      <h1>${esc(showcase.name)}</h1>
      <p class="sku">${esc(showcase.sku)}</p>
      ${label}
      ${figure}
      ${dl}
      <h2>Packs</h2>
      <ul class="pack-list">${packs(showcase.packs)}</ul>
      ${quote}
      <p class="fine">Prices in US dollars. Published text from <a href="${esc(family.sourceHref)}" rel="noopener noreferrer">${esc(family.sourceLabel)}</a>.</p>
      <p><a href="${lipidHref(look)}">Back to the ${esc(family.title)} catalogue</a></p>
    </div>
  </article>
</main>
${footer(site)}`;
}

function shotFigure(manifest, key, caption) {
  const shot = manifest[key];
  if (!shot) return "";
  return `<figure>
      <img src="${ASSET}/variants/shots/${esc(key)}.webp" width="${Number(shot.w)}" height="${Number(shot.h)}" alt="" loading="lazy">
      <figcaption>${esc(caption)}</figcaption>
    </figure>`;
}

function indexPage(site, manifest) {
  const directions = Object.values(LOOKS)
    .map((look) => {
      const shots = [
        shotFigure(manifest, `${look.id}-home-desktop`, `${look.name} home, desktop`),
        shotFigure(manifest, `${look.id}-home-mobile`, `${look.name} home, mobile`),
      ].join("");
      return `<article class="direction" id="look-${look.id}">
        <h2>${esc(look.name)}</h2>
        <p>${esc(look.line)}</p>
        <div class="shots">${shots}</div>
        <p class="links"><a href="${ASSET}/variants/${look.id}/">Home</a> <a href="${ASSET}/variants/${look.id}/lipids/">Lipids catalogue</a> <a href="${ASSET}/variants/${look.id}/products/${SHOWCASE_ID}/">Lipid 5</a></p>
      </article>`;
    })
    .join("");
  const body = `<header class="mast">
    <div class="utility">
      <p><a href="${ASSET}/">Back to the current redesign</a></p>
      ${themeButton()}
    </div>
    <div class="brand-row">${brand(site, `${ASSET}/variants/`)}</div>
  </header>
  <main id="main" class="chooser">
    <h1>Three looks for the catalogue</h1>
    <p class="lede">Each direction is a home, the lipids catalogue, and the Lipid 5 page, linked together. The buttons swap colour, type, and radius.</p>
    <div class="look-switch" role="group" aria-label="Apply a variant token set">
      <button type="button" data-look-set="a" aria-pressed="false">Swiss grid</button>
      <button type="button" data-look-set="b" aria-pressed="false">Lab readout</button>
      <button type="button" data-look-set="c" aria-pressed="false">Editorial</button>
    </div>
    <div class="specimen">
      <p class="eyebrow">${esc(site.hero.eyebrow)}</p>
      <p class="specimen-title">${esc(site.hero.title)}</p>
      <p>${esc(site.hero.lede)}</p>
      <div class="swatches" aria-hidden="true">
        <span style="background:var(--bg)"></span>
        <span style="background:var(--surface)"></span>
        <span style="background:var(--ink)"></span>
        <span style="background:var(--accent)"></span>
      </div>
      <p><a class="btn" data-look-href href="${ASSET}/variants/a/">Open this look</a></p>
      <p class="fine">Token names match <span class="sku">css/tokens.css</span>. Copy the matching block from <span class="sku">variants/tokens.css</span> into that file to try the look on the live shell.</p>
    </div>
    ${directions}
  </main>
  ${footer(site)}`;
  return page({
    index: true,
    title: "Design variants · Advanced Molecular Technologies",
    description: "Three concept directions for the AMT catalogue redesign: Swiss grid, lab readout, and editorial. Unlisted concept, not the official site.",
    path: "variants/",
    css: ["tokens.css", "base.css", "index.css"],
    body,
  });
}

async function main() {
  const { site, products } = await loadData(redesign);
  const lipids = [];
  for (const product of products) {
    if (!product || product.family !== "lipids" || !(product.name || product.sku)) continue;
    if (product.structureImage) {
      const size = pngSize(await readFile(join(redesign, product.structureImage)));
      product._imageSize = size || [566, 148];
    }
    lipids.push(product);
  }
  const family = site.families.find((item) => item.id === "lipids");
  if (!family) throw new Error("Missing lipids family in site data");
  const entries = whatsNewEntries(flyerRows(products));
  if (entries.length !== 9) throw new Error(`Expected 9 new-product rows, found ${entries.length}`);
  const modelBase = { site, entries, counts: countsOf(products), lipids, family };
  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(join(here, "shots", "manifest.json"), "utf8"));
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }

  const homes = { a: homeA, b: homeB, c: homeC };
  const titles = {
    a: "Swiss grid · Advanced Molecular Technologies",
    b: "Lab readout · Advanced Molecular Technologies",
    c: "Editorial · Advanced Molecular Technologies",
  };
  for (const look of ["a", "b", "c"]) {
    const model = { ...modelBase, look };
    const home = page({
      look,
      title: titles[look],
      description: site.hero.lede + " Concept redesign direction, not the official AMT site.",
      path: `variants/${look}/`,
      css: ["tokens.css", "base.css", `${look}.css`],
      body: homes[look](model),
    });
    const familyHtml = page({
      look,
      title: `Lipids, ${LOOKS[look].name} · Advanced Molecular Technologies`,
      description: family.description,
      path: `variants/${look}/lipids/`,
      css: ["tokens.css", "base.css", `${look}.css`],
      body: familyPage(model, look),
    });
    const showcase = lipids.find((row) => row.id === SHOWCASE_ID);
    if (!showcase) throw new Error(`Missing showcase product ${SHOWCASE_ID}`);
    const productHtml = page({
      look,
      title: `${showcase.name} · ${LOOKS[look].name} · Advanced Molecular Technologies`,
      description: `${showcase.name}, ${showcase.sku}. ${family.description}`,
      path: `variants/${look}/products/${SHOWCASE_ID}/`,
      css: ["tokens.css", "base.css", `${look}.css`],
      body: productPage({ ...model, showcase }, look),
    });
    await writePage(`${look}/index.html`, home);
    await writePage(`${look}/lipids/index.html`, familyHtml);
    await writePage(`${look}/products/${SHOWCASE_ID}/index.html`, productHtml);
  }
  await writePage("index.html", indexPage(site, manifest));

  const pages = ["index.html", "a/index.html", "a/lipids/index.html", "b/index.html", "b/lipids/index.html", "c/index.html", "c/lipids/index.html", `a/products/${SHOWCASE_ID}/index.html`, `b/products/${SHOWCASE_ID}/index.html`, `c/products/${SHOWCASE_ID}/index.html`];
  for (const rel of pages) {
    const html = await readFile(join(here, rel), "utf8");
    for (const needle of ["noindex,nofollow", site.conceptNote]) {
      if (!html.includes(needle)) throw new Error(`${rel} missing ${needle}`);
    }
    if (rel !== "index.html" && !html.includes("Name / Formula / CAS")) throw new Error(`${rel} missing search`);
    if (rel.endsWith("lipids/index.html") && !html.includes("Search and filter this family")) {
      throw new Error(`${rel} missing catalogue link`);
    }
  }
  for (const look of ["a", "b", "c"]) {
    const href = `${ASSET}/variants/${look}/products/${SHOWCASE_ID}/`;
    const home = await readFile(join(here, `${look}/index.html`), "utf8");
    const listing = await readFile(join(here, `${look}/lipids/index.html`), "utf8");
    const product = await readFile(join(here, `${look}/products/${SHOWCASE_ID}/index.html`), "utf8");
    if (!home.includes(href) || !listing.includes(href)) throw new Error(`${look} does not link to Lipid 5`);
    if (!product.includes(`${ASSET}/variants/${look}/lipids/`)) throw new Error(`${look} product does not link back to lipids`);
    if (!product.includes("2089251-33-0") || !product.includes("$140.00")) throw new Error(`${look} product dropped published fields`);
  }
  console.log(`variants: 7 pages, ${lipids.length} lipids, ${entries.length} new products`);
}

await main();
