# Catalogue counts

Crawled 2026-10-22 from https://www.amtechpl.com/. Prices, CAS numbers, purities and pack sizes are copied from the text layer of the PDFs linked on the homepage, plus the homepage featured cards. Nothing in this file was inferred to fill a blank.

## Unique products

Total unique SKUs: **1347**.

| Family | Products |
| --- | ---: |
| lipids | 36 |
| peg | 212 |
| fluorophores | 40 |
| organoborons | 1046 |
| other | 13 |

## Rows by source

Extracted rows are catalogue lines before identical repeats were collapsed. Unique products are one record per SKU after that collapse. When a SKU is printed in more than one current brochure, the primary source follows this order: lipids, PEG, fluorophores, organoborons, then the May 2025 flyer. Those four brochures are parallel catalogues linked together on the homepage, not successive editions of one list.

| Source | Extracted rows | Unique SKUs whose primary source is this file |
| --- | ---: | ---: |
| Lipids PDF 26 Aug 2026 | 36 | 36 |
| PEG PDF 3 Sep 2026 | 217 | 212 |
| Fluorophores & dyes PDF (media date 9 Jan 2026) | 40 | 40 |
| Organoborons PDF 21 Apr 2026 | 1056 | 1046 |
| New products flyer 16 May 2025 | 9 | 7 |
| Homepage featured cards only | — | 6 |

Homepage featured cards parsed: 12.

## Reconciliation

Family pages (`/organoborons/`, `/peg-reagents-and-linkers/`, and the other product-menu pages) publish no SKU table. Their live HTML is the shared catalogue menu. The homepage links five files and that is the product corpus: four 2026 catalogues and the May 2025 new-products flyer.

The same SKU printed twice with the same name, CAS, purity and packs was collapsed to one product. Page-boundary repeats in the organoboron PDF (a row reprinted at the top of the next page) are in this set, as is one same-page duplicate.

| SKU | Source | Pages | Why collapsed |
| --- | --- | --- | --- |
| AMTB661-BE13 | organoborons-20260421 | 56, 57 | repeated at a page boundary |
| AMTB872-BU14 | organoborons-20260421 | 75, 75 | same-page duplicate row |
| AMTB1015-IM14 | organoborons-20260421 | 86, 87 | repeated at a page boundary |

Four PEG SKUs are printed as two different rows (a second row marked High Purity). Both rows are kept. `packs` lists every published pack and sets `listing` so the prices are not merged. Top-level `purity` is null when the rows disagree; each listing keeps the purity string that row actually prints (`High Purity 99%` or `High purity 98%`).

| SKU | Listings |
| --- | --- |
| AMTGC125-AT15 | p.1 purity not printed: 5g $65.00, 25g $240.00; p.1 High Purity 99%: 5g $150.00, 25g $450.00 |
| AMTGC156-AA15 | p.1 purity not printed: 5g $90.00, 25g $240.00; p.1 High Purity 99%: 5g $210.00, 25g $630.00 |
| AMTGC261-TA17 | p.2 purity not printed: 1g $80.00, 5g $240.00; p.2 High Purity 99%: 1g $90.00, 5g $270.00 |
| AMTGC281-AP17 | p.3 purity not printed: 1g $64.00, 5g $194.00; p.3 High purity 98%: 1g $98.00, 5g $294.00 |

Homepage featured prices are stored on `homepagePacks` and do not replace the catalogue packs. The cards do not print a currency. Where the same pack size is on the card and in the PDF, numeric differences are below. A card that shows a subset of the PDF packs is listed only when a shown price disagrees or a shown size is absent from the PDF.

| SKU | What the homepage prints | Catalogue |
| --- | --- | --- |
| AMTGC903-AL21 | 500 mg $310 | [250] |
| AMTGC903-AL21 | 1 g $470 | [430] |
| AMTGC936-SM21 | 500 mg $420 | [410] |
| AMTGC936-SM21 | 1 g $680 | [690] |
| AMTGC125-AT15 | 5 g $80 | [65, 150] |
| AMTGC125-AT15 | 25 g $202 | [240, 450] |
| AMTGC187-AC16 | 1 g $80 | [90] |
| AMTGC187-AC16 | 5 g $240 | [270] |

When a SKU is in more than one current file, `packs`, `name`, `cas`, `purity` and `family` come from the primary brochure in the order above. The other row is kept on `alsoListedIn` and is not overwritten. The May 2025 flyer does not replace a 2026 brochure. Flyer-only SKUs stay in family `other` with `name` null, because that flyer prints structures and CAS numbers, not names. Six homepage featured cards are not in any of these PDFs; their family is `other` and their card prices are the only packs, with `currency` null because the card does not name a currency.

Flyer-only SKUs: AMTGC1457-FI25, AMTGC1458-PP25, AMTGC1459-AT25, AMTGC1460-DH25, AMTGC1462-AH25, AMTGC1464-TH25, AMTGC1465-NM25.

Cross-source pack differences: 4. See `data/discrepancies.json`.

## Fields left null

- `formula` and `mw` are null for every product. The catalogues do not have formula or molecular-weight columns. Atom labels inside structure drawings were not OCR'd into those fields. Where those labels share the body font size and sit between the name and the SKU, they are dropped from `name` by left-margin position. The name string is the left-hand text only.
- Some dye names end in `diazaborinin-4-ium-5-uide`. That is the PDF text layer (the syllable between `diaza` and `inin` is not in the text). It is stored as printed.
- Three organoboron packs have size `"25"` with no unit: AMTB1060-MP14, AMTB1062-IP14, AMTB1249-IB18. The unit glyph is not in the text layer, so the size is the digits that are. AMTGC1460-DH25 on the flyer prints `5mg` at $315; that token is stored as printed.
- `purity` is null when the source row does not print one. The PEG, fluorophore and organoboron tables have no purity column. The lipids table prints one, copied with its spacing (for example `≥ 98%`). Four PEG rows add a `High Purity 99%` or `High purity 98%` line; that string is stored on the listing.
- `documents.sds`, `documents.coa` and `documents.datasheet` are null. The crawled pages and current PDFs do not link SDS, COA or datasheet files.
- `subfamily` is null. The current PDFs are flat lists; the homepage tag `Ionisable Lipid` is on `homepageLabels`, not promoted to a subfamily.
- `synonyms` is an empty array. Parentheticals such as `(Exoria)` and `(PEG2000)` stay inside `name`.
- Unpublished prices use `price` null and `priceText` `"quote"`. `priceRaw` keeps the printed token (`POA`, `Price on application`, or a masked `########`).

## Not extracted

- Older PDFs in the WordPress media library (2020–2025 catalogues and earlier new-product flyers) are not linked from the live pages. They are listed in `data/sources.json` and were not parsed, so superseded prices are not mixed into `products.json`.
- The HOMSi fact sheet linked from the literature page is an AK Scientific method sheet, not an AMT SKU catalogue.
- ChemExper structure search is an iframe. It was not queried.
- `parse anomalies` recorded while reading tokens: 0. See `data/anomalies.json`. A non-zero count means a token did not fit CAS / purity / pack and was not guessed into a field.

<!-- counts
{
  "uniqueProducts": 1347,
  "byFamily": {
    "lipids": 36,
    "peg": 212,
    "fluorophores": 40,
    "organoborons": 1046,
    "other": 13
  },
  "byPrimarySource": {
    "lipids-20260826": 36,
    "peg-20260903": 212,
    "fluorophores-2026": 40,
    "organoborons-20260421": 1046,
    "homepage": 6,
    "new-products-20250516": 7
  },
  "extractedRowsBeforeCollapse": {
    "lipids-20260826": 36,
    "peg-20260903": 217,
    "fluorophores-2026": 40,
    "organoborons-20260421": 1056,
    "new-products-20250516": 9
  },
  "identicalRowsCollapsed": 3,
  "skusWithMultipleListings": 4,
  "parseAnomalies": 0,
  "discrepancies": 21
}
-->
