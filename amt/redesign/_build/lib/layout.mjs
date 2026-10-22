import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { esc } from "./html.mjs";
import { canonical, normalizePath, url } from "./paths.mjs";

const redesignRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Product pages ship this later. Omit the tag until the file exists so a 404 cannot fail the console audit. */
function serviceWorkerScript() {
  const rel = "js/sw-register.js";
  if (!existsSync(join(redesignRoot, rel))) return "";
  return `\n  <script type="module" src="${url(rel)}"></script>`;
}

let siteContext = null;

/** Called by the build before page generators run. */
export function configure({ site }) {
  siteContext = site;
}

function site() {
  if (!siteContext) throw new Error("layout.configure({ site }) must run before renderPage");
  return siteContext;
}

function itemHref(item) {
  if (item.href) return item.href;
  return url(item.path || "");
}

function itemCurrent(item, current) {
  if (item.href || item.path == null) return false;
  if (String(item.path).includes("#")) return false;
  const itemPath = normalizePath(item.path);
  if (itemPath === "/") return current === "/";
  return current === itemPath || current.startsWith(itemPath);
}

function navItems(items, current) {
  return items
    .map((item) => {
      if (Array.isArray(item.children) && item.children.length) {
        const childCurrent = item.children.some((child) => itemCurrent(child, current));
        const links = item.children
          .map((child) => {
            const currentAttr = itemCurrent(child, current) ? ' aria-current="page"' : "";
            const external = child.href ? ' rel="noopener noreferrer"' : "";
            return `<li><a href="${esc(itemHref(child))}"${currentAttr}${external}>${esc(child.label)}</a></li>`;
          })
          .join("");
        return `<li class="nav-sub"><details${childCurrent ? " open" : ""}><summary>${esc(item.label)}</summary><ul>${links}</ul></details></li>`;
      }
      const currentAttr = itemCurrent(item, current) ? ' aria-current="page"' : "";
      const external = item.href ? ' rel="noopener noreferrer"' : "";
      return `<li><a href="${esc(itemHref(item))}"${currentAttr}${external}>${esc(item.label)}</a></li>`;
    })
    .join("");
}

function header(current) {
  const data = site();
  const contact = data.contact;
  const phoneHref = `tel:${String(contact.phoneTel || "").replace(/\s+/g, "")}`;
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap utility">
    <p class="utility-contact">
      <a href="${esc(phoneHref)}">${esc(contact.phoneAu)}</a>
      <span aria-hidden="true">·</span>
      <a href="mailto:${esc(contact.emailEnquiries)}">${esc(contact.emailEnquiries)}</a>
    </p>
    <button type="button" class="theme-toggle" data-theme-toggle aria-pressed="false" aria-label="Switch to dark theme">
      <span class="when-light">Dark theme</span>
      <span class="when-dark">Light theme</span>
    </button>
  </div>
  <div class="wrap brand-bar">
    <a class="brand" href="${url("")}">
      <span class="brand-mark"><img class="logo" src="${url("assets/amt-logo.png")}" width="183" height="99" alt=""></span>
      <span class="brand-name">${esc(data.name)}</span>
    </a>
    <form class="search" role="search" action="${url("catalogue/")}" method="get">
      <label class="visually-hidden" for="site-search">Search catalogue</label>
      <input id="site-search" name="q" type="search" placeholder="Name / Formula / CAS" enterkeyhint="search" autocomplete="off">
      <button class="btn btn-primary" type="submit">Search</button>
    </form>
  </div>
  <div class="wrap menu-bar">
    <input class="nav-toggle" type="checkbox" id="nav-toggle">
    <label class="nav-toggle-label" for="nav-toggle"><span class="menu-open">Menu</span><span class="menu-close">Close</span></label>
  </div>
  <nav class="site-nav" aria-label="Primary">
    <div class="wrap">
      <ul class="nav-list">${navItems(data.nav || [], current)}</ul>
    </div>
  </nav>
</header>`;
}

function footer(current) {
  const data = site();
  const contact = data.contact;
  const links = (data.footerNav || [])
    .map((item) => {
      const currentAttr = itemCurrent(item, current) ? ' aria-current="page"' : "";
      const external = item.href ? ' rel="noopener noreferrer"' : "";
      return `<li><a href="${esc(itemHref(item))}"${currentAttr}${external}>${esc(item.label)}</a></li>`;
    })
    .join("");
  const phoneHref = `tel:${String(contact.phoneTel || "").replace(/\s+/g, "")}`;
  return `<footer class="site-footer">
  <div class="wrap">
    <p class="concept-note">${esc(data.conceptNote)} <a href="${esc(data.officialUrl)}" rel="noopener noreferrer">Official AMT site</a></p>
    <div class="footer-grid">
      <div>
        <p class="footer-name">${esc(data.legalName)}</p>
        <address>
          ${esc(contact.street[0])}<br>
          ${esc(contact.street[1])}<br>
          ${esc(contact.street[2])}
        </address>
        <p><a href="${esc(contact.mapUrl)}" rel="noopener noreferrer">Locate us</a></p>
      </div>
      <div>
        <p><span class="footer-label">Within Australia</span><br><a href="${esc(phoneHref)}">${esc(contact.phoneAu)}</a></p>
        <p><span class="footer-label">International</span><br><a href="${esc(phoneHref)}">${esc(contact.phoneIntl)}</a></p>
        <p><span class="footer-label">Email</span><br>
          <a href="mailto:${esc(contact.emailEnquiries)}">${esc(contact.emailEnquiries)}</a><br>
          <a href="mailto:${esc(contact.emailSales)}">${esc(contact.emailSales)}</a>
        </p>
      </div>
      <nav aria-label="Footer">
        <ul class="footer-links">${links}</ul>
      </nav>
    </div>
    <p class="copyright">${esc(data.copyright)}</p>
  </div>
</footer>`;
}

const THEME_BOOT = `<script>
(function () {
  var theme = "light";
  try {
    var stored = localStorage.getItem("amt-theme");
    if (stored === "light" || stored === "dark") theme = stored;
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) theme = "dark";
  } catch (e) {}
  document.documentElement.setAttribute("data-theme", theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0e141c" : "#f3f0e8");
})();
</script>`;

/**
 * @param {{ title: string, description: string, path: string, body: string, head?: string }} page
 * @returns {string} full HTML document
 */
export function renderPage({ title, description, path, body, head = "" }) {
  const data = site();
  const current = normalizePath(path);
  const fullTitle = /Advanced Molecular Technologies|\bAMT\b/.test(title)
    ? title
    : `${title} · Advanced Molecular Technologies`;
  const assetCss = (file) => url(`css/${file}`);
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="noindex,nofollow">
  <link rel="canonical" href="${esc(canonical(path))}">
  <meta name="theme-color" content="#f3f0e8">
  <link rel="icon" href="${url("assets/amt-logo.png")}" type="image/png">
  ${THEME_BOOT}
  <link rel="stylesheet" href="${assetCss("tokens.css")}">
  <link rel="stylesheet" href="${assetCss("base.css")}">
  <link rel="stylesheet" href="${assetCss("components.css")}">
  <link rel="stylesheet" href="${assetCss("print.css")}" media="print">
  ${head}
</head>
<body>
  ${header(current)}
  <main id="main" tabindex="-1">
    ${body}
  </main>
  ${footer(current)}
  <script type="module" src="${url("js/theme.js")}"></script>${serviceWorkerScript()}
</body>
</html>
`;
}
