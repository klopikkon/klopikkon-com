import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BASE_PATH = "/amt/redesign";
export const LIVE_ORIGIN = "https://klopikkon.com";
export const CONCEPT_NOTE = /concept redesign,\s*not the official amt site/i;

const libDir = path.dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const args = {
    live: false,
    base: null,
    root: null,
    repo: null,
    runs: null,
    label: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--live") args.live = true;
    else if (token === "--help" || token === "-h") args.help = true;
    else if (token === "--base") args.base = required(argv, ++i, token);
    else if (token === "--root") args.root = required(argv, ++i, token);
    else if (token === "--repo") args.repo = required(argv, ++i, token);
    else if (token === "--runs") args.runs = Number(required(argv, ++i, token));
    else if (token === "--label") args.label = required(argv, ++i, token);
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (args.runs != null && (!Number.isInteger(args.runs) || args.runs < 1)) {
    throw new Error("--runs must be a positive integer");
  }
  return args;
}

function required(argv, index, flag) {
  if (index >= argv.length || argv[index].startsWith("--")) {
    throw new Error(`${flag} needs a value`);
  }
  return argv[index];
}

export function locate(args = {}) {
  const qaDir = path.resolve(libDir, "..");
  const harnessRedesign = path.resolve(qaDir, "..");
  const scanRedesign = path.resolve(args.root || harnessRedesign);
  const repo = path.resolve(args.repo || path.join(scanRedesign, "..", ".."));
  return {
    qaDir,
    harnessRedesign,
    scanRedesign,
    repo,
    results: path.join(qaDir, "results"),
    reportFile: path.join(harnessRedesign, "QA.md"),
    label: args.label || "local",
  };
}

export function gitMeta(repo) {
  const read = (args) => {
    try {
      return execFileSync("git", args, {
        cwd: repo,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return null;
    }
  };
  return {
    sha: read(["rev-parse", "--short", "HEAD"]),
    branch: read(["rev-parse", "--abbrev-ref", "HEAD"]),
  };
}

export function ensureResults(located) {
  fs.mkdirSync(located.results, { recursive: true });
}

export function writeOutcome(located, outcome) {
  ensureResults(located);
  const file = path.join(located.results, `${outcome.name}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        ...outcome,
        label: located.label,
        scanRedesign: located.scanRedesign,
        git: gitMeta(located.repo),
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

/**
 * @param {ReturnType<typeof locate>} located
 * @param {{ name: string, status: "pass"|"skip"|"fail", failures?: string[], skips?: string[], notes?: string[], extra?: unknown }} outcome
 */
export function report(located, outcome) {
  const failures = outcome.failures || [];
  const skips = outcome.skips || [];
  const notes = outcome.notes || [];
  const status = failures.length ? "fail" : outcome.status;
  const line = status === "fail" ? "FAIL" : status === "skip" ? "SKIP" : "PASS";
  const log = status === "fail" ? console.error : console.log;
  log(`${line} ${outcome.name}`);
  for (const skip of skips) log(`  skip: ${skip}`);
  for (const note of notes) log(`  ${note}`);
  const shown = failures.slice(0, 80);
  for (const failure of shown) log(`  ${failure}`);
  if (failures.length > shown.length) {
    log(`  … ${failures.length - shown.length} more (see _qa/results/${outcome.name}.json)`);
  }
  writeOutcome(located, { ...outcome, status, failures, skips, notes });
  if (status === "fail") process.exitCode = 1;
  return status;
}

const SKIP_DIRS = new Set([".git", "node_modules", "_qa", "_build"]);

export async function walkFiles(dir, accept, { skipDirNames = SKIP_DIRS } = {}) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirNames.has(entry.name)) continue;
      out.push(...(await walkFiles(full, accept, { skipDirNames })));
    } else if (accept(full, entry.name)) {
      out.push(full);
    }
  }
  return out;
}

export function isHtmlFile(name) {
  return name.endsWith(".html") || name.endsWith(".htm");
}

export function relTo(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

export function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function visibleText(html) {
  const stripped = String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}

export function parseAttrs(source) {
  const attrs = {};
  const re = /([:@\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of source.matchAll(re)) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

export function canonicalPath(pathname) {
  let value = pathname || "/";
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep the raw path */
  }
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(/\/{2,}/g, "/");
  if (value.endsWith("/index.html")) value = value.slice(0, -"index.html".length);
  const tail = value.split("/").pop();
  const isFile = tail.includes(".");
  if (!isFile && !value.endsWith("/")) value = `${value}/`;
  return value;
}

export function fileUrlPath(redesign, file) {
  const rel = relTo(redesign, file);
  if (rel === "index.html") return `${BASE_PATH}/`;
  if (rel.endsWith("/index.html")) return `${BASE_PATH}/${rel.slice(0, -"index.html".length)}`;
  return `${BASE_PATH}/${rel}`;
}

export function firstProductPage(redesign) {
  const dir = path.join(redesign, "products");
  if (!fs.existsSync(dir)) return null;
  const pages = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "_qa" || entry.name === "_build") continue;
        stack.push(full);
      } else if (isHtmlFile(entry.name)) {
        if (path.relative(dir, full) === "index.html") continue;
        pages.push(full);
      }
    }
  }
  pages.sort();
  if (!pages.length) return null;
  const file = pages[0];
  return {
    id: "product",
    rel: relTo(redesign, file),
    urlPath: fileUrlPath(redesign, file),
    file,
  };
}

const A11Y_IDS = new Set([
  "home",
  "about",
  "contact",
  "catalogue",
  "quote",
  "compare",
  "styleguide",
  "lipids",
]);

const LIGHTHOUSE_IDS = new Set(["home", "catalogue", "product", "quote", "compare"]);

export function sitePages(redesign) {
  const specs = [
    ["home", "index.html", `${BASE_PATH}/`],
    ["about", "about/index.html", `${BASE_PATH}/about/`],
    ["contact", "contact/index.html", `${BASE_PATH}/contact/`],
    ["catalogue", "catalogue/index.html", `${BASE_PATH}/catalogue/`],
    ["quote", "quote/index.html", `${BASE_PATH}/quote/`],
    ["compare", "compare/index.html", `${BASE_PATH}/compare/`],
    ["styleguide", "styleguide/index.html", `${BASE_PATH}/styleguide/`],
    ["lipids", "families/lipids/index.html", `${BASE_PATH}/families/lipids/`],
  ];
  const found = [];
  for (const [id, rel, urlPath] of specs) {
    const file = path.join(redesign, rel);
    if (fs.existsSync(file)) found.push({ id, rel, urlPath, file });
  }
  if (!found.some((page) => page.id === "lipids")) {
    const families = path.join(redesign, "families");
    if (fs.existsSync(families)) {
      const names = fs.readdirSync(families).sort();
      for (const name of names) {
        const rel = `families/${name}/index.html`;
        const file = path.join(redesign, rel);
        if (fs.existsSync(file)) {
          found.push({
            id: `family-${name}`,
            rel,
            urlPath: `${BASE_PATH}/families/${name}/`,
            file,
          });
          break;
        }
      }
    }
  }
  const product = firstProductPage(redesign);
  if (product) found.push(product);
  return found;
}

export function pagesFor(redesign, kind) {
  const pages = sitePages(redesign);
  if (kind === "lighthouse") return pages.filter((page) => LIGHTHOUSE_IDS.has(page.id));
  return pages.filter(
    (page) => A11Y_IDS.has(page.id) || page.id === "product" || page.id.startsWith("family-"),
  );
}

export async function liveStatus(urlPath = `${BASE_PATH}/`) {
  const url = `${LIVE_ORIGIN}${urlPath}`;
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      headers: { accept: "text/html" },
    });
    return { url, status: response.status, ok: response.status === 200 };
  } catch (error) {
    return { url, status: 0, ok: false, error: error.message };
  }
}

/**
 * Re-run this process under `npx -p` when a dev tool is actually needed.
 * Returns false when this process is already that relaunch.
 */
export function relaunchWithNpx(scriptUrl, packages, extraEnv = {}) {
  if (process.env.QA_DEPS === "1") return false;
  const args = ["--yes"];
  for (const spec of packages) args.push("-p", spec);
  args.push("node", fileURLToPath(scriptUrl), ...process.argv.slice(2));
  const result = spawnSync("npx", args, {
    stdio: "inherit",
    env: {
      ...process.env,
      QA_DEPS: "1",
      npm_config_update_notifier: "false",
      ...extraEnv,
    },
  });
  process.exit(result.status ?? 1);
}

export function help(name, extra = "") {
  return `Usage: amt/redesign/_qa/${name} [--root <amt/redesign>] [--repo <repo>] [--label <name>]${extra}

Paths default to the redesign tree next to this script. --root points the
scan at another checkout (for example a worktree of the shell PR) without
copying files. Missing inputs are skipped, not failed.
`;
}
