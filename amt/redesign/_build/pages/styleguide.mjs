import { url } from "../lib/paths.mjs";
import { breadcrumbs, featuredCard, priceBadge } from "../lib/ui.mjs";

const SWATCHES = [
  ["Background", "--bg"],
  ["Surface", "--surface"],
  ["Ink", "--ink"],
  ["Muted", "--muted"],
  ["Accent", "--accent"],
  ["Copper", "--copper"],
  ["Price lower", "--green-bg"],
  ["Price split", "--amber-bg"],
  ["Price higher", "--red-bg"],
];

export async function build({ renderPage, writeFile }) {
  const swatches = SWATCHES.map(
    ([name, token]) => `<figure class="swatch">
      <div class="swatch-chip" style="background: var(${token})"></div>
      <figcaption><span class="sku">${token}</span><br>${name}</figcaption>
    </figure>`,
  ).join("");

  const specimen = featuredCard({
    name: "Specimen card",
    sku: "SPECIMEN",
    familyLabel: "Component",
    note: "Sample label",
    packs: [
      { size: "100 mg", priceText: "quote" },
      { size: "1 g", priceText: "$80" },
    ],
  });

  const body = `<div class="wrap page-intro">
  ${breadcrumbs([
    { label: "Home", href: url("") },
    { label: "Styleguide" },
  ])}
  <h1>Styleguide</h1>
  <p class="lede">Component specimens for this concept redesign. Use the theme control in the header to check light and dark. Nothing in the specimen blocks is an AMT product claim.</p>

  <section class="section" id="type">
    <h2>Type</h2>
    <ul class="scale-list">
      <li><span class="eyebrow">Eyebrow</span></li>
      <li><h1>Heading one</h1></li>
      <li><h2>Heading two</h2></li>
      <li><h3>Heading three</h3></li>
      <li><p>Body text for catalogue prose, set in the system sans at 1rem.</p></li>
      <li><p class="sku">AMTGC000-SKU00 · catalogue number</p></li>
      <li><p class="fine">Secondary note, still at least 13px.</p></li>
    </ul>
  </section>

  <section class="section" id="colour">
    <h2>Colour</h2>
    <div class="swatch-grid">${swatches}</div>
  </section>

  <section class="section" id="buttons">
    <h2>Buttons</h2>
    <p>
      <button class="btn btn-primary" type="button">Primary</button>
      <a class="btn btn-secondary" href="#buttons">Secondary</a>
      <a class="btn btn-ghost" href="#buttons">Ghost</a>
    </p>
  </section>

  <section class="section" id="badges">
    <h2>Badges</h2>
    <p>Price-position badges keep a text label as well as colour. Green: AMT has the lowest published list on a matched pack. Amber: the result depends on pack size, an analogue, or a currency gap within 25%. Red: a competitor prints a lower list.</p>
    <p>
      ${priceBadge("green")}
      ${priceBadge("amber")}
      ${priceBadge("red")}
      <span class="badge">Neutral</span>
    </p>
  </section>

  <section class="section" id="cards">
    <h2>Cards</h2>
    <div class="card-grid">${specimen}</div>
  </section>

  <section class="section" id="chips">
    <h2>Chips</h2>
    <ul class="chip-row">
      <li><a class="chip" href="${url("families/lipids/")}">Lipids</a></li>
      <li><a class="chip" href="${url("families/peg/")}" aria-current="page">PEG linkers</a></li>
      <li><span class="chip">Static chip</span></li>
    </ul>
  </section>

  <section class="section" id="breadcrumbs">
    <h2>Breadcrumbs</h2>
    <p class="fine">The trail at the top of this page is the live component.</p>
  </section>

  <section class="section" id="table">
    <h2>Table</h2>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Price position legend">
      <table>
        <caption>Price position legend</caption>
        <thead>
          <tr>
            <th scope="col">Badge</th>
            <th scope="col">Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${priceBadge("green")}</td>
            <td>AMT cheapest published list on a matched pack.</td>
          </tr>
          <tr>
            <td>${priceBadge("amber")}</td>
            <td>Pack-size split, analogue-only peer, or currency split within 25%.</td>
          </tr>
          <tr>
            <td>${priceBadge("red")}</td>
            <td>A competitor prints a lower list.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="section" id="tabs">
    <h2>Tabs</h2>
    <p class="fine">Radio tabs work from the keyboard without JavaScript. Arrow keys move the selected tab once a tab has focus.</p>
    <div class="tabs">
      <input class="tab-radio" type="radio" name="specimen-tabs" id="tab-packs" checked>
      <input class="tab-radio" type="radio" name="specimen-tabs" id="tab-docs">
      <input class="tab-radio" type="radio" name="specimen-tabs" id="tab-notes">
      <div class="tablist">
        <label class="tab" for="tab-packs">Packs</label>
        <label class="tab" for="tab-docs">Documents</label>
        <label class="tab" for="tab-notes">Notes</label>
      </div>
      <div class="panels">
        <div class="panel" id="panel-packs"><p>Specimen panel for pack sizes. Unpublished prices read “quote”.</p></div>
        <div class="panel" id="panel-docs"><p>Specimen panel for SDS, CoA and datasheet links.</p></div>
        <div class="panel" id="panel-notes"><p>Specimen panel for handling notes. No handling advice is invented here.</p></div>
      </div>
    </div>
  </section>

  <section class="section" id="forms">
    <h2>Forms</h2>
    <form class="form" action="#forms">
      <div class="field">
        <label for="sg-name">Label</label>
        <input id="sg-name" name="sg-name" type="text" placeholder="Name / Formula / CAS" autocomplete="off">
        <p class="hint">Hint text sits under the field.</p>
      </div>
      <div class="field">
        <label for="sg-email">Email</label>
        <input id="sg-email" name="sg-email" type="email" autocomplete="email" aria-describedby="sg-email-error" aria-invalid="true">
        <p class="field-error" id="sg-email-error">Specimen error: enter an email address.</p>
      </div>
      <div class="field">
        <label for="sg-topic">Select</label>
        <select id="sg-topic" name="sg-topic">
          <option>Lipids</option>
          <option>PEG reagents</option>
          <option>Fluorophores</option>
        </select>
      </div>
      <div class="field">
        <label for="sg-notes">Message</label>
        <textarea id="sg-notes" name="sg-notes"></textarea>
      </div>
      <label class="check"><input type="checkbox" name="sg-copy"> Specimen checkbox</label>
      <button class="btn btn-primary" type="submit">Submit specimen</button>
    </form>
  </section>
</div>`;

  await writeFile("styleguide/index.html", renderPage({
    title: "Styleguide - Advanced Molecular Technologies",
    description: "Design system specimens for the AMT concept redesign: colour, type, buttons, badges, cards, tables, tabs and forms.",
    path: "styleguide/",
    body,
  }));
}
