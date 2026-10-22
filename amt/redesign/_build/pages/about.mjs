import { bulletList, paragraphs, rich } from "../lib/html.mjs";
import { url } from "../lib/paths.mjs";
import { breadcrumbs, sourceLine } from "../lib/ui.mjs";
import { esc } from "../lib/html.mjs";

const SEO = "Custom Contract Synthesis | Analytical Services | Advanced Molecular Technologies";
const CRO = "Custom Contract Synthesis | CRO | Advanced Molecular Technologies";

function photo(file, alt, w, h) {
  const cap = Math.max(1, Math.floor(w / 1.5));
  return `<img class="photo" src="${url(`assets/photos/${file}`)}" width="${w}" height="${h}" alt="${esc(alt)}" style="--photo-w:${cap}px" loading="lazy" decoding="async">`;
}

const ABOUT_PHOTOS = [
  ["AMT-Exterior-Photo-1-scaled.jpg", `AMT | ${SEO}`, 2560, 1613],
  ["AMT-Interior-Photo-7-Resized.jpg", "", 2309, 1732],
  ["AMT-Interior-Photo-6-Resized.jpg", SEO, 2309, 1732],
  ["Bruker-Avance-III-400-MHz-NMR2.jpg", `Bruker Avance III 400 MHz NMR | ${SEO}`, 400, 500],
];

const CONTRACT_PHOTOS = [
  ["Kuglerohr-Photo-1-Resized.jpg", CRO, 2500, 1875],
  ["Reaction-1-Photo-1-Resized-1-e1589325800986.jpg", CRO, 1500, 1790],
  ["AMT-Interior-Photo-8-Resized.jpg", CRO, 2309, 1732],
];

const INSTRUMENT_PHOTO = {
  "Bruker Avance III 400 MHz NMR": ["Bruker-Avance-III-400-MHz-NMR.jpg", `Bruker Avance III NMR 400 MHz | ${SEO}`, 800, 500],
  "Waters Alliance HPLC": ["HPLC.jpg", `Waters HPLC | ${SEO}`, 800, 500],
  "PerkinElmer Clarus 580 Gas Chromatograph": ["Clarus-580-Gas-Chromatograph.jpg", `Clarus 580 Gas Chromatograph | ${SEO}`, 800, 500],
  "Agilent Cary 630 FTIR Spectrometer": ["Agilent-Cary-630-FTIR-Spectrometer.jpg", `Agilent Cary 630 FTIR Spectrometer | ${SEO}`, 800, 500],
  "John Morris 6850 UV-Vis": ["UV-Vis.jpg", `UV-Vis | ${SEO}`, 800, 500],
  "851 Titrando Coulometric Karl Fischer System": ["851-Titrando-Coulometric-Karl-Fischer-System.jpg", `851-Titrando-Coulometric Karl Fischer | ${SEO}`, 800, 500],
  "Rudolph Research Analytical Autopol I Automatic Polarimeter": ["Polarimeter.jpg", `Polarimeter | ${SEO}`, 800, 500],
  "Mettler Toledo Differential Scanning Calorimetry (DSC) – DSC3": ["Thermogravimetric-Analyzer.jpg", `Metler Toledo TGA | ${SEO}`, 800, 500],
  "Setaflash Series 3 Closed Cup Flash Point Tester": ["Setaflash-Series-3-Closed-Cup-Flash-Point-Tester.jpg", `John Morris Flash Point | ${SEO}`, 800, 500],
  "Biotage SP4 Flash Purification": ["Biotage-SP4-Flash-Purification-Picture-2-1-e1573520502732.jpg", `Biotage SP4 | ${SEO}`, 800, 500],
};

function gallery(items) {
  return `<div class="photo-row">${items.map((item) => photo(...item)).join("")}</div>`;
}

function instrument(block) {
  const note = block.note ? `<p>${rich(block.note)}</p>` : "";
  const shot = INSTRUMENT_PHOTO[block.name];
  const figure = shot ? photo(...shot) : "";
  return `<section>
    <h3>${esc(block.name)}</h3>
    ${figure}
    ${bulletList(block.items)}
    ${note}
  </section>`;
}

export async function build({ site, renderPage, writeFile }) {
  const about = site.about;
  const analytical = site.analytical;
  const serviceLinks = {
    "Custom Synthesis": url("about/#contract-research"),
    "Contract Research": url("about/#contract-research"),
    "Analytical Services": url("about/#analytical-services"),
  };
  const services = about.services
    .map((label) => {
      const href = serviceLinks[label];
      return href ? `<li><a href="${href}">${esc(label)}</a></li>` : `<li>${esc(label)}</li>`;
    })
    .join("");
  const instruments = (analytical.instruments || []).map(instrument).join("");
  const body = `<div class="wrap page-intro prose">
  ${breadcrumbs([
    { label: "Home", href: url("") },
    { label: "About" },
  ])}
  <h1>About Us</h1>
  ${paragraphs(site.company)}
  <p id="incubating">${esc(about.aims)}</p>
  <p>${esc(about.incubating)}</p>
  ${gallery(ABOUT_PHOTOS)}
  <ul>${services}</ul>
  <section id="contract-research">
    <h2>${esc(about.cro.heading)}</h2>
    ${bulletList(about.cro.bullets)}
    ${paragraphs(about.cro.paragraphs)}
    <ul class="chip-row">${about.cro.tags.map((tag) => `<li><span class="chip">${esc(tag)}</span></li>`).join("")}</ul>
    <p><a href="${url("contact/")}">${esc(about.contactLine)}</a></p>
    <h2>AMT Custom Synthesis in Action:</h2>
    ${gallery(CONTRACT_PHOTOS)}
    <p class="source-line">Also published at <a href="https://www.amtechpl.com/contract-services/" rel="noopener noreferrer">amtechpl.com/contract-services</a>.</p>
  </section>
  <section id="analytical-services">
    <h2>${esc(about.analyticalSummary.heading)}</h2>
    <p>${esc(about.analyticalSummary.paragraph)}</p>
    ${bulletList(about.analyticalSummary.items)}
    <p>${rich(about.analyticalSummary.more)}</p>
  </section>
  <section id="analytical-equipment">
    <h2>Analytical equipment</h2>
    <p>${esc(analytical.banner)}</p>
    ${instruments}
  </section>
  ${sourceLine("amtechpl.com/about-us", "https://www.amtechpl.com/about-us/")}
  <p class="source-line">Analytical equipment text from <a href="https://www.amtechpl.com/analytical-services/" rel="noopener noreferrer">amtechpl.com/analytical-services</a>.</p>
</div>`;

  await writeFile("about/index.html", renderPage({
    title: "About Us - Advanced Molecular Technologies",
    description: "Advanced Molecular Technologies is a biotech incubator and contract research organisation in Scoresby, Victoria, working in medicinal chemistry and custom organic synthesis.",
    path: "about/",
    body,
  }));
}
