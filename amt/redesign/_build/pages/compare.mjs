/**
 * Competitor comparison page.
 * Owns: compare/, this file, css/compare.css.
 * If _build/lib/layout.mjs is missing, the standalone run uses the fallback
 * renderer at the bottom of this file (integrator: swap to the shared layout).
 *
 * Later redesign measurement: put runs on compare/data/redesign.json
 * (status other than "pending live measurement", plus a runs[] array of the
 * same trimmed Lighthouse objects, or a lighthouse.{home,product}.{mobile,desktop}
 * median object). This page reads that file and does not invent scores.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REDESIGN = path.resolve(__dirname, "../..");
const DATA = path.join(REDESIGN, "compare/data");
const LH_DIR = path.join(DATA, "lighthouse");

const METRICS = [
  ["performance", "Perf", "score"],
  ["accessibility", "A11y", "score"],
  ["best-practices", "Best practices", "score"],
  ["seo", "SEO", "score"],
  ["lcp", "LCP", "lcp"],
  ["cls", "CLS", "cls"],
  ["tbt", "TBT", "tbt"],
  ["bytes", "Weight", "bytes"],
];

export async function build(ctx) {
  const html = await renderCompare(ctx.renderPage);
  await ctx.writeFile("compare/index.html", html);
}

async function renderCompare(renderPage) {
  const model = await loadModel();
  const body = renderBody(model);
  return renderPage({
    title: "Competitor comparison",
    description:
      "Measured comparison of the current Advanced Molecular Technologies site and chemical-catalogue competitors. Lighthouse figures are medians of repeated runs. Qualitative notes record what a headless browser showed.",
    path: "compare/",
    body,
    head: '<link rel="stylesheet" href="/amt/redesign/css/compare.css">',
  });
}

async function loadModel() {
  const sitesDoc = JSON.parse(await fs.readFile(path.join(DATA, "sites.json"), "utf8"));
  const redesign = JSON.parse(await fs.readFile(path.join(DATA, "redesign.json"), "utf8"));
  let review = null;
  try {
    review = JSON.parse(await fs.readFile(path.join(DATA, "review.json"), "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const runs = await loadRuns();
  const columns = sitesDoc.sites.map((site) => ({
    site,
    groups: groupRuns(runs.filter((run) => run.siteId === site.id)),
  }));
  return { sitesDoc, redesign, review, columns, runs };
}

async function loadRuns() {
  let names = [];
  try {
    names = await fs.readdir(LH_DIR);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const runs = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name.startsWith("_")) continue;
    const raw = JSON.parse(await fs.readFile(path.join(LH_DIR, name), "utf8"));
    raw.file = name;
    runs.push(raw);
  }
  return runs;
}

function groupRuns(runs) {
  const groups = {};
  for (const run of runs) {
    const key = `${run.page}|${run.formFactor}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(run);
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => (a.run || 0) - (b.run || 0));
  }
  return groups;
}

function isBlocked(run) {
  if (!run) return false;
  if (run.blocked) return true;
  const err = `${run.error || ""} ${run.runtimeError?.message || run.runtimeError?.code || ""}`;
  return /status code:\s*40[13]/i.test(err) || /access denied/i.test(err) || /ERR_HTTP2_PROTOCOL_ERROR/i.test(err);
}

function usable(run) {
  return run && run.status === "ok" && !isBlocked(run) && !run.runtimeError && run.categories;
}

function metricValue(run, metric) {
  if (!usable(run)) return null;
  if (metric === "performance" || metric === "accessibility" || metric === "best-practices" || metric === "seo") {
    const score = run.categories?.[metric]?.score;
    return typeof score === "number" ? score : null;
  }
  const auditId = {
    lcp: "largest-contentful-paint",
    cls: "cumulative-layout-shift",
    tbt: "total-blocking-time",
    bytes: "total-byte-weight",
  }[metric];
  const value = run.audits?.[auditId]?.numericValue;
  return typeof value === "number" ? value : null;
}

function median(values) {
  const xs = values.filter((n) => typeof n === "number" && Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  if (xs.length % 2) return xs[mid];
  return (xs[mid - 1] + xs[mid]) / 2;
}

function summarise(runs, metric) {
  const list = runs || [];
  const goods = list.filter(usable);
  const values = goods.map((run) => metricValue(run, metric)).filter((n) => n != null);
  const blocked = list.filter((run) => isBlocked(run));
  const failed = list.filter((run) => !usable(run) && !isBlocked(run));
  return {
    median: median(values),
    values,
    n: values.length,
    blocked: blocked.length,
    failed: failed.length,
    runs: list,
  };
}

function redesignPending(redesign) {
  const status = String(redesign?.status || "");
  return status.toLowerCase().startsWith("pending") || (!redesign?.runs?.length && !redesign?.lighthouse);
}

function redesignSummary(redesign, page, form, metric) {
  if (redesignPending(redesign)) return null;
  if (Array.isArray(redesign.runs) && redesign.runs.length) {
    const runs = redesign.runs.filter((run) => run.page === page && run.formFactor === form);
    return summarise(runs, metric);
  }
  const cell = redesign.lighthouse?.[page]?.[form];
  if (!cell) return null;
  const key = {
    performance: "performance",
    accessibility: "accessibility",
    "best-practices": "bestPractices",
    seo: "seo",
    lcp: "lcpMs",
    cls: "cls",
    tbt: "tbtMs",
    bytes: "bytes",
  }[metric];
  const value = cell[key];
  if (typeof value !== "number") return { median: null, values: [], n: 0, blocked: cell.blocked ? 1 : 0, failed: 0, runs: [] };
  return { median: value, values: [value], n: cell.runs || 1, blocked: 0, failed: cell.failedRuns || 0, runs: [] };
}

function fmtScore(value) {
  if (value == null) return "—";
  return String(Math.round(value * 100));
}

function fmtMetric(metric, value) {
  if (value == null) return "—";
  if (metric === "performance" || metric === "accessibility" || metric === "best-practices" || metric === "seo") {
    return fmtScore(value);
  }
  if (metric === "lcp") return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
  if (metric === "tbt") return `${Math.round(value)} ms`;
  if (metric === "cls") return value.toFixed(3);
  if (metric === "bytes") return value >= 1048576 ? `${(value / 1048576).toFixed(2)} MB` : `${Math.round(value / 1024)} KB`;
  return String(value);
}

function band(metric, value) {
  if (value == null) return "";
  if (metric === "performance" || metric === "accessibility" || metric === "best-practices" || metric === "seo") {
    const score = Math.round(value * 100);
    if (score >= 90) return "good";
    if (score >= 50) return "mid";
    return "poor";
  }
  if (metric === "lcp") return value <= 2500 ? "good" : value <= 4000 ? "mid" : "poor";
  if (metric === "cls") return value <= 0.1 ? "good" : value <= 0.25 ? "mid" : "poor";
  if (metric === "tbt") return value <= 200 ? "good" : value <= 600 ? "mid" : "poor";
  return "";
}

function cellText(summary) {
  if (!summary || (!summary.n && !summary.blocked && !summary.failed)) return { text: "—", sort: "", band: "" };
  if (!summary.n && summary.blocked && !summary.failed) return { text: "blocked", sort: "", band: "" };
  if (!summary.n && summary.failed) return { text: "failed", sort: "", band: "" };
  const metric = summary.metric;
  let text = fmtMetric(metric, summary.median);
  if (summary.blocked || summary.failed) {
    const bits = [];
    if (summary.failed) bits.push(`${summary.failed} failed`);
    if (summary.blocked) bits.push(`${summary.blocked} blocked`);
    text += ` (${summary.n} runs; ${bits.join(", ")})`;
  }
  return { text, sort: String(summary.median), band: band(metric, summary.median) };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function renderBody(model) {
  const { sitesDoc, redesign, review, columns } = model;
  const fetchTimes = model.runs.map((run) => run.fetchTime).filter(Boolean).sort();
  const when = fetchTimes.length ? `${fetchTimes[0].slice(0, 10)} to ${fetchTimes[fetchTimes.length - 1].slice(0, 10)}` : sitesDoc.observedOn;
  return `<div class="wrap compare">
<p class="cmp-kicker">Concept redesign · measured comparison</p>
<h1>Competitor comparison</h1>
<p class="lede cmp-lede">Lab metrics for the current Advanced Molecular Technologies site and twelve chemical catalogues. Each figure is the median of up to three Lighthouse ${esc(sitesDoc.tool.lighthouse)} runs. The new redesign column stays empty until <code>compare/data/redesign.json</code> carries a real measurement.</p>
<p class="cmp-meta">Run dates in the raw files: ${esc(when)}. Tooling recorded in <code>compare/data/sites.json</code>. Colour bands are the published Lighthouse score bands (90 / 50) and Core Web Vitals bands (LCP 2.5 s / 4 s, CLS 0.1 / 0.25, TBT 200 ms / 600 ms). They are not a separate score.</p>
${renderScorecard(columns, redesign)}
<h2>Lighthouse medians</h2>
<p class="cmp-meta">Home page, mobile, unless the column says otherwise. Sort from the header buttons. Raw runs are the JSON files linked from each site note.</p>
<div class="cmp-legend">
<span><i class="cmp-swatch cmp-band-good"></i>Good band</span>
<span><i class="cmp-swatch cmp-band-mid"></i>Needs-improvement band</span>
<span><i class="cmp-swatch cmp-band-poor"></i>Poor band</span>
<span>blocked or failed = no number, the run did not return the catalogue</span>
</div>
${renderTable(columns, redesign)}
${renderRunDetails(columns)}
<h2>Hands-on review</h2>
${renderReview(columns, review, sitesDoc)}
<h2>Method</h2>
${renderMethod(sitesDoc, model.runs, redesign)}
</div>
<script type="module" src="/amt/redesign/compare/sort.js"></script>`;
}

function renderScorecard(columns, redesign) {
  const cards = [];
  const amt = columns.find((col) => col.site.id === "amt");
  if (amt) cards.push(scoreCard(amt.site.name, summarise(amt.groups["home|mobile"], "performance"), "Current site, mobile home performance"));
  cards.push(redesignCard(redesign));
  const ranked = columns
    .map((col) => {
      const summary = summarise(col.groups["home|mobile"], "performance");
      summary.metric = "performance";
      return { name: col.site.name, summary };
    })
    .filter((item) => item.summary.n);
  ranked.sort((a, b) => b.summary.median - a.summary.median);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  if (best) cards.push(scoreCard(best.name, best.summary, "Highest measured mobile home performance"));
  if (worst && worst !== best) cards.push(scoreCard(worst.name, worst.summary, "Lowest measured mobile home performance"));
  const blocked = columns.filter((col) => {
    const runs = col.groups["home|mobile"] || [];
    return runs.length && runs.every((run) => isBlocked(run));
  });
  cards.push(`<article class="cmp-card"><h3>Home pages blocked</h3><p class="cmp-score-lg">${blocked.length}</p><p class="cmp-meta">${blocked.length ? esc(blocked.map((col) => col.site.name).join(", ")) : "None of the measured home pages were blocked on every run."}</p></article>`);
  return `<div class="cmp-cards">${cards.join("")}</div>`;
}

function scoreCard(name, summary, caption) {
  const withMetric = { ...summary, metric: "performance" };
  const cell = cellText(withMetric);
  return `<article class="cmp-card"><h3>${esc(name)}</h3><p class="cmp-score-lg">${esc(cell.text)}</p><p class="cmp-meta">${esc(caption)}. Median of ${summary.n} successful run${summary.n === 1 ? "" : "s"}.</p></article>`;
}

function redesignCard(redesign) {
  if (redesignPending(redesign)) {
    return `<article class="cmp-card"><h3>${esc(redesign.name)}</h3><p class="cmp-score-lg cmp-pending">Pending</p><p class="cmp-meta">${esc(redesign.note)}</p></article>`;
  }
  const summary = redesignSummary(redesign, "home", "mobile", "performance");
  if (!summary) return `<article class="cmp-card"><h3>${esc(redesign.name)}</h3><p class="cmp-pending">No home mobile median in redesign.json.</p></article>`;
  return scoreCard(redesign.name, summary, "Redesign, mobile home performance");
}

function renderTable(columns, redesign) {
  const specs = [
    ["Site", "text", null, null, null],
    ["Mobile perf", "number", "home", "mobile", "performance"],
    ["Desktop perf", "number", "home", "desktop", "performance"],
    ["Mobile a11y", "number", "home", "mobile", "accessibility"],
    ["Mobile best practices", "number", "home", "mobile", "best-practices"],
    ["Mobile SEO", "number", "home", "mobile", "seo"],
    ["Mobile LCP", "number", "home", "mobile", "lcp"],
    ["Mobile CLS", "number", "home", "mobile", "cls"],
    ["Mobile TBT", "number", "home", "mobile", "tbt"],
    ["Mobile weight", "number", "home", "mobile", "bytes"],
    ["Desktop LCP", "number", "home", "desktop", "lcp"],
    ["Desktop weight", "number", "home", "desktop", "bytes"],
    ["Product mobile perf", "number", "product", "mobile", "performance"],
    ["Product mobile LCP", "number", "product", "mobile", "lcp"],
    ["Product mobile a11y", "number", "product", "mobile", "accessibility"],
  ];
  const head = specs
    .map(([label, kind], index) => `<th scope="col"${index === 0 ? ' class="cmp-sticky"' : ""}><button type="button" data-sort="${kind}">${esc(label)}</button></th>`)
    .join("");
  const rows = [];
  rows.push(renderSiteRow(columns.find((col) => col.site.id === "amt"), specs));
  rows.push(renderRedesignRow(redesign, specs));
  for (const col of columns) {
    if (col.site.id === "amt") continue;
    rows.push(renderSiteRow(col, specs));
  }
  return `<div class="cmp-scroll" tabindex="0" role="region" aria-label="Sortable Lighthouse medians"><table data-sort-table><caption>Lighthouse medians for the home page and one product page. Pending cells have no measured number.</caption><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function renderSiteRow(col, specs) {
  if (!col) return "";
  const cells = specs.map(([label, , page, form, metric], index) => {
    if (index === 0) {
      return `<th scope="row" class="cmp-sticky" data-sort-value="${esc(col.site.name)}"><a href="#site-${esc(col.site.id)}">${esc(col.site.name)}</a></th>`;
    }
    const summary = summarise(col.groups[`${page}|${form}`], metric);
    summary.metric = metric;
    const cell = cellText(summary);
    const cls = cell.band ? ` class="cmp-band-${cell.band}"` : "";
    return `<td${cls} data-sort-value="${esc(cell.sort)}">${esc(cell.text)}</td>`;
  });
  return `<tr>${cells.join("")}</tr>`;
}

function renderRedesignRow(redesign, specs) {
  const cells = specs.map(([, , page, form, metric], index) => {
    if (index === 0) {
      return `<th scope="row" class="cmp-sticky" data-sort-value="${esc(redesign.name)}"><a href="#site-redesign">${esc(redesign.name)}</a></th>`;
    }
    if (redesignPending(redesign)) return `<td class="cmp-pending" data-sort-value="">pending</td>`;
    const summary = redesignSummary(redesign, page, form, metric);
    if (!summary) return `<td data-sort-value="">—</td>`;
    summary.metric = metric;
    const cell = cellText(summary);
    const cls = cell.band ? ` class="cmp-band-${cell.band}"` : "";
    return `<td${cls} data-sort-value="${esc(cell.sort)}">${esc(cell.text)}</td>`;
  });
  return `<tr>${cells.join("")}</tr>`;
}

function renderRunDetails(columns) {
  const blocks = columns.map((col) => {
    const keys = Object.keys(col.groups).sort();
    const parts = keys.map((key) => {
      const [page, form] = key.split("|");
      const runs = col.groups[key];
      const items = runs.map((run) => {
        const perf = metricValue(run, "performance");
        const lcp = metricValue(run, "lcp");
        const cls = metricValue(run, "cls");
        const tbt = metricValue(run, "tbt");
        const bytes = metricValue(run, "bytes");
        const a11y = metricValue(run, "accessibility");
        const bp = metricValue(run, "best-practices");
        const seo = metricValue(run, "seo");
        let line;
        if (usable(run)) {
          line = `run ${run.run}: perf ${fmtScore(perf)}, a11y ${fmtScore(a11y)}, best practices ${fmtScore(bp)}, SEO ${fmtScore(seo)}, LCP ${fmtMetric("lcp", lcp)}, CLS ${fmtMetric("cls", cls)}, TBT ${fmtMetric("tbt", tbt)}, weight ${fmtMetric("bytes", bytes)}`;
          if (run.fetchTime) line += `, fetchTime ${run.fetchTime}`;
          if (run.finalUrl) line += `, final URL ${run.finalUrl}`;
        } else if (isBlocked(run)) {
          const fromError = (String(run.error || "").match(/Status code:\s*\d+/i) || [])[0] || "";
          const reason = run.blockReason || fromError;
          const status = run.mainDocumentStatus ? String(run.mainDocumentStatus) : "";
          const statusBit = status && !String(reason).includes(status) ? `, HTTP ${status}` : "";
          line = `run ${run.run}: blocked${reason ? ` (${reason})` : ""}${statusBit}`;
        } else {
          const err = String(run.error || run.runtimeError?.message || "no catalogue result").replace(/\s+/g, " ").slice(0, 220);
          line = `run ${run.run}: failed — ${err}`;
        }
        return `<li>${esc(line)} · <a href="/amt/redesign/compare/data/lighthouse/${esc(run.file)}">raw JSON</a></li>`;
      });
      return `<h3>${esc(page)} · ${esc(form)}</h3><ul class="cmp-tight">${items.join("")}</ul>`;
    });
    return `<section class="cmp-site" id="site-${esc(col.site.id)}"><h2>${esc(col.site.name)}</h2>
<p>${esc(col.site.selection)}</p>
<p class="cmp-meta">Home: <a href="${esc(col.site.homeUrl)}">${esc(col.site.homeUrl)}</a><br>Product page measured: <a href="${esc(col.site.productUrl)}">${esc(col.site.productUrl)}</a> — ${esc(col.site.productLabel)}</p>
<p class="cmp-meta">${esc(col.site.robots)}</p>
${parts.join("")}</section>`;
  });
  return blocks.join("");
}

function renderReview(columns, review, sitesDoc) {
  const pending = `<section class="cmp-site" id="site-redesign"><h2>New AMT redesign</h2><p class="cmp-pending">Pending live measurement. This section reads <code>compare/data/redesign.json</code>. No screenshots or scores are filled in until that file leaves status “pending live measurement”.</p></section>`;
  if (!review || !review.sites) {
    return `<p class="cmp-note">The hands-on review file <code>compare/data/review.json</code> is not present, so this build has no search, filter, product-detail, mobile, or quote notes. Lighthouse numbers above still come only from <code>compare/data/lighthouse/</code>.</p>${pending}`;
  }
  const order = ["amt", ...columns.map((col) => col.site.id).filter((id) => id !== "amt")];
  const seen = new Set();
  const blocks = [];
  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);
    const site = sitesDoc.sites.find((item) => item.id === id);
    const note = review.sites[id];
    if (!site || !note) continue;
    blocks.push(renderSiteReview(site, note));
  }
  return `${blocks.join("")}${pending}`;
}

function renderSiteReview(site, note) {
  const shots = (note.shots || [])
    .map(
      (shot) => `<figure><img src="${esc(shot.src)}" alt="${esc(shot.alt)}" loading="lazy"><figcaption>${esc(shot.caption)}</figcaption></figure>`,
    )
    .join("");
  const queries = (note.queries || [])
    .map((item) => `<li><strong>${esc(item.query)}</strong> — ${esc(item.observed)}${item.url ? ` Final URL: ${esc(item.url)}.` : ""}</li>`)
    .join("");
  const fields = note.productFields || {};
  const fieldList = ["cas", "mw", "purity", "pricing", "sds", "coa", "structure"]
    .map((key) => `<dt>${esc(key)}</dt><dd>${esc(fields[key] || "not recorded")}</dd>`)
    .join("");
  return `<section class="cmp-site"><h2>${esc(site.name)} · observed catalogue behaviour</h2>
<h3>Search</h3>
${note.searchNote ? `<p>${esc(note.searchNote)}</p>` : ""}
${queries ? `<ul class="cmp-tight">${queries}</ul>` : "<p class=\"cmp-meta\">No query notes recorded.</p>"}
<h3>Filters</h3>
<p>${esc(note.filters || "No filter note recorded.")}</p>
<h3>Product page</h3>
<p>${esc(note.productNote || "")}</p>
<dl class="cmp-fields">${fieldList}</dl>
<h3>Mobile</h3>
<p>${esc(note.mobile || "No mobile note recorded.")}</p>
<h3>Quote and cart</h3>
<p>${esc(note.quoteCart || "No quote or cart note recorded.")}</p>
${shots ? `<div class="cmp-shots">${shots}</div>` : ""}
</section>`;
}

function renderMethod(sitesDoc, runs, redesign) {
  const ok = runs.filter(usable).length;
  const blocked = runs.filter((run) => isBlocked(run)).length;
  const failed = runs.filter((run) => !usable(run) && !isBlocked(run)).length;
  const versions = [...new Set(runs.map((run) => run.lighthouseVersion).filter(Boolean))];
  return `<div class="cmp-note">
<p>Lighthouse ${esc(versions.join(", ") || sitesDoc.tool.lighthouse)} was run with Chrome headless (<code>--headless=new --no-sandbox --disable-gpu</code>). Mobile runs use Lighthouse’s default mobile emulation and simulated throttling. Desktop runs use <code>--preset=desktop</code>. Categories: performance, accessibility, best practices, SEO. The page reports the median. With an even number of successful runs the median is the mean of the two middle values. Scores are stored as Lighthouse’s 0–1 values and shown rounded to the nearest integer. LCP, CLS, TBT and total byte weight are the audit <code>numericValue</code> fields.</p>
<p>Each URL was run three times. This build read ${runs.length} run files: ${ok} returned a catalogue document, ${blocked} were flagged blocked (HTTP status ≥ 400 or an error/challenge URL), ${failed} failed before a report. A blocked or failed run contributes no number. Image payloads and audit item lists were removed from the stored JSON; scores, numeric values, the main-document status and the Lighthouse metadata were copied across. The trim note is inside each file.</p>
<p>Hands-on checks used headless Chrome. The same five queries were typed where the site’s robots.txt allows a search URL: ${esc(sitesDoc.queries.join(", "))}. Where robots.txt disallows search, cart, or inquiry URLs, those URLs were not requested and the note says so. No quote form was submitted, no account was created, and nobody was contacted.</p>
<p>The new redesign is a column only. <code>compare/data/redesign.json</code> currently has status “${esc(redesign.status)}”. A later pass replaces that status and adds either <code>runs</code> (trimmed Lighthouse objects with <code>page</code> and <code>formFactor</code>) or <code>lighthouse.home/product.mobile/desktop</code> medians. Until then the column shows pending and no number.</p>
</div>
<ul class="cmp-tight">
${sitesDoc.sites
  .map(
    (site) =>
      `<li><strong>${esc(site.name)}</strong> — home ${esc(site.homeUrl)}; product ${esc(site.productUrl)}</li>`,
  )
  .join("")}
</ul>`;
}

function fallbackRenderPage({ title, description, body, head }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} · AMT concept redesign</title>
<meta name="description" content="${esc(description)}">
<link rel="stylesheet" href="/amt/redesign/css/compare.css">
${head || ""}
<script>
(function () {
  var key = "amt-theme";
  try {
    var saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
  } catch (err) {}
  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-theme-toggle]");
    if (!button) return;
    var current = document.documentElement.getAttribute("data-theme");
    if (current !== "light" && current !== "dark") {
      current = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    var next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(key, next); } catch (err) {}
    button.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
  });
})();
</script>
</head>
<body class="cmp-fallback">
<a class="skip" href="#content">Skip to content</a>
<header class="site-header">
<div class="header-inner">
<a class="brand" href="/amt/redesign/">AMT <span class="brand-tag">Concept redesign</span></a>
<nav class="site-nav" aria-label="Primary">
<ul>
<li><a href="/amt/redesign/">Home</a></li>
<li><a href="/amt/redesign/catalogue/">Catalogue</a></li>
<li><a href="/amt/redesign/compare/" aria-current="page">Compare</a></li>
<li><a href="/amt/redesign/quote/">Quote</a></li>
<li><a href="/amt/redesign/about/">About</a></li>
<li><a href="/amt/redesign/contact/">Contact</a></li>
</ul>
</nav>
<button type="button" data-theme-toggle aria-pressed="false">Theme</button>
</div>
</header>
<main id="content">${body}</main>
<footer class="site-footer"><div class="footer-inner"><p>Concept redesign, not the official AMT site. Figures on this page are from the measurement files in <code>compare/data/</code>.</p></div></footer>
</body>
</html>`;
}

const isDirect = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirect) {
  const outDir = REDESIGN;
  let renderPage = fallbackRenderPage;
  try {
    const layoutPath = path.join(REDESIGN, "_build/lib/layout.mjs");
    const dataPath = path.join(REDESIGN, "_build/lib/data.mjs");
    const layout = await import(pathToFileURL(layoutPath).href);
    const data = await import(pathToFileURL(dataPath).href);
    if (typeof layout.renderPage === "function" && typeof layout.configure === "function" && typeof data.loadData === "function") {
      const loaded = await data.loadData(REDESIGN);
      layout.configure({ site: loaded.site });
      renderPage = layout.renderPage;
    }
  } catch (err) {
    console.error(`shared layout unavailable, using fallback: ${err.message}`);
  }
  await build({
    renderPage,
    outDir,
    writeFile: async (file, contents) => {
      const full = path.isAbsolute(file) ? file : path.join(outDir, file);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, contents);
    },
  });
  console.log("wrote compare/index.html");
}
