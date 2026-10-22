# AMT concept redesign — QA harness

Verification for the unlisted concept redesign under `/amt/redesign/`. The integrator runs this before calling the redesign done. It does not build the site and it does not add pages outside this folder.

GitHub Pages serves `main` directly (`.nojekyll`, `CNAME`). There is no Pages workflow under `.github/`, so this harness is not wired into CI. Run it locally, then again with `--live` after the pages are on `main`.

Tools are dev-only. The static build stays zero-dependency. Playwright, axe-core, and Lighthouse are fetched with `npx` the first time those checks run. Node 20 or newer is required. Accessibility and Lighthouse need Chrome (`CHROME_PATH`, or `/usr/local/bin/google-chrome`).

## How to run

From the repo root:

```bash
amt/redesign/_qa/run-all
amt/redesign/_qa/run-all --live
amt/redesign/_qa/check-meta
amt/redesign/_qa/check-links
amt/redesign/_qa/check-links --live
amt/redesign/_qa/check-counts
amt/redesign/_qa/check-a11y
amt/redesign/_qa/lighthouse
```

`--live` on `run-all`, `check-links`, and `check-a11y` also requests `https://klopikkon.com/amt/redesign/`. Lighthouse always tries the live URLs. A live HTTP 404 means the redesign is not published yet: that half is skipped, not failed. A network error is a failure.

Point the same scripts at another checkout without copying them:

```bash
amt/redesign/_qa/run-all \
  --root /path/to/other/amt/redesign \
  --repo /path/to/other/repo \
  --label pr-73
```

`--runs` (default 3) is the Lighthouse sample size. The gate uses the median. JSON from the latest run is written to `amt/redesign/_qa/results/` and is gitignored. `run-all` and `lighthouse` refresh the result blocks at the bottom of this file.

Exit code is 0 when every check passes or is skipped because its inputs are not in the tree yet. Exit code is 1 when any check fails. `run-all` still runs the remaining checks after a failure.

## Checks

| Script | Pass | Skip | Fail |
| --- | --- | --- | --- |
| `check-meta` | Every HTML page under `amt/redesign/` (except `_qa/` and `_build/`) has `<meta name="robots" content="noindex,nofollow">` and a footer containing “Concept redesign, not the official AMT site.” No HTML, CSS, SVG, or XML page outside `amt/redesign/` references `/amt/redesign`. Markdown only fails when the path is a real link. | No HTML pages yet. The outside-the-folder scan still runs. | Missing tag, wrong robots tokens, missing footer note, or an outside link. |
| `check-links` | A local static server (repo root, so `/amt/redesign/` resolves) is crawled from every built HTML page. Internal links, images, CSS, JS, and JSON return HTTP 200. Fragment ids exist. Absolute `https://klopikkon.com/amt/redesign/...` URLs are checked against the local server. `mailto:` and `tel:` are ignored. Other hosts are not required to answer. | No HTML yet. Live 404 when `--live` is set. | Any in-scope URL is not 200, a fragment id is missing, or referenced JSON does not parse. |
| `check-counts` | `products/*.html` page count = `data/products.json` length = `products` total in `data/COUNTS.md`. Each product id has one page at `products/<id>/index.html` (or `products/<id>.html`) showing that sku, CAS, pack size, and `priceText`. | Whichever of those three inputs is absent. A fixture under `_build/fixtures/` is reported and not treated as source data. | Present inputs disagree, a CAS is shown when data has none, or a price string does not match. |
| `check-a11y` | axe-core (Playwright) on representative pages, light and dark, 375px and 1440px. Tags: WCAG 2.0/2.1/2.2 A and AA. Theme is forced with `localStorage["amt-theme"]` and `data-theme` before the scan. | Representative pages are not built yet. Live 404 when `--live` is set. | Any serious or critical violation. Moderate and minor are printed and do not fail the run. |
| `lighthouse` | Median of 3 mobile and desktop runs for home, catalogue, one product page, quote, and compare, locally and on the live origin when that URL is published. | A page file is missing, or the live origin 404s. | A gated budget below is missed. SEO is not a gate. |

Representative accessibility pages, when the file exists: home, about, contact, lipids (else the first family page), styleguide, catalogue, the first product page, quote, compare.

Product pages are everything under `products/` except `products/index.html`, which is reserved as a section index if a later agent adds one.

### Robots token

`noindex,nofollow` is required, in that order. Whitespace around the comma is accepted. Any other token (`index`, `follow`, `all`) fails.

### What `check-counts` compares

Visible text, with `script` and `style` removed. For each pack, `priceText` must appear that many times (`quote` is matched as a word). A numeric `price` must be contained in its `priceText` when both are set. An empty `cas` fails the page if the visible text has a labeled CAS (`CAS 12345-67-8`). A non-empty `cas` must appear exactly.

`data/COUNTS.md` may use either shape:

```markdown
| Key | Count |
| --- | ---: |
| products | 1200 |
| lipids | 100 |
| peg | 200 |
| fluorophores | 50 |
| organoborons | 300 |
| other | 550 |
```

```markdown
products: 1200
lipids: 100
```

`products` (aliases: `total`, `total products`) is required once the file exists. Family rows are checked only when present. The five family ids are `lipids`, `peg`, `fluorophores`, `organoborons`, and `other`.

## Performance budget

Numbers live in `_qa/lib/budget.mjs`. Scores are 0–100. LCP and TBT are lab values from Lighthouse’s default mobile throttling and the desktop preset.

| Metric | Mobile | Desktop | Gate |
| --- | ---: | ---: | --- |
| Performance | ≥ 90 | ≥ 90 | yes |
| Accessibility | ≥ 95 | ≥ 95 | yes |
| Best practices | ≥ 90 | ≥ 90 | yes |
| SEO | report only | report only | no |
| LCP | ≤ 2.5s | ≤ 2.0s | yes |
| CLS | ≤ 0.10 | ≤ 0.10 | yes |
| TBT | ≤ 200ms | ≤ 150ms | yes |

SEO will read low. `is-crawlable` fails because `noindex,nofollow` is required. That score is printed in its own column and never fails the run.

Local best-practices ignores `is-on-https` and `redirects-http`. The harness serves the repo over HTTP on `127.0.0.1`. Those two audits are about the public HTTPS origin, which Lighthouse measures again on the live URLs.

axe is the WCAG AA gate for serious and critical issues. The Lighthouse accessibility score is a backstop at 95 so a single non-serious audit does not flap the run.

## Recommendations

### Data

- Publish `data/products.json` as the only source of record. The shell fixture is intentionally ignored by `check-counts`.
- Add `data/COUNTS.md` with a `products` total and, when you have them, the five family totals above. The checker fails the file if it exists and has no parseable `products` total.
- Keep `cas` null when the source does not print one. An invented CAS fails the product page check.
- Put the exact visible price in `priceText` (`$390.00`, `$310`, or `quote`). `price` is the number, or null when the pack is quote-only. Unpublished prices stay `quote`.
- `id` is the URL slug. One product, one id, one sku.

### Design / shell

- Keep the robots meta and the footer sentence exactly as `check-meta` describes them. The footer copy is “Concept redesign, not the official AMT site.”
- Keep the theme contract the accessibility check drives: storage key `amt-theme` (`light` or `dark`) and `data-theme` on `<html>`, set before first paint.
- Keep absolute `/amt/redesign/` URLs so the local server and GitHub Pages share one tree. Do not link this tree from `/`, `/hello`, or `/amt/` outside `amt/redesign/`.
- The shell already links to `/catalogue/` and `products/<id>/`. Those 404s fail `check-links` until the catalogue and product pages exist. Leave the links in place; they are the integration contract, not a shell defect to delete.
- Footer label “Literature” currently lands on `#organosilicons`, whose heading is “Organosilicons”. The literature list is an `h3` inside that section. Give the literature block its own id and point the footer at that id so the accessible name matches the target heading.
- At 375px the primary nav is `display: none` until the menu checkbox is checked (it becomes visible at `56rem`). Keep the checkbox programmatically labeled, and don’t `display: none` the desktop nav.
- The logo is 2KB with width and height set. Keep width and height on every later image, including structure drawings and compare shots. Serve them at the rendered size.
- Don’t add a second font or a framework runtime. The current CSS is about 20KB and the theme script is a small module; that is the budget the scores below assume.

### Catalogue / search

- `catalogue/index.html` must answer `/amt/redesign/catalogue/` and `/amt/redesign/catalogue/?q=…&family=…`. Query strings are the same static file.
- `catalogue/index.json` must return 200 and be valid JSON. `check-links` follows `fetch()` and JSON string paths that look like assets.
- Ship `js/search.js` and `css/catalogue.css` only. Home should not download the full search index; load it from the catalogue page.
- Family filter links from the shell use `?family=` and `?family=other&subfamily=`. Those URLs have to 200 once this page exists.

### Product pages and quote

- One directory per product: `products/<id>/index.html`, id taken from `products.json`.
- Render sku, pack size, and `priceText` in the HTML, not only in a client-side template. The count check ignores `script` and `style`.
- When `cas` is null, don’t print a CAS number. When it is set, print that exact string.
- `quote/index.html` is a Lighthouse and accessibility target. The quote action stays a `mailto:` to the published AMT address. No payment step, no invented price.

### Compare

- `compare/index.html` is a Lighthouse and accessibility target.
- Screenshots under `compare/shots/` have to be ordinary `<img>` (or CSS) URLs that return 200. Give them width, height, and a text alternative that says they are comparison shots, not product data.

### Integrator

- Order that goes green: data files, then shell, then catalogue, product, quote, and compare. `run-all` stays red on link 404s while those targets are still missing. That is the signal, not a reason to weaken the check.
- Re-run `amt/redesign/_qa/run-all --live` after Pages has published `main`. Until then the live half skips.
- Moderate axe findings are listed in the result block and in `_qa/results/check-a11y.json`. They do not fail CI-style, but they are still worth clearing before sign-off.

## Latest results

The blocks below are rewritten by `run-all` and `lighthouse`. Hand-written findings from the run that opened this PR sit with them.

<!-- harness-blocks -->
