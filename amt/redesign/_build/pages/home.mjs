import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { esc, paragraphs, rich } from "../lib/html.mjs";
import { url } from "../lib/paths.mjs";
import { featuredCard, motif } from "../lib/ui.mjs";

const redesignRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Drawings the live homepage shows for the featured rows. */
const FEATURED_IMAGE = {
  "AMTGC1533-LP25": "assets/structures/Lipid-5.png",
  "AMTGC903-AL21": "assets/structures/AMTGC903-AL21.png",
  "AMTGC1223-PL23": "assets/structures/AMTGC1223-PL23.png",
  "AMTGC1264-AH24": "assets/structures/AMTGC1264-AH24.png",
  "AMTGC1266-AO24": "assets/structures/AMTGC1266-AO24.png",
  "AMTGC1269-CB24": "assets/structures/AMTGC1269-CB24.png",
  "AMTH390-DF24": "assets/structures/AMTH390-DF24.png",
  "AMTGC936-SM21": "assets/structures/AMTGC936-SM21.png",
  "AMTGC125-AT15": "assets/structures/AMTGC125-AT15.png",
  "AMTGC807-AM21": "assets/structures/AMTGC807-AM21.png",
  "AMTGC1441-DB25": "assets/structures/AMTGC1441-DB25-1.jpg",
  "AMTGC187-AC16": "assets/structures/AMTGC187-AC16.png",
};

const SERVICE_PHOTOS = [
  {
    file: "Bruker-Avance-III-400-MHz-NMR2.jpg",
    alt: "Bruker Avance III 400 MHz NMR | Custom Contract Synthesis | Analytical Services | Advanced Molecular Technologies",
    w: 400,
    h: 500,
  },
  {
    file: "Waters-Alliance-HPLC2.jpg",
    alt: "Waters HPLC | Custom Contract Synthesis | Analytical Services | Advanced Molecular Technologies",
    w: 396,
    h: 500,
  },
];

function photoTag(file, alt, w, h) {
  const cap = Math.max(1, Math.floor(w / 1.5));
  return `<img class="photo" src="${url(`assets/photos/${file}`)}" width="${w}" height="${h}" alt="${esc(alt)}" style="--photo-w:${cap}px" loading="lazy" decoding="async">`;
}

async function imageSize(rel) {
  const buf = await readFile(join(redesignRoot, rel));
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc2) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error(`No pixel size in ${rel}`);
}

const FLYER_ID = "new-products-20250516";

function flyerEntries(products) {
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

function flyerPacks(packs) {
  if (!Array.isArray(packs) || !packs.length) {
    return `<li><span>Pack</span> <span>quote</span></li>`;
  }
  return packs
    .map((pack) => {
      const size = pack.size ? esc(pack.size) : "Pack";
      const price = pack.priceText || "quote";
      return `<li><span>${size}</span> <span>${esc(price)}</span></li>`;
    })
    .join("");
}

function whatsNew(products) {
  const rows = flyerEntries(products);
  if (!rows.length) return "";
  const pdf = rows[0].flyer.pdf || "https://www.amtechpl.com/wp-content/uploads/2025/05/New_Products_20250516.pdf";
  const cards = rows.map(({ product, flyer }) => {
    const publishedName = String(product.name || "").trim();
    const href = url(`products/${encodeURIComponent(product.id)}/`);
    const heading = publishedName || product.sku || product.id;
    const cas = flyer.cas || product.cas || "";
    const missing = publishedName
      ? ""
      : `<p class="fine">AMT has not published a name for this catalogue number.</p>`;
    const casLine = cas ? `<p>CAS ${esc(cas)}</p>` : "";
    return `<article class="card product-card">
      <h3><a href="${href}">${esc(heading)}</a></h3>
      <p class="sku">${esc(product.sku || "")}</p>
      ${missing}
      ${casLine}
      <ul class="pack-list">${flyerPacks(flyer.packs)}</ul>
    </article>`;
  }).join("");
  return `<section class="section" id="whats-new">
    <p class="eyebrow">16 May 2025</p>
    <h2>What's new</h2>
    <p class="lede">NEW PRODUCTS MAY 2025</p>
    <p class="fine">Prices in US dollars, from the 16 May 2025 new-products list.</p>
    <div class="card-grid cards-wide">${cards}</div>
    <p class="source-line">Published rows from <a href="${esc(pdf)}" rel="noopener noreferrer">New_Products_20250516.pdf</a>.</p>
  </section>`;
}

export async function build({ site, products, renderPage, writeFile }) {
  const heroLinks = (site.hero.categories || [])
    .map((item) => `<li><a href="${url(item.path)}">${esc(item.label)}</a></li>`)
    .join("");
  const facts = (site.facts || []).map((fact) => {
    const truck = String(fact).startsWith("Next day dispatch")
      ? ` <a href="${url("#australia")}" aria-label="Australian customers"><img class="truck" src="${url("assets/logos/Delivery-Truck-e1599703368301.png")}" width="256" height="171" alt=""></a>`
      : "";
    return `<li>${rich(fact)}${truck}</li>`;
  }).join("");
  const offers = (site.offers.items || []).map((item) => `<li>${rich(item)}</li>`).join("");
  const brochures = (site.brochures || [])
    .map((item) => `<li><a href="${esc(item.href)}" rel="noopener noreferrer">${esc(item.label)}</a></li>`)
    .join("");
  const cards = (site.familyCards || [])
    .map((card) => {
      const detail = card.detail
        ? `<p><a href="${esc(card.detailHref)}" rel="noopener noreferrer">${esc(card.detail)}</a></p>`
        : "";
      return `<article class="card">
        <h3><a href="${url(card.path)}">${esc(card.name)}</a></h3>
        ${detail}
      </article>`;
    })
    .join("");
  const featured = [];
  for (const item of site.featured || []) {
    const rel = FEATURED_IMAGE[item.sku];
    let image = null;
    if (rel && existsSync(join(redesignRoot, rel))) {
      const size = await imageSize(rel);
      image = { src: rel, ...size };
    }
    featured.push(featuredCard({ ...item, image }));
  }
  const partners = (site.partners || [])
    .map((item) => {
      const file = item.logo ? String(item.logo).split("/").pop() : "";
      const local = file ? join(redesignRoot, "assets/logos", file) : "";
      const img = local && existsSync(local)
        ? `<img src="${url(`assets/logos/${file}`)}" alt="" width="${file.includes("150x150") ? 150 : file.endsWith(".png") ? 200 : 180}" height="${file.includes("150x150") ? 150 : file.endsWith(".png") ? 200 : 100}" style="--photo-w:${file.includes("150x150") ? 100 : 120}px" loading="lazy" decoding="async">`
        : "";
      return `<li><a href="${esc(item.href)}" rel="noopener noreferrer">${img}<span>${esc(item.name)}</span></a></li>`;
    })
    .join("");
  const news = (site.news || [])
    .map((article) => `<article id="${esc(article.id)}">
      <h3>${esc(article.title)}</h3>
      <p class="fine">${esc(article.date)}</p>
      ${paragraphs(article.paragraphs)}
    </article>`)
    .join("");

  const body = `<section class="hero">
  ${motif("home-lattice")}
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="eyebrow">${esc(site.hero.eyebrow)}</p>
      <h1>${esc(site.hero.title)}</h1>
      <p class="lede">${esc(site.hero.lede)}</p>
      <ul class="pipe-line">${heroLinks}</ul>
    </div>
    <ul class="fact-list">${facts}</ul>
  </div>
</section>
<div class="wrap">
  <section class="section" id="australia">
    <h2>${esc(site.offers.heading)}</h2>
    <ul>${offers}</ul>
    <p><a href="${url("contact/")}">${esc(site.offers.close)}</a></p>
  </section>
  <section class="section" id="search">
    <h2>Catalogue Search:</h2>
    <form class="search" role="search" action="${url("catalogue/")}" method="get">
      <label class="visually-hidden" for="catalogue-search">Search catalogue</label>
      <input id="catalogue-search" name="q" type="search" placeholder="Name / Formula / CAS" enterkeyhint="search" autocomplete="off">
      <button class="btn btn-primary" type="submit">Search Chemical</button>
    </form>
    <p class="fine">Structure search stays on the <a href="https://www.amtechpl.com/structure-search/" rel="noopener noreferrer">AMT site</a>.</p>
  </section>
  <section class="section" id="brochures">
    <h2>Recent AMT Brochures</h2>
    <ul>${brochures}</ul>
  </section>
  ${whatsNew(products)}
  <section class="section" id="families">
    <h2>Product families</h2>
    <div class="card-grid">${cards}</div>
  </section>
  <section class="section" id="featured">
    <h2>Featured Products:</h2>
    <div class="card-grid cards-wide">${featured.join("")}</div>
  </section>
  <section class="section prose" id="services">
    <h2>${esc(site.services.heading)}</h2>
    ${paragraphs(site.services.paragraphs)}
    <p>${rich(site.services.equipment)}</p>
    <div class="photo-row">${SERVICE_PHOTOS.map((item) => photoTag(item.file, item.alt, item.w, item.h)).join("")}</div>
  </section>
  <section class="section" id="partners">
    <h2>Partners</h2>
    <ul class="partner-list">${partners}</ul>
  </section>
  <section class="section prose" id="news">
    <h2>News</h2>
    ${news}
  </section>
  <section class="quote-band" id="quote">
    <h2>${esc(site.quote.heading)}</h2>
    <p>${esc(site.quote.line)}</p>
    <p><a class="btn btn-primary" href="tel:${esc(site.contact.phoneTel)}">${esc(site.contact.phoneAu)}</a></p>
    <p><a href="mailto:${esc(site.contact.emailEnquiries)}">${esc(site.contact.emailEnquiries)}</a></p>
  </section>
</div>`;

  await writeFile("index.html", renderPage({
    title: "Custom Organic Synthesis | Advanced Molecular Technologies",
    description: "Biotech incubator and CRO. Custom organic synthesis, PEG linkers, lipids, fluorophores, organoborons and analytical services from Scoresby, Victoria.",
    path: "",
    body,
  }));
}
