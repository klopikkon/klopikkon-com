import path from "node:path";
import { createRequire } from "node:module";
import { pagesFor, BASE_PATH, LIVE_ORIGIN, ensureToolPackages, help, liveStatus, locate, parseArgs, report, resolveChromeBinary } from "./common.mjs";
import { startServer } from "./server.mjs";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
];
const THEMES = ["light", "dark"];

async function launchBrowser(chromium) {
  const args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
  const executablePath = resolveChromeBinary();
  if (executablePath) {
    try {
      return await chromium.launch({ executablePath, headless: true, args });
    } catch {
      /* fall through to Playwright's own lookup */
    }
  }
  try {
    return await chromium.launch({ channel: "chrome", headless: true, args });
  } catch (chromeError) {
    try {
      return await chromium.launch({ headless: true, args });
    } catch {
      throw new Error(
        `Could not launch Chrome (${chromeError.message}). Run via amt/redesign/_qa/check-a11y so Playwright is on NODE_PATH, and install Google Chrome or \`npx playwright install chromium\`.`,
      );
    }
  }
}

async function auditPages({ AxeBuilder, browser, origin, pages, label, failures, notes, violations, moderates }) {
  for (const spec of pages) {
    for (const theme of THEMES) {
      for (const viewport of VIEWPORTS) {
        let context;
        try {
          context = await browser.newContext({
            viewport,
            colorScheme: theme === "dark" ? "dark" : "light",
            reducedMotion: "reduce",
          });
          await context.addInitScript((chosen) => {
            try {
              localStorage.setItem("amt-theme", chosen);
            } catch {
              /* storage can be blocked; the page is still themed after load */
            }
          }, theme);
          const page = await context.newPage();
          const url = `${origin}${spec.urlPath}`;
          const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
          const status = response ? response.status() : 0;
          if (status !== 200) {
            failures.push(`[${label}] ${spec.id} returned HTTP ${status} (${url})`);
            continue;
          }
          await page.evaluate((chosen) => {
            document.documentElement.setAttribute("data-theme", chosen);
          }, theme);
          const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
          const where = `${spec.id} ${theme} ${viewport.width}px`;
          for (const violation of results.violations) {
            const impact = violation.impact || "unknown";
            const summary = `[${label}] ${impact} ${violation.id} on ${where} (${violation.nodes.length} nodes) ${violation.help}`;
            if (impact === "serious" || impact === "critical") {
              failures.push(summary);
              violations.push({
                label,
                page: spec.id,
                theme,
                width: viewport.width,
                id: violation.id,
                impact,
                help: violation.help,
                targets: violation.nodes.slice(0, 5).map((node) => node.target.join(" ")),
              });
            } else {
              moderates.push({ impact, id: violation.id, help: violation.help, where, nodes: violation.nodes.length });
            }
          }
          if (results.incomplete?.length) {
            const ids = [...new Set(results.incomplete.map((item) => item.id))].join(", ");
            notes.push(`[${label}] ${where}: incomplete ${ids}`);
          }
        } catch (error) {
          failures.push(`[${label}] ${spec.id} ${theme} ${viewport.width}px: ${error.message}`);
        } finally {
          if (context) await context.close();
        }
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      help(
        "check-a11y",
        " [--live]\n\nRuns axe-core through Playwright. WCAG 2.x A/AA. Serious and critical violations fail the run.",
      ),
    );
    return;
  }
  const located = locate(args);
  const pages = pagesFor(located.scanRedesign, "a11y");
  const failures = [];
  const skips = [];
  const notes = [];
  const violations = [];
  const moderates = [];

  if (!pages.length) {
    const skips = ["no representative HTML pages yet (home, about, contact, family, catalogue, product, quote, compare)"];
    const failures = [];
    if (args.live) {
      const live = await liveStatus(`${BASE_PATH}/`);
      if (live.error) failures.push(`[live] ${live.url} could not be fetched (${live.error})`);
      else if (live.status === 404) skips.push(`[live] ${live.url} is not published yet (HTTP 404)`);
      else if (!live.ok) failures.push(`[live] ${live.url} returned HTTP ${live.status}`);
      else skips.push("[live] no local page list to mirror onto the live site");
    }
    report(located, {
      name: "check-a11y",
      status: failures.length ? "fail" : "skip",
      failures,
      skips,
    });
    return;
  }

  let chromium;
  let AxeBuilder;
  try {
    const tools = ensureToolPackages(["playwright@1.64.1", "@axe-core/playwright@4.14.0"]);
    const require = createRequire(path.join(tools.nodeModules, "playwright", "package.json"));
    ({ chromium } = require("playwright"));
    const axeMod = require("@axe-core/playwright");
    AxeBuilder = axeMod.AxeBuilder || axeMod.default || axeMod;
  } catch (error) {
    console.error(`FAIL check-a11y\n  ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const browser = await launchBrowser(chromium);
  let server;
  try {
    if (pages.length) {
      server = await startServer(located.repo);
      notes.push(`local server ${server.origin}`);
      notes.push(
        `local pages: ${pages.map((page) => page.id).join(", ")}; themes light/dark; widths 375 and 1440`,
      );
      await auditPages({
        AxeBuilder,
        browser,
        origin: server.origin,
        pages,
        label: "local",
        failures,
        notes,
        violations,
        moderates,
      });
    } else {
      skips.push("no local representative pages");
    }

    if (args.live) {
      const live = await liveStatus(`${BASE_PATH}/`);
      if (live.error) failures.push(`[live] ${live.url} could not be fetched (${live.error})`);
      else if (live.status === 404) skips.push(`[live] ${live.url} is not published yet (HTTP 404)`);
      else if (!live.ok) failures.push(`[live] ${live.url} returned HTTP ${live.status}`);
      else if (!pages.length) skips.push("[live] no local page list to mirror onto the live site");
      else {
        await auditPages({
          AxeBuilder,
          browser,
          origin: LIVE_ORIGIN,
          pages,
          label: "live",
          failures,
          notes,
          violations,
          moderates,
        });
      }
    }
  } finally {
    await browser.close();
    if (server) await server.close();
  }

  const grouped = new Map();
  for (const item of moderates) {
    const key = `${item.impact} ${item.id}`;
    const group = grouped.get(key) || { ...item, count: 0, wheres: [] };
    group.count += 1;
    if (group.wheres.length < 8) group.wheres.push(`${item.where} (${item.nodes})`);
    grouped.set(key, group);
  }
  for (const group of grouped.values()) {
    notes.push(
      `${group.impact} ${group.id} × ${group.count} (not gated): ${group.help}; ${group.wheres.join("; ")}`,
    );
  }
  if (!failures.length && pages.length) {
    notes.push(`axe WCAG AA: 0 serious/critical across ${pages.length} page(s)`);
  }
  report(located, {
    name: "check-a11y",
    status: failures.length ? "fail" : pages.length ? "pass" : "skip",
    failures,
    skips,
    notes,
    extra: { violations, moderates },
  });
}

main().catch((error) => {
  console.error(`FAIL check-a11y\n  ${error.stack || error.message}`);
  process.exitCode = 1;
});
