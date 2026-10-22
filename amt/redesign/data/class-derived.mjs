/**
 * Name-derived browsing classes. The rules live in data/class-rules.json.
 * A miss is null. Nothing here is an AMT heading.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RULES_PATH = join(dirname(fileURLToPath(import.meta.url)), "class-rules.json");

export function loadClassRules() {
  return JSON.parse(readFileSync(RULES_PATH, "utf8"));
}

function compile(pattern, flags) {
  return new RegExp(pattern, flags || "");
}

function hits(name, rule) {
  if (!compile(rule.pattern, rule.flags).test(name)) return false;
  if (rule.unless && compile(rule.unless, rule.flags).test(name)) return false;
  return true;
}

function firstMatch(name, rules) {
  for (const rule of rules) {
    if (hits(name, rule)) return rule.value;
  }
  return null;
}

function allMatches(name, rules) {
  const values = [];
  for (const rule of rules) {
    if (hits(name, rule)) values.push(rule.value);
  }
  return values;
}

const LINKER_VALUES = ["NHS", "maleimide", "DBCO"];

function linkerRules(rules) {
  const groups = rules.families?.peg?.reactiveGroups || [];
  return groups.filter((rule) => LINKER_VALUES.includes(rule.value));
}

export function deriveClass(name, family, rules) {
  if (typeof name !== "string" || name.trim() === "") return null;
  const spec = rules.families?.[family];
  const base = { derivedFrom: "name", rules: rules.rules };
  const linkers = allMatches(name, linkerRules(rules));
  if (!spec) {
    if (linkers.length === 0) return null;
    return { ...base, reactiveGroups: linkers };
  }
  if (spec.kind === "single") {
    const value = firstMatch(name, spec.rules);
    if (!value && linkers.length === 0) return null;
    if (!value) return { ...base, reactiveGroups: linkers };
    if (linkers.length === 0) return { ...base, [spec.field]: value };
    return { ...base, [spec.field]: value, reactiveGroups: linkers };
  }
  if (spec.kind === "peg") {
    const reactiveGroups = allMatches(name, spec.reactiveGroups);
    let architecture = null;
    for (const rule of spec.architecture) {
      const word = rule.pattern ? hits(name, rule) : false;
      const several =
        Number.isInteger(rule.distinctReactiveGroupsAtLeast) &&
        reactiveGroups.length >= rule.distinctReactiveGroupsAtLeast;
      if (word || several) {
        architecture = rule.value;
        break;
      }
    }
    if (!architecture && reactiveGroups.length === 0) return null;
    return {
      ...base,
      architecture,
      reactiveGroups: reactiveGroups.length ? reactiveGroups : null,
    };
  }
  return null;
}

export function classCounts(products, rules) {
  const families = ["lipids", "peg", "fluorophores", "organoborons", "other"];
  const byFamily = {};
  for (const family of families) {
    const spec = rules.families?.[family];
    const row = { products: 0, matched: 0, null: 0 };
    if (spec?.kind === "single") {
      row[spec.field] = Object.fromEntries(spec.rules.map((rule) => [rule.value, 0]));
      row.reactiveGroups = Object.fromEntries(LINKER_VALUES.map((value) => [value, 0]));
    }
    if (spec?.kind === "peg") {
      row.architecture = Object.fromEntries(spec.architecture.map((rule) => [rule.value, 0]));
      row.reactiveGroups = Object.fromEntries(spec.reactiveGroups.map((rule) => [rule.value, 0]));
    }
    if (!spec) {
      row.reactiveGroups = Object.fromEntries(LINKER_VALUES.map((value) => [value, 0]));
    }
    byFamily[family] = row;
  }
  const total = { products: 0, matched: 0, null: 0 };
  for (const product of products) {
    const family = product.family;
    const row = byFamily[family];
    if (!row) continue;
    row.products += 1;
    total.products += 1;
    const derived = deriveClass(product.name, family, rules);
    if (!derived) {
      row.null += 1;
      total.null += 1;
      continue;
    }
    row.matched += 1;
    total.matched += 1;
    if (derived.boronClass) row.boronClass[derived.boronClass] += 1;
    if (derived.dyeCore) row.dyeCore[derived.dyeCore] += 1;
    if (derived.architecture) row.architecture[derived.architecture] += 1;
    for (const group of derived.reactiveGroups || []) row.reactiveGroups[group] += 1;
  }
  return {
    derivedFrom: "name",
    rules: rules.rules,
    note: "Not an AMT heading. Counted from the printed name with data/class-rules.json. Null means no rule matched. Reactive-group counts are products whose name includes that group, so one product can be counted under more than one group. NHS, maleimide and DBCO are counted in every family. ADIBO is counted as DBCO.",
    byFamily: { ...byFamily, total },
  };
}

const FAMILIES = ["lipids", "peg", "fluorophores", "organoborons", "other"];

export function classSection(block) {
  const lines = [
    "## Name-derived class",
    "",
    "`classDerived` is a browsing facet read from the printed product name with `data/class-rules.json`. It is not an AMT heading and it is not a PubChem field. `classDerivedSource` is `\"name\"` when a rule matches and null otherwise. Boron class, PEG architecture and dye core run only inside the family AMT already assigned. NHS, maleimide and DBCO use the same name patterns on every family, including succinimidyl, SC, SCM, SVA, SS, 2,5-dioxopyrrolidin-1-yl, Mal, pyrrole-2,5-dione, dibenzocyclooctyne and ADIBO. A PEG product can also carry an architecture (`mPEG`, `heterobifunctional`, `multi-arm`) and azide, amine or acid. Dye cores include Cy3, Cy5, Cy5.5, Cy7, cyanine, sulfo-Cy, FITC and BODIPY. Unknowns are null.",
    "",
    "| Family | Products | Matched | Null |",
    "| --- | ---: | ---: | ---: |",
  ];
  for (const family of [...FAMILIES, "total"]) {
    const row = block.byFamily[family];
    lines.push(`| ${family} | ${row.products} | ${row.matched} | ${row.null} |`);
  }
  lines.push("", "Organoboron class, first matching rule:", "", "| Class | Products |", "| --- | ---: |");
  for (const [label, count] of Object.entries(block.byFamily.organoborons.boronClass)) {
    lines.push(`| ${label} | ${count} |`);
  }
  lines.push("", "PEG architecture. A product is counted once. Null architecture is not listed.", "", "| Architecture | Products |", "| --- | ---: |");
  for (const [label, count] of Object.entries(block.byFamily.peg.architecture)) {
    lines.push(`| ${label} | ${count} |`);
  }
  lines.push("", "PEG reactive groups. A product with two groups is counted under each.", "", "| Reactive group | Products |", "| --- | ---: |");
  for (const [label, count] of Object.entries(block.byFamily.peg.reactiveGroups)) {
    lines.push(`| ${label} | ${count} |`);
  }
  lines.push(
    "",
    "NHS, maleimide and DBCO on every family. The PEG row repeats the three cells above. ADIBO is counted as DBCO.",
    "",
    "| Family | NHS | maleimide | DBCO |",
    "| --- | ---: | ---: | ---: |",
  );
  for (const family of FAMILIES) {
    const groups = block.byFamily[family].reactiveGroups;
    lines.push(`| ${family} | ${groups.NHS} | ${groups.maleimide} | ${groups.DBCO} |`);
  }
  lines.push("", "Fluorophore dye core:", "", "| Dye core | Products |", "| --- | ---: |");
  for (const [label, count] of Object.entries(block.byFamily.fluorophores.dyeCore)) {
    lines.push(`| ${label} | ${count} |`);
  }
  lines.push("");
  return lines;
}
