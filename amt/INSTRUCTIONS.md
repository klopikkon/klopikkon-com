# AMT ranking pages — standing instructions

Site root: `https://klopikkon.com/amt/ranking-on-price/`
Repo: `klopikkon/klopikkon-com` under `amt/`.

## Ranking is unlisted

- `/amt/ranking-on-price/` stays reachable by direct URL (and old winning/losing/unique redirects).
- Every ranking HTML page already has `noindex,nofollow`.
- Do **not** link Ranking from `/amt/` overview nav/cards, `/amt/one-price-list/`, `/hello`, or root.
- Keep internal ranking ↔ breakdown links so the index still works when you have the URL.

## Every product on the ranking index MUST have a breakdown page

When a SKU is added to `amt/ranking-on-price/index.html`:

1. Create `amt/ranking-on-price/<slug>/index.html` in the same commit or immediately after.
2. Put a **breakdown** link on that index row. No row without a link.
3. The breakdown page always has two tables:
   - **Price** — supplier, SKU, pack, list price + currency, purity, live product/catalog link, catalog date if the price came from a PDF.
   - **Purity vs AMT** — higher / lower / same / unpublished.
4. Do not invent prices. Unpublished competitor cards = “quote only”.
5. Exact CAS / structure first. Closest analogue is allowed only if the CAS difference is stated in the lede.

## Keep a running “not found at competitors” list

If Broadpharm, JenKem, Creative PEGWorks, Avanti, Cayman, TCI, Sigma, Lumiprobe, Vector, GlpBio, TargetMol, Thermo, BOC Sciences, Kerafast, Biosynth, Quanta, and AKSci/Frontier do not publish the same CAS or the same structure:

- Still create the breakdown page.
- The price table has AMT only, plus a row that says **no public peer found** and the houses searched.
- Add or keep the SKU on the index section **Not found at competitors**.
- Do not delete a “not found” row later without a dated re-search note.

## Rank colours

- Green / `row-win` / `rank-win` — AMT cheapest published list on a matched pack.
- Red / `row-lose` / `rank-lose` — a competitor prints a lower list.
- Amber / `row-split` / `rank-split` — pack-size split, analogue-only peer, or CAS still unchecked.

## Sources to re-read, not guess

- Lipids: https://www.amtechpl.com/wp-content/uploads/2026/08/AMT-Lipids-20260826.pdf
- PEGs: https://www.amtechpl.com/wp-content/uploads/2026/09/AMT-PEG-Reagents-and-Linkers-Catalogue-List-20260903.pdf
- Dyes: https://www.amtechpl.com/wp-content/uploads/2026/01/AMT-FluorophoresDyes-Catalogue-List-2026.pdf
- Borons: https://www.amtechpl.com/wp-content/uploads/2026/04/AMT-Organoboron-Compounds-List-20260421.pdf
- Homepage featured cards (prices can differ from the PDF).

## Watcher webhook (fire immediately; do not wait for a nudge)

When ANY of these happen, POST the watcher webhook immediately (GET ok if POST fails):

- (a) a ranking batch is committed/published to https://klopikkon.com/amt/ranking-on-price/
- (b) you stall waiting for the next instruction
- (c) you hit usage / rate limits

Webhook URL and Authorization bearer token are **secrets**. Do not commit them.

- URL: set `AMT_WATCHER_WEBHOOK_URL` (Cursor automation webhook).
- Auth: `Authorization: Bearer $AMT_WATCHER_TOKEN`.
- Store both only in a private env / password manager / GitHub Actions secret. Never in this file, `AGENTS.md`, chat logs that get committed, or the public site.

JSON body examples:

```json
{"event":"batch_done","family":"PEGs","note":"what just finished"}
{"event":"stalled","note":"waiting for next continue"}
{"event":"usage_exhausted","note":"hit rate limit"}
```

Do not wait for a human nudge between batches — fire the webhook, then wait for the next continue instruction in chat.

## Do not

- Link Winning / Losing / Unique pages (they redirect to ranking).
- Dump every commodity pinacol ester from the 120-page boron book.
- Treat analogue CAS as a win/loss without saying so.
- Touch `/hello` or `/energy`.

## Prospects page (unlisted + password)

- Live: https://klopikkon.com/amt/prospects/
- Unlisted. Do **not** link from `/hello`, root, or the public `/amt/` ranking nav.
- Password unlock uses PBKDF2 + AES-GCM (`prospects.enc`), same pattern as `/energy/`.
- Source of truth for the account list: AMT account scout Drive folder **AMT accounts**.
- When the scout list updates, export JSON and republish with `amt/prospects/publish.py` (secrets `AMT_PROSPECTS_PASSWORD`, `AMT_PROSPECTS_SALT`, `GH_PAT` — never commit those, never put webhook secrets in this tree).
- See `amt/prospects/README.md` for the JSON shape.
