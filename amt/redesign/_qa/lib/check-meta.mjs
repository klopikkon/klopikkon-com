import fs from "node:fs";
import path from "node:path";
import {
  CONCEPT_NOTE,
  help,
  isHtmlFile,
  locate,
  parseArgs,
  parseAttrs,
  relTo,
  report,
  visibleText,
  walkFiles,
} from "./common.mjs";

const LINK_EXT = new Set([".html", ".htm", ".css", ".svg", ".xml", ".xhtml"]);
const MD_EXT = new Set([".md", ".markdown"]);

function robotsValues(html) {
  const found = [];
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttrs(tag[0]);
    const name = (attrs.name || attrs["http-equiv"] || "").toLowerCase();
    if (name === "robots") found.push(attrs.content || "");
  }
  return found;
}

function robotsOk(content) {
  const tokens = content
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return tokens.length === 2 && tokens[0] === "noindex" && tokens[1] === "nofollow";
}

function footerOk(html) {
  const footer = html.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/i);
  if (!footer) return false;
  return CONCEPT_NOTE.test(visibleText(footer[0]));
}

function markdownLinksToRedesign(text) {
  const hits = [];
  const patterns = [
    /\[[^\]]*\]\(([^)]*amt\/redesign[^)]*)\)/gi,
    /<https?:\/\/[^>\s]*amt\/redesign[^>\s]*>/gi,
    /href\s*=\s*["'][^"']*amt\/redesign[^"']*["']/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) hits.push(match[0]);
  }
  return hits;
}

async function outsideLinks(repo, redesign) {
  const failures = [];
  const notes = [];
  const redesignRoot = path.resolve(redesign);
  const files = await walkFiles(
    repo,
    (file, name) => {
      const ext = path.extname(name).toLowerCase();
      return LINK_EXT.has(ext) || MD_EXT.has(ext);
    },
    { skipDirNames: new Set([".git", "node_modules"]) },
  );
  for (const file of files) {
    const resolved = path.resolve(file);
    if (resolved === redesignRoot || resolved.startsWith(`${redesignRoot}${path.sep}`)) continue;
    let text;
    try {
      const stat = fs.statSync(file);
      if (stat.size > 2_000_000) continue;
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const ext = path.extname(file).toLowerCase();
    const rel = relTo(repo, file);
    if (MD_EXT.has(ext)) {
      for (const hit of markdownLinksToRedesign(text)) {
        failures.push(`${rel} links to the redesign: ${hit.slice(0, 180)}`);
      }
      if (/\/amt\/redesign\b|amt\/redesign\//.test(text) && markdownLinksToRedesign(text).length === 0) {
        notes.push(`${rel} mentions amt/redesign in prose (not a link)`);
      }
      continue;
    }
    if (/\/amt\/redesign\b|amt\/redesign\//.test(text)) {
      failures.push(`${rel} references /amt/redesign`);
    }
  }
  return { failures, notes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(help("check-meta"));
    return;
  }
  const located = locate(args);
  const pages = await walkFiles(located.scanRedesign, (_file, name) => isHtmlFile(name));
  const failures = [];
  const skips = [];
  const notes = [];
  if (!pages.length) {
    skips.push("no HTML pages under amt/redesign yet (excluding _qa and _build)");
  }
  let pageProblems = 0;
  for (const file of pages) {
    const html = fs.readFileSync(file, "utf8");
    const rel = relTo(located.scanRedesign, file);
    const robots = robotsValues(html);
    if (!robots.length) {
      pageProblems += 1;
      failures.push(`${rel}: missing <meta name="robots" content="noindex,nofollow">`);
    } else if (!robots.every(robotsOk)) {
      pageProblems += 1;
      failures.push(`${rel}: robots content is ${JSON.stringify(robots)}, expected noindex,nofollow`);
    }
    if (!footerOk(html)) {
      pageProblems += 1;
      failures.push(`${rel}: footer is missing the concept-redesign note`);
    }
  }
  if (pages.length && pageProblems === 0) {
    notes.push(`${pages.length} HTML page(s) carry noindex,nofollow and the footer note`);
  }

  const outside = await outsideLinks(located.repo, located.scanRedesign);
  failures.push(...outside.failures);
  notes.push(...outside.notes);
  if (!outside.failures.length) notes.push("no page outside amt/redesign links to it");

  const status = failures.length ? "fail" : pages.length ? "pass" : "pass";
  report(located, { name: "check-meta", status, failures, skips, notes });
}

main().catch((error) => {
  console.error(`FAIL check-meta\n  ${error.message}`);
  process.exitCode = 1;
});
