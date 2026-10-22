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

Visible text, with `script` and `style` removed. For each pack, `priceText` must appear that many times (`quote` is matched as a word). A numeric `price` must be contained in its `priceText` when both are set. Thousands separators count: `$1,750.00` contains `1750`. The product CAS is the spec-table cell (`th` CAS / `td`), not an analogue number in a price note. An empty `cas` fails the page when that cell shows a CAS number. A non-empty `cas` must appear in that cell (`&amp;` is read as `&`).

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
- The shell links to `/catalogue/` and `products/<id>/`. Those URLs return 200 on current main. Leave the links in place.
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
- When `structureImage` is set, render that file with width, height, and a text alternative. `amtgc903-al21` now does this for `assets/structures/AMTGC903-AL21.png`.
- `quote/index.html` is a Lighthouse and accessibility target. Link it from the header or from the product quote control. No other redesign page points at `/amt/redesign/quote/` today, so `check-links` reports it as an orphan. The quote action stays a `mailto:` to the published AMT address. No payment step, no invented price.

### Compare

- `compare/index.html` is a Lighthouse and accessibility target.
- Screenshots under `compare/shots/` have to be ordinary `<img>` (or CSS) URLs that return 200. Give them width, height, and a text alternative that says they are comparison shots, not product data.

### Integrator

- Order that goes green: data files, then shell, then catalogue, product, quote, and compare. `run-all` stays red on link 404s while those targets are still missing. That is the signal, not a reason to weaken the check.
- Re-run `amt/redesign/_qa/run-all --live` after Pages publishes a new `main`. Lighthouse always tries the live origin. A 404 there is a skip. `check-links` and `check-a11y` crawl it only with `--live`.
- Moderate axe findings are listed in the result block and in `_qa/results/check-a11y.json`. They do not fail CI-style, but they are still worth clearing before sign-off.

## Findings (2026-10-22, current main)

`amt/redesign/_qa/run-all --live` against this branch rebased onto current `main`, and against `https://klopikkon.com/amt/redesign/`. Exit code 1. Chrome for Lighthouse and axe was `/opt/google/chrome/chrome` (the `/usr/local/bin/google-chrome` wrapper is unwrapped). There is no `compare/index.html`, so that Lighthouse and axe slot was skipped. Family compare pages from merged PR #81 are in the link crawl.

| Check | Result |
| --- | --- |
| `check-meta` | Pass. 1431 HTML pages. Nothing outside `amt/redesign/` links in. |
| `check-links` | Pass. 2314 internal URLs, local and live, all HTTP 200. |
| `check-counts` | Fail. 1347 pages, 1347 JSON rows, `COUNTS.md` agrees, family totals agree. Ten `cas` values are the sentinel `No CAS#`. |
| `check-a11y` | Pass. 0 serious or critical. Incomplete `color-contrast` on home and lipids. |
| `lighthouse` | Fail. One gate: local quote mobile LCP 2.55s. SEO 66 on every row, reported separately. |

`products/amtgc903-al21/` shows CAS `2036272-55-4` and `$250.00` / `$430.00` / `$790.00`, and the structure PNG. The count check agrees.

## Open issues

### data — `cas` is `No CAS#` on ten products

Owner: **data**.

`data/products.json` stores the string `No CAS#` instead of null. The spec cell on each page says “Not published”. The other seven products with `cas: null` pass. Set these ten to null.

| id | Live URL |
| --- | --- |
| `amtgc1487-il25` | https://klopikkon.com/amt/redesign/products/amtgc1487-il25/ |
| `amtgc1583-nm26` | https://klopikkon.com/amt/redesign/products/amtgc1583-nm26/ |
| `amtb1369-ae21` | https://klopikkon.com/amt/redesign/products/amtb1369-ae21/ |
| `amtgc941-to21` | https://klopikkon.com/amt/redesign/products/amtgc941-to21/ |
| `amtgc942-ob21` | https://klopikkon.com/amt/redesign/products/amtgc942-ob21/ |
| `amtgc948-da21` | https://klopikkon.com/amt/redesign/products/amtgc948-da21/ |
| `amtgc994-ee22` | https://klopikkon.com/amt/redesign/products/amtgc994-ee22/ |
| `amtgc998-aa22` | https://klopikkon.com/amt/redesign/products/amtgc998-aa22/ |
| `amtgc999-di22` | https://klopikkon.com/amt/redesign/products/amtgc999-di22/ |
| `amtb1406-ba24` | https://klopikkon.com/amt/redesign/products/amtb1406-ba24/ |

Evidence: `check-counts` line `page CAS Not published != data No CAS#` for each id. Same HTML locally and on the live URLs.

### product — quote page misses the local mobile LCP budget

Owner: **product**.

Page: https://klopikkon.com/amt/redesign/quote/ (`quote/index.html`).

Local mobile, median of 3, LCP 2.55s (runs 2554 ms, 2579 ms, 2553 ms). Budget is ≤ 2.5s. Performance score is 94, which is inside the score gate. Local desktop LCP is 0.57s. Live mobile LCP is 1.08s and passes. The failure is the throttled local lab run only.

### Notes that do not fail the run

- **shell.** `/amt/redesign/quote/` is an orphan: no other redesign HTML links to it. `js/cart.js` names `QUOTE_PATH`. `/amt/redesign/404.html` is also unlinked, which is expected for a 404 page. Both local and live crawls checked 2314 URLs and got HTTP 200.
- **shell.** axe `color-contrast` was incomplete, not a violation, on home and lipids, light and dark, 375px and 1440px, local and live. 0 serious or critical on home, about, contact, catalogue, quote, styleguide, lipids, and `products/amtb001-b06/`.
- **compare.** No open PR adds `compare/index.html`. Merged PR #81 shipped `families/<family>/compare/`. Those five pages were in the link crawl. Lighthouse did not measure a top-level compare URL because the file is absent.

## Latest results

The blocks below are rewritten by `run-all` and `lighthouse`. The findings above are hand-written and are not replaced by those scripts.

<!-- harness-blocks -->

<!-- harness-main:start -->
### main

Scanned `/workspace/amt/redesign` (`cursor/amt-redesign-qa-ac08` @ `3ffcc2b9`) at 2026-10-22T04:18:15.902Z.

| Check | Result |
| --- | --- |
| check-meta | pass |
| check-links | pass |
| check-counts | fail |
| check-a11y | pass |
| lighthouse | fail |

**check-meta**
- 1431 HTML page(s) carry noindex,nofollow and the footer note
- no page outside amt/redesign links to it

**check-links**
- local server http://127.0.0.1:41639
- [local] orphan HTML (not linked from another redesign page): /amt/redesign/404.html
- [local] orphan HTML (not linked from another redesign page): /amt/redesign/quote/
- [local] checked 2314 internal URL(s)
- [live] orphan HTML (not linked from another redesign page): /amt/redesign/404.html
- [live] orphan HTML (not linked from another redesign page): /amt/redesign/quote/
- [live] checked 2314 internal URL(s)

**check-counts**
- 1347 rendered product page(s)
- data/products.json has 1347 product(s)
- COUNTS.md products matches products.json (1347)
- amtgc1487-il25: page CAS Not published != data No CAS#
- amtgc1583-nm26: page CAS Not published != data No CAS#
- amtb1369-ae21: page CAS Not published != data No CAS#
- amtgc941-to21: page CAS Not published != data No CAS#
- amtgc942-ob21: page CAS Not published != data No CAS#
- amtgc948-da21: page CAS Not published != data No CAS#
- amtgc994-ee22: page CAS Not published != data No CAS#
- amtgc998-aa22: page CAS Not published != data No CAS#
- amtgc999-di22: page CAS Not published != data No CAS#
- amtb1406-ba24: page CAS Not published != data No CAS#

**check-a11y**
- local server http://127.0.0.1:38373
- local pages: home, about, contact, catalogue, quote, styleguide, lipids, product; themes light/dark; widths 375 and 1440
- [local] home light 375px: incomplete color-contrast
- [local] home light 1440px: incomplete color-contrast
- [local] home dark 375px: incomplete color-contrast
- [local] home dark 1440px: incomplete color-contrast
- [local] lipids light 375px: incomplete color-contrast
- [local] lipids light 1440px: incomplete color-contrast
- [local] lipids dark 375px: incomplete color-contrast
- [local] lipids dark 1440px: incomplete color-contrast
- [live] home light 375px: incomplete color-contrast
- [live] home light 1440px: incomplete color-contrast
- [live] home dark 375px: incomplete color-contrast
- [live] home dark 1440px: incomplete color-contrast
- [live] lipids light 375px: incomplete color-contrast
- [live] lipids light 1440px: incomplete color-contrast
- [live] lipids dark 375px: incomplete color-contrast
- [live] lipids dark 1440px: incomplete color-contrast
- axe WCAG AA: 0 serious/critical across 8 page(s)

**lighthouse**
- 16 page/form median(s) from 3 run(s)
- chrome /opt/google/chrome/chrome
- local server http://127.0.0.1:37169
- [local] quote mobile: LCP ms 2554 > 2500
<!-- harness-main:end -->

<!-- lighthouse-main:start -->
### main

Median of 3 Lighthouse run(s). SEO is reported and is not a gate: `noindex,nofollow` makes `is-crawlable` fail on purpose.
On the local HTTP server, best-practices ignores `is-on-https` and `redirects-http`.

| Target | Page | Form | Perf | A11y | BP | SEO | LCP | CLS | TBT | Gate |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| local | home | mobile | 100 | 100 | 100 | 66 | 1.35s | 0.000 | 0ms | pass |
| local | home | desktop | 100 | 100 | 100 | 66 | 0.37s | 0.000 | 0ms | pass |
| local | catalogue | mobile | 99 | 100 | 100 | 66 | 1.65s | 0.000 | 0ms | pass |
| local | catalogue | desktop | 100 | 100 | 100 | 66 | 0.36s | 0.000 | 0ms | pass |
| local | quote | mobile | 94 | 100 | 100 | 66 | 2.55s | 0.000 | 0ms | fail |
| local | quote | desktop | 100 | 100 | 100 | 66 | 0.57s | 0.000 | 0ms | pass |
| local | product | mobile | 100 | 100 | 100 | 66 | 1.35s | 0.000 | 0ms | pass |
| local | product | desktop | 100 | 100 | 100 | 66 | 0.32s | 0.000 | 0ms | pass |
| live | home | mobile | 100 | 100 | 100 | 66 | 0.92s | 0.000 | 0ms | pass |
| live | home | desktop | 100 | 100 | 100 | 66 | 0.25s | 0.000 | 0ms | pass |
| live | catalogue | mobile | 100 | 100 | 100 | 66 | 1.06s | 0.000 | 0ms | pass |
| live | catalogue | desktop | 100 | 100 | 100 | 66 | 0.29s | 0.000 | 0ms | pass |
| live | quote | mobile | 100 | 100 | 100 | 66 | 1.08s | 0.000 | 0ms | pass |
| live | quote | desktop | 100 | 100 | 100 | 66 | 0.29s | 0.000 | 0ms | pass |
| live | product | mobile | 100 | 100 | 100 | 66 | 1.06s | 0.000 | 0ms | pass |
| live | product | desktop | 100 | 100 | 100 | 66 | 0.24s | 0.000 | 0ms | pass |

SEO `is-crawlable` score is 0 on every measured page because robots noindex is required.
<!-- lighthouse-main:end -->
