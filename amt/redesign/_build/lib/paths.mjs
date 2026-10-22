/** Public URL prefix. GitHub Pages serves this tree from the domain root. */
export const BASE = "/amt/redesign";

export const ORIGIN = "https://klopikkon.com";

/**
 * @param {string} path site path, with or without a leading slash
 * @returns {string} path beginning with "/" and ending with "/" except for files
 */
export function normalizePath(path) {
  if (path == null || path === "" || path === "/" || path === "index.html") return "/";
  let value = String(path).trim();
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.endsWith("/index.html")) value = value.slice(0, -"index.html".length);
  const isFile = /\/[^/]+\.[a-z0-9]+$/i.test(value);
  if (!isFile && !value.endsWith("/")) value += "/";
  return value;
}

/**
 * Absolute path on this host, including the base.
 * Query strings and hashes are preserved: `catalogue/?q=cas` stays a search URL.
 */
export function url(path = "") {
  const raw = String(path ?? "");
  const hashAt = raw.indexOf("#");
  const hash = hashAt >= 0 ? raw.slice(hashAt) : "";
  const beforeHash = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const queryAt = beforeHash.indexOf("?");
  const query = queryAt >= 0 ? beforeHash.slice(queryAt) : "";
  const pathname = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;
  const normalized = normalizePath(pathname);
  const base = normalized === "/" ? `${BASE}/` : `${BASE}${normalized}`;
  return `${base}${query}${hash}`;
}

/** Canonical URL for a page path. */
export function canonical(path = "") {
  return `${ORIGIN}${url(path)}`;
}
