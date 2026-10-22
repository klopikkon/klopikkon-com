import { bulletList, paragraphs, rich } from "../lib/html.mjs";
import { url } from "../lib/paths.mjs";
import { breadcrumbs, sourceLine } from "../lib/ui.mjs";
import { esc } from "../lib/html.mjs";

function instrument(block) {
  const note = block.note ? `<p>${rich(block.note)}</p>` : "";
  return `<section>
    <h3>${esc(block.name)}</h3>
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
  <ul>${services}</ul>
  <section id="contract-research">
    <h2>${esc(about.cro.heading)}</h2>
    ${bulletList(about.cro.bullets)}
    ${paragraphs(about.cro.paragraphs)}
    <ul class="chip-row">${about.cro.tags.map((tag) => `<li><span class="chip">${esc(tag)}</span></li>`).join("")}</ul>
    <p><a href="${url("contact/")}">${esc(about.contactLine)}</a></p>
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
