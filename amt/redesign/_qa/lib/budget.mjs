/**
 * Performance budget for the concept redesign.
 * Keep the table in amt/redesign/QA.md in sync with these numbers.
 *
 * SEO is intentionally absent: every page must send noindex,nofollow,
 * so Lighthouse SEO (is-crawlable) stays low and is not a gate.
 */
export const BUDGET = {
  mobile: {
    performance: 90,
    accessibility: 95,
    "best-practices": 90,
    lcp: 2500,
    cls: 0.1,
    tbt: 200,
  },
  desktop: {
    performance: 90,
    accessibility: 95,
    "best-practices": 90,
    lcp: 2000,
    cls: 0.1,
    tbt: 150,
  },
};

/** Best-practices audits that fail only because the local server is plain HTTP. */
export const LOCAL_HTTP_BP_AUDITS = new Set(["is-on-https", "redirects-http"]);

export const RUNS = 3;
