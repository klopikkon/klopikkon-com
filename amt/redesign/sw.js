/**
 * Offline cache for the AMT concept redesign.
 * Scope is /amt/redesign/ because this file is served from that directory.
 * HTML is network-first. The shell and the catalogue index are precached.
 * A product page is stored only after it has been opened.
 * mailto URLs are never cached.
 */
const CACHE = "amt-redesign-v1";
const SCOPE = "/amt/redesign/";

const SHELL = [
  "/amt/redesign/",
  "/amt/redesign/index.html",
  "/amt/redesign/catalogue/",
  "/amt/redesign/catalogue/index.html",
  "/amt/redesign/catalogue/index.json",
  "/amt/redesign/css/tokens.css",
  "/amt/redesign/css/base.css",
  "/amt/redesign/css/components.css",
  "/amt/redesign/css/print.css",
  "/amt/redesign/css/catalogue.css",
  "/amt/redesign/css/product.css",
  "/amt/redesign/css/quote.css",
  "/amt/redesign/js/theme.js",
  "/amt/redesign/js/cart.js",
  "/amt/redesign/js/search.js",
  "/amt/redesign/assets/amt-logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("amt-redesign-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isHtml(request) {
  if (request.mode === "navigate" || request.destination === "document") return true;
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) return true;
  const path = new URL(request.url).pathname;
  return path.endsWith("/") || path.endsWith(".html");
}

function cacheable(request) {
  if (request.method !== "GET") return false;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  if (url.protocol === "mailto:") return false;
  if (url.href.toLowerCase().includes("mailto:")) return false;
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith(SCOPE)) return false;
  if (url.pathname.endsWith("/sw.js") || url.pathname.endsWith("/js/sw-register.js")) return false;
  return true;
}

function shouldStore(request, response) {
  if (!response || !response.ok || !cacheable(request)) return false;
  const path = new URL(request.url).pathname;
  if (isHtml(request)) return path.startsWith("/amt/redesign/products/");
  return /\.(css|js|png|webp|svg|jpe?g|json|woff2?)$/i.test(path);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (shouldStore(request, fresh)) await cache.put(request, fresh.clone());
    return fresh;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (isHtml(request)) {
      return new Response("This page has not been saved for offline use.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (shouldStore(request, fresh)) await cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  if (!cacheable(event.request)) return;
  event.respondWith(isHtml(event.request) ? networkFirst(event.request) : cacheFirst(event.request));
});
