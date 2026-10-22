/**
 * Registers the redesign service worker, scoped to /amt/redesign/.
 * layout.mjs includes this script when the file is present.
 */
const SCOPE = "/amt/redesign/";

if ("serviceWorker" in navigator && location.pathname.startsWith(SCOPE)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/amt/redesign/sw.js", { scope: SCOPE }).catch(() => {});
  });
}
