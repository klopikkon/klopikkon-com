/**
 * Catalogue search checks against data/products.json.
 * Run: node amt/redesign/catalogue/test-search.mjs
 *
 * A few in-memory rows at the bottom exercise PEG-mass and formula
 * matching. They are not catalogue products and are not written to the site.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractPeg,
  prepareRecord,
  runSearch,
  stateFromParams,
  stateToQuery,
  toCompact,
  didYouMean,
  rememberSearch,
  readRecent,
  weightLabel,
} from "../js/search.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const products = JSON.parse(await readFile(path.join(root, "data/products.json"), "utf8"));
const records = products.map(prepareRecord);

let failed = 0;
let passed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL ${message}`);
  } else {
    passed += 1;
  }
}

function search(q, extra = {}, pool = records) {
  return runSearch(pool, {
    q,
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
    ...extra,
  });
}

function skus(result, n = 8) {
  return result.hits.slice(0, n).map((hit) => hit.record.sku);
}

function top(result) {
  return result.hits[0]?.record;
}

assert(products.length === 1347, `products.json has 1347 SKUs (${products.length})`);
assert(new Set(products.map((product) => product.sku)).size === products.length, "SKUs are unique");
const roundTrip = products.map((product) => prepareRecord(toCompact(product)));
assert(roundTrip.length === products.length, "compact index keeps every product");
const alcRound = roundTrip.find((record) => record.sku === "AMTGC903-AL21");
assert(alcRound?.id === "amtgc903-al21" && alcRound.packs[1]?.price === 430 && alcRound.packs[1]?.priceText === "$430.00", "compact ALC-0315 keeps id and the published 1 g price");
const saltRound = roundTrip.find((record) => record.sku === "AMTGC1455-HA25");
assert(saltRound?.formulaExternal === "C45H90INO5" && saltRound?.mwExternal === 852.1 && saltRound?.structureCid === 172871935 && saltRound?.types.length === 0, "compact SM-102 salt keeps the PubChem formula, weight, and structure");
const amtImage = roundTrip.find((record) => record.sku === "AMTGC187-AC16");
assert(amtImage && !amtImage.structureCid, "a published AMT structure is not replaced by the PubChem drawing");

const peg2k = extractPeg("mPEG 2k");
assert(peg2k && peg2k.mw === 2000 && peg2k.methoxy === true, "mPEG 2k is methoxy PEG mass 2000");
const peg3 = extractPeg("PEG3");
assert(peg3 && peg3.n === 3 && peg3.mw == null && peg3.methoxy === false, "PEG3 is an oligomer length, not a mass");
const dspe = extractPeg("DSPE-PEG2000");
assert(dspe && dspe.mw === 2000, "DSPE-PEG2000 carries nominal mass 2000");
const peg400 = extractPeg("N3-PEG(400)-NH2");
assert(peg400 && peg400.mw === 400 && peg400.n == null, "PEG(400) is a nominal mass");

assert(top(search("2036272-55-4"))?.sku === "AMTGC903-AL21", "exact CAS 2036272-55-4 is ALC-0315");
assert(top(search("2036272554"))?.sku === "AMTGC903-AL21", "CAS without hyphens is ALC-0315");
assert(top(search("2036272"))?.sku === "AMTGC903-AL21", "CAS prefix 2036272 is ALC-0315");
assert(skus(search("2089251"), 5).includes("AMTGC936-SM21"), "partial CAS 2089251 finds SM-102");
assert(skus(search("2089251"), 5).includes("AMTGC1533-LP25"), "partial CAS 2089251 finds Lipid 5");
assert(top(search("160743-62-4"))?.sku === "AMTGC1444-DM25", "DMG-PEG CAS 160743-62-4");
assert(top(search("1397695-86-1"))?.sku === "AMTGC1444-DM25", "DMG-PEG alternate published CAS");
assert(top(search("98-80-6"))?.sku === "AMTB008-P06", "phenylboronic acid CAS 98-80-6");
assert(top(search("816-94-4"))?.sku === "AMTGC1609-DS26", "DSPC CAS 816-94-4");

assert(top(search("ALC-0315"))?.sku === "AMTGC903-AL21", "name ALC-0315");
assert(top(search("ALC0315"))?.sku === "AMTGC903-AL21", "name without hyphen");
assert(top(search("SM-102"))?.sku === "AMTGC936-SM21", "SM-102 ranks above the N-oxide");
assert(top(search("phenylboronic acid"))?.sku === "AMTB008-P06", "phenylboronic acid by name");
assert(top(search("AMTGC903-AL21"))?.sku === "AMTGC903-AL21", "SKU lookup");
assert(top(search("DSPC"))?.sku === "AMTGC1609-DS26", "DSPC abbreviation");

const typoBoron = skus(search("phenylbornoic acid"), 5);
assert(typoBoron.includes("AMTB008-P06"), `typo phenylbornoic acid finds phenylboronic acid (${typoBoron.join(",")})`);
const typoDye = skus(search("fluorescien"), 8);
assert(typoDye.some((sku) => ["AMTGC270-CF17", "AMTGC248-BB16"].includes(sku) || records.some((record) => record.sku === sku && /fluorescein/i.test(record.name))), `typo fluorescien finds a fluorescein (${typoDye.join(",")})`);

const peg2000 = skus(search("PEG2000"), 6);
assert(peg2000.includes("AMTGC1179-AL23"), "PEG2000 finds ALC-0159");
assert(peg2000.includes("AMTGC1444-DM25"), "PEG2000 finds DMG-PEG");
assert(!peg2000.includes("AMTGC223-MA16"), "PEG2000 does not return m-PEG3-amine");

assert(top(search("DMG-PEG2000"))?.sku === "AMTGC1444-DM25", "DMG-PEG2000 is DMG-PEG");
assert(!skus(search("DSPE-PEG2000"), 10).includes("AMTGC1444-DM25"), "DSPE-PEG2000 does not return DMG-PEG");
assert(search("DSPE-PEG2000").hits.length === 0, "this extract has no DSPE-PEG2000");

const mpeg3 = skus(search("mPEG3"), 12);
assert(top(search("2-(2-(2-Methoxyethoxy)ethoxy) ethanamine"))?.sku === "AMTGC223-MA16", "published name finds AMTGC223-MA16");
assert(!mpeg3.includes("AMTGC223-MA16"), "mPEG3 is not printed on AMTGC223-MA16");
assert(!mpeg3.includes("AMTGC297-AT17"), "mPEG3 does not return the tetraoxa amine");
assert(!mpeg3.includes("AMTGC1444-DM25"), "mPEG3 does not return DMG-PEG 2000");
const anyPeg3 = skus(search("PEG3"), 20);
assert(top(search("2,5,8,11-Tetraoxatridecan-13-amine"))?.sku === "AMTGC297-AT17", "published name finds AMTGC297-AT17");
assert(!anyPeg3.includes("AMTGC1179-AL23"), "PEG3 does not include PEG2000 lipid ALC-0159");

const mpeg2k = skus(search("mPEG 2k"), 8);
assert(!mpeg2k.includes("AMTGC284-MA17"), "mPEG 2k does not return m-PEG2-amine");
assert(!mpeg2k.includes("AMTGC1179-AL23"), "mPEG 2k does not treat ALC-0159 as methoxy PEG");

const quote = search("", { quote: true });
assert(quote.hits.some((hit) => hit.record.sku === "AMTGC1487-IL25"), "quote only includes C16-200");
assert(!quote.hits.some((hit) => hit.record.sku === "AMTGC903-AL21"), "quote only excludes priced ALC-0315");

const family = search("phenylboronic acid", { family: ["organoborons"] });
assert(family.hits.length > 0 && family.hits.every((hit) => hit.record.fam === "organoborons"), "family filter keeps organoborons");
assert(family.hits.some((hit) => hit.record.sku === "AMTB008-P06"), "filtered phenylboronic acid still matches");

const packed = search("", { pack: ["25 g"] });
assert(packed.hits.some((hit) => hit.record.sku === "AMTB008-P06"), "pack 25 g includes phenylboronic acid");

const pure = search("", { purity: ["≥ 98%"] });
assert(pure.hits.some((hit) => hit.record.sku === "AMTGC903-AL21"), "purity ≥ 98% includes ALC-0315");
assert(!pure.hits.some((hit) => hit.record.sku === "AMTGC1297-DO24"), "purity ≥ 98% excludes DODAP");

const noCas = search("", { cas: "no" });
assert(noCas.hits.some((hit) => hit.record.sku === "AMTGC1487-IL25"), "CAS not listed includes C16-200");
assert(!noCas.hits.some((hit) => hit.record.sku === "AMTGC903-AL21"), "CAS not listed excludes ALC-0315");

const priced = search("", { priceMin: 400, priceMax: 450 });
assert(priced.hits.some((hit) => hit.record.sku === "AMTGC903-AL21"), "price 400–450 matches the ALC-0315 1 g pack");
assert(!priced.hits.some((hit) => hit.record.sku === "AMTB008-P06"), "price 400–450 excludes phenylboronic acid");

const byPrice = search("boronic acid", { sort: "price" });
const prices = byPrice.hits.slice(0, 6).map((hit) => hit.record.minPrice ?? Number.POSITIVE_INFINITY);
assert(prices.every((price, index) => index === 0 || price >= prices[index - 1]), "price sort is ascending");

const facets = search("phenyl").facets;
assert(facets.family.some(([family]) => family === "organoborons"), "family facet is present");
assert(facets.family.every(([, count]) => count > 0), "facet counts are positive");

const salt = records.find((record) => record.sku === "AMTGC1455-HA25");
assert(salt && salt.mw == null && salt.mwExternal === 852.1, "SM-102 salt has a PubChem weight and no published weight");
assert(weightLabel(salt) === "852.1 Da · PubChem", "the SM-102 salt weight is labelled PubChem");
const saltRange = search("", { mwMin: 852, mwMax: 852.2 });
assert(saltRange.hits.some((hit) => hit.record.sku === "AMTGC1455-HA25"), "MW 852–852.2 includes the PubChem weight");
assert(!saltRange.hits.some((hit) => hit.record.sku === "AMTGC903-AL21"), "MW 852–852.2 excludes ALC-0315, which has no weight");
assert(top(search("C45H90INO5"))?.sku === "AMTGC1455-HA25", "formulaExternal C45H90INO5 matches the SM-102 salt");

const pinacol = search("", { type: ["pinacol ester"] });
assert(pinacol.hits.length === 648 && pinacol.hits.every((hit) => hit.record.types.includes("pinacol ester")), "type pinacol ester keeps those 648 products");
assert(pinacol.hits.some((hit) => hit.record.sku === "AMTB001-B06"), "type pinacol ester includes the benzo oxadiazole pinacol ester");
assert(!pinacol.hits.some((hit) => hit.record.sku === "AMTB008-P06"), "type pinacol ester excludes phenylboronic acid");
assert(!pinacol.hits.some((hit) => hit.record.types.length === 0), "type filter omits products with no derived class");
const acid = records.find((record) => record.sku === "AMTB008-P06");
assert(acid?.types.length === 1 && acid.types[0] === "boronic acid", "phenylboronic acid is type boronic acid");
const amine = search("", { type: ["amine"] });
assert(amine.hits.some((hit) => hit.record.sku === "AMTGC1000-DE22") && amine.hits.every((hit) => hit.record.types.includes("amine")), "type amine matches the dimethylethyl carbamate");

const expectedTypes = {
  "boronic acid": 135,
  "pinacol ester": 648,
  trifluoroborate: 123,
  BODIPY: 6,
  mPEG: 2,
  heterobifunctional: 17,
  azide: 65,
  amine: 74,
  acid: 5,
};
const typeFacet = search("").facets.type;
assert(typeFacet.length === Object.keys(expectedTypes).length, "type facet omits classes with no products");
for (const [token, count] of typeFacet) {
  assert(expectedTypes[token] === count, `type ${token} counts ${expectedTypes[token]} (got ${count})`);
  assert(token && token !== "null", "type facet has no null bucket");
}
assert(records.filter((record) => record.types.length === 0).length === 306, "306 products have no derived type");

const round = stateFromParams(new URLSearchParams(stateToQuery({
  q: "phenyl",
  family: ["organoborons"],
  sub: ["pegylated lipid"],
  type: ["pinacol ester", "amine"],
  cas: "yes",
  mwMin: 100,
  mwMax: 400,
  purity: ["≥ 98%"],
  pack: ["1 g"],
  priceMin: 10,
  priceMax: 80,
  quote: true,
  sort: "mw",
  page: 2,
}).slice(1)));
assert(round.q === "phenyl" && round.family[0] === "organoborons" && round.mwMin === 100 && round.mwMax === 400, "mw range survives the URL");
assert(round.priceMin === 10 && round.priceMax === 80 && round.quote === true && round.sort === "mw" && round.page === 2, "price, quote, sort and page survive the URL");
assert(round.cas === "yes" && round.pack[0] === "1 g" && round.purity[0] === "≥ 98%", "CAS, pack and purity survive the URL");
assert(round.type[0] === "pinacol ester" && round.type[1] === "amine" && round.sub[0] === "pegylated lipid", "type and the older subfamily param survive the URL");

const synthetic = [
  ...records,
  prepareRecord({
    id: "engine-dspe-peg2000",
    sku: "ENGINE-DSPE",
    name: "DSPE-PEG2000",
    synonyms: [],
    family: "lipids",
    subfamily: "pegylated lipid",
    cas: "",
    formula: null,
    mw: null,
    purity: "",
    packs: [{ size: "100mg", price: null, currency: "USD", priceText: "quote" }],
  }),
  prepareRecord({
    id: "engine-mpeg-2000",
    sku: "ENGINE-MPEG",
    name: "mPEG-2000",
    synonyms: ["methoxy polyethylene glycol 2000"],
    family: "peg",
    subfamily: "polymeric",
    cas: "",
    formula: null,
    mw: null,
    purity: "",
    packs: [{ size: "1g", price: null, currency: "USD", priceText: "quote" }],
  }),
  prepareRecord({
    id: "engine-formula",
    sku: "ENGINE-FORMULA",
    name: "Formula fixture",
    synonyms: [],
    family: "other",
    subfamily: "",
    cas: "",
    formula: "C6H7BO2",
    mw: 121.93,
    purity: "",
    packs: [{ size: "1g", price: null, currency: "USD", priceText: "quote" }],
  }),
];
assert(top(search("DSPE-PEG2000", {}, synthetic))?.sku === "ENGINE-DSPE", "engine row DSPE-PEG2000 matches that name");
assert(top(search("mPEG 2k", {}, synthetic))?.sku === "ENGINE-MPEG", "engine row mPEG 2k matches mPEG-2000");
assert(!skus(search("mPEG 2k", {}, synthetic), 5).includes("ENGINE-DSPE"), "mPEG 2k does not match DSPE-PEG2000");
assert(top(search("C6H7BO2", {}, synthetic))?.sku === "ENGINE-FORMULA", "formula query matches the engine row");
const mwHits = search("", { mwMin: 100, mwMax: 150 }, synthetic);
assert(mwHits.hits.some((hit) => hit.record.sku === "ENGINE-FORMULA"), "MW range matches a published-style numeric mw");
assert(!mwHits.hits.some((hit) => hit.record.sku === "AMTGC903-AL21"), "MW range skips products with no published mw");
const pubchem = prepareRecord({
  id: "engine-pubchem",
  sku: "ENGINE-PUBCHEM",
  name: "PubChem weight row",
  synonyms: [],
  family: "other",
  subfamily: "",
  cas: "",
  formula: null,
  formulaExternal: "C10H14N2",
  mw: null,
  mwExternal: 162.23,
  purity: "",
  packs: [{ size: "1g", price: null, currency: "USD", priceText: "quote" }],
});
const pubchemHits = search("", { mwMin: 160, mwMax: 170 }, [...records, pubchem]);
assert(pubchemHits.hits.some((hit) => hit.record.sku === "ENGINE-PUBCHEM"), "MW range uses PubChem mwExternal when AMT published none");
assert(weightLabel(pubchem) === "162.23 Da · PubChem", "PubChem weight is labelled PubChem");
assert(top(search("C10H14N2", {}, [...records, pubchem]))?.sku === "ENGINE-PUBCHEM", "formulaExternal matches and stays labelled as PubChem");
assert(/phenylboronic/i.test(didYouMean(records, "phenylbornoic acid")), "did you mean corrects phenylbornoic");
assert(didYouMean(records, "ALC-0315") === "", "an exact name is not rewritten");
const memory = { store: {}, getItem(key) { return this.store[key] ?? null; }, setItem(key, value) { this.store[key] = value; } };
assert(rememberSearch("ALC-0315", memory)[0] === "ALC-0315", "a search is remembered");
assert(rememberSearch("SM-102", memory)[0] === "SM-102" && readRecent(memory)[1] === "ALC-0315", "recent searches keep the newest first");
assert(rememberSearch("SM-102", memory).filter((item) => item === "SM-102").length === 1, "repeating a search does not duplicate it");

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
