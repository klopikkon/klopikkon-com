# AMT concept redesign

Unlisted concept redesign of [Advanced Molecular Technologies](https://www.amtechpl.com/). It is published only at `https://klopikkon.com/amt/redesign/` and is not linked from `/amt/`, `/hello`, the site root, or the passworded hub.

This file records the stack contract and the folder ownership fixed by the coordinator. It does not propose a different stack or a second design system. Visual tokens, layout, and page chrome belong to the design agent (`css/tokens.css`, `css/base.css`, `css/components.css`, `_build/lib/layout.mjs`).

Crawled 2026-10-22. Product counts and reconciliation live in [`data/COUNTS.md`](data/COUNTS.md).

## Stack contract

klopikkon.com is GitHub Pages served straight from `main`. The repo has `.nojekyll` and `CNAME`. There is no server. Built static HTML is committed under `amt/redesign/`. The base path is `/amt/redesign/`.

`.github/workflows/` is Tesla/Powerwall automation and `limits-ping.yml` only. There is no Pages build workflow. Nothing outside `amt/redesign/` is changed to fit hosting.

Generator: zero-dependency Node >= 20 ES modules in `amt/redesign/_build/`. Entry command:

```bash
node amt/redesign/_build/build.mjs
```

That regenerates all HTML into `amt/redesign/`. No `npm install` is required to build. Dev tooling such as Lighthouse or Playwright via `npx` is fine for checks and is never required to build.

Shared layout, owned by the design/shell agent: `_build/lib/layout.mjs` exports `renderPage({title, description, path, body, head})`. The returned document includes `<meta name="robots" content="noindex,nofollow">`, header/nav, a footer note "Concept redesign, not the official AMT site", and a light/dark toggle.

Page generators: `_build/pages/<name>.mjs`, each exporting `async function build(ctx)` with `ctx = {products, site, renderPage, outDir, writeFile}`. `build.mjs` loads every file in `_build/pages/`.

CSS: `css/tokens.css`, `css/base.css`, and `css/components.css` are owned by the design agent. Feature agents add only `css/<feature>.css`.

JS: vanilla ES modules `js/<feature>.js`, progressive enhancement, no framework.

Every page: `noindex,nofollow`, mobile-first, WCAG AA, light/dark (`prefers-color-scheme` plus a toggle), fast.

Until this data is on `main`, other agents test against a small fixture in a file they own (for example `_build/fixtures/<feature>.json`) using real values copied from amtechpl.com, and read `data/products.json` when it is present. If `layout.mjs` is not on `main` yet, a feature agent keeps a minimal fallback inside a file it owns and notes it for the integrator.

Quote flow is a mailto only, to the contact-page address `sales@amtechpl.com`. The header also publishes `enquiries@amtechpl.com`. No payments, no form posted to amtechpl.com.

## Folder ownership

| Agent | Owns |
| --- | --- |
| Data (this work) | `data/`, `assets/`, `scripts/validate-data*`, `PLAN.md` |
| Design/shell | `_build/build.mjs`, `_build/lib/`, `css/tokens.css`, `css/base.css`, `css/components.css`, `js/theme.js`, `index.html`, `about/`, `contact/`, `families/`, `styleguide/`, `_build/pages/home.mjs`, `about.mjs`, `contact.mjs`, `families.mjs`, `styleguide.mjs` |
| Catalogue/search | `catalogue/`, `_build/pages/catalogue.mjs`, `js/search.js`, `css/catalogue.css`, `catalogue/index.json` |
| Product pages + quote | `products/`, `quote/`, `_build/pages/products.mjs`, `quote.mjs`, `js/cart.js`, `css/product.css`, `css/quote.css` |
| Compare | `compare/` (including `compare/shots/` and `compare/data/`), `_build/pages/compare.mjs`, `css/compare.css` |

Only edit paths you own. Do not touch `amt/ranking-on-price/` (read-only), `amt/INSTRUCTIONS.md`, `amt/prospects/`, `hello/`, `energy/`, Powerwall code, root pages, or secrets.

## Sitemap

Paths below are under `/amt/redesign/`. Each HTML page carries `noindex,nofollow`.

| Path | Role | Owner |
| --- | --- | --- |
| `/` | Home | Design |
| `/about/` | About, from `data/site.json` pages | Design |
| `/contact/` | Contact and mailto quote pointer | Design |
| `/families/` | Family landings (lipids, peg, fluorophores, organoborons) | Design |
| `/catalogue/` | Full catalogue, search and filters (CAS, family, MW, purity, pack, price) | Catalogue |
| `/products/<id>/` | Product detail. `id` is the lowercase SKU | Product |
| `/quote/` | Quote cart. Mailto only | Product |
| `/compare/` | Compare against the live AMT site | Compare |
| `/styleguide/` | Design-system reference | Design |

`data/site.json` holds the live amtechpl.com nav, contact block, and page copy. The redesign nav is the design agent's; it should be built from `site.nav` and the sitemap above, not by inventing pages the source site does not have.

## Data model

`data/products.json` is an array of 1347 products validated by `data/products.schema.json`. Extra fields are allowed. Core fields:

| Field | Rule |
| --- | --- |
| `id` | URL slug, lowercase SKU, unique |
| `sku` | As printed, unique. Pattern `AMT` + letters + digits + `-` + suffix. One suffix contains a lowercase L (`AMTGC224-Cl16`) |
| `name` | Printed name. `null` for the seven flyer-only SKUs (structures and CAS, no name) |
| `synonyms` | Always `[]`. Parentheticals such as `(Exoria)` stay inside `name` |
| `family` | `lipids` \| `peg` \| `fluorophores` \| `organoborons` \| `other` |
| `subfamily` | The heading AMT prints above the product, verbatim. `subfamilySource` records the PDF running header or the homepage card. The brochures are flat lists, so this is the catalogue title except three cards labelled `Ionisable Lipid` |
| `cas` | Printed CAS, or a string such as `No CAS#`. `null` if absent |
| `formula` | `null`. No formula column, and structure drawings are not OCR'd |
| `mw` | `null` (number when a future source actually prints one) |
| `purity` | Exact published string, including the space in `≥ 98%`. `null` when the row prints none, or when two listings disagree |
| `packs[]` | `{size, price, currency, priceText}`. Unpublished price: `price` null and `priceText` `"quote"` |
| `structureImage` | `assets/structures/…` relative to `amt/redesign/`, or `null` |
| `documents` | `{sds, coa, datasheet}`, all `null`. No SDS/COA/datasheet links were published |
| `source` | `{url, pdf, page}`. PDF products use the homepage as `url` plus the PDF URL and page. Homepage-only products have `pdf` null |

Extra fields other agents can read:

- `packs[].priceRaw` — the printed token (`$250.00`, `POA`, `Price on application`, `########`).
- `packs[].listing` and `packs[].purity` — set when one SKU has two different rows, so the prices are not merged.
- `listings[]` — every kept row (source id, pdf, page, name, cas, purity, packs).
- `alsoListedIn[]` — the same SKU in a non-primary brochure.
- `homepagePacks`, `homepageLabels` — featured card only. Card currency is null because the card does not name one. Card prices do not replace catalogue packs.
- `catalogueNote` — a printed note that is not a pack (for example `Not Isomer Specific`).

`data/site.json` has contact (street and postal "Unit 1/7-11 Rocco drive, Scoresby VIC 3179", phones, `enquiries@` and `sales@`, ABN from the flyer only), the live amtechpl.com menu on `sourceNav` (header, secondary, footer, absolute URLs), shipping notes, brochure list, ChemExper iframe note, and `pages[]` copy for the 20 live WordPress pages. `emptyCataloguePages` lists the ten product-menu slugs whose live HTML is the shared menu and not a SKU table.

`_build/lib/data.mjs` merges `data/site.json` over `_build/fixtures/site.json`, and an array in the data file replaces the fixture array. The redesign `nav` (paths under `/amt/redesign/`) is left to that fixture. `sourceNav` is the crawled menu so it does not wipe those paths. Brochure objects include `label` as well as `title`, which is the field the home page renders. Contact also has the flat fields the shell reads (`street`, `phoneAu`, `phoneIntl`, `phoneTel`, `emailEnquiries`, `emailSales`, `mapUrl`). `phoneTel` is `+61397649220`, the published international number with spaces removed. The contact-page `tel:` href is stored separately as `phones.telHref` (`tel:0397649220`); the live HTML appends a stray `I` to that href, which is not copied. The analytical-services page is the only place a service price is published ("Samples (1-9) – From $25.00 (AUD) per sample / 1H NMR (raw data)."). That is not a catalogue product.

`assets/manifest.json` records path, source URL, kind, bytes, and sha256 for logos and the structure images that could be matched to a SKU. Most SKUs have no separate structure file; the drawing exists only inside the PDF.

Check the data with:

```bash
node amt/redesign/scripts/validate-data.mjs
```

`data/extract.py` rebuilds the JSON from a local crawl cache. It is not part of the site build. A re-run keeps `formulaExternal`, `mwExternal`, `structureImageExternal`, `externalSource`, `mwNominal` and `mwNominalSource`.

PubChem values are never copied into `formula`, `mw` or `structureImage`. `data/enrich_pubchem.py` looks up a single CAS at PubChem PUG REST and keeps the result only when that CAS maps to exactly one CID. Cached responses live in `data/raw/pubchem/`. The 2D PNG is also under `assets/structures/pubchem/`. `mwNominal` is only a number printed in the name as a PEG mass (`PEG2000`, `PEG(400)`). `PEG3` is an oligomer length and is not a nominal mass.

## How a SKU was chosen

The live product corpus is the five files linked from the homepage, plus twelve homepage featured cards. Family menu pages do not list SKUs.

The four 2026 brochures are parallel catalogues, not successive editions. When a SKU is in more than one, the primary row (family, name, CAS, purity, packs) is chosen in this order:

1. Lipids PDF, 26 Aug 2026
2. PEG PDF, 3 Sep 2026
3. Fluorophores & dyes PDF (media date 9 Jan 2026)
4. Organoborons PDF, 21 Apr 2026
5. New-products flyer, 16 May 2025

The flyer and the homepage never override a 2026 brochure. The other row is kept on `alsoListedIn`. Identical rows, including page-boundary reprints, are collapsed (`alsoPages` records the extra page). Four PEG SKUs are printed twice with a different "High Purity" price; both rows stay, and top-level `purity` is null.

Currency on PDF packs is USD, as the brochures print ("All prices are in US Dollars" / "Pricing in USD"). Homepage packs leave `currency` null.

Catalogue size text is copied as printed. Three organoboron packs are size `"25"` because the unit glyph is not in the text layer. Flyer SKU AMTGC1460-DH25 prints `5mg` at $315; that token is stored as printed.

## `amt/ranking-on-price/` (read only)

This tree is processed comparison HTML, not the source of truth for AMT prices. The redesign must not import its numbers over `products.json`.

`amt/ranking-on-price/index.html` loads HTML fragments (`fragments/lipids.html`, `pegs-*.html`, `dyes.html`, `borons-*.html`, `not-found.html`). A row is a `<tr class="row-win|row-lose|row-split">` with the product name, a `.sku` line (AMT SKU, CAS, purity), an "AMT list" cell of pack prices, a rank pill (green `rank-win` / red `rank-lose` / amber `rank-split`), and a link to `amt/ranking-on-price/<slug>/index.html`.

A breakdown page has two tables. Price: rank, supplier, SKU, pack and list price with currency, $/g, purity, link. Purity vs AMT: stated purity compared with AMT's. Example ALC-0315: CAS 2036272-55-4, SKU AMTGC903-AL21, lipid PDF 1 g USD 430. The homepage card for the same SKU prints 500 mg $310 / 1 g $470, which `products.json` stores on `homepagePacks` and does not treat as the catalogue price.

## Integration checklist

- [ ] `node amt/redesign/_build/build.mjs` exits 0 with no install step
- [ ] `node amt/redesign/scripts/validate-data.mjs` exits 0 and the family counts match `data/COUNTS.md`
- [ ] Every product `id` has a page under `products/<id>/`
- [ ] Catalogue search/filter covers CAS, family, MW, purity, pack, and price, and empty MW stays filterable as unknown
- [ ] Quote mailto uses `sales@amtechpl.com` and does not submit anything to amtechpl.com
- [ ] Every HTML page has `<meta name="robots" content="noindex,nofollow">` and the footer note that this is not the official AMT site
- [ ] Internal links use the `/amt/redesign/` base and return 200 on `https://klopikkon.com/amt/redesign/`
- [ ] Lighthouse is run against that live URL after merge
- [ ] No link to the redesign is added from `/`, `/amt/`, `/hello`, or `hub.enc`
- [ ] Rebase on `main` before merge so `_build/pages/` from each agent load together
