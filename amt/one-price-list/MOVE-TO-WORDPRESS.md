# Move the one-price-list mockup onto AMT WordPress

AMT runs WordPress. This folder is static HTML so the same markup works in Gutenberg.

## Fast path (no plugin)

1. Open https://klopikkon.com/amt/one-price-list/wordpress-block.html
2. Copy from `<!-- AMT-ONE-LIST START -->` through `<!-- AMT-ONE-LIST END -->`
3. WP admin → Pages → Add New
   - Title: Price list
   - Slug: `price-list`
4. Add a **Custom HTML** block, paste, publish
5. Appearance → Menus → add the page
6. Edit the homepage featured cards so ALC-0315, SM-102 and Azido-PEG3-amine match the list (see the red “Homepage still disagrees” table)

CSS is scoped to `.amt-one-list`. It will not restyle the rest of their theme.

WordPress often strips `<script>` for some roles. If the family filter buttons stop working after paste, the table still works. The script is optional.

## Later, if they want staff to edit rows

Install TablePress. Create a table with the same columns:

Family | Product | SKU | CAS | Grade | Packs | Source

Paste from this page. TablePress shortcode goes in the same WordPress page.

Do not keep a second price on the homepage. One list means one list.
