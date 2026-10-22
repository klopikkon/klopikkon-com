/**
 * Headless review. Not used by the static build.
 * Requires puppeteer-core (dev only) and system Chrome.
 * Does not submit quote forms, create accounts, or open robots-disallowed paths.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire("/tmp/amt-tools/package.json");
const puppeteer = require("puppeteer-core");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const SHOTS = path.join(ROOT, "shots");
const CAPTURES = path.join(ROOT, "data/captures");
const QUERIES = ["474922-26-4", "DSPE-PEG2000", "mPEG-NHS", "Cy5", "pinacol boronate"];

const SITES = [
  {
    id: "amt",
    home: "https://www.amtechpl.com/",
    product: "https://www.amtechpl.com/peg-reagents-and-linkers/",
    search: true,
  },
  {
    id: "broadpharm",
    home: "https://broadpharm.com/",
    product: "https://broadpharm.com/product/bp-25269",
    search: true,
  },
  {
    id: "jenkem",
    home: "https://jenkemusa.com/",
    product: "https://jenkemusa.com/product/methoxy-peg-dspe",
    search: true,
  },
  {
    id: "creativepeg",
    home: "https://creativepegworks.com/",
    product: "https://creativepegworks.com/product/mpeg-dspe-mw-2k",
    search: true,
  },
  {
    id: "avanti",
    home: "https://www.avantiresearch.com/en-gb",
    product: "https://www.avantiresearch.com/en-gb/products/product/880120-180-peg2000-pe-ammonium-salt",
    search: true,
  },
  {
    id: "cayman",
    home: "https://www.caymanchem.com/",
    product: "https://www.caymanchem.com/product/28181/dspe-mpeg-2000-sodium-salt",
    search: true,
    searchUrl: (q) => `https://www.caymanchem.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "tci",
    home: "https://www.tcichemicals.com/US/en/",
    product: "https://www.tcichemicals.com/US/en/p/A2420",
    search: false,
    searchSkip: "Homepage and robots.txt returned Akamai Access Denied during discovery. Search was not run.",
  },
  {
    id: "sigma",
    home: "https://www.sigmaaldrich.com/US/en",
    product: "https://www.sigmaaldrich.com/US/en/product/aldrich/718513",
    search: true,
    fetchRobots: "https://www.sigmaaldrich.com/robots.txt",
  },
  {
    id: "lumiprobe",
    home: "https://www.lumiprobe.com/",
    product: "https://www.lumiprobe.com/p/cy5-nhs-ester",
    search: true,
  },
  {
    id: "boc",
    home: "https://www.bocsci.com/",
    product: "https://www.bocsci.com/product/dppe-mpeg-cas-205494-72-0-254018.html",
    search: false,
    searchSkip: "robots.txt disallows */search and *?. Search URLs were not requested.",
  },
  {
    id: "biochempeg",
    home: "https://www.biochempeg.com/",
    product: "https://www.biochempeg.com/product/DSPE-PEG-Mal.html",
    search: false,
    searchSkip: "robots.txt disallows /search.do and /Search.do. The search form was not submitted.",
  },
  {
    id: "nanocs",
    home: "https://www.nanocs.net/",
    product: "https://www.nanocs.net/DSPE-PEG2000-Maleimide-2k.htm",
    search: false,
    searchSkip: "robots.txt disallows /*?route=product/search. The search form was not submitted.",
  },
  {
    id: "aatbio",
    home: "https://www.aatbio.com/",
    product: "https://www.aatbio.com/products/ifluor-488-succinimidyl-ester",
    search: true,
  },
];

const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

await fs.mkdir(SHOTS, { recursive: true });
await fs.mkdir(CAPTURES, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function snap(page, name) {
  const file = path.join(SHOTS, name);
  await page.screenshot({ path: file, type: "jpeg", quality: 58 });
  return `shots/${name}`;
}

async function dismissCookies(page) {
  const clicked = await page.evaluate(() => {
    const labels = ["i understand", "accept all", "accept", "agree", "allow all", "got it", "allow cookies", "ok"];
    const nodes = [...document.querySelectorAll("button, a, input[type=button], input[type=submit]")];
    for (const node of nodes) {
      const text = (node.innerText || node.value || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!text || text.length > 40) continue;
      if (labels.includes(text)) {
        node.click();
        return text;
      }
    }
    return null;
  });
  if (clicked) await sleep(600);
  return clicked;
}

async function pageFacts(page) {
  return page.evaluate(() => {
    const text = (document.body?.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, 7000);
    const interesting = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /cas|molecular|mol\.?\s*wt|formula|purity|sds|coa|certificate|structure|\$|usd|eur|price|quote|pack|mg\b|g\b/i.test(line))
      .slice(0, 50);
    const controls = [...document.querySelectorAll("a, button")]
      .map((el) => ({
        tag: el.tagName,
        text: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 90),
        href: el.href || "",
      }))
      .filter((item) => /quote|cart|add to|enquir|inquir|pricing|request|sds|coa|buy|order|basket/i.test(item.text))
      .slice(0, 30);
    const selects = [...document.querySelectorAll("select")].map((el) => ({
      name: el.getAttribute("name") || el.getAttribute("aria-label") || el.id || "",
      options: [...el.options].slice(0, 12).map((opt) => opt.text.trim()).filter(Boolean),
    }));
    const legends = [...document.querySelectorAll("fieldset legend, [class*=facet] legend, [class*=filter] h2, [class*=filter] h3")]
      .map((el) => (el.innerText || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 20);
    return {
      title: document.title,
      text,
      interesting,
      controls,
      selects: selects.slice(0, 15),
      legends,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
}

async function openPage(page, url) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await sleep(2200);
  const cookie = await dismissCookies(page);
  await sleep(400);
  return {
    url: page.url(),
    status: response ? response.status() : null,
    cookie,
  };
}

async function runSearch(page, site) {
  if (!site.search) {
    return { skipped: true, reason: site.searchSkip, queries: [] };
  }
  if (site.fetchRobots) {
    try {
      const robotsPage = await browser.newPage();
      await robotsPage.setUserAgent(DESKTOP_UA);
      const response = await robotsPage.goto(site.fetchRobots, { waitUntil: "domcontentloaded", timeout: 30000 });
      const body = await robotsPage.evaluate(() => document.body?.innerText?.slice(0, 2500) || "");
      await robotsPage.close();
      const disallowSearch = /disallow:\s*[^\n]*search/i.test(body);
      site._robotsText = body.slice(0, 1500);
      site._robotsStatus = response ? response.status() : null;
      if (disallowSearch) {
        return {
          skipped: true,
          reason: `robots.txt (${site._robotsStatus}) contains a Disallow rule mentioning search. Search was not run.`,
          robotsExcerpt: site._robotsText,
          queries: [],
        };
      }
    } catch (err) {
      site._robotsError = String(err).slice(0, 300);
    }
  }
  const queries = [];
  for (const query of QUERIES) {
    try {
      if (site.searchUrl) {
        const nav = await openPage(page, site.searchUrl(query));
        const facts = await pageFacts(page);
        let shot = null;
        if (query === "DSPE-PEG2000" || query === "474922-26-4") {
          shot = await snap(page, `${site.id}-search-${query === "474922-26-4" ? "cas" : "dspe"}-desktop.jpg`);
        }
        queries.push({ query, finalUrl: nav.url, status: nav.status, title: facts.title, text: facts.text.slice(0, 2500), interesting: facts.interesting, shot });
      } else {
        await openPage(page, site.home);
        const found = await page.evaluate(() => {
          const selectors = [
            'input[type="search"]',
            'input[name="s"]',
            'input[name="q"]',
            'input[name="query"]',
            'input[name="keyword"]',
            'input[placeholder*="Search" i]',
            'input[aria-label*="Search" i]',
            'input[id*="search" i]',
          ];
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) return selector;
          }
          return null;
        });
        if (!found) {
          queries.push({ query, error: "No search field found on the home page after cookie dismissal." });
          break;
        }
        const action = await page.$eval(found, (el) => {
          const form = el.closest("form");
          return form ? form.getAttribute("action") || "" : "";
        });
        if (/search\.do|route=product\/search|\/search\.jsp/i.test(action)) {
          return {
            skipped: true,
            reason: `Search form action “${action}” matches a disallowed path. Not submitted.`,
            queries,
          };
        }
        await page.click(found, { clickCount: 3 });
        await page.type(found, query, { delay: 15 });
        await Promise.all([
          page.keyboard.press("Enter"),
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => null),
        ]);
        await sleep(2000);
        const facts = await pageFacts(page);
        let shot = null;
        if (query === "DSPE-PEG2000" || query === "474922-26-4") {
          shot = await snap(page, `${site.id}-search-${query === "474922-26-4" ? "cas" : "dspe"}-desktop.jpg`);
        }
        queries.push({
          query,
          field: found,
          formAction: action,
          finalUrl: page.url(),
          title: facts.title,
          text: facts.text.slice(0, 2500),
          interesting: facts.interesting,
          shot,
        });
      }
      await sleep(1200);
    } catch (err) {
      queries.push({ query, error: String(err).slice(0, 400) });
    }
  }
  return { skipped: false, robotsExcerpt: site._robotsText || null, robotsStatus: site._robotsStatus || null, robotsError: site._robotsError || null, queries };
}

for (const site of SITES) {
  const outPath = path.join(CAPTURES, `${site.id}.json`);
  console.log("review", site.id);
  const page = await browser.newPage();
  const capture = { id: site.id, reviewedAt: new Date().toISOString(), home: {}, product: {}, mobileHome: {}, mobileProduct: {}, search: null };
  try {
    await page.setUserAgent(DESKTOP_UA);
    await page.setViewport(DESKTOP);
    const homeNav = await openPage(page, site.home);
    const homeFacts = await pageFacts(page);
    capture.home = {
      ...homeNav,
      title: homeFacts.title,
      text: homeFacts.text,
      overflow: homeFacts.overflow,
      scrollWidth: homeFacts.scrollWidth,
      controls: homeFacts.controls,
      selects: homeFacts.selects,
      legends: homeFacts.legends,
      shot: await snap(page, `${site.id}-home-desktop.jpg`),
    };
    const productNav = await openPage(page, site.product);
    const productFacts = await pageFacts(page);
    const productShot = await snap(page, `${site.id}-product-desktop.jpg`);
    await page.evaluate(() => window.scrollTo(0, 900));
    await sleep(400);
    const productShot2 = await snap(page, `${site.id}-product-desktop-scrolled.jpg`);
    capture.product = {
      ...productNav,
      title: productFacts.title,
      text: productFacts.text,
      interesting: productFacts.interesting,
      overflow: productFacts.overflow,
      controls: productFacts.controls,
      selects: productFacts.selects,
      legends: productFacts.legends,
      shots: [productShot, productShot2],
    };
    capture.search = await runSearch(page, site);

    await page.setUserAgent(MOBILE_UA);
    await page.setViewport(MOBILE);
    const mobileHome = await openPage(page, site.home);
    const mobileHomeFacts = await pageFacts(page);
    capture.mobileHome = {
      ...mobileHome,
      title: mobileHomeFacts.title,
      text: mobileHomeFacts.text.slice(0, 1800),
      overflow: mobileHomeFacts.overflow,
      scrollWidth: mobileHomeFacts.scrollWidth,
      innerWidth: mobileHomeFacts.innerWidth,
      shot: await snap(page, `${site.id}-home-mobile.jpg`),
    };
    const mobileProduct = await openPage(page, site.product);
    const mobileProductFacts = await pageFacts(page);
    capture.mobileProduct = {
      ...mobileProduct,
      title: mobileProductFacts.title,
      text: mobileProductFacts.text.slice(0, 1800),
      overflow: mobileProductFacts.overflow,
      scrollWidth: mobileProductFacts.scrollWidth,
      innerWidth: mobileProductFacts.innerWidth,
      controls: mobileProductFacts.controls,
      shot: await snap(page, `${site.id}-product-mobile.jpg`),
    };
  } catch (err) {
    capture.error = String(err).slice(0, 800);
    try {
      capture.errorShot = await snap(page, `${site.id}-error-desktop.jpg`);
    } catch {
      // page may already be closed
    }
  }
  await page.close();
  await fs.writeFile(outPath, JSON.stringify(capture, null, 2));
  console.log("wrote", outPath);
  await sleep(1500);
}

await browser.close();
console.log("review done");
