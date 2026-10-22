/**
 * Quote page. The list lives in localStorage; this file is the empty shell
 * plus a catalogue lookup so names and published pack labels can be shown.
 */
import { mkdir, writeFile as fsWriteFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { url } from "../lib/paths.mjs";
import { breadcrumbs } from "../lib/ui.mjs";
import { escapeHtml, packLabel, publishedText, quoteEmail } from "../product-support.mjs";

function catalogue(products) {
  return products.map((product) => ({
    id: product.id,
    sku: product.sku || "",
    name: product.name || "",
    packs: (Array.isArray(product.packs) ? product.packs : []).map((pack) => ({
      size: publishedText(pack.size) || "",
      label: packLabel(pack),
    })),
  }));
}

export async function build(ctx) {
  const products = ctx.products;
  const site = ctx.site || {};
  const render = ctx.renderPage;
  const write = ctx.writeFile;
  if (typeof render !== "function" || typeof write !== "function") {
    throw new Error("quote build needs ctx.renderPage and ctx.writeFile");
  }
  const email = quoteEmail(site);
  const items = catalogue(products);
  const json = JSON.stringify(items).replace(/</g, "\\u003c");
  const crumbs = breadcrumbs([
    { label: "Home", href: url("") },
    { label: "Quote" },
  ]);
  const body = `<div class="wrap page-intro">
    ${crumbs}
    <article class="quote" data-generated="amt-quote" data-quote-page data-email="${escapeHtml(email)}">
    <h1>Quote list</h1>
    <p class="lede">Items stay in this browser. Opening the email uses your mail app and addresses ${escapeHtml(email)}, the sales address published on the AMT contact page. Nothing is sent to a server, and there is no payment.</p>
    <p class="quote-empty" data-quote-empty>No items yet. <a href="${url("catalogue/")}">Browse the catalogue</a>.</p>
    <ul class="quote-lines" data-quote-lines></ul>
    <form class="quote-details" data-quote-details>
      <h2>Message</h2>
      <p class="hint">Name, organisation, and notes are optional. They are only copied into the email.</p>
      <div class="field">
        <label for="quote-name">Name</label>
        <input id="quote-name" name="name" type="text" autocomplete="name">
      </div>
      <div class="field">
        <label for="quote-org">Organisation</label>
        <input id="quote-org" name="organisation" type="text" autocomplete="organization">
      </div>
      <div class="field">
        <label for="quote-notes">Notes</label>
        <textarea id="quote-notes" name="notes" rows="4"></textarea>
      </div>
      <p><a class="btn btn-primary mailto" data-quote-mailto href="mailto:${escapeHtml(email)}">Open email to AMT</a></p>
      <p class="quote-status" data-quote-status role="status" aria-live="polite"></p>
    </form>
    <noscript><p>JavaScript is required to read the saved list and fill the email. The message is still only sent if you send it from your mail app.</p></noscript>
    <script type="application/json" id="amt-quote-catalog">${json}</script>
    <script type="module" src="${url("js/cart.js")}"></script>
    </article>
  </div>`;
  const html = render({
    title: "Quote list",
    description: "Browser-only quote list for Advanced Molecular Technologies. Opens an email. No payment and no server.",
    path: "quote/",
    head: `<link rel="stylesheet" href="${url("css/quote.css")}">`,
    body,
  });
  await write("quote/index.html", html);
  const dir = path.join(ctx.outDir, "quote");
  await mkdir(dir, { recursive: true });
  await fsWriteFile(path.join(dir, "items.json"), `${JSON.stringify(items, null, 2)}\n`);
}

async function runStandalone() {
  const outDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
  const { loadData } = await import("../lib/data.mjs");
  const layout = await import("../lib/layout.mjs");
  const { products, site } = await loadData(outDir);
  layout.configure({ site });
  await build({
    products,
    site,
    renderPage: layout.renderPage,
    outDir,
    writeFile: async (rel, html) => {
      const full = path.join(outDir, rel);
      await mkdir(path.dirname(full), { recursive: true });
      await fsWriteFile(full, html);
    },
  });
  console.log(`quote page for ${products.length} products → ${quoteEmail(site)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  runStandalone().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
