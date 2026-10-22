/**
 * Registers the redesign service worker, scoped to /amt/redesign/.
 * The shell agent should include this once in _build/lib/layout.mjs,
 * next to the theme script:
 * <script type="module" src="/amt/redesign/js/sw-register.js"></script>
 */
const SCOPE = "/amt/redesign/";

if ("serviceWorker" in navigator && location.pathname.startsWith(SCOPE)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/amt/redesign/sw.js", { scope: SCOPE }).catch(() => {});
  });
}
