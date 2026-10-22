import { mkdir, readdir, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadData } from "./lib/data.mjs";
import { configure, renderPage } from "./lib/layout.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pagesDir = join(root, "_build", "pages");

const REQUIRED = [
  "index.html",
  "about/index.html",
  "contact/index.html",
  "families/lipids/index.html",
  "families/peg/index.html",
  "families/fluorophores/index.html",
  "families/organoborons/index.html",
  "families/other/index.html",
  "styleguide/index.html",
  "404.html",
];

function assertShell(rel, html) {
  const checks = [
    ["robots", 'name="robots" content="noindex,nofollow"'],
    ["concept note", "Concept redesign, not the official AMT site"],
    ["language", 'lang="en-AU"'],
    ["main", 'id="main"'],
    ["skip link", 'class="skip-link"'],
    ["viewport", 'name="viewport"'],
  ];
  for (const [label, needle] of checks) {
    if (!html.includes(needle)) {
      throw new Error(`${rel} is missing ${label}`);
    }
  }
  if (/\.(css|js|png|webp|svg)\//.test(html)) {
    throw new Error(`${rel} has a trailing slash on a file URL`);
  }
}

async function writePage(rel, html) {
  const full = resolve(root, rel);
  const relToRoot = relative(root, full);
  if (relToRoot.startsWith("..") || relToRoot === "") {
    throw new Error(`Refusing to write outside amt/redesign: ${rel}`);
  }
  assertShell(rel, html);
  await mkdir(dirname(full), { recursive: true });
  await fsWriteFile(full, html);
  return rel;
}

const { products, site, productsSource, siteSource } = await loadData(root);
configure({ site });

const files = (await readdir(pagesDir)).filter((name) => name.endsWith(".mjs")).sort();
const written = [];
for (const file of files) {
  const mod = await import(pathToFileURL(join(pagesDir, file)).href);
  if (typeof mod.build !== "function") {
    throw new Error(`${file} does not export build`);
  }
  const result = await mod.build({
    products,
    site,
    renderPage,
    outDir: root,
    writeFile: async (rel, html) => {
      written.push(await writePage(rel, html));
    },
  });
  if (result != null) written.push(result);
}

for (const rel of REQUIRED) {
  if (!written.includes(rel)) {
    throw new Error(`Build did not write ${rel}`);
  }
}

console.log(`AMT redesign shell: ${written.length} pages`);
console.log(`  products: ${productsSource} (${products.length})`);
console.log(`  site: ${siteSource}`);
for (const rel of written) console.log(`  ${rel}`);
