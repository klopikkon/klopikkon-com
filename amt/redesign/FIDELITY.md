# Fidelity audit

Checked 22 October 2026 against the 20 pages in `PLAN-sitemap.md`. Each live page was fetched (`Accept: text/html`, a browser user agent) and compared with the redesign: headings, paragraphs, images, contact details, and links. Copy is the published wording, including the two CRO spellings. Nothing was added that AMT has not published.

The header logo was not changed. See the logo note below.

## Logo

The live header on every page fetched today is the stacked mark, not the 2026 wordmark.

- Header image: `https://www.amtechpl.com/wp-content/uploads/2019/05/web-logo.png`
- Markup: `class="fusion-standard-logo"`, `width="183"` `height="99"`, `srcset` the same file at `1x`, `data-retina_logo_url=""`, alt `Advanced Molecular Technologies Logo`
- Favicon: `https://www.amtechpl.com/wp-content/uploads/2020/04/AMT-Logo-e1586416288420.png`
- The 2026 wordmark is a content image in the homepage partners column, linked to Frontier Specialty Chemicals, with an empty alt: `https://www.amtechpl.com/wp-content/uploads/2026/02/White-Background-Logo-no-subtitle.png_20260217_080755_0000-400x74.png` (srcset also has 200, 600, 800, and 1200 widths). The partners page uses `Frontier-logo-150x150.png` for that partner. The redesign keeps the stacked header and the Frontier logo from the partners page.

## Shared chrome

Carried in the shell header and footer: street and postal address (the same three lines), `03 9764 9220`, `+61 3 9764 9220`, `enquiries@amtechpl.com`, `sales@amtechpl.com`, and the primary catalogue labels.

Not copied, on purpose:

- The WordPress author byline “amtech pl”.
- The sidebar label “Call Now”. The redesign phone links use `tel:+61397649220`. The live pages use `tel:0397649220`.
- The live email attribute `mail:sales@amtechpl.com`. The redesign uses `mailto:`.
- The contact form’s reCAPTCHA field. This site opens an email; it does not post the form.
- The decorative hero background `molecular-bg.jpg`.

## Per page

| Live page | Redesign | Carried | Held |
| --- | --- | --- | --- |
| Home | `/` | Hero title and “Biotech Incubator and CRO”. Category links. Next-day dispatch, Frontier PEG sentence, USD $150 minimum. Delivery-truck drawing beside the dispatch line, linking to `#australia`. “Catalogue Search:” and “Search Chemical”. Five brochure links. What’s new from the 16 May 2025 flyer. Featured product names, packs, and the structure drawings the homepage shows (Desthiobiotin uses `AMTGC1441-DB25-1.jpg`). “Contract Synthesis & Analytical Services:”, both sentences, the equipment line, and the Bruker and Waters photographs from that block. Partner names. News. “Contact us today…” and “Proudly Australian owned & operated”. | The 2026 wordmark in the partners column, until you decide. The homepage partners column shows that wordmark plus Scaled Organics; this page lists the four logos from the partners page. |
| About Us | `/about/` | Aims paragraph, incubating line, service list, CRO bullets, both published CRO paragraphs (“utilize” / “organization” from About, “utilise” / “organisation” from Contract Research), tags, “Contact us for more information.”, analytical summary and the four analysis labels, equipment list. Exterior, interior, and NMR photographs from the about page. | — |
| Contact | `/contact/` | “Contact Details”, street, postal (same three lines), Australian and international phones, `sales@amtechpl.com`, and the form fields Your Name, Your Email, Your Mobile Number, Your Subject, Your Message. Send opens a mailto to sales@. `enquiries@amtechpl.com` is the header address. | Google map embed. A “Locate us” search link is used instead. reCAPTCHA, as above. |
| Contract Research | `/about/#contract-research` | Custom synthesis bullets and the contract-page paragraphs (utilise / organisation). Heading “AMT Custom Synthesis in Action:” with no further body text. Kugelrohr, reaction, and interior photographs from that page. | — |
| Analytical Services | `/about/#analytical-services` and `#analytical-equipment` | Banner line, including the published spelling “Thermogravimetic”. Each instrument heading, the NMR price lines, and “Contact Us to schedule analytical testing!”. One published photograph per instrument. The DSC heading is paired with `Thermogravimetric-Analyzer.jpg`, alt “Metler Toledo TGA”, which is how the live page places that file. | — |
| Literature | `/families/other/#organosilicons` | “Organosilicon Reagents”, HOMSi fact sheet, Corey’s Disilane (title still starts at “2-Methoxyphenyl”, as published), Dondoni, and both DOI links. | — |
| News | `/#news` | Frontier (20 November 2025), IDT (22 December 2023, including “AMT and IDT Australia able to”), and Key Organics (2 September 2013), with the published paragraphs. | — |
| Partners | `/#partners` | The crawled partners page has no body copy. The four published logos and outbound links are listed: Scaled Organics, AK Scientific, Key Organics, Frontier Specialty Chemicals. | — |
| Australian customers | `/#australia` | The offers heading, free delivery over $250.00 AUD, next-day dispatch before 12-noon, local product storage, and “Please get in touch for more details!”. | The page’s only photograph is the Scoresby exterior. That file is on the about page, which publishes the same picture. |
| Structure search | Link to `https://www.amtechpl.com/structure-search/` | The live page is a ChemExper iframe (`https://newsearch.chemexper.com/misc/hosted/amtechpl`) plus a quick-search frame. The redesign links out and does not host the iframe. | Iframe. |
| General Chemicals | `/families/other/#general-chemicals` | Heading. The live page is the shared catalogue menu and has no product rows. | — |
| Organoborons | `/families/organoborons/` | Catalogue, paginated, with the brochure. The live page is the shared menu. | — |
| Organosilicons | `/families/other/#organosilicons` | Heading, plus the literature section. | — |
| Nucleosides | `/families/other/#nucleosides` | Heading. Empty on the live site. | — |
| Halogenated Organics | `/families/other/#halogenated-organics` | Heading. Empty on the live site. | — |
| Diaryls | `/families/other/#diaryls` | Heading. Empty on the live site. | — |
| Catalysts | `/families/other/#catalysts` | Heading. Empty on the live site. | — |
| Bioactives | `/families/other/#bioactives` | Heading. Empty on the live site. | — |
| PEG Reagents and Linkers | `/families/peg/` | Catalogue, paginated, with the Frontier sentence and the 2026 brochure. | — |
| Fluorophores and Dyes | `/families/fluorophores/` | Catalogue, paginated, with the 2026 brochure. | — |

Lipids are not one of the 20 pages. They stay at `/families/lipids/` from the 26 August 2026 brochure.

Photographs were saved unaltered under `assets/photos/` from the `src` URLs on those pages. Partner logos and the delivery truck were already in `assets/logos/`.
