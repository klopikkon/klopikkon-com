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
- `synonyms` is an empty array. Parentheticals such as `(Exoria)` and `(PEG2000)` stay inside `name`.
- Unpublished prices use `price` null and `priceText` `"quote"`. `priceRaw` keeps the printed token (`POA`, `Price on application`, or a masked `########`).

## Subfamily

Each `subfamily` is the heading AMT prints above that product, copied verbatim. `subfamilySource` records where it was read. The 2026 brochures are flat lists: the running header is the only heading on the page. The site adds one finer label, `Ionisable Lipid`, on three homepage cards. Headings such as helper lipids, mPEG-NHS, Cy dyes, or boronic acid versus pinacol ester are not printed in these PDFs or on the crawled pages, so they are not assigned.

| Subfamily | Products |
| --- | ---: |
| Lipids from Advanced Molecular Technologies | 33 |
| PEG Reagents and Linkers | 212 |
| Fluorophores and Dyes | 40 |
| AMT Organoboron Catalogue List | 1046 |
| NEW PRODUCTS MAY 2025 | 7 |
| Featured Products: | 6 |
| Ionisable Lipid | 3 |


## Name-derived class

`classDerived` is a browsing facet read from the printed product name with `data/class-rules.json`. It is not an AMT heading and it is not a PubChem field. `classDerivedSource` is `"name"` when a rule matches and null otherwise. Boron class, PEG architecture and dye core run only inside the family AMT already assigned. NHS, maleimide and DBCO use the same name patterns on every family, including succinimidyl, SC, SCM, SVA, SS, 2,5-dioxopyrrolidin-1-yl, Mal, pyrrole-2,5-dione, dibenzocyclooctyne and ADIBO. A PEG product can also carry an architecture (`mPEG`, `heterobifunctional`, `multi-arm`) and azide, amine or acid. Dye cores include Cy3, Cy5, Cy5.5, Cy7, cyanine, sulfo-Cy, FITC and BODIPY. Unknowns are null.

| Family | Products | Matched | Null |
| --- | ---: | ---: | ---: |
| lipids | 36 | 0 | 36 |
| peg | 212 | 129 | 83 |
| fluorophores | 40 | 6 | 34 |
| organoborons | 1046 | 906 | 140 |
| other | 13 | 0 | 13 |
| total | 1347 | 1041 | 306 |

Organoboron class, first matching rule:

| Class | Products |
| --- | ---: |
| MIDA ester | 0 |
| trifluoroborate | 123 |
| pinacol ester | 648 |
| boronic acid | 135 |

PEG architecture. A product is counted once. Null architecture is not listed.

| Architecture | Products |
| --- | ---: |
| multi-arm | 0 |
| mPEG | 2 |
| heterobifunctional | 17 |

PEG reactive groups. A product with two groups is counted under each.

| Reactive group | Products |
| --- | ---: |
| NHS | 0 |
| maleimide | 0 |
| azide | 65 |
| DBCO | 0 |
| amine | 74 |
| acid | 5 |

NHS, maleimide and DBCO on every family. The PEG row repeats the three cells above. ADIBO is counted as DBCO.

| Family | NHS | maleimide | DBCO |
| --- | ---: | ---: | ---: |
| lipids | 0 | 0 | 0 |
| peg | 0 | 0 | 0 |
| fluorophores | 1 | 0 | 1 |
| organoborons | 1 | 2 | 0 |
| other | 0 | 0 | 0 |

Fluorophore dye core:

| Dye core | Products |
| --- | ---: |
| Cy3 | 0 |
| Cy5.5 | 0 |
| Cy5 | 0 |
| Cy7 | 0 |
| cyanine | 0 |
| FITC | 0 |
| BODIPY | 6 |


## External reference data

`formula` and `mw` are only what AMT published, and both stay null because the catalogues have no such columns. `structureImage` stays the AMT file when one was published. PubChem formula, molecular weight and the 2D depiction are `formulaExternal`, `mwExternal` and `structureImageExternal`, with `externalSource` `{name: PubChem, cid, url}`. A CAS is accepted only when PubChem returns exactly one CID. PubChem does not serve SVG. Each `structureImageExternal` file is an SVG drawn from that CID's 2D coordinates and bond annotations, one file per CID, so a page can lazy-load it. `mwNominal` is a nominal PEG mass read from the printed name (PEG2000 or PEG(400)); a short token such as PEG3 is an oligomer length and is not used.

| Family | Products | Single CAS | One CID | Formula and MW | Structure image | Nominal PEG mass |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| lipids | 36 | 33 | 6 | 6 | 6 | 2 |
| peg | 212 | 205 | 108 | 108 | 108 | 2 |
| fluorophores | 40 | 40 | 24 | 24 | 24 | 0 |
| organoborons | 1046 | 1045 | 531 | 531 | 531 | 0 |
| other | 13 | 7 | 4 | 4 | 4 | 0 |
| total | 1347 | 1330 | 673 | 673 | 673 | 4 |


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
  "discrepancies": 21,
  "pubchem": {
    "byFamily": {
      "lipids": {
        "products": 36,
        "singleCas": 33,
        "oneCid": 6,
        "formulaAndMw": 6,
        "structureImage": 6,
        "mwNominal": 2
      },
      "peg": {
        "products": 212,
        "singleCas": 205,
        "oneCid": 108,
        "formulaAndMw": 108,
        "structureImage": 108,
        "mwNominal": 2
      },
      "fluorophores": {
        "products": 40,
        "singleCas": 40,
        "oneCid": 24,
        "formulaAndMw": 24,
        "structureImage": 24,
        "mwNominal": 0
      },
      "organoborons": {
        "products": 1046,
        "singleCas": 1045,
        "oneCid": 531,
        "formulaAndMw": 531,
        "structureImage": 531,
        "mwNominal": 0
      },
      "other": {
        "products": 13,
        "singleCas": 7,
        "oneCid": 4,
        "formulaAndMw": 4,
        "structureImage": 4,
        "mwNominal": 0
      },
      "total": {
        "products": 1347,
        "singleCas": 1330,
        "oneCid": 673,
        "formulaAndMw": 673,
        "structureImage": 673,
        "mwNominal": 4
      }
    }
  },
  "bySubfamily": {
    "Lipids from Advanced Molecular Technologies": 33,
    "PEG Reagents and Linkers": 212,
    "Fluorophores and Dyes": 40,
    "AMT Organoboron Catalogue List": 1046,
    "NEW PRODUCTS MAY 2025": 7,
    "Featured Products:": 6,
    "Ionisable Lipid": 3
  },
  "classDerived": {
    "derivedFrom": "name",
    "rules": "data/class-rules.json",
    "note": "Not an AMT heading. Counted from the printed name with data/class-rules.json. Null means no rule matched. Reactive-group counts are products whose name includes that group, so one product can be counted under more than one group. NHS, maleimide and DBCO are counted in every family. ADIBO is counted as DBCO.",
    "byFamily": {
      "lipids": {
        "products": 36,
        "matched": 0,
        "null": 36,
        "reactiveGroups": {
          "NHS": 0,
          "maleimide": 0,
          "DBCO": 0
        }
      },
      "peg": {
        "products": 212,
        "matched": 129,
        "null": 83,
        "architecture": {
          "multi-arm": 0,
          "mPEG": 2,
          "heterobifunctional": 17
        },
        "reactiveGroups": {
          "NHS": 0,
          "maleimide": 0,
          "azide": 65,
          "DBCO": 0,
          "amine": 74,
          "acid": 5
        }
      },
      "fluorophores": {
        "products": 40,
        "matched": 6,
        "null": 34,
        "dyeCore": {
          "Cy3": 0,
          "Cy5.5": 0,
          "Cy5": 0,
          "Cy7": 0,
          "cyanine": 0,
          "FITC": 0,
          "BODIPY": 6
        },
        "reactiveGroups": {
          "NHS": 1,
          "maleimide": 0,
          "DBCO": 1
        }
      },
      "organoborons": {
        "products": 1046,
        "matched": 906,
        "null": 140,
        "boronClass": {
          "MIDA ester": 0,
          "trifluoroborate": 123,
          "pinacol ester": 648,
          "boronic acid": 135
        },
        "reactiveGroups": {
          "NHS": 1,
          "maleimide": 2,
          "DBCO": 0
        }
      },
      "other": {
        "products": 13,
        "matched": 0,
        "null": 13,
        "reactiveGroups": {
          "NHS": 0,
          "maleimide": 0,
          "DBCO": 0
        }
      },
      "total": {
        "products": 1347,
        "matched": 1041,
        "null": 306
      }
    }
  }
}
-->
