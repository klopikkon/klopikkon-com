import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { BUDGET, LOCAL_HTTP_BP_AUDITS, RUNS } from "./budget.mjs";
import {
  BASE_PATH,
  LIVE_ORIGIN,
  ensureResults,
  help,
  liveStatus,
  locate,
  pagesFor,
  parseArgs,
  relaunchWithNpx,
  report,
} from "./common.mjs";
import { upsertBlock } from "./report.mjs";
import { startServer } from "./server.mjs";

const FORMS = ["mobile", "desktop"];

function scoreOf(lhr, id) {
  const score = lhr.categories?.[id]?.score;
  return typeof score === "number" ? score * 100 : null;
}

function adjustedBestPractices(lhr, ignore) {
  const refs = lhr.categories?.["best-practices"]?.auditRefs || [];
  let weight = 0;
  let total = 0;
  const ignored = [];
  for (const ref of refs) {
    if (!ref.weight) continue;
    const audit = lhr.audits?.[ref.id];
    if (!audit || audit.score === null || audit.score === undefined) continue;
    if (ignore.has(ref.id)) {
      if (audit.score < 1) ignored.push(ref.id);
      continue;
    }
    weight += ref.weight;
    total += audit.score * ref.weight;
  }
  return { score: weight ? (total / weight) * 100 : scoreOf(lhr, "best-practices"), ignored };
}

function metricsOf(lhr, isLocal) {
  const bp = adjustedBestPractices(lhr, isLocal ? LOCAL_HTTP_BP_AUDITS : new Set());
  return {
    performance: scoreOf(lhr, "performance"),
    accessibility: scoreOf(lhr, "accessibility"),
    bestPracticesRaw: scoreOf(lhr, "best-practices"),
    bestPractices: bp.score,
    ignoredBp: bp.ignored,
    seo: scoreOf(lhr, "seo"),
    lcp: lhr.audits?.["largest-contentful-paint"]?.numericValue ?? null,
    cls: lhr.audits?.["cumulative-layout-shift"]?.numericValue ?? null,
    tbt: lhr.audits?.["total-blocking-time"]?.numericValue ?? null,
    crawlable: lhr.audits?.["is-crawlable"]?.score ?? null,
    crawlableTitle: lhr.audits?.["is-crawlable"]?.title || "",
  };
}

function median(values) {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function runOnce(url, form, outFile) {
  const args = [
    url,
    "--quiet",
    "--output=json",
    `--output-path=${outFile}`,
    "--only-categories=performance,accessibility,best-practices,seo",
    "--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage",
  ];
  if (form === "desktop") args.push("--preset=desktop");
  const result = spawnSync("lighthouse", args, {
    encoding: "utf8",
    timeout: 180000,
    env: process.env,
  });
  return result;
}

function loadLhr(file) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return parsed.lhr || parsed;
}

async function measure({ origin, pages, label, isLocal, runs, resultsDir, failures, notes, rows }) {
  for (const spec of pages) {
    const url = `${origin}${spec.urlPath}`;
    if (!isLocal) {
      const probe = await liveStatus(spec.urlPath);
      if (probe.status === 404) {
        notes.push(`[${label}] skip ${spec.id}: ${url} is not published (HTTP 404)`);
        continue;
      }
      if (!probe.ok) {
        failures.push(`[${label}] ${spec.id}: ${url} returned HTTP ${probe.status || probe.error}`);
        continue;
      }
    }
    for (const form of FORMS) {
      const samples = [];
      let lastError = "";
      for (let index = 1; index <= runs; index += 1) {
        const outFile = path.join(
          resultsDir,
          `lighthouse-${label}-${spec.id}-${form}-${index}.json`,
        );
        fs.rmSync(outFile, { force: true });
        let result = runOnce(url, form, outFile);
        if ((result.status !== 0 || !fs.existsSync(outFile)) && result.status !== 0) {
          result = runOnce(url, form, outFile);
        }
        if (result.status !== 0 || !fs.existsSync(outFile)) {
          lastError = (
            result.error?.message ||
            result.stderr ||
            result.stdout ||
            "lighthouse failed"
          )
            .trim()
            .slice(-500);
          break;
        }
        try {
          samples.push(metricsOf(loadLhr(outFile), isLocal));
        } catch (error) {
          lastError = error.message;
          break;
        }
      }
      if (samples.length !== runs) {
        failures.push(`[${label}] ${spec.id} ${form}: lighthouse did not finish ${runs} run(s). ${lastError}`);
        continue;
      }
      const summary = {
        label,
        page: spec.id,
        url,
        form,
        runs,
        performance: median(samples.map((sample) => sample.performance)),
        accessibility: median(samples.map((sample) => sample.accessibility)),
        bestPractices: median(samples.map((sample) => sample.bestPractices)),
        bestPracticesRaw: median(samples.map((sample) => sample.bestPracticesRaw)),
        seo: median(samples.map((sample) => sample.seo)),
        lcp: median(samples.map((sample) => sample.lcp)),
        cls: median(samples.map((sample) => sample.cls)),
        tbt: median(samples.map((sample) => sample.tbt)),
        crawlable: median(samples.map((sample) => sample.crawlable)),
        ignoredBp: [...new Set(samples.flatMap((sample) => sample.ignoredBp))],
      };
      const misses = gate(summary);
      summary.gate = misses.length ? "fail" : "pass";
      summary.misses = misses;
      rows.push(summary);
      if (misses.length) {
        failures.push(`[${label}] ${spec.id} ${form}: ${misses.join("; ")}`);
      }
    }
  }
}

function gate(summary) {
  const budget = BUDGET[summary.form];
  const misses = [];
  const checkMin = (name, value, min) => {
    if (value == null) misses.push(`${name} missing`);
    else if (value < min) misses.push(`${name} ${value.toFixed(0)} < ${min}`);
  };
  const checkMax = (name, value, max, digits = 0) => {
    if (value == null) misses.push(`${name} missing`);
    else if (value > max) misses.push(`${name} ${digits ? value.toFixed(digits) : Math.round(value)} > ${max}`);
  };
  checkMin("performance", summary.performance, budget.performance);
  checkMin("accessibility", summary.accessibility, budget.accessibility);
  checkMin("best-practices", summary.bestPractices, budget["best-practices"]);
  checkMax("LCP ms", summary.lcp, budget.lcp);
  checkMax("CLS", summary.cls, budget.cls, 3);
  checkMax("TBT ms", summary.tbt, budget.tbt);
  return misses;
}

function cell(value, digits = 0) {
  if (value == null) return "—";
  return digits ? value.toFixed(digits) : String(Math.round(value));
}

function renderTable(label, rows, runs) {
  const lines = [
    `### ${label}`,
    "",
    `Median of ${runs} Lighthouse run(s). SEO is reported and is not a gate: \`noindex,nofollow\` makes \`is-crawlable\` fail on purpose.`,
    "On the local HTTP server, best-practices ignores `is-on-https` and `redirects-http`.",
    "",
    "| Target | Page | Form | Perf | A11y | BP | SEO | LCP | CLS | TBT | Gate |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  if (!rows.length) {
    lines.push("| — | — | — | — | — | — | — | — | — | — | skipped |");
  }
  for (const row of rows) {
    const lcp = row.lcp == null ? "—" : `${(row.lcp / 1000).toFixed(2)}s`;
    const tbt = row.tbt == null ? "—" : `${Math.round(row.tbt)}ms`;
    lines.push(
      `| ${row.label} | ${row.page} | ${row.form} | ${cell(row.performance)} | ${cell(row.accessibility)} | ${cell(row.bestPractices)} | ${cell(row.seo)} | ${lcp} | ${cell(row.cls, 3)} | ${tbt} | ${row.gate} |`,
    );
  }
  const ignored = [...new Set(rows.flatMap((row) => row.ignoredBp || []))];
  if (ignored.length) {
    lines.push("", `Local best-practices audits ignored: ${ignored.map((id) => `\`${id}\``).join(", ")}.`);
  }
  const seoNote = rows.filter((row) => row.crawlable === 0);
  if (seoNote.length) {
    lines.push("", "SEO `is-crawlable` score is 0 on every measured page because robots noindex is required.");
  }
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(help("lighthouse", " [--runs 3]\n\nAlways measures local pages that exist, then the same URLs on the live site when they are published."));
    return;
  }
  const located = locate(args);
  const runs = args.runs || RUNS;
  ensureResults(located);
  const pages = pagesFor(located.scanRedesign, "lighthouse");
  const failures = [];
  const skips = [];
  const notes = [];
  const rows = [];

  if (!pages.length) skips.push("no local lighthouse pages yet (home, catalogue, product, quote, compare)");
  else {
    relaunchWithNpx(import.meta.url, ["lighthouse@13.5.0"], {
      CHROME_PATH: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    });
  }

  let server;
  try {
    if (pages.length) {
      server = await startServer(located.repo);
      notes.push(`local server ${server.origin}`);
      await measure({
        origin: server.origin,
        pages,
        label: "local",
        isLocal: true,
        runs,
        resultsDir: located.results,
        failures,
        notes,
        rows,
      });
    }

    const live = await liveStatus(`${BASE_PATH}/`);
    if (live.error) failures.push(`[live] ${live.url} could not be fetched (${live.error})`);
    else if (live.status === 404) skips.push(`[live] ${live.url} is not published yet (HTTP 404)`);
    else if (!live.ok) failures.push(`[live] ${live.url} returned HTTP ${live.status}`);
    else if (!pages.length) skips.push("[live] no local page list to mirror onto the live site");
    else {
      await measure({
        origin: LIVE_ORIGIN,
        pages,
        label: "live",
        isLocal: false,
        runs,
        resultsDir: located.results,
        failures,
        notes,
        rows,
      });
    }
  } finally {
    if (server) await server.close();
  }

  const summary = { label: located.label, runs, rows, at: new Date().toISOString() };
  fs.writeFileSync(path.join(located.results, "lighthouse-summary.json"), JSON.stringify(summary, null, 2));
  if (fs.existsSync(located.reportFile)) {
    upsertBlock(located.reportFile, `lighthouse-${located.label}`, renderTable(located.label, rows, runs));
  } else {
    notes.push(`QA.md not found at ${located.reportFile}; left lighthouse-summary.json only`);
  }

  const measured = rows.length > 0;
  report(located, {
    name: "lighthouse",
    status: failures.length ? "fail" : measured ? "pass" : "skip",
    failures,
    skips,
    notes: measured ? [`${rows.length} page/form median(s) from ${runs} run(s)`, ...notes] : notes,
    extra: { rows },
  });
}

main().catch((error) => {
  console.error(`FAIL lighthouse\n  ${error.stack || error.message}`);
  process.exitCode = 1;
});
