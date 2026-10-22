/**
 * Catalogue search for the AMT concept redesign.
 *
 * Chemist-oriented matching over a prepared index:
 * names, synonyms, SKU, exact and partial CAS (hyphens optional),
 * formula, typo tolerance, and PEG length versus nominal mass
 * (PEG3 is three ethylene-oxide units; PEG2000 / mPEG 2k is a mass).
 *
 * The same module runs in the browser and under Node tests.
 * `amt:add-to-quote` is dispatched on `document` with `{id, sku, pack}`.
 */

const FAMILY_LABELS = {
  lipids: "Lipids",
  peg: "PEG reagents and linkers",
  fluorophores: "Fluorophores and dyes",
  organoborons: "Organoborons",
  other: "Other",
};

const FAMILY_ORDER = ["lipids", "peg", "fluorophores", "organoborons", "other"];

const FAMILY_CODE = {
  l: "lipids",
  p: "peg",
  f: "fluorophores",
  b: "organoborons",
  o: "other",
};

const FAMILY_TO_CODE = {
  lipids: "l",
  peg: "p",
  fluorophores: "f",
  organoborons: "b",
  other: "o",
};

const ANCHORS = {
  dspe: ["dspe", "distearoylphosphatidylethanolamine", "distearoyl phosphoethanolamine"],
  dmg: ["dmg", "dimyristoyl"],
  dspc: ["dspc", "distearoyl phosphocholine"],
  dopc: ["dopc"],
  dppc: ["dppc"],
  dotap: ["dotap"],
  dodap: ["dodap"],
};

const PAGE_SIZE = 24;

/** Display order for the name-derived type facet. Empty classes are omitted. */
const TYPE_ORDER = [
  "boronic acid",
  "pinacol ester",
  "MIDA ester",
  "trifluoroborate",
  "BODIPY",
  "Cy3",
  "Cy5",
  "FITC",
  "mPEG",
  "heterobifunctional",
  "multi-arm",
  "NHS",
  "maleimide",
  "azide",
  "DBCO",
  "amine",
  "acid",
];

function familyLabel(family) {
  return FAMILY_LABELS[family] || family || "Other";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function escReg(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compact(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normSize(size) {
  const match = String(size ?? "").match(/(\d+(?:\.\d+)?)\s*(mg|g|kg)/i);
  if (!match) return String(size ?? "");
  const n = Number(match[1]);
  const num = Number.isInteger(n) ? String(n) : String(n);
  return `${num} ${match[2].toLowerCase()}`;
}

function sizeMg(size) {
  const match = String(size ?? "").match(/(\d+(?:\.\d+)?)\s*(mg|g|kg)/i);
  if (!match) return Number.POSITIVE_INFINITY;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "kg") return n * 1e6;
  if (unit === "g") return n * 1000;
  return n;
}

function publishedPriceText(price) {
  if (typeof price !== "number" || !Number.isFinite(price)) return "quote";
  const formatted = Math.abs(price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${price < 0 ? "-" : ""}$${formatted}`;
}

function moneyLabel(pack) {
  if (!pack || pack.price == null || pack.priceText === "quote") return "Quote";
  return pack.priceText || publishedPriceText(pack.price);
}

/** Coarse grouping read off the published name when `subfamily` is null. */
function deriveSub(family, text) {
  const value = String(text || "").toLowerCase();
  if (family === "lipids") {
    if (/peg/.test(value)) return "pegylated lipid";
    if (/phytan/.test(value)) return "phytanyl lipid";
    if (/phospho/.test(value)) return "phospholipid";
    return "lipid";
  }
  if (family === "peg") {
    if (/azid/.test(value) && /amine|amino/.test(value)) return "azide-amine";
    if (/azid/.test(value)) return "azide";
    if (/acid/.test(value)) return "acid";
    if (/amine|amino/.test(value)) return "amine";
    if (/sulfon/.test(value)) return "sulfonate";
    if (/alkyne/.test(value)) return "alkyne";
    if (/bromo|chloro|iodo|fluor/.test(value)) return "halide";
    if (/alcohol|hydroxy/.test(value)) return "alcohol";
    if (/peg\s*\(?\s*\d{3,}/.test(value)) return "polymeric";
    return "linker";
  }
  if (family === "fluorophores") {
    if (/bodipy/.test(value)) return "BODIPY";
    if (/fluorescein/.test(value)) return "fluorescein";
    if (/coumarin/.test(value)) return "coumarin";
    if (/rhodamine/.test(value)) return "rhodamine";
    return "dye";
  }
  if (family === "organoborons") {
    if (/\bmida\b/.test(value)) return "MIDA boronate";
    if (/\bbdan\b/.test(value)) return "BDAN";
    if (/trifluoroborate/.test(value)) return "trifluoroborate";
    if (/neopentyl/.test(value)) return "neopentyl glycol ester";
    if (/pinacol|bpin|dioxaborol/.test(value)) return "pinacol ester";
    if (/boronic acid/.test(value)) return "boronic acid";
    return "organoboron";
  }
  return "";
}

function looksLikeFormula(value) {
  if (!/^([A-Z][a-z]?\d*)+$/.test(value) || !/[CH]/.test(value) || !/\d/.test(value)) return false;
  if (value.length < 2 || value.length > 48) return false;
  // Catalogue codes such as ALC0315 are all capitals plus a trailing number.
  if (/^[A-Z]{2,}\d+$/.test(value)) return false;
  if (!/H/.test(value) && value.length > 6) return false;
  return true;
}

function casParts(value) {
  const raw = String(value ?? "");
  if (!raw || /no\s*cas/i.test(raw)) return [];
  return raw.match(/\d{2,7}-\d{2}-\d/g) || [];
}

function damerau(a, b, limit) {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > limit) return limit + 1;
  const prev2 = new Uint16Array(lb + 1);
  const prev = new Uint16Array(lb + 1);
  const cur = new Uint16Array(lb + 1);
  for (let j = 0; j <= lb; j += 1) prev[j] = j;
  for (let i = 1; i <= la; i += 1) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= lb; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let value = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
        value = Math.min(value, prev2[j - 2] + 1);
      }
      cur[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
    prev2.set(prev);
    prev.set(cur);
  }
  return prev[lb];
}

/**
 * Read a PEG description out of a string.
 * PEG3 / m-PEG3 → oligomer length. PEG2000 / PEG(400) / mPEG 2k → nominal mass.
 * The matched text is removed from `rest` so it is not searched again as words.
 */
function extractPeg(text) {
  let rest = String(text ?? "");
  let methoxy = /\bm[\s-]*peg\b/i.test(rest) || /\bmpeg/i.test(rest);
  let n = null;
  let mw = null;
  const take = (re) => {
    const match = rest.match(re);
    if (!match) return null;
    rest = `${rest.slice(0, match.index)} ${rest.slice(match.index + match[0].length)}`;
    return match;
  };
  let match = take(/\bpeg\s*\(\s*(\d{2,5})\s*\)/i);
  if (match) mw = Number(match[1]);
  if (mw == null) {
    match = take(/\b(m[\s-]*)?peg[\s-]*(\d+(?:\.\d+)?)\s*k\b/i);
    if (match) {
      mw = Math.round(Number(match[2]) * 1000);
      if (match[1]) methoxy = true;
    }
  }
  if (mw == null) {
    match = take(/\b(m[\s-]*)?peg[\s-]*(\d{3,5})\b/i);
    if (match) {
      mw = Number(match[2]);
      if (match[1]) methoxy = true;
    }
  }
  if (mw == null) {
    match = take(/\b(m[\s-]*)?peg[\s-]*(\d{1,2})\b/i);
    if (match) {
      n = Number(match[2]);
      if (match[1]) methoxy = true;
    }
  }
  if (mw == null && n == null) {
    match = take(/\bmpeg(\d{1,5})\b/i);
    if (match) {
      methoxy = true;
      const num = Number(match[1]);
      if (num >= 100) mw = num;
      else n = num;
    }
  }
  if (n == null && mw == null && !methoxy) return null;
  rest = rest.replace(/\bm[\s-]*peg\b/gi, " ").replace(/\bmpeg\b/gi, " ").replace(/\bpegs?\b/gi, " ");
  return { n, mw, methoxy, rest };
}

function indexTokens(text) {
  const out = new Set();
  const lower = String(text ?? "").toLowerCase();
  for (const chunk of lower.split(/[\s,/()+[\]:]+/)) {
    const piece = chunk.replace(/^[.\-]+|[.\-]+$/g, "");
    if (piece.length < 2) continue;
    out.add(piece);
    const flat = piece.replace(/[^a-z0-9]/g, "");
    if (flat.length >= 2) out.add(flat);
    for (const part of piece.split(/[^a-z0-9+]+/)) {
      if (part.length >= 2) out.add(part);
    }
  }
  return [...out];
}

function queryTokens(text) {
  const out = [];
  for (const chunk of String(text ?? "").toLowerCase().split(/[\s,/()+[\]:.;]+/)) {
    const piece = chunk.replace(/^[^\w+]+|[^\w+]+$/g, "");
    if (piece.length < 2) continue;
    if (piece === "peg" || piece === "mpeg" || piece === "k") continue;
    out.push(piece);
    const flat = piece.replace(/[^a-z0-9]/g, "");
    if (flat.length >= 2 && flat !== piece) out.push(flat);
  }
  return [...new Set(out)];
}

function isCompact(product) {
  return Boolean(product && typeof product.s === "string" && product.sku == null);
}

/** Tokens from `classDerived`. Null and unmatched products contribute none. */
function classTokens(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }
  const tokens = [];
  if (value.boronClass) tokens.push(value.boronClass);
  if (value.dyeCore) tokens.push(value.dyeCore);
  if (value.architecture) tokens.push(value.architecture);
  if (Array.isArray(value.reactiveGroups)) tokens.push(...value.reactiveGroups.filter(Boolean));
  return tokens;
}

/**
 * PubChem CID for the card image. Omitted when AMT already published a structure.
 * Compact rows store the CID in `pi` only in that case.
 */
function pubchemCid(product) {
  if (!product || product.structureImage) return null;
  const direct = product.externalSource?.cid;
  if (Number.isInteger(direct) && direct > 0) return direct;
  const path = String(product.structureImageExternal || "");
  const match = path.match(/(?:^|\/)(\d+)\.svg$/);
  return match ? Number(match[1]) : null;
}

function packFrom(pack) {
  if (Array.isArray(pack)) {
    const price = typeof pack[1] === "number" ? pack[1] : null;
    return {
      size: pack[0] || "",
      price,
      currency: "USD",
      priceText: pack[2] || publishedPriceText(price),
      sizeNorm: normSize(pack[0] || ""),
    };
  }
  const price = typeof pack.price === "number" ? pack.price : null;
  return {
    size: pack.size || "",
    price,
    currency: pack.currency || "USD",
    priceText: pack.priceText || publishedPriceText(price),
    sizeNorm: normSize(pack.size || ""),
  };
}

/**
 * Short-key record for `catalogue/index.json`.
 * Empty fields are omitted. `id` is omitted when it is the lowercase SKU.
 * Price text is omitted when it is the published USD formatting of the number.
 */
function toCompact(product) {
  const row = { s: product.sku };
  const id = product.id || "";
  if (id && id !== String(product.sku || "").toLowerCase()) row.i = id;
  if (product.name) row.n = product.name;
  row.f = FAMILY_TO_CODE[product.family] || product.family || "o";
  if (product.cas && !/no\s*cas/i.test(product.cas)) row.c = product.cas;
  if (product.purity) row.p = product.purity;
  if (product.formula) row.o = product.formula;
  if (typeof product.mw === "number") row.m = product.mw;
  if (product.formulaExternal) row.oe = product.formulaExternal;
  if (typeof product.mwExternal === "number") row.me = product.mwExternal;
  const types = classTokens(product.classDerived);
  if (types.length) row.cd = types;
  const cid = pubchemCid(product);
  if (cid) row.pi = cid;
  if (product.subfamily) row.u = product.subfamily;
  if (Array.isArray(product.synonyms) && product.synonyms.length) row.y = product.synonyms.filter(Boolean);
  if (Array.isArray(product.homepageLabels) && product.homepageLabels.length) row.h = product.homepageLabels.filter(Boolean);
  if (product.catalogueNote) row.t = product.catalogueNote;
  row.k = (product.packs || []).map((pack) => {
    const size = pack.size || "";
    const price = typeof pack.price === "number" ? pack.price : null;
    const text = pack.priceText || publishedPriceText(price);
    if (text !== publishedPriceText(price)) return [size, price, text];
    return [size, price];
  });
  return row;
}

function prepareRecord(product) {
  if (product && product._prepared) return product;
  const row = isCompact(product);
  const sku = row ? product.s : (product.sku || "");
  const id = (row ? product.i : product.id) || String(sku).toLowerCase();
  const name = (row ? product.n : product.name) || "";
  const fam = row
    ? (FAMILY_CODE[product.f] || product.f || "other")
    : (product.family || product.fam || "other");
  const syn = row
    ? (Array.isArray(product.y) ? product.y.filter(Boolean) : [])
    : (Array.isArray(product.synonyms) ? product.synonyms.filter(Boolean) : (product.syn || []));
  const labels = row
    ? (Array.isArray(product.h) ? product.h.filter(Boolean) : [])
    : (Array.isArray(product.homepageLabels) ? product.homepageLabels.filter(Boolean) : []);
  const note = row ? (product.t || "") : (product.catalogueNote || "");
  const casInput = row ? (product.c || "") : (product.cas || "");
  const casRaw = casParts(casInput);
  const formula = row ? (product.o || "") : (product.formula || "");
  const formulaExternal = row ? (product.oe || "") : (product.formulaExternal || "");
  const mwValue = row ? product.m : product.mw;
  const mwExternalValue = row ? product.me : product.mwExternal;
  const mw = typeof mwValue === "number" ? mwValue : null;
  const mwExternal = typeof mwExternalValue === "number" ? mwExternalValue : null;
  const pur = row ? (product.p || "") : (product.purity || product.pur || "");
  const subGiven = row ? (product.u || "") : (product.subfamily || product.sub || "");
  const types = row
    ? (Array.isArray(product.cd) ? product.cd.filter(Boolean) : [])
    : classTokens(product.classDerived);
  const structureCid = row
    ? (Number.isInteger(product.pi) && product.pi > 0 ? product.pi : null)
    : pubchemCid(product);
  const packs = (row ? (product.k || []) : (product.packs || [])).map(packFrom);
  const priced = packs.map((pack) => pack.price).filter((price) => typeof price === "number");
  const peg = extractPeg([name, ...syn, ...labels].join(" ")) || { n: null, mw: null, methoxy: false };
  const sub = subGiven || deriveSub(fam, [name, ...syn, ...labels, note].join(" "));
  const searchableCas = casRaw.join(" ");
  return {
    _prepared: true,
    id,
    sku,
    name,
    syn,
    labels,
    note,
    fam,
    sub,
    types,
    structureCid,
    cas: casRaw.join(" & "),
    formula,
    formulaExternal,
    mw,
    mwExternal,
    pur,
    packs,
    pegN: peg.n,
    pegMw: peg.mw,
    pegMe: Boolean(peg.methoxy),
    minPrice: priced.length ? Math.min(...priced) : null,
    quoteOnly: priced.length === 0,
    casRaw,
    casDigits: casRaw.map((cas) => cas.replace(/\D/g, "")),
    skuKey: compact(sku),
    nameKey: compact(name),
    formulaKey: String(formula || "").replace(/\s+/g, ""),
    formulaExternalKey: String(formulaExternal || "").replace(/\s+/g, ""),
    tokens: indexTokens([name, ...syn, ...labels, note, sku, searchableCas, formula, formulaExternal].filter(Boolean).join(" ")),
    nameTokens: indexTokens(name),
  };
}

function hydrate(record) {
  if (record.tokenSet) return record;
  const prepared = record._prepared ? record : prepareRecord(record);
  prepared.tokenSet = new Set(prepared.tokens);
  prepared.nameTokenSet = new Set(prepared.nameTokens);
  prepared.blob = [prepared.name, ...prepared.syn, prepared.sku, prepared.cas, prepared.formula].join(" ").toLowerCase();
  return prepared;
}

function parseQuery(raw) {
  const original = String(raw ?? "").trim();
  const parsed = { raw: original, cas: null, formula: null, peg: null, anchors: [], tokens: [] };
  if (!original) return parsed;

  const squashed = original.replace(/\s+/g, "");
  if (/^[\d-]+$/.test(squashed)) {
    const digits = squashed.replace(/\D/g, "");
    if (digits.length >= 3) {
      parsed.cas = { digits, formatted: squashed.includes("-") ? squashed : null };
      return parsed;
    }
  }

  let work = original;
  const casMatch = work.match(/\d{2,7}-\d{2}-\d/);
  if (casMatch) {
    parsed.cas = { digits: casMatch[0].replace(/\D/g, ""), formatted: casMatch[0] };
    work = `${work.slice(0, casMatch.index)} ${work.slice(casMatch.index + casMatch[0].length)}`;
  }

  const peg = extractPeg(work);
  if (peg) {
    parsed.peg = { n: peg.n, mw: peg.mw, methoxy: peg.methoxy };
    work = peg.rest;
  }

  const anchors = [];
  for (const key of Object.keys(ANCHORS)) {
    const re = new RegExp(`\\b${key}\\b`, "i");
    if (re.test(work)) {
      anchors.push(key);
      work = work.replace(re, " ");
    }
  }
  parsed.anchors = anchors;

  const formulaSource = work.replace(/\s+/g, "");
  if (looksLikeFormula(formulaSource)) {
    parsed.formula = formulaSource;
    work = "";
  } else {
    const lone = work.trim();
    if (looksLikeFormula(lone)) {
      parsed.formula = lone;
      work = "";
    }
  }

  parsed.tokens = queryTokens(work);
  return parsed;
}

function casScore(record, cas) {
  if (!cas) return null;
  if (!record.casDigits.length) return 0;
  for (const digits of record.casDigits) {
    if (digits === cas.digits) return 1000;
  }
  if (cas.digits.length >= 5) {
    for (const digits of record.casDigits) {
      if (digits.startsWith(cas.digits)) return 720;
    }
  }
  if (cas.digits.length >= 6) {
    for (const digits of record.casDigits) {
      if (digits.includes(cas.digits)) return 460;
    }
    if (cas.formatted) {
      for (const raw of record.casRaw) {
        if (raw.includes(cas.formatted)) return 460;
      }
    }
  }
  return 0;
}

function pegOk(record, peg) {
  if (!peg) return true;
  if (peg.mw != null && record.pegMw !== peg.mw) return false;
  if (peg.n != null && record.pegN !== peg.n) return false;
  if (peg.methoxy && !record.pegMe) return false;
  if (peg.mw == null && peg.n == null && peg.methoxy && !record.pegMe) return false;
  return peg.mw != null || peg.n != null || peg.methoxy;
}

function anchorOk(record, anchors) {
  if (!anchors.length) return true;
  for (const key of anchors) {
    const alts = ANCHORS[key] || [key];
    const matched = alts.some((alt) => alt.split(/\s+/).every((word) => record.blob.includes(word)));
    if (!matched) return false;
  }
  return true;
}

function formulaScore(record, formula) {
  if (!formula) return null;
  if (record.formulaKey && record.formulaKey === formula) return 780;
  if (record.formulaExternalKey && record.formulaExternalKey === formula) return 640;
  if (record.formulaKey && (record.formulaKey.includes(formula) || formula.includes(record.formulaKey))) return 240;
  if (record.formulaExternalKey && (record.formulaExternalKey.includes(formula) || formula.includes(record.formulaExternalKey))) return 180;
  return 0;
}

function weightValue(record) {
  if (typeof record.mw === "number") return record.mw;
  if (typeof record.mwExternal === "number") return record.mwExternal;
  return null;
}

function weightLabel(record) {
  if (typeof record.mw === "number") return `${record.mw} Da`;
  if (typeof record.mwExternal === "number") return `${record.mwExternal} Da · PubChem`;
  return "";
}

function tokenHit(record, token) {
  const flat = token.replace(/[^a-z0-9]/g, "");
  if (record.tokenSet.has(token) || (flat && record.tokenSet.has(flat))) {
    const inName = record.nameTokenSet.has(token) || (flat && record.nameTokenSet.has(flat));
    return { score: inName ? 84 : 58, needle: token };
  }
  if (flat.length >= 4) {
    for (const candidate of record.nameTokens) {
      if (candidate.startsWith(flat)) return { score: 40, needle: candidate };
    }
    for (const candidate of record.tokens) {
      if (candidate.startsWith(flat)) return { score: 28, needle: candidate };
    }
  }
  if (flat.length >= 5 && record.blob.includes(flat)) return { score: 24, needle: flat };
  if (flat.length >= 5 && !/\d/.test(flat)) {
    const limit = flat.length >= 9 ? 2 : 1;
    let best = null;
    for (const candidate of record.tokens) {
      if (candidate.length < 5 || /\d/.test(candidate)) continue;
      if (Math.abs(candidate.length - flat.length) > limit) continue;
      if (!best && candidate[0] !== flat[0] && Math.abs(candidate.charCodeAt(0) - flat.charCodeAt(0)) > 1) continue;
      const distance = damerau(flat, candidate, limit);
      if (distance <= limit && (!best || distance < best.distance)) {
        best = { distance, needle: candidate };
      }
    }
    if (best) return { score: best.distance === 1 ? 18 : 11, needle: best.needle };
    if (flat.length >= 6) {
      for (const candidate of record.tokens) {
        if (candidate.length <= flat.length || candidate.length > flat.length + 12 || /\d/.test(candidate)) continue;
        for (let i = 0; i <= candidate.length - flat.length; i += 1) {
          const slice = candidate.slice(i, i + flat.length);
          if (slice[0] !== flat[0]) continue;
          if (damerau(flat, slice, 1) <= 1) return { score: 14, needle: slice };
        }
      }
    }
  }
  return { score: 0, needle: "" };
}

function skuBonus(record, raw) {
  const key = compact(raw);
  if (key.length < 5) return 0;
  if (key === record.skuKey) return 960;
  if (record.skuKey.startsWith(key) && key.length >= 6) return 520;
  return 0;
}

function searchRecords(records, state) {
  const parsed = parseQuery(state.q || "");
  const queryKey = compact(state.q || "");
  const hits = [];
  for (const raw of records) {
    const record = hydrate(raw);
    if (!passesFilters(record, state)) continue;
    const empty = !parsed.raw;
    let score = 1;
    const needles = new Set();
    if (!empty) {
      const cas = casScore(record, parsed.cas);
      if (cas === 0) continue;
      if (!pegOk(record, parsed.peg)) continue;
      if (!anchorOk(record, parsed.anchors)) continue;
      const formula = formulaScore(record, parsed.formula);
      if (formula === 0) continue;
      let tokenScore = 0;
      let failed = false;
      for (const token of parsed.tokens) {
        const hit = tokenHit(record, token);
        if (!hit.score) {
          failed = true;
          break;
        }
        tokenScore += hit.score;
        if (hit.needle) needles.add(hit.needle);
        needles.add(token);
      }
      if (failed) continue;
      const hasConstraint = parsed.cas || parsed.peg || parsed.anchors.length || parsed.formula || parsed.tokens.length;
      if (!hasConstraint) continue;
      score = tokenScore;
      if (cas) score += cas;
      if (formula) score += formula;
      if (parsed.peg?.mw != null) score += 640;
      if (parsed.peg?.n != null) score += 540;
      if (parsed.anchors.length) score += 220 * parsed.anchors.length;
      score += skuBonus(record, parsed.raw);
      if (queryKey && record.nameKey === queryKey) score += 860;
      else if (queryKey.length >= 6 && Math.abs(queryKey.length - record.nameKey.length) <= (queryKey.length >= 12 ? 2 : 1) && damerau(queryKey, record.nameKey, queryKey.length >= 12 ? 2 : 1) <= (queryKey.length >= 12 ? 2 : 1)) score += 420;
      else if (queryKey.length >= 4 && record.nameKey.startsWith(queryKey)) score += 180;
      if (parsed.raw && record.blob.includes(parsed.raw.toLowerCase())) score += 70;
      if (parsed.cas?.formatted) needles.add(parsed.cas.formatted);
      if (parsed.peg?.mw) {
        needles.add(String(parsed.peg.mw));
        needles.add(`PEG${parsed.peg.mw}`);
      }
      if (parsed.peg?.n != null) needles.add(`PEG${parsed.peg.n}`);
    }
    hits.push({ record, score, needles: [...needles].filter((needle) => String(needle).length >= 2) });
  }

  const sort = state.sort || "relevance";
  hits.sort((a, b) => compareHits(a, b, sort, Boolean(parsed.raw)));
  return { hits, parsed };
}

function passesFilters(record, state) {
  if (state.family?.length && !state.family.includes(record.fam)) return false;
  if (state.sub?.length && !state.sub.includes(record.sub || "")) return false;
  if (state.type?.length && !state.type.some((token) => record.types?.includes(token))) return false;
  if (state.cas === "yes" && !record.casRaw.length) return false;
  if (state.cas === "no" && record.casRaw.length) return false;
  if (state.mwMin != null || state.mwMax != null) {
    const weight = weightValue(record);
    if (weight == null) return false;
    if (state.mwMin != null && weight < state.mwMin) return false;
    if (state.mwMax != null && weight > state.mwMax) return false;
  }
  if (state.purity?.length) {
    const label = record.pur || "Not stated";
    if (!state.purity.includes(label)) return false;
  }
  if (state.pack?.length) {
    const sizes = new Set(record.packs.map((pack) => pack.sizeNorm));
    if (!state.pack.some((size) => sizes.has(normSize(size)) || sizes.has(size))) return false;
  }
  if (state.priceMin != null || state.priceMax != null) {
    const matched = record.packs.some((pack) => {
      if (typeof pack.price !== "number") return false;
      if (state.priceMin != null && pack.price < state.priceMin) return false;
      if (state.priceMax != null && pack.price > state.priceMax) return false;
      return true;
    });
    if (!matched) return false;
  }
  if (state.quote && !record.quoteOnly) return false;
  return true;
}

function clearedQuery(state) {
  return { ...emptyState(), q: state.q || "", sort: "relevance" };
}

function runSearch(records, state) {
  const queried = searchRecords(records, clearedQuery(state));
  const pool = queried.hits.map((hit) => hit.record);
  const facets = facetCounts(pool, state);
  const hits = queried.hits.filter((hit) => passesFilters(hit.record, state));
  hits.sort((a, b) => compareHits(a, b, state.sort || "relevance", Boolean((state.q || "").trim())));
  return { hits, facets, parsed: queried.parsed };
}

function compareHits(a, b, sort, hasQuery) {
  if (sort === "name" || (sort === "relevance" && !hasQuery)) {
    return (a.record.name || a.record.sku).localeCompare(b.record.name || b.record.sku, "en", { numeric: true, sensitivity: "base" });
  }
  if (sort === "mw") {
    const aw = weightValue(a.record) ?? Number.POSITIVE_INFINITY;
    const bw = weightValue(b.record) ?? Number.POSITIVE_INFINITY;
    if (aw !== bw) return aw - bw;
  } else if (sort === "price") {
    const ap = a.record.minPrice ?? Number.POSITIVE_INFINITY;
    const bp = b.record.minPrice ?? Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
  } else if (b.score !== a.score) {
    return b.score - a.score;
  }
  return (a.record.name || a.record.sku).localeCompare(b.record.name || b.record.sku, "en", { numeric: true, sensitivity: "base" });
}

function facetCounts(records, state) {
  const families = new Map();
  const subs = new Map();
  const types = new Map();
  const purities = new Map();
  const packs = new Map();
  let casYes = 0;
  let casNo = 0;
  let quote = 0;
  const consider = (skip) => records.filter((record) => passesFilters(hydrate(record), { ...state, ...skip }));
  for (const record of consider({ family: [] })) {
    families.set(record.fam, (families.get(record.fam) || 0) + 1);
  }
  for (const record of consider({ sub: [] })) {
    const key = record.sub || "Unspecified";
    subs.set(key, (subs.get(key) || 0) + 1);
  }
  for (const record of consider({ type: [] })) {
    const seen = new Set();
    for (const token of record.types || []) {
      if (!token || seen.has(token)) continue;
      seen.add(token);
      types.set(token, (types.get(token) || 0) + 1);
    }
  }
  for (const record of consider({ purity: [] })) {
    const key = record.pur || "Not stated";
    purities.set(key, (purities.get(key) || 0) + 1);
  }
  for (const record of consider({ pack: [] })) {
    const seen = new Set();
    for (const pack of record.packs) {
      if (!pack.sizeNorm || seen.has(pack.sizeNorm)) continue;
      seen.add(pack.sizeNorm);
      packs.set(pack.sizeNorm, (packs.get(pack.sizeNorm) || 0) + 1);
    }
  }
  for (const record of consider({ cas: "any" })) {
    if (record.casRaw.length) casYes += 1;
    else casNo += 1;
  }
  for (const record of consider({ quote: false })) {
    if (record.quoteOnly) quote += 1;
  }
  const byCount = (map) => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const familyRows = [...families.entries()].sort((a, b) => {
    const ai = FAMILY_ORDER.indexOf(a[0]);
    const bi = FAMILY_ORDER.indexOf(b[0]);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  const typeRows = [...types.entries()].sort((a, b) => {
    const ai = TYPE_ORDER.indexOf(a[0]);
    const bi = TYPE_ORDER.indexOf(b[0]);
    const ao = ai < 0 ? 99 : ai;
    const bo = bi < 0 ? 99 : bi;
    if (ao !== bo) return ao - bo;
    return b[1] - a[1] || String(a[0]).localeCompare(String(b[0]));
  });
  return {
    family: familyRows,
    sub: byCount(subs),
    type: typeRows,
    purity: byCount(purities),
    pack: [...packs.entries()].sort((a, b) => sizeMg(a[0]) - sizeMg(b[0])),
    casYes,
    casNo,
    quote,
  };
}

function highlight(text, needles) {
  const source = String(text ?? "");
  const useful = [...new Set(needles || [])].filter((needle) => String(needle).length >= 3).sort((a, b) => b.length - a.length);
  if (!useful.length || !source) return esc(source);
  const re = new RegExp(useful.map(escReg).join("|"), "gi");
  let html = "";
  let last = 0;
  for (const match of source.matchAll(re)) {
    const index = match.index ?? 0;
    html += esc(source.slice(last, index));
    html += `<mark class="cat-mark">${esc(match[0])}</mark>`;
    last = index + match[0].length;
  }
  html += esc(source.slice(last));
  return html;
}

function emptyState() {
  return {
    q: "",
    family: [],
    sub: [],
    type: [],
    cas: "any",
    mwMin: null,
    mwMax: null,
    purity: [],
    pack: [],
    priceMin: null,
    priceMax: null,
    quote: false,
    sort: "relevance",
    page: 1,
  };
}

function numOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function listParam(params, key) {
  const values = typeof params.getAll === "function" ? params.getAll(key) : [];
  return values.flatMap((value) => String(value).split(",")).map((value) => value.trim()).filter(Boolean);
}

function stateFromParams(params) {
  const state = emptyState();
  state.q = params.get("q") || "";
  state.family = listParam(params, "family");
  state.sub = listParam(params, "sub");
  state.type = listParam(params, "type");
  const cas = params.get("cas");
  state.cas = cas === "yes" || cas === "no" ? cas : "any";
  const mw = params.get("mw");
  if (mw && mw.includes("-")) {
    const [min, max] = mw.split("-");
    state.mwMin = numOrNull(min);
    state.mwMax = numOrNull(max);
  } else {
    state.mwMin = numOrNull(params.get("mwMin"));
    state.mwMax = numOrNull(params.get("mwMax"));
  }
  state.purity = listParam(params, "purity");
  state.pack = listParam(params, "pack").map(normSize);
  const price = params.get("price");
  if (price && price.includes("-")) {
    const [min, max] = price.split("-");
    state.priceMin = numOrNull(min);
    state.priceMax = numOrNull(max);
  } else {
    state.priceMin = numOrNull(params.get("priceMin"));
    state.priceMax = numOrNull(params.get("priceMax"));
  }
  state.quote = params.get("quote") === "1" || params.get("quote") === "only";
  const sort = params.get("sort");
  state.sort = ["relevance", "name", "mw", "price"].includes(sort) ? sort : "relevance";
  const page = Number(params.get("page") || 1);
  state.page = Number.isFinite(page) && page > 1 ? Math.floor(page) : 1;
  return state;
}

function rangeParam(min, max) {
  if (min == null && max == null) return "";
  return `${min ?? ""}-${max ?? ""}`;
}

function stateToQuery(state) {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.family?.length) params.set("family", state.family.join(","));
  if (state.sub?.length) params.set("sub", state.sub.join(","));
  if (state.type?.length) params.set("type", state.type.join(","));
  if (state.cas === "yes" || state.cas === "no") params.set("cas", state.cas);
  const mw = rangeParam(state.mwMin, state.mwMax);
  if (mw && mw !== "-") params.set("mw", mw);
  if (state.purity?.length) params.set("purity", state.purity.join(","));
  if (state.pack?.length) params.set("pack", state.pack.join(","));
  const price = rangeParam(state.priceMin, state.priceMax);
  if (price && price !== "-") params.set("price", price);
  if (state.quote) params.set("quote", "1");
  if (state.sort && state.sort !== "relevance") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

function activeFilterCount(state) {
  return (state.family?.length ? 1 : 0)
    + (state.sub?.length ? 1 : 0)
    + (state.type?.length ? 1 : 0)
    + (state.cas !== "any" ? 1 : 0)
    + (state.mwMin != null || state.mwMax != null ? 1 : 0)
    + (state.purity?.length ? 1 : 0)
    + (state.pack?.length ? 1 : 0)
    + (state.priceMin != null || state.priceMax != null ? 1 : 0)
    + (state.quote ? 1 : 0);
}

function structureHtml(record, base) {
  if (!record.structureCid || !base) return "";
  const title = record.name || record.sku || "this product";
  const src = `${base}${record.structureCid}.svg`;
  return `<figure class="cat-structure"><img src="${esc(src)}" alt="PubChem structure of ${esc(title)}" width="72" height="56" loading="lazy" decoding="async"><figcaption>PubChem</figcaption></figure>`;
}

function renderCard(hit, href, structureBase) {
  const record = hit.record;
  const needles = hit.needles || [];
  const title = record.name || "Name not published";
  const typeBit = record.types?.length ? ` · ${record.types.join(", ")}` : "";
  const kicker = `${familyLabel(record.fam)}${typeBit}`;
  const cas = record.cas ? `CAS ${record.cas}` : "No CAS published";
  const syn = record.syn.slice(0, 2).join(" · ");
  const packItems = record.packs.map((pack) => {
    const size = pack.size || "Pack";
    return `<li><span>${esc(size)}</span> <span>${esc(moneyLabel(pack))}</span></li>`;
  }).join("");
  const options = record.packs.map((pack) => {
    const size = pack.size || "Pack";
    return `<option value="${esc(pack.size)}">${esc(size)} · ${esc(moneyLabel(pack))}</option>`;
  }).join("");
  const price = record.quoteOnly ? "Quote" : `From ${moneyLabel(record.packs.find((pack) => pack.price === record.minPrice) || record.packs[0])}`;
  const label = record.labels[0] ? `<p><span class="badge">${esc(record.labels[0])}</span></p>` : "";
  const note = record.note ? `<p class="hint">${esc(record.note)}</p>` : "";
  return `<li class="card product-card">
    <div>
      ${structureHtml(record, structureBase)}
      <p class="kicker">${highlight(kicker, needles)}</p>
      <h2><a class="cat-name" href="${esc(href)}">${highlight(title, needles)}</a></h2>
      <p class="sku">${highlight(record.sku, needles)}</p>
      <p class="cat-meta">
        <span>${highlight(cas, needles)}</span>
        ${record.pur ? `<span>${highlight(record.pur, needles)}</span>` : ""}
        ${record.formula ? `<span>${highlight(record.formula, needles)}</span>` : ""}
        ${record.formulaExternal && record.formulaExternal !== record.formula ? `<span>${highlight(record.formulaExternal, needles)} · PubChem</span>` : ""}
        ${weightLabel(record) ? `<span>${esc(weightLabel(record))}</span>` : ""}
      </p>
      ${label}
      ${note}
      ${syn ? `<p class="hint">${highlight(syn, needles)}</p>` : ""}
      ${packItems ? `<ul class="pack-list">${packItems}</ul>` : ""}
    </div>
    <div class="cat-buy" data-quote-root>
      <p class="cat-price">${esc(price)}</p>
      ${options ? `<label class="field"><span>Pack</span><select data-pack-select aria-label="Pack size for ${esc(title)}">${options}</select></label>` : ""}
      <button type="button" class="btn btn-primary" data-add-quote data-id="${esc(record.id)}" data-sku="${esc(record.sku)}" data-pack="${esc(record.packs[0]?.size || "")}">Add to quote</button>
    </div>
  </li>`;
}

function checkList(name, legend, rows, selected, labeler) {
  if (!rows.length) return "";
  const items = rows.map(([value, count]) => {
    const key = `${name}:${value}`;
    const checked = selected.includes(value) ? " checked" : "";
    return `<label class="cat-check">
      <input type="checkbox" data-facet="${esc(name)}" data-facet-key="${esc(key)}" value="${esc(value)}"${checked}>
      <span>${esc(labeler ? labeler(value) : value)}</span>
      <span class="cat-count">${count}</span>
    </label>`;
  }).join("");
  return `<fieldset class="cat-facet"><legend>${esc(legend)}</legend><div class="cat-facet-list">${items}</div></fieldset>`;
}

function renderFilters(facets, state, mwNote) {
  const cas = (value, label, count) => `<label class="cat-check"><input type="radio" name="cas" data-facet="cas" value="${value}"${state.cas === value ? " checked" : ""}><span>${label}</span><span class="cat-count">${count}</span></label>`;
  return `
    <div class="cat-filter-head">
      <h2 id="cat-filter-title">Filters</h2>
      <button type="button" class="cat-textish" data-clear-all>Clear all</button>
      <button type="button" class="cat-textish cat-filter-close" data-close-filters>Close</button>
    </div>
    ${checkList("family", "Family", facets.family, state.family, familyLabel)}
    ${checkList("type", "Type (from name)", facets.type || [], state.type || [])}
    <p class="cat-facet-note">Read from the printed product name. Not an AMT heading.</p>
    <fieldset class="cat-facet">
      <legend>CAS</legend>
      ${cas("any", "Any", facets.casYes + facets.casNo)}
      ${cas("yes", "Listed", facets.casYes)}
      ${cas("no", "Not listed", facets.casNo)}
    </fieldset>
    <fieldset class="cat-facet">
      <legend>Molecular weight</legend>
      ${mwNote ? `<p class="cat-facet-note">${esc(mwNote)}</p>` : ""}
      <div class="cat-range">
        <label>Min <input type="number" inputmode="decimal" min="0" data-range="mwMin" value="${state.mwMin ?? ""}" aria-label="Minimum molecular weight"></label>
        <label>Max <input type="number" inputmode="decimal" min="0" data-range="mwMax" value="${state.mwMax ?? ""}" aria-label="Maximum molecular weight"></label>
      </div>
    </fieldset>
    ${checkList("purity", "Purity", facets.purity, state.purity)}
    ${checkList("pack", "Pack size", facets.pack, state.pack)}
    <fieldset class="cat-facet">
      <legend>Price, USD</legend>
      <p class="cat-facet-note">Any listed pack whose price falls in the range.</p>
      <div class="cat-range">
        <label>Min <input type="number" inputmode="decimal" min="0" data-range="priceMin" value="${state.priceMin ?? ""}" aria-label="Minimum price"></label>
        <label>Max <input type="number" inputmode="decimal" min="0" data-range="priceMax" value="${state.priceMax ?? ""}" aria-label="Maximum price"></label>
      </div>
      <label class="cat-check">
        <input type="checkbox" data-facet="quote" data-facet-key="quote"${state.quote ? " checked" : ""}>
        <span>Quote only</span>
        <span class="cat-count">${facets.quote}</span>
      </label>
    </fieldset>`;
}

function renderChips(state) {
  const chips = [];
  const add = (label, patch) => chips.push(`<button type="button" class="cat-chip" data-chip="${esc(JSON.stringify(patch))}">${esc(label)} <span aria-hidden="true">×</span></button>`);
  if (state.q) add(`“${state.q}”`, { q: "" });
  for (const family of state.family) add(familyLabel(family), { family: state.family.filter((value) => value !== family) });
  for (const sub of state.sub) add(sub, { sub: state.sub.filter((value) => value !== sub) });
  for (const token of state.type || []) add(token, { type: state.type.filter((value) => value !== token) });
  if (state.cas === "yes") add("CAS listed", { cas: "any" });
  if (state.cas === "no") add("CAS not listed", { cas: "any" });
  if (state.mwMin != null || state.mwMax != null) add(`MW ${state.mwMin ?? "0"}–${state.mwMax ?? "∞"}`, { mwMin: null, mwMax: null });
  for (const purity of state.purity) add(purity, { purity: state.purity.filter((value) => value !== purity) });
  for (const pack of state.pack) add(pack, { pack: state.pack.filter((value) => value !== pack) });
  if (state.priceMin != null || state.priceMax != null) add(`$${state.priceMin ?? "0"}–${state.priceMax ?? "∞"}`, { priceMin: null, priceMax: null });
  if (state.quote) add("Quote only", { quote: false });
  return chips.join("");
}

function renderPager(page, pages) {
  if (pages <= 1) return "";
  const links = [];
  const windowStart = Math.max(1, page - 2);
  const windowEnd = Math.min(pages, page + 2);
  const push = (n, label = String(n)) => {
    const current = n === page ? ` aria-current="page"` : "";
    links.push(`<button type="button" class="cat-page" data-page="${n}"${current}>${label}</button>`);
  };
  push(Math.max(1, page - 1), "Previous");
  if (windowStart > 1) push(1);
  for (let n = windowStart; n <= windowEnd; n += 1) push(n);
  if (windowEnd < pages) push(pages);
  push(Math.min(pages, page + 1), "Next");
  return links.join("");
}

function boot(root) {
  const form = root.querySelector("#cat-form");
  const input = root.querySelector("#cat-q");
  const sort = root.querySelector("#cat-sort");
  const live = root.querySelector("#cat-live");
  const results = root.querySelector("#cat-results");
  const pager = root.querySelector("#cat-pager");
  const chips = root.querySelector("#cat-chips");
  const filters = root.querySelector("#cat-filters");
  const openButton = root.querySelector(".cat-filter-open");
  const hasMw = root.dataset.hasMw === "1";
  const productBase = root.dataset.productBase || "../products/";
  let records = [];
  let state = stateFromParams(new URLSearchParams(location.search));

  const mobile = () => window.matchMedia("(max-width: 959px)").matches;

  function writeControls() {
    if (input && input.value !== state.q) input.value = state.q;
    if (sort && sort.value !== state.sort) sort.value = state.sort;
    const count = activeFilterCount(state);
    if (openButton) {
      openButton.textContent = count ? `Filters (${count})` : "Filters";
    }
  }

  function persist(mode) {
    const url = `${location.pathname}${stateToQuery(state)}${location.hash}`;
    if (mode === "push") history.pushState(null, "", url);
    else history.replaceState(null, "", url);
  }

  function focusFilters(previous) {
    if (!previous) return;
    const next = filters.querySelector(`[data-facet-key="${CSS.escape(previous)}"]`);
    if (next) next.focus();
  }

  function render(mode) {
    writeControls();
    const searched = runSearch(records, state);
    const total = searched.hits.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * PAGE_SIZE;
    const slice = searched.hits.slice(start, start + PAGE_SIZE);
    const previous = document.activeElement?.dataset?.facetKey || "";
    filters.innerHTML = renderFilters(searched.facets, state, mwNote(records));
    focusFilters(previous);
    chips.innerHTML = renderChips(state);
    const correction = state.q ? didYouMean(records, state.q) : "";
    const did = root.querySelector("#cat-did-you-mean");
    if (did) {
      did.hidden = !correction;
      did.innerHTML = correction
        ? `Did you mean <button type="button" data-did-you-mean="${esc(correction)}">${esc(correction)}</button>?`
        : "";
    }
    const suggest = root.querySelector("#cat-suggest");
    if (suggest) {
      const options = state.q.trim().length >= 2 ? searched.hits.slice(0, 6) : [];
      suggest.hidden = options.length === 0;
      suggest.innerHTML = options.map((hit, index) => suggestionOption(hit, `cat-opt-${index}`)).join("");
      input?.setAttribute("aria-expanded", options.length ? "true" : "false");
      input?.setAttribute("aria-controls", "cat-suggest");
    }
    if (!total) {
      results.innerHTML = `<p class="cat-empty">No products match. Clear a filter, or browse by family below.</p>`;
    } else {
      const structureBase = root.dataset.structureBase || "";
      results.innerHTML = `<ol class="cat-list" start="${start + 1}">${slice.map((hit) => renderCard(hit, `${productBase}${encodeURIComponent(hit.record.id)}/`, structureBase)).join("")}</ol>`;
    }
    pager.innerHTML = renderPager(state.page, pages);
    const noun = total === 1 ? "product" : "products";
    const queryBit = state.q ? ` for ${state.q}` : "";
    const pageBit = pages > 1 ? ` Page ${state.page} of ${pages}.` : "";
    live.textContent = `${total} ${noun}${queryBit}.${pageBit}`;
    if (mode) persist(mode);
  }

  function patch(partial, mode) {
    state = { ...state, ...partial, page: partial.page ?? 1 };
    renderWhenReady(mode);
  }

  input?.addEventListener("focus", () => {
    renderWhenReady();
  });
  input?.addEventListener("input", () => {
    patch({ q: input.value, page: 1 }, "replace");
  });
  sort?.addEventListener("change", () => patch({ sort: sort.value, page: state.page }, "push"));
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    rememberSearch(input.value);
    patch({ q: input.value }, "replace");
  });
  root.addEventListener("click", (event) => {
    const correction = event.target.closest("[data-did-you-mean]");
    if (correction) {
      rememberSearch(correction.dataset.didYouMean);
      if (input) input.value = correction.dataset.didYouMean;
      patch({ q: correction.dataset.didYouMean }, "push");
      return;
    }
    const option = event.target.closest("#cat-suggest [data-suggest-id]");
    if (!option) return;
    rememberSearch(state.q || option.dataset.suggestQ || "");
    window.location.href = `${productBase}${encodeURIComponent(option.dataset.suggestId)}/`;
  });

  filters.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.facet === "family" || target.dataset.facet === "sub" || target.dataset.facet === "type" || target.dataset.facet === "purity" || target.dataset.facet === "pack") {
      const key = target.dataset.facet;
      const current = new Set(state[key]);
      const value = key === "pack" ? normSize(target.value) : target.value;
      if (target.checked) current.add(value);
      else current.delete(value);
      patch({ [key]: [...current] }, "push");
      return;
    }
    if (target.name === "cas") patch({ cas: target.value }, "push");
    if (target.dataset.facet === "quote") patch({ quote: target.checked }, "push");
  });
  filters.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.range) return;
    patch({ [target.dataset.range]: numOrNull(target.value) }, "replace");
  });
  filters.addEventListener("click", (event) => {
    const clear = event.target.closest("[data-clear-all]");
    if (clear) {
      const q = state.q;
      state = { ...emptyState(), q };
      if (input) input.value = q;
      renderWhenReady("push");
    }
    if (event.target.closest("[data-close-filters]")) closeFilters();
  });
  chips.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-chip]");
    if (!chip) return;
    patch(JSON.parse(chip.dataset.chip), "push");
  });
  pager.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (!button) return;
    state = { ...state, page: Number(button.dataset.page) };
    renderWhenReady("push").then(() => {
      results.querySelector(".cat-name")?.focus();
    });
  });

  function openFilters() {
    if (!mobile()) return;
    filters.classList.add("is-open");
    filters.setAttribute("role", "dialog");
    filters.setAttribute("aria-modal", "true");
    openButton?.setAttribute("aria-expanded", "true");
    document.body.classList.add("cat-lock");
    filters.querySelector("input, button")?.focus();
  }
  function closeFilters() {
    filters.classList.remove("is-open");
    filters.removeAttribute("role");
    filters.removeAttribute("aria-modal");
    openButton?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("cat-lock");
    openButton?.focus();
  }
  openButton?.addEventListener("click", () => {
    renderWhenReady().then(() => openFilters());
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && filters.classList.contains("is-open")) closeFilters();
    if (event.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "SELECT") {
      event.preventDefault();
      input?.focus();
    }
    if (!filters.classList.contains("is-open") || !mobile() || event.key !== "Tab") return;
    const nodes = [...filters.querySelectorAll("button, input, select, a")];
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  input?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      const first = results.querySelector(".cat-name");
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  results.addEventListener("keydown", (event) => {
    const links = [...results.querySelectorAll(".cat-name")];
    const index = links.indexOf(document.activeElement);
    if (index < 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      links[Math.min(index + 1, links.length - 1)].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) input?.focus();
      else links[index - 1].focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      links[0].focus();
    } else if (event.key === "End") {
      event.preventDefault();
      links[links.length - 1].focus();
    }
  });

  let ready = false;
  let loading = null;

  function needsIndex(value) {
    return Boolean(value.q)
      || value.family.length
      || value.sub.length
      || value.type.length
      || value.cas !== "any"
      || value.mwMin != null
      || value.mwMax != null
      || value.purity.length
      || value.pack.length
      || value.priceMin != null
      || value.priceMax != null
      || value.quote
      || (value.sort && value.sort !== "relevance")
      || value.page > 1;
  }

  function ensureIndex() {
    if (ready) return Promise.resolve(records);
    if (loading) return loading;
    if (live) live.textContent = "Loading the catalogue index.";
    loading = fetch(new URL(root.dataset.index || "index.json", document.baseURI).href)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((payload) => {
        const items = Array.isArray(payload) ? payload : payload.items;
        records = items.map(hydrate);
        ready = true;
        return records;
      })
      .catch((error) => {
        loading = null;
        if (live) live.textContent = "The search index did not load. The family lists below still work.";
        throw error;
      });
    return loading;
  }

  function renderWhenReady(mode) {
    return ensureIndex().then(() => render(mode)).catch(() => {});
  }

  window.addEventListener("popstate", () => {
    state = stateFromParams(new URLSearchParams(location.search));
    if (needsIndex(state) || ready) renderWhenReady();
  });

  if (needsIndex(state)) renderWhenReady();
}

const RECENT_KEY = "amt-recent-searches";
let nameCounts = null;
let nameCountRecords = null;

function dictionaryFor(records) {
  if (nameCountRecords === records && nameCounts) return nameCounts;
  const counts = new Map();
  for (const record of records) {
    const prepared = record.tokenSet ? record : hydrate(record);
    for (const token of prepared.nameTokens) {
      if (token.length < 5 || /\d/.test(token)) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  nameCounts = counts;
  nameCountRecords = records;
  return counts;
}

function didYouMean(records, query) {
  const source = String(query || "");
  if (source.trim().length < 5) return "";
  const counts = dictionaryFor(records);
  let next = source;
  let changed = false;
  for (const token of queryTokens(source)) {
    if (token.length < 5 || /\d/.test(token) || counts.has(token)) continue;
    const limit = token.length >= 9 ? 2 : 1;
    let best = "";
    let bestCount = 0;
    for (const [candidate, count] of counts) {
      if (candidate[0] !== token[0]) continue;
      if (Math.abs(candidate.length - token.length) > limit) continue;
      if (damerau(token, candidate, limit) <= limit && count > bestCount) {
        best = candidate;
        bestCount = count;
      }
    }
    if (!best) continue;
    const re = new RegExp(escReg(token), "i");
    if (!re.test(next)) continue;
    next = next.replace(re, best);
    changed = true;
  }
  return changed && next.trim().toLowerCase() !== source.trim().toLowerCase() ? next : "";
}

function mwNote(records) {
  const published = records.some((record) => typeof record.mw === "number");
  const pubchem = records.some((record) => typeof record.mw !== "number" && typeof record.mwExternal === "number");
  if (!published && !pubchem) {
    return "No molecular weights are in this extract. A range matches nothing until AMT or PubChem supplies one. A PubChem weight is labelled PubChem.";
  }
  if (pubchem) {
    return "The range uses the published weight. When AMT did not print one, it uses the PubChem weight, labelled PubChem.";
  }
  return "";
}

function suggestionOption(hit, id) {
  const record = hit.record;
  const title = record.name || record.sku;
  const weight = weightLabel(record);
  return `<li role="option" id="${esc(id)}" data-suggest-id="${esc(record.id)}" data-suggest-q="${esc(title)}"><span>${highlight(title, hit.needles)}</span><span class="sku">${esc(record.sku)}${weight ? ` · ${esc(weight)}` : ""}</span></li>`;
}

function storageOf(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readRecent(storage) {
  const box = storageOf(storage);
  if (!box) return [];
  try {
    const parsed = JSON.parse(box.getItem(RECENT_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item.trim()) : [];
  } catch {
    return [];
  }
}

function rememberSearch(query, storage) {
  const box = storageOf(storage);
  const q = String(query || "").trim();
  const current = readRecent(box);
  if (!box || q.length < 2) return current;
  const next = [q, ...current.filter((item) => item.toLowerCase() !== q.toLowerCase())].slice(0, 8);
  box.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

function catalogueUrl() {
  const action = document.querySelector("form.search")?.getAttribute("action");
  return new URL(action || "/amt/redesign/catalogue/", document.baseURI).href;
}

function sharedIndexUrl() {
  const app = document.querySelector("[data-catalogue-app]");
  if (app?.dataset.index) return new URL(app.dataset.index, document.baseURI).href;
  return new URL("index.json", catalogueUrl()).href;
}

function productHref(id) {
  const base = document.querySelector("[data-catalogue-app]")?.dataset.productBase;
  if (base) return `${base}${encodeURIComponent(id)}/`;
  return new URL(`../products/${encodeURIComponent(id)}/`, catalogueUrl()).href;
}

let sharedRecords = null;
let sharedIndexPromise = null;

function loadSharedIndex() {
  if (sharedRecords) return Promise.resolve(sharedRecords);
  if (sharedIndexPromise) return sharedIndexPromise;
  sharedIndexPromise = fetch(sharedIndexUrl())
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    })
    .then((payload) => {
      const items = Array.isArray(payload) ? payload : payload.items;
      sharedRecords = items.map(hydrate);
      return sharedRecords;
    })
    .catch((error) => {
      sharedIndexPromise = null;
      throw error;
    });
  return sharedIndexPromise;
}

function bootPalette() {
  if (document.getElementById("amt-palette")) return;
  const root = document.createElement("div");
  root.id = "amt-palette";
  root.className = "amt-palette";
  root.hidden = true;
  root.innerHTML = `<div class="amt-palette-panel" role="dialog" aria-modal="true" aria-labelledby="amt-palette-title">
    <form class="form" role="search">
      <label class="field" id="amt-palette-title">Search the catalogue
        <input id="amt-palette-q" type="search" autocomplete="off" spellcheck="false" placeholder="Name, CAS, SKU, formula" aria-autocomplete="list" aria-controls="amt-palette-list" aria-expanded="false" aria-keyshortcuts="Control+K Meta+K">
      </label>
      <p id="amt-palette-did" class="cat-did" hidden></p>
      <ul id="amt-palette-list" class="amt-suggest" role="listbox"></ul>
      <p class="hint">Enter opens a product. Esc closes. Recent searches stay in this browser.</p>
    </form>
  </div>`;
  document.body.append(root);
  const input = root.querySelector("#amt-palette-q");
  const list = root.querySelector("#amt-palette-list");
  const did = root.querySelector("#amt-palette-did");
  let records = [];
  let active = -1;

  function close() {
    root.hidden = true;
    document.body.classList.remove("cat-lock");
  }
  function open(preset) {
    root.hidden = false;
    document.body.classList.add("cat-lock");
    if (preset != null) input.value = preset;
    input.focus();
    input.select();
    loadSharedIndex().then((loaded) => {
      records = loaded;
      paint();
    }).catch(() => {
      list.innerHTML = `<li class="hint">The search index did not load.</li>`;
    });
  }
  function paint() {
    const q = input.value.trim();
    const correction = q ? didYouMean(records, q) : "";
    did.hidden = !correction;
    did.innerHTML = correction
      ? `Did you mean <button type="button" data-palette-q="${esc(correction)}">${esc(correction)}</button>?`
      : "";
    let html = "";
    if (q.length >= 2 && records.length) {
      const hits = runSearch(records, { ...emptyState(), q }).hits.slice(0, 8);
      html = hits.map((hit, index) => suggestionOption(hit, `amt-opt-${index}`)).join("");
    } else if (!q) {
      html = readRecent().map((item) => `<li role="option" data-palette-q="${esc(item)}"><span>${esc(item)}</span><span class="hint">Recent</span></li>`).join("");
    }
    list.innerHTML = html;
    active = html ? 0 : -1;
    markActive();
    input.setAttribute("aria-expanded", html ? "true" : "false");
  }
  function markActive() {
    const options = [...list.querySelectorAll("[role=option]")];
    options.forEach((option, index) => {
      option.setAttribute("aria-selected", index === active ? "true" : "false");
    });
    if (options[active]) input.setAttribute("aria-activedescendant", options[active].id || "");
    else input.removeAttribute("aria-activedescendant");
  }
  function choose(option) {
    if (!option) return;
    if (option.dataset.suggestId) {
      rememberSearch(input.value.trim() || option.dataset.suggestQ || "");
      window.location.href = productHref(option.dataset.suggestId);
      return;
    }
    const next = option.dataset.paletteQ || "";
    if (!next) return;
    input.value = next;
    rememberSearch(next);
    paint();
  }
  input.addEventListener("input", paint);
  input.addEventListener("keydown", (event) => {
    const options = [...list.querySelectorAll("[role=option]")];
    if (event.key === "ArrowDown" && options.length) {
      event.preventDefault();
      active = Math.min(options.length - 1, active + 1);
      markActive();
    } else if (event.key === "ArrowUp" && options.length) {
      event.preventDefault();
      active = Math.max(0, active - 1);
      markActive();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (options[active]) choose(options[active]);
      else if (input.value.trim()) {
        rememberSearch(input.value);
        window.location.href = `${catalogueUrl()}?q=${encodeURIComponent(input.value.trim())}`;
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
  list.addEventListener("click", (event) => {
    const option = event.target.closest("[role=option], [data-palette-q]");
    if (option) choose(option.closest("[role=option]") || option);
  });
  did.addEventListener("click", (event) => {
    const button = event.target.closest("[data-palette-q]");
    if (!button) return;
    input.value = button.dataset.paletteQ;
    rememberSearch(input.value);
    paint();
  });
  root.addEventListener("click", (event) => {
    if (event.target === root) close();
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (root.hidden) open("");
      else close();
    } else if (event.key === "Escape" && !root.hidden) {
      close();
    }
  });
  document.querySelector("#site-search")?.addEventListener("focus", () => {
    open(document.querySelector("#site-search").value);
  });
  document.querySelector("form.search")?.addEventListener("submit", (event) => {
    if (document.getElementById("amt-palette") && !root.hidden) event.preventDefault();
  });
}

function onQuoteClick(event) {
  const button = event.target.closest?.("[data-add-quote]");
  if (!button) return;
  const root = button.closest("[data-quote-root]") || button.parentElement;
  const select = root?.querySelector("[data-pack-select]");
  const pack = select?.value || button.dataset.pack || "";
  const detail = { id: button.dataset.id || "", sku: button.dataset.sku || "", pack };
  document.dispatchEvent(new CustomEvent("amt:add-to-quote", { bubbles: true, detail }));
  const status = document.getElementById("cat-quote-status");
  const message = `Added ${detail.sku || detail.id}${pack ? `, ${pack}` : ""} to the quote.`;
  if (status) status.textContent = message;
  button.dataset.added = "true";
}

if (typeof document !== "undefined") {
  const app = document.querySelector("[data-catalogue-app]");
  if (app) boot(app);
  bootPalette();
  document.addEventListener("click", onQuoteClick);
}

export {
  ANCHORS,
  FAMILY_LABELS,
  PAGE_SIZE,
  activeFilterCount,
  extractPeg,
  familyLabel,
  highlight,
  hydrate,
  normSize,
  parseQuery,
  prepareRecord,
  runSearch,
  searchRecords,
  stateFromParams,
  stateToQuery,
  toCompact,
  didYouMean,
  rememberSearch,
  readRecent,
  weightLabel,
};
