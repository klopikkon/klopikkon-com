import {
  BASE_PATH,
  LIVE_ORIGIN,
  canonicalPath,
  fileUrlPath,
  help,
  isHtmlFile,
  liveStatus,
  locate,
  parseArgs,
  parseAttrs,
  relTo,
  report,
  walkFiles,
} from "./common.mjs";
import { startServer } from "./server.mjs";

const SKIP_PROTOCOL = /^(mailto|tel|sms|javascript|data|blob|about):/i;

function extractHtml(html) {
  const refs = [];
  const source = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of source.matchAll(/<([a-zA-Z][\w:-]*)\b([^>]*)>/g)) {
    const name = tag[1].toLowerCase();
    const attrs = parseAttrs(tag[2]);
    for (const key of ["href", "src", "action", "poster"]) {
      if (attrs[key]) refs.push({ raw: decode(attrs[key]), kind: `${name}[${key}]` });
    }
    if (attrs.srcset) {
      for (const part of attrs.srcset.split(",")) {
        const url = part.trim().split(/\s+/)[0];
        if (url) refs.push({ raw: decode(url), kind: `${name}[srcset]` });
      }
    }
  }
  return refs;
}

function extractCss(css) {
  const refs = [];
  for (const match of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    const raw = match[2].trim();
    if (raw && !raw.startsWith("data:")) refs.push({ raw, kind: "css-url" });
  }
  for (const match of css.matchAll(/@import\s+(?:url\(\s*)?(['"])([^'"]+)\1/g)) {
    refs.push({ raw: match[2], kind: "css-import" });
  }
  return refs;
}

function extractJs(source) {
  const refs = [];
  const patterns = [
    [/(?:^|[^\w])import\s+(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/g, "js-import"],
    [/import\(\s*['"]([^'"]+)['"]\s*\)/g, "js-import"],
    [/fetch\(\s*['"]([^'"]+)['"]/g, "js-fetch"],
  ];
  for (const [pattern, kind] of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (looksLikeUrl(match[1])) refs.push({ raw: match[1], kind });
    }
  }
  return refs;
}

function extractJson(text) {
  const data = JSON.parse(text);
  const refs = [];
  const visit = (value) => {
    if (typeof value === "string") {
      if (looksLikeUrl(value)) refs.push({ raw: value, kind: "json" });
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(data);
  return refs;
}

function looksLikeUrl(value) {
  if (!value || value.length > 500 || /\s/.test(value)) return false;
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    /\.(?:html?|css|js|mjs|json|png|jpe?g|gif|svg|webp|pdf|woff2?)(?:[?#]|$)/i.test(value)
  );
}

function decode(value) {
  return String(value).replace(/&amp;/g, "&").replace(/&#0*38;/g, "&").trim();
}

/** @returns {URL | {bad: string} | null} */
function classify(raw, baseUrl, localOrigin) {
  const trimmed = String(raw || "").trim();
  if (!trimmed || SKIP_PROTOCOL.test(trimmed)) return null;
  if (trimmed.startsWith("#")) {
    const url = new URL(baseUrl);
    url.hash = trimmed;
    return url;
  }
  let url;
  try {
    url = new URL(trimmed, baseUrl);
  } catch {
    return { bad: trimmed };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const redesign = url.pathname === BASE_PATH || url.pathname.startsWith(`${BASE_PATH}/`);
  if (redesign && localOrigin) return new URL(`${url.pathname}${url.search}${url.hash}`, localOrigin);
  if (url.origin === new URL(baseUrl).origin) return url;
  return null;
}

function hashId(url) {
  if (!url.hash || url.hash === "#") return "";
  try {
    return decodeURIComponent(url.hash.slice(1));
  } catch {
    return url.hash.slice(1);
  }
}

function collectIds(html) {
  const ids = new Set();
  for (const match of html.matchAll(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    ids.add(match[1] ?? match[2] ?? match[3]);
  }
  return ids;
}

function kindOf(urlPath, contentType) {
  if (/html/.test(contentType) || /\/$/.test(urlPath) || urlPath.endsWith(".html")) return "html";
  if (/css/.test(contentType) || urlPath.endsWith(".css")) return "css";
  if (/javascript|ecmascript/.test(contentType) || /\.(?:js|mjs)$/.test(urlPath)) return "js";
  if (/json/.test(contentType) || urlPath.endsWith(".json")) return "json";
  return "other";
}

async function fetchPath(origin, urlPath) {
  const response = await fetch(`${origin}${urlPath}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  const contentType = response.headers.get("content-type") || "";
  const kind = kindOf(urlPath, contentType);
  const textual = kind === "html" || kind === "css" || kind === "js" || kind === "json";
  const body = response.ok && textual ? await response.text() : "";
  if (!(response.ok && textual)) await response.arrayBuffer();
  return { status: response.status, kind, body };
}

/**
 * @param {{ origin: string, localOrigin: string | null, files: string[], redesign: string, label: string }} job
 */
async function crawl(job) {
  const { origin, localOrigin, files, redesign, label } = job;
  const failures = [];
  const notes = [];
  const cache = new Map();
  const refs = [];
  const queue = [];
  const queued = new Set();

  const enqueue = (urlPath) => {
    const key = canonicalPath(urlPath);
    if (queued.has(key)) return;
    queued.add(key);
    queue.push(key);
  };

  if (files.length) {
    for (const file of files) enqueue(fileUrlPath(redesign, file));
  } else {
    enqueue(`${BASE_PATH}/`);
  }

  while (queue.length) {
    const urlPath = queue.shift();
    if (cache.has(urlPath)) continue;
    let record;
    try {
      record = await fetchPath(origin, urlPath);
    } catch (error) {
      record = { status: 0, kind: "other", body: "", error: error.message };
    }
    cache.set(urlPath, record);
    if (record.status !== 200) continue;
    if (!(urlPath === BASE_PATH || urlPath.startsWith(`${BASE_PATH}/`))) continue;

    const baseUrl = `${origin}${urlPath}`;
    let extracted = [];
    if (record.kind === "html") extracted = extractHtml(record.body);
    else if (record.kind === "css") extracted = extractCss(record.body);
    else if (record.kind === "js") extracted = extractJs(record.body);
    else if (record.kind === "json") {
      try {
        extracted = extractJson(record.body);
      } catch (error) {
        failures.push(`[${label}] ${urlPath} is not valid JSON (${error.message})`);
      }
    }
    for (const ref of extracted) {
      const classified = classify(ref.raw, baseUrl, localOrigin);
      if (!classified) continue;
      if (classified.bad) {
        failures.push(`[${label}] ${urlPath}: unparseable URL ${classified.bad}`);
        continue;
      }
      const next = canonicalPath(classified.pathname);
      refs.push({ from: urlPath, urlPath: next, id: hashId(classified), kind: ref.kind });
      if (!queued.has(next)) enqueue(next);
    }
  }

  for (const [urlPath, record] of cache) {
    if (record.status === 200) continue;
    const via = [];
    const seenFrom = new Set();
    for (const ref of refs) {
      if (ref.urlPath !== urlPath || seenFrom.has(ref.from)) continue;
      seenFrom.add(ref.from);
      via.push(`${ref.from} ${ref.kind}`);
      if (via.length === 4) break;
    }
    const why = record.error ? record.error : `HTTP ${record.status}`;
    failures.push(`[${label}] ${why} ${urlPath}${via.length ? ` (${via.join(", ")})` : ""}`);
  }

  const seenFragments = new Set();
  for (const ref of refs) {
    if (!ref.id) continue;
    if (!(ref.urlPath === BASE_PATH || ref.urlPath.startsWith(`${BASE_PATH}/`))) continue;
    const record = cache.get(ref.urlPath);
    if (!record || record.status !== 200 || record.kind !== "html") continue;
    const key = `${ref.urlPath}#${ref.id}`;
    if (seenFragments.has(key)) continue;
    seenFragments.add(key);
    if (!collectIds(record.body).has(ref.id)) {
      failures.push(`[${label}] missing #${ref.id} on ${ref.urlPath} (from ${ref.from} ${ref.kind})`);
    }
  }

  if (files.length) {
    const htmlPaths = new Set(files.map((file) => fileUrlPath(redesign, file)));
    const inbound = new Set();
    for (const ref of refs) {
      if (ref.from !== ref.urlPath && htmlPaths.has(ref.urlPath)) inbound.add(ref.urlPath);
    }
    for (const urlPath of htmlPaths) {
      if (urlPath === `${BASE_PATH}/` || inbound.has(urlPath)) continue;
      notes.push(`[${label}] orphan HTML (not linked from another redesign page): ${urlPath}`);
    }
  }

  notes.push(`[${label}] checked ${cache.size} internal URL(s)`);
  return { failures, notes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      help(
        "check-links",
        " [--live]\n\n--live also crawls https://klopikkon.com/amt/redesign/ and skips that half when it is not published (HTTP 404).",
      ),
    );
    return;
  }
  const located = locate(args);
  const files = await walkFiles(located.scanRedesign, (_file, name) => isHtmlFile(name));
  const failures = [];
  const skips = [];
  const notes = [];

  if (!files.length && !args.live) {
    report(located, {
      name: "check-links",
      status: "skip",
      skips: ["no HTML pages under amt/redesign yet"],
    });
    return;
  }

  if (files.length) {
    let server;
    try {
      const explicit = args.base ? args.base.replace(/\/$/, "") : "";
      if (!explicit) {
        server = await startServer(located.repo);
        notes.push(`local server ${server.origin}`);
      }
      const origin = explicit || server.origin;
      const result = await crawl({
        origin,
        localOrigin: origin,
        files,
        redesign: located.scanRedesign,
        label: explicit ? "base" : "local",
      });
      failures.push(...result.failures);
      notes.push(...result.notes);
    } finally {
      if (server) await server.close();
    }
  } else {
    skips.push("no local HTML to crawl");
  }

  if (args.live) {
    const live = await liveStatus(`${BASE_PATH}/`);
    if (live.error) failures.push(`[live] ${live.url} could not be fetched (${live.error})`);
    else if (live.status === 404) skips.push(`[live] ${live.url} is not published yet (HTTP 404)`);
    else if (!live.ok) failures.push(`[live] ${live.url} returned HTTP ${live.status}`);
    else {
      const result = await crawl({
        origin: LIVE_ORIGIN,
        localOrigin: null,
        files,
        redesign: located.scanRedesign,
        label: "live",
      });
      failures.push(...result.failures);
      notes.push(...result.notes);
    }
  }

  const status = failures.length ? "fail" : files.length || args.live ? "pass" : "skip";
  report(located, { name: "check-links", status, failures, skips, notes });
}

main().catch((error) => {
  console.error(`FAIL check-links\n  ${error.stack || error.message}`);
  process.exitCode = 1;
});
