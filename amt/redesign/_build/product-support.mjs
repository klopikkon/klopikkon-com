/**
 * Product-page and quote helpers.
 * Pages are rendered by the shell's renderPage in _build/lib/layout.mjs.
 * Ranking files under amt/ranking-on-price/ are read only.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export const BASE = "/amt/redesign";
export const ORIGIN = "https://klopikkon.com";
export const PUBLISHED_QUOTE_EMAIL = "sales@amtechpl.com";

const FAMILY_LABELS = {
  lipids: "Lipids",
  peg: "PEG reagents and linkers",
  fluorophores: "Fluorophores and dyes",
  organoborons: "Organoborons",
  other: "Other",
};

export function familyLabel(family) {
  return FAMILY_LABELS[family] || String(family || "Other");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sitePath(rel) {
  const clean = String(rel || "").replace(/^\/+/, "");
  return clean ? `${BASE}/${clean}` : `${BASE}/`;
}

export function absoluteUrl(rel) {
  return `${ORIGIN}${sitePath(rel)}`;
}

function decodeFragment(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

export async function loadProducts(outDir) {
  const dataPath = path.join(outDir, "data", "products.json");
  try {
    const parsed = JSON.parse(await readFile(dataPath, "utf8"));
    if (!Array.isArray(parsed)) {
      throw new Error("data/products.json must be a JSON array");
    }
    parsed.sourceLabel = "data/products.json";
    return parsed;
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const fixturePath = path.join(outDir, "_build", "fixtures", "products.json");
  const parsed = JSON.parse(await readFile(fixturePath, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("fixture products.json must be an array");
  parsed.sourceLabel = "_build/fixtures/products.json";
  return parsed;
}

export async function loadSite(outDir) {
  const dataPath = path.join(outDir, "data", "site.json");
  try {
    return { ...(JSON.parse(await readFile(dataPath, "utf8"))), sourceLabel: "data/site.json" };
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const fixturePath = path.join(outDir, "_build", "fixtures", "site.json");
  try {
    return { ...(JSON.parse(await readFile(fixturePath, "utf8"))), sourceLabel: "_build/fixtures/site.json" };
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  return {
    name: "Advanced Molecular Technologies",
    email: PUBLISHED_QUOTE_EMAIL,
    sourceLabel: "published contact fallback",
    source: "https://www.amtechpl.com/contact/",
  };
}

export function quoteEmail(site) {
  const candidates = [
    site?.contact?.emailSales,
    site?.quoteEmail,
    site?.email,
    site?.contact?.email,
    site?.contact?.sales,
    site?.contacts?.sales,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.includes("@")) return candidate.trim();
  }
  return PUBLISHED_QUOTE_EMAIL;
}

function normaliseSku(value) {
  const match = String(value || "")
    .toUpperCase()
    .match(/\bAMT[A-Z]*\d+(?:-[A-Z0-9]+)+\b/);
  return match ? match[0] : "";
}

export function casNumbers(value) {
  return String(value || "").match(/\b\d{2,7}-\d{2}-\d\b/g) || [];
}

export function normaliseName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toneFromClass(className) {
  if (/row-lose/.test(className)) return "lose";
  if (/row-win/.test(className)) return "win";
  if (/row-split/.test(className)) return "split";
  return null;
}

function uniqueRow(rows) {
  if (!rows?.length) return null;
  const slugs = new Set(rows.map((row) => row.slug));
  return slugs.size === 1 ? rows[0] : null;
}

/**
 * Parse ranking index fragments. Each <tr class="row-win|row-lose|row-split">
 * is one catalogue row: product name, SKU span ("SKU · CAS · purity"), a
 * rank pill, and a breakdown link. Not-found tables omit the pill; the row
 * class is still the colour and the middle cell is the note.
 */
export function parseRankingHtml(html, sourceFile) {
  const rows = [];
  const re = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[1];
    const body = match[2];
    const className = (attrs.match(/class="([^"]*)"/) || [])[1] || "";
    const tone = toneFromClass(className);
    if (!tone) continue;
    const tds = [...body.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (!tds.length) continue;
    const name = decodeFragment((body.match(/<span class="product-name">([\s\S]*?)<\/span>/i) || [])[1] || "");
    if (!name || /^amt$/i.test(name)) continue;
    const skuBlob = decodeFragment((body.match(/<span class="sku">([\s\S]*?)<\/span>/i) || [])[1] || tds[0]);
    const sku = normaliseSku(skuBlob);
    const cas = casNumbers(skuBlob);
    const links = [...body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const href = links.find((h) => /\/ranking-on-price\/[^/"?#]+\/?/.test(h) && !/\/ranking-on-price\/?$/.test(h));
    if (!href) continue;
    const slug = href.match(/\/ranking-on-price\/([^/"?#]+)/)[1];
    const pillMatch = body.match(/<span class="rank-pill[^"]*">([\s\S]*?)<\/span>/i);
    const pillText = pillMatch ? decodeFragment(pillMatch[1]) : "";
    const pillTd = tds.find((td) => /rank-pill/.test(td));
    let note = "";
    if (pillTd) {
      note = decodeFragment(pillTd.replace(/<span class="rank-pill[^"]*">[\s\S]*?<\/span>/i, " "));
    } else {
      const noteTd = tds.find((td) => !/product-name/.test(td) && !/href=/.test(td));
      note = noteTd ? decodeFragment(noteTd) : "";
    }
    rows.push({
      sku,
      cas,
      name,
      tone,
      pillText,
      note,
      slug,
      href: `/amt/ranking-on-price/${slug}/`,
      sourceFile,
    });
  }
  return rows;
}

export function buildRankingIndex(rows) {
  const bySku = new Map();
  const byCas = new Map();
  const byName = new Map();
  const add = (map, key, row) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  };
  for (const row of rows) {
    add(bySku, row.sku, row);
    for (const cas of row.cas) add(byCas, cas, row);
    add(byName, normaliseName(row.name), row);
  }
  return { rows, bySku, byCas, byName };
}

export async function loadRanking(rankingDir) {
  const { readdir } = await import("node:fs/promises");
  const fragmentsDir = path.join(rankingDir, "fragments");
  let files;
  try {
    files = (await readdir(fragmentsDir)).filter((name) => name.endsWith(".html")).sort();
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`Ranking fragments not found at ${fragmentsDir} (read-only input)`);
    }
    throw err;
  }
  const rows = [];
  for (const file of files) {
    const html = await readFile(path.join(fragmentsDir, file), "utf8");
    rows.push(...parseRankingHtml(html, file));
  }
  if (rows.length < 100) {
    throw new Error(`Ranking parser found only ${rows.length} rows; the fragment format may have changed`);
  }
  return buildRankingIndex(rows);
}

/**
 * Match one catalogue product to a single ranking breakdown.
 * Order: exact SKU, then CAS, then product name or synonym.
 * A key that points at more than one breakdown slug does not match.
 * A name hit is refused when both sides publish a CAS and they differ.
 * No match and ambiguous matches render nothing.
 */
export function matchProduct(product, index) {
  const sku = normaliseSku(product.sku);
  if (sku && index.bySku.has(sku)) {
    const hits = index.bySku.get(sku);
    const row = uniqueRow(hits);
    if (!row) return { row: null, via: "sku-ambiguous", candidates: hits.map((hit) => hit.slug) };
    return { row, via: "sku" };
  }

  const cases = casNumbers(product.cas);
  if (cases.length) {
    const hits = [];
    for (const cas of cases) {
      const list = index.byCas.get(cas);
      if (list) hits.push(...list);
    }
    if (hits.length) {
      const row = uniqueRow(hits);
      if (!row) return { row: null, via: "cas-ambiguous", candidates: [...new Set(hits.map((hit) => hit.slug))] };
      return { row, via: "cas" };
    }
  }

  const names = [product.name, ...(Array.isArray(product.synonyms) ? product.synonyms : [])];
  for (const name of names) {
    const key = normaliseName(name);
    if (!key || !index.byName.has(key)) continue;
    const hits = index.byName.get(key);
    const row = uniqueRow(hits);
    if (!row) return { row: null, via: "name-ambiguous", candidates: hits.map((hit) => hit.slug) };
    if (cases.length && row.cas.length && !row.cas.some((cas) => cases.includes(cas))) {
      return { row: null, via: "name-cas-conflict", candidates: [row.slug] };
    }
    return { row, via: "name" };
  }

  return { row: null, via: "none" };
}

const TONE_COPY = {
  win: {
    label: "Cheapest published list",
    line: "AMT is the cheapest published list.",
  },
  lose: {
    label: "A competitor is cheaper",
    line: "A competitor publishes a lower list.",
  },
  split: {
    label: "Split or no peer",
    line: "Pack-size split, analogue, or no peer.",
  },
};

export function pricePositionCopy(row) {
  const tone = TONE_COPY[row.tone] ? row.tone : "split";
  const copy = TONE_COPY[tone];
  const detailParts = [];
  if (row.pillText && !/^(amt #1|split|lose|win|amt quote)$/i.test(row.pillText)) detailParts.push(row.pillText);
  if (row.note) detailParts.push(row.note);
  const detail = detailParts.join(" ").replace(/\s+/g, " ").trim();
  const line = detail ? `${copy.line} ${detail}` : copy.line;
  return { tone, label: copy.label, line };
}

export function summariseMatches(products, index) {
  const counts = { sku: 0, cas: 0, name: 0, none: 0, ambiguous: 0 };
  const matched = [];
  const unmatched = [];
  const ambiguous = [];
  const bySlug = new Map();
  for (const product of products) {
    const result = matchProduct(product, index);
    if (result.row) {
      const via = result.via;
      counts[via] = (counts[via] || 0) + 1;
      matched.push({ id: product.id, sku: product.sku, via, slug: result.row.slug, tone: result.row.tone });
      if (!bySlug.has(result.row.slug)) bySlug.set(result.row.slug, []);
      bySlug.get(result.row.slug).push(product.id);
    } else if (String(result.via).includes("ambiguous") || result.via === "name-cas-conflict") {
      counts.ambiguous += 1;
      ambiguous.push({ id: product.id, sku: product.sku, via: result.via, candidates: result.candidates || [] });
    } else {
      counts.none += 1;
      unmatched.push({ id: product.id, sku: product.sku, name: product.name });
    }
  }
  const shared = [...bySlug.entries()].filter(([, ids]) => ids.length > 1);
  const total = products.length;
  const matchedCount = matched.length;
  return {
    total,
    matchedCount,
    rate: total ? matchedCount / total : 0,
    counts,
    matched,
    unmatched,
    ambiguous,
    shared,
    rankingRows: index.rows.length,
  };
}

export function renderPriceMatchMarkdown(summary, sourceLabel) {
  const pct = summary.total ? `${(summary.rate * 100).toFixed(1)}%` : "n/a";
  const lines = [
    "# Price position matching",
    "",
    "Read-only input: `amt/ranking-on-price/fragments/*.html`. This build does not modify those files.",
    "",
    "## How a row is read",
    "",
    "Each ranking fragment row with `row-win`, `row-lose`, or `row-split` is one breakdown.",
    "The product cell has `.product-name` and a `.sku` span, usually `SKU · CAS … · purity`.",
    "The colour is the row class. The pill text and any words after it are the public note.",
    "Not-found rows often have no pill; the middle cell is the note and the row class is still the colour.",
    "The breakdown link (`/amt/ranking-on-price/<slug>/`) is what the product page links to.",
    "",
    "## Match order",
    "",
    "1. Exact catalogue SKU (letters, digits, and the hyphenated suffix; case-insensitive). One SKU may appear on several fragment rows. They match only when every one of those rows points at the same breakdown slug.",
    "2. CAS number. Every `NNNNNN-NN-N` token on the product and on the ranking SKU line is collected. The product matches when those numbers land on exactly one slug. A product with no CAS skips this step.",
    "3. Normalised product name, then each synonym (lower case, punctuation collapsed). Used only if SKU and CAS did not hit. If the name is shared by more than one slug, it does not match. If both sides publish a CAS and none of the numbers overlap, the name does not match.",
    "",
    "Anything else, including an ambiguous key, shows no badge.",
    "",
    "Same-SKU catalogue rows share that SKU's badge. AMTGC125-AT15 is published twice (standard and High Purity 99%); both receive the one ranking row for that SKU.",
    "",
    "## Badge copy",
    "",
    "- Green `row-win`: “AMT is the cheapest published list.”",
    "- Red `row-lose`: “A competitor publishes a lower list.”",
    "- Amber `row-split`: “Pack-size split, analogue, or no peer.”",
    "",
    "The ranking pill or note is appended when it adds a fact (for example a competitor pack). The page does not recompute prices and does not invent a comparison the index does not state.",
    "",
    "## This build",
    "",
    `- Catalogue source: \`${sourceLabel}\``,
    `- Ranking rows parsed: ${summary.rankingRows}`,
    `- Products: ${summary.total}`,
    `- Matched: ${summary.matchedCount} (${pct})`,
    `- By SKU: ${summary.counts.sku || 0}`,
    `- By CAS: ${summary.counts.cas || 0}`,
    `- By name: ${summary.counts.name || 0}`,
    `- Unmatched: ${summary.counts.none || 0}`,
    `- Ambiguous (no badge): ${summary.counts.ambiguous || 0}`,
    "",
  ];
  if (summary.unmatched.length) {
    lines.push("### Unmatched", "");
    for (const item of summary.unmatched) {
      lines.push(`- ${item.id} · ${item.sku || "no SKU"} · ${item.name}`);
    }
    lines.push("");
  }
  if (summary.ambiguous.length) {
    lines.push("### Ambiguous", "");
    for (const item of summary.ambiguous) {
      lines.push(`- ${item.id} · ${item.sku} · ${item.via} · ${(item.candidates || []).join(", ")}`);
    }
    lines.push("");
  }
  if (summary.shared.length) {
    lines.push("### One breakdown, more than one catalogue row", "");
    for (const [slug, ids] of summary.shared) {
      lines.push(`- /amt/ranking-on-price/${slug}/ · ${ids.join(", ")}`);
    }
    lines.push("");
  }
  if (String(sourceLabel).includes("fixtures")) {
    lines.push(
      "### Fixture until data/products.json lands",
      "",
      "Pages are built from `_build/fixtures/products.json` when `data/products.json` is absent. That fixture copies the homepage cards. CAS, formula, molecular weight, purity, structure image, and pack currency are unpublished on those rows, so the product page leaves them blank and JSON-LD omits offers.",
      "",
      "A numeric price with no published currency is shown as the homepage price text. It is not given a currency.",
      "",
      "Homepage cards and catalogue PDFs disagree for some SKUs (ALC-0315, SM-102, Lipid 5, AMTGC125-AT15, AMTGC187-AC16). This fixture follows the homepage card and does not blend a PDF price onto the same row.",
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

export function publishedText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^(n\/a|na|none|not published|unknown|no cas#?)$/i.test(text)) return null;
  return text;
}

export function packLabel(pack) {
  const text = publishedText(pack?.priceText);
  if (text && text.toLowerCase() !== "quote") return text;
  if (pack?.price == null || (text && text.toLowerCase() === "quote")) return "Quote";
  if (typeof pack.price === "number") {
    return pack.currency ? `${pack.currency} ${pack.price}` : String(pack.price);
  }
  return "Quote";
}

export function isQuotedPack(pack) {
  return packLabel(pack) === "Quote";
}

const MASS_IN_MG = {
  mg: 1,
  g: 1000,
  kg: 1000000,
  ug: 0.001,
  µg: 0.001,
  mcg: 0.001,
};

/** Pack size as milligrams, only when the whole label is a mass. */
export function packMassMg(size) {
  const text = String(size || "")
    .trim()
    .toLowerCase()
    .replace(/μ/g, "µ");
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(kg|mg|g|µg|ug|mcg)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const factor = MASS_IN_MG[match[2]];
  if (!Number.isFinite(amount) || amount <= 0 || factor == null) return null;
  return amount * factor;
}

/** Numeric published price. Quote labels and missing prices stay null. */
export function publishedAmount(pack) {
  if (!pack || isQuotedPack(pack)) return null;
  if (typeof pack.price === "number" && Number.isFinite(pack.price) && pack.price > 0) return pack.price;
  const text = publishedText(pack.priceText);
  if (!text) return null;
  const match = text.replace(/,/g, "").match(/^(?:USD|US\$|A\$|AU\$|\$|€|£)\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function pricePerMg(pack) {
  const amount = publishedAmount(pack);
  const mg = packMassMg(pack?.size);
  if (amount == null || mg == null) return null;
  return amount / mg;
}

function formatPerMgNumber(value) {
  const rounded = Math.round(value * 10000) / 10000;
  const [whole, fracRaw] = rounded.toFixed(4).split(".");
  let frac = fracRaw.replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0");
  return `${whole}.${frac}`;
}

/** "$0.62/mg" from a published price and a mass pack size. Otherwise null. */
export function formatPerMg(pack) {
  const per = pricePerMg(pack);
  if (per == null) return null;
  const text = publishedText(pack?.priceText) || "";
  const symbol = (text.match(/^[^\d\s-]+/) || [""])[0];
  return `${symbol}${formatPerMgNumber(per)}/mg`;
}
