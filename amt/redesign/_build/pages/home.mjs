import { esc, paragraphs, rich } from "../lib/html.mjs";
import { url } from "../lib/paths.mjs";
import { featuredCard, motif } from "../lib/ui.mjs";

export async function build({ site, renderPage, writeFile }) {
  const heroLinks = (site.hero.categories || [])
    .map((item) => `<li><a href="${url(item.path)}">${esc(item.label)}</a></li>`)
    .join("");
  const facts = (site.facts || []).map((fact) => `<li>${rich(fact)}</li>`).join("");
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
  const featured = (site.featured || []).map((item) => featuredCard(item)).join("");
  const partners = (site.partners || [])
    .map((item) => `<li><a href="${esc(item.href)}" rel="noopener noreferrer">${esc(item.name)}</a></li>`)
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
    <h2>Catalogue search</h2>
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
  <section class="section" id="families">
    <h2>Product families</h2>
    <div class="card-grid">${cards}</div>
  </section>
  <section class="section" id="featured">
    <h2>Featured Products</h2>
    <div class="card-grid cards-wide">${featured}</div>
  </section>
  <section class="section prose" id="services">
    <h2>${esc(site.services.heading)}</h2>
    ${paragraphs(site.services.paragraphs)}
    <p>${rich(site.services.equipment)}</p>
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
