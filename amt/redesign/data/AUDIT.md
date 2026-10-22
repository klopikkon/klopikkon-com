# Catalogue audit

Second extract of the five PDFs, compared with `data/products.json`. The first extract (`data/extract.py`) used Poppler `pdftotext -bbox-layout`. This pass uses pdfplumber 0.11.10 (pdfminer): `extract_tables()` on the four brochures and word positions on the May 2025 flyer. The script is `data/audit_pdfplumber.py`. It does not write `products.json`.

Each PDF row was matched to `listings[]` and `alsoListedIn[]` on source and SKU. Compared fields: SKU, name, CAS, purity, pack size, price, and the printed price token.

## Rows read

| Source | Rows |
| --- | ---: |
| Lipids, 26 Aug 2026 | 36 |
| PEG, 3 Sep 2026 | 217 |
| Fluorophores, 2026 | 40 |
| Organoborons, 21 Apr 2026 | 1056 |
| New products flyer, 16 May 2025 | 9 |
| Total | 1358 |

That total matches the first extract before identical-row collapse. Three identical reprints stay collapsed (`duplicateCount` 3): AMTB661-BE13, AMTB872-BU14, AMTB1015-IM14. After `alsoListedIn` is included, no SKU is missing on either side.

## Mismatches

Automated field mismatches before any edit: **80**.

Page images of the rows that were not a spacing difference found **4** catalogue values that disagreed with the print. Those four were corrected. After the corrections, disagreements with the page image: **0**.

A second automated diff is **79**. pdfminer still disagrees with the stored text on artifacts the page image does not support changing:

| Kind | Rows | What the page shows |
| --- | ---: | --- |
| Name, space only | 47 | A line wrap or a zero-width break. The stored name is the continuous word. |
| Pack size, space only | 25 | A glyph gap (`1` then `g`) read as `1 g`. Neighbouring rows and the crop read `1g`, which is what is stored. |
| CAS, space only | 1 | AMTGC994-EE22 prints `No CAS#`. pdfminer split it as `No CAS #`. |
| Flyer size | 2 | AMTGC1459-AT25 and AMTGC1460-DH25. A structure digit was glued on, producing `31g`. The cards print `1 g` / `5 g` and `1 g` / `5mg`. |
| Masked price | 2 | AMTB1334-BB20 and AMTB1335-FL20, 25 g. The cell is hash marks. pdfminer has no price token. Stored `priceRaw` is now `########`. |
| CAS note | 1 | AMTB500-TO11. The cell is `1374215-74-3 Not Isomer Specific`. The CAS is stored, and the note is `catalogueNote`. |
| Structure label | 1 | AMTB843-MP14. A structure atom label `4` landed in the name cell. The printed name has no `4`. |

## Fixes

- **AMTB037-M06** CAS was null. Page 4 of the organoboron PDF prints `883738-27-0` on that row (the row above, AMTB036-M06, stays `364794-79-6`). `listings[0].cas` is the same value. PubChem returns one CID, 46739725, so `formulaExternal` is `C18H29BN2O2`, `mwExternal` is 316.2, and `structureImageExternal` is `assets/structures/pubchem/46739725.svg`. AMT `formula`, `mw`, and `structureImage` stay null.
- **AMTB1334-BB20** and **AMTB1335-FL20**, 25 g pack, page 113. `priceRaw` was the word `quote`. The cell is `########`. `price` stays null and `priceText` stays `quote`. The same token is on the top-level pack and the listing pack.
- **AMTGC936-SM21** PEG `alsoListedIn` name, page 15. The name cell ends `octanoate SM-102`. The stored PEG name now includes ` SM-102`. The primary name stays `SM-102` from the lipids PDF. Packs were not changed.

## Homepage cards

Twelve products have `homepagePacks`. Compared with the PDF packs, 20 card rows differ. Neither the card nor the catalogue pack was overwritten.

Price differs:

| SKU | Card | PDF |
| --- | --- | --- |
| AMTGC903-AL21 | 500 mg $310 | lipids 500mg $250 |
| AMTGC903-AL21 | 1 g $470 | lipids 1g $430 |
| AMTGC936-SM21 | 500 mg $420 | lipids 500mg $410; PEG 500mg $450 |
| AMTGC936-SM21 | 1 g $680 | lipids 1g $690 |
| AMTGC125-AT15 | 5 g $80 | PEG 5g $65 and high-purity 5g $150 |
| AMTGC125-AT15 | 25 g $202 | PEG 25g $240 and high-purity 25g $450 |
| AMTGC187-AC16 | 1 g $80 | PEG 1g $90 |
| AMTGC187-AC16 | 5 g $240 | PEG 5g $270 |

The card size is not in any of the five PDFs (homepage only, family `other`):

| SKU | Card packs |
| --- | --- |
| AMTGC1223-PL23 | 100 mg $120, 500 mg $360 |
| AMTGC1264-AH24 | 100 mg $250, 1 g $780 |
| AMTGC1266-AO24 | 1 g $120, 5 g $360 |
| AMTGC1269-CB24 | 1 g $120, 5 g $360 |
| AMTGC1441-DB25 | 10 mg $120, 25 mg $210 |
| AMTH390-DF24 | 250 mg $195, 1 g $595 |

Card currency is null. Catalogue currency on the PDF packs stays USD.
