# AMT concept redesign — QA harness

Verification for the unlisted concept redesign under `/amt/redesign/`. The integrator runs this before calling the redesign done. It does not build the site and it does not add pages outside this folder.

GitHub Pages serves `main` directly (`.nojekyll`, `CNAME`). There is no Pages workflow under `.github/`, so this harness is not wired into CI. Run it locally, then again with `--live` after the pages are on `main`.

Tools are dev-only. The static build stays zero-dependency. The first accessibility or Lighthouse run installs Playwright, axe-core, and Lighthouse into `~/.cache/amt-redesign-qa` (npm cache, not a repo dependency). Node 20 or newer is required. Accessibility and Lighthouse need Chrome. The harness resolves `CHROME_PATH`, then known install paths, then `PATH`. If that file is a launcher script that pins `--user-data-dir` or `--remote-debugging-port`, it follows the script’s `exec` to the real binary (on this machine, `/usr/local/bin/google-chrome` pins port 9222 and one profile, so a second Chrome stalls). An official `google-chrome` wrapper is replaced by the `chrome` ELF beside it when that file exists.

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

`products` (aliases: `total`, `total products`, `total unique skus`) is required once the file exists. A line such as `Total unique SKUs: **1347**.` counts. Family rows are checked only when present. The five family ids are `lipids`, `peg`, `fluorophores`, `organoborons`, and `other`. Bold markers and a trailing full stop are ignored.

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
- When `structureImage` is set, render that file with width, height, and a text alternative. `amtgc903-al21` already has `assets/structures/AMTGC903-AL21.png` in the tree and the page still shows the “No structure image published by AMT” placeholder.
- `quote/index.html` is a Lighthouse and accessibility target. Link it from the header or from the product quote control. No other redesign page points at `/amt/redesign/quote/` today, so `check-links` reports it as an orphan. The quote action stays a `mailto:` to the published AMT address. No payment step, no invented price.

### Compare

- `compare/index.html` is a Lighthouse and accessibility target.
- Screenshots under `compare/shots/` have to be ordinary `<img>` (or CSS) URLs that return 200. Give them width, height, and a text alternative that says they are comparison shots, not product data.

### Integrator

- Order that goes green: data files, then shell, then catalogue, product, quote, and compare. `run-all` stays red on link 404s while those targets are still missing. That is the signal, not a reason to weaken the check.
- Re-run `amt/redesign/_qa/run-all --live` after Pages publishes a new `main`. Lighthouse always tries the live origin. A 404 there is a skip. `check-links` and `check-a11y` crawl it only with `--live`.
- Moderate axe findings are listed in the result block and in `_qa/results/check-a11y.json`. They do not fail CI-style, but they are still worth clearing before sign-off.

## Findings (2026-10-22)

Two trees were checked. The blocks under “Latest results” are the current branch, which already contains merged `main` (shell PR #73, the data files, and the product/quote pages) plus this harness. PR #73’s shell-only tree was checked separately and is written up here so a later `run-all` does not erase it.

### Current tree

| Check | Result |
| --- | --- |
| `check-meta` | Pass. 22 HTML pages have `noindex,nofollow` and the footer note. No page outside `amt/redesign/` links to it. |
| `check-links` | Fail. `/amt/redesign/catalogue/` is HTTP 404. Search forms on about, contact, fluorophores, and lipids already post there. `/amt/redesign/quote/` exists but nothing else in the redesign links to it (orphan note, not a failure). 44 internal URLs were checked. |
| `check-counts` | Fail. 12 rendered product pages, `data/products.json` has 1347, and `data/COUNTS.md` “Total unique SKUs” is 1347. Family totals in COUNTS.md match the JSON. Six of the twelve pages do not show the catalogue CAS, pack size strings, or `priceText`. 1335 products have no page. |
| `check-a11y` | Pass. 0 serious or critical on home, about, contact, quote, styleguide, lipids, and one product page, light and dark, 375px and 1440px. Lipids at 1440px (light and dark) has an incomplete `color-contrast` check. That is a note, not a failure. Catalogue and compare were not scanned; those directories are not in the tree. |
| `lighthouse` | Pass against the budget. Median of 3, mobile and desktop, local and live, for home, quote, and `products/amtgc1223-pl23/`. Catalogue and compare were not measured. SEO is 66 on every row because `is-crawlable` is 0; that column is not a gate. |

`products/price-match.md` says this product build read `_build/fixtures/products.json` (12 rows), not `data/products.json`. Six of those twelve pages match `products.json` on sku, CAS, pack size, and `priceText`: `amtgc1223-pl23`, `amtgc1264-ah24`, `amtgc1266-ao24`, `amtgc1269-cb24`, `amtgc1441-db25`, and `amth390-df24`. The other six do not. `amtgc903-al21` is CAS `2036272-55-4` in the JSON with packs `500mg` `$250.00`, `1g` `$430.00`, and `2g` `$790.00`; the rendered page shows none of those strings. The same gap is on `amtgc1533-lp25`, `amtgc936-sm21`, `amtgc187-ac16`, and `amtgc807-am21` (CAS present in data and missing on the page; pack size strings such as `100mg` or `5g` missing; `priceText` such as `$140.00` not on the page). `amtgc125-at15` is two catalogue rows (standard and high purity, pack sizes `5g` and `25g` on each) and neither price set (`$65.00` / `$240.00` and `$150.00` / `$450.00`) is on the page. `amtgc903-al21` has `structureImage` `assets/structures/AMTGC903-AL21.png` and that file is in the tree. The rendered page still uses a placeholder captioned “No structure image published by AMT”.

Live product best-practices is 96, local is 100. The live audit that scored 0 is `image-size-responsive` (an image served below the resolution of its displayed size). 96 is still inside the 90 gate. Give structure and content images width, height, and a file at least as large as the CSS box.

The live origin `https://klopikkon.com/amt/redesign/` answered HTTP 200, so the live half ran. It is the shell that is already on `main`. Quote and the sample product page are published there too. Catalogue is not.

`run-all` will stay red until `catalogue/index.html` returns 200 and every product page matches `products.json`. That is the integrator signal.

### PR #73 shell only (`43204b1`)

Checked with `--root` pointed at that worktree, before product pages and `data/products.json` were on this branch.

| Check | Result |
| --- | --- |
| `check-meta` | Pass. 9 HTML pages. |
| `check-links` | Fail. `/amt/redesign/catalogue/` 404, plus 12 product URLs from the family tables (`amth390-df24`, `amtgc1533-lp25`, `amtgc903-al21`, `amtgc936-sm21`, `amtgc1223-pl23`, `amtgc1264-ah24`, `amtgc1266-ao24`, `amtgc1269-cb24`, `amtgc125-at15`, `amtgc807-am21`, `amtgc1441-db25`, `amtgc187-ac16`). Those product files exist on current `main`; the catalogue file still does not. |
| `check-counts` | Skip. No `data/products.json`, `data/COUNTS.md`, or `products/` directory. The shell fixture has 12 rows and is not the source of record. |
| `check-a11y`, `lighthouse` | Not re-run on the shell-only commit. Current `main` already includes those pages, and the tables below are that tree. |

## Latest results

The blocks below are rewritten by `run-all` and `lighthouse`. The findings above are hand-written and are not replaced by those scripts.

<!-- harness-blocks -->

<!-- harness-main:start -->
### main

Scanned `/workspace/amt/redesign` (`cursor/amt-redesign-qa-ac08` @ `390d609`) at 2026-10-22T04:02:19.475Z.

| Check | Result |
| --- | --- |
| check-meta | pass |
| check-links | fail |
| check-counts | fail |
| check-a11y | pass |
| lighthouse | pass |

**check-meta**
- 22 HTML page(s) carry noindex,nofollow and the footer note
- no page outside amt/redesign links to it

**check-links**
- local server http://127.0.0.1:33417
- [local] orphan HTML (not linked from another redesign page): /amt/redesign/quote/
- [local] checked 44 internal URL(s)
- [local] HTTP 404 /amt/redesign/catalogue/ (/amt/redesign/about/ form[action], /amt/redesign/contact/ form[action], /amt/redesign/families/fluorophores/ form[action], /amt/redesign/families/lipids/ form[action])

**check-counts**
- 12 rendered product page(s)
- data/products.json has 1347 product(s)
- COUNTS.md products matches products.json (1347)
- amtgc1533-lp25: page does not show CAS 2089251-33-0
- amtgc1533-lp25: page does not show pack size "100mg"
- amtgc1533-lp25: expected "$140.00" 1 time(s) on the page, found 0
- amtgc903-al21: page does not show CAS 2036272-55-4
- amtgc903-al21: page does not show pack size "500mg"
- amtgc903-al21: page does not show pack size "1g"
- amtgc903-al21: page does not show pack size "2g"
- amtgc903-al21: expected "$250.00" 1 time(s) on the page, found 0
- amtgc903-al21: expected "$430.00" 1 time(s) on the page, found 0
- amtgc903-al21: expected "$790.00" 1 time(s) on the page, found 0
- amtgc936-sm21: page does not show CAS 2089251-47-6
- amtgc936-sm21: page does not show pack size "100mg"
- amtgc936-sm21: page does not show pack size "500mg"
- amtgc936-sm21: page does not show pack size "1g"
- amtgc936-sm21: expected "$150.00" 1 time(s) on the page, found 0
- amtgc936-sm21: expected "$410.00" 1 time(s) on the page, found 0
- amtgc936-sm21: expected "$690.00" 1 time(s) on the page, found 0
- amtgc125-at15: page does not show CAS 134179-38-7
- amtgc125-at15: page does not show pack size "5g"
- amtgc125-at15: page does not show pack size "25g"
- amtgc125-at15: page does not show pack size "5g"
- amtgc125-at15: page does not show pack size "25g"
- amtgc125-at15: expected "$65.00" 1 time(s) on the page, found 0
- amtgc125-at15: expected "$240.00" 1 time(s) on the page, found 0
- amtgc125-at15: expected "$150.00" 1 time(s) on the page, found 0
- amtgc125-at15: expected "$450.00" 1 time(s) on the page, found 0
- amtgc187-ac16: page does not show CAS 642091-68-7
- amtgc187-ac16: page does not show pack size "1g"
- amtgc187-ac16: page does not show pack size "5g"
- amtgc187-ac16: expected "$90.00" 1 time(s) on the page, found 0
- amtgc187-ac16: expected "$270.00" 1 time(s) on the page, found 0
- amtgc807-am21: page does not show CAS 1072920-62-7
- amtgc807-am21: page does not show pack size "1g"
- amtgc807-am21: page does not show pack size "5g"
- amtgc807-am21: expected "$80.00" 1 time(s) on the page, found 0
- amtgc807-am21: expected "$240.00" 1 time(s) on the page, found 0
- 1335 products have no page at products/<id>/index.html (first: amtgc1044-ad22, amtgc1179-al23, amtgc1297-do24, amtgc1444-dm25, amtgc1455-ha25, amtgc1461-sm25, amtgc1487-il25, amtgc1505-bh25)
- product page count 12 != products.json count 1347
- product page count 12 != COUNTS.md products 1347

**check-a11y**
- local server http://127.0.0.1:39737
- local pages: home, about, contact, quote, styleguide, lipids, product; themes light/dark; widths 375 and 1440
- [local] lipids light 1440px: incomplete color-contrast
- [local] lipids dark 1440px: incomplete color-contrast
- axe WCAG AA: 0 serious/critical across 7 page(s)

**lighthouse**
- 12 page/form median(s) from 3 run(s)
- local server http://127.0.0.1:41069
<!-- harness-main:end -->

<!-- lighthouse-main:start -->
### main

Median of 3 Lighthouse run(s). SEO is reported and is not a gate: `noindex,nofollow` makes `is-crawlable` fail on purpose.
On the local HTTP server, best-practices ignores `is-on-https` and `redirects-http`.

| Target | Page | Form | Perf | A11y | BP | SEO | LCP | CLS | TBT | Gate |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| local | home | mobile | 100 | 100 | 100 | 66 | 1.35s | 0.000 | 0ms | pass |
| local | home | desktop | 100 | 100 | 100 | 66 | 0.33s | 0.000 | 0ms | pass |
| local | quote | mobile | 100 | 100 | 100 | 66 | 1.20s | 0.000 | 0ms | pass |
| local | quote | desktop | 100 | 100 | 100 | 66 | 0.33s | 0.000 | 0ms | pass |
| local | product | mobile | 100 | 100 | 100 | 66 | 1.20s | 0.000 | 0ms | pass |
| local | product | desktop | 100 | 100 | 100 | 66 | 0.33s | 0.000 | 0ms | pass |
| live | home | mobile | 100 | 100 | 100 | 66 | 0.91s | 0.000 | 0ms | pass |
| live | home | desktop | 100 | 100 | 100 | 66 | 0.24s | 0.000 | 0ms | pass |
| live | quote | mobile | 100 | 100 | 100 | 66 | 1.05s | 0.000 | 0ms | pass |
| live | quote | desktop | 100 | 100 | 100 | 66 | 0.29s | 0.000 | 0ms | pass |
| live | product | mobile | 100 | 100 | 96 | 66 | 1.06s | 0.000 | 0ms | pass |
| live | product | desktop | 100 | 100 | 96 | 66 | 0.25s | 0.000 | 0ms | pass |

SEO `is-crawlable` score is 0 on every measured page because robots noindex is required.
<!-- lighthouse-main:end -->
