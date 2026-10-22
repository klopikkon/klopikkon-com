import { esc } from "../lib/html.mjs";
import { url } from "../lib/paths.mjs";

export async function build({ site, renderPage, writeFile }) {
  const body = `<div class="wrap page-intro prose">
  <p class="eyebrow">404</p>
  <h1>Page not found</h1>
  <p>This address is not in the concept redesign.</p>
  <p><a href="${esc(site.officialUrl)}" rel="noopener noreferrer">Official AMT site</a></p>
  <p>
    <a class="btn btn-primary" href="${url("")}">Home</a>
    <a class="btn btn-secondary" href="${url("catalogue/")}">Catalogue</a>
    <a class="btn btn-secondary" href="${url("contact/")}">Contact</a>
  </p>
</div>`;

  await writeFile("404.html", renderPage({
    title: "Page not found",
    description: "This address is not in the concept redesign.",
    path: "404.html",
    body,
  }));
}
