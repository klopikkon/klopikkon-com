# Price position matching

Read-only input: `amt/ranking-on-price/fragments/*.html`. This build does not modify those files.

## How a row is read

Each ranking fragment row with `row-win`, `row-lose`, or `row-split` is one breakdown.
The product cell has `.product-name` and a `.sku` span, usually `SKU · CAS … · purity`.
The colour is the row class. The pill text and any words after it are the public note.
Not-found rows often have no pill; the middle cell is the note and the row class is still the colour.
The breakdown link (`/amt/ranking-on-price/<slug>/`) is what the product page links to.

## Match order

1. Exact catalogue SKU (letters, digits, and the hyphenated suffix; case-insensitive). One SKU may appear on several fragment rows. They match only when every one of those rows points at the same breakdown slug.
2. CAS number. Every `NNNNNN-NN-N` token on the product and on the ranking SKU line is collected. The product matches when those numbers land on exactly one slug. A product with no CAS skips this step.
3. Normalised product name, then each synonym (lower case, punctuation collapsed). Used only if SKU and CAS did not hit. If the name is shared by more than one slug, it does not match. If both sides publish a CAS and none of the numbers overlap, the name does not match.

Anything else, including an ambiguous key, shows no badge.

Same-SKU catalogue rows share that SKU's badge. AMTGC125-AT15 is published twice (standard and High Purity 99%); both receive the one ranking row for that SKU.

## Badge copy

- Green `row-win`: “AMT is the cheapest published list.”
- Red `row-lose`: “A competitor publishes a lower list.”
- Amber `row-split`: “Pack-size split, analogue, or no peer.”

The ranking pill or note is appended when it adds a fact (for example a competitor pack). The page does not recompute prices and does not invent a comparison the index does not state.

## This build

- Catalogue source: `_build/fixtures/products.json`
- Ranking rows parsed: 831
- Products: 12
- Matched: 12 (100.0%)
- By SKU: 12
- By CAS: 0
- By name: 0
- Unmatched: 0
- Ambiguous (no badge): 0

### Fixture until data/products.json lands

Pages are built from `_build/fixtures/products.json` when `data/products.json` is absent. That fixture copies the homepage cards. CAS, formula, molecular weight, purity, structure image, and pack currency are unpublished on those rows, so the product page leaves them blank and JSON-LD omits offers.

A numeric price with no published currency is shown as the homepage price text. It is not given a currency.

Homepage cards and catalogue PDFs disagree for some SKUs (ALC-0315, SM-102, Lipid 5, AMTGC125-AT15, AMTGC187-AC16). This fixture follows the homepage card and does not blend a PDF price onto the same row.

