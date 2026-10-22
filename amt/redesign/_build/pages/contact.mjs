import { paragraphs } from "../lib/html.mjs";
import { url } from "../lib/paths.mjs";
import { breadcrumbs, sourceLine } from "../lib/ui.mjs";
import { esc } from "../lib/html.mjs";

export async function build({ site, renderPage, writeFile }) {
  const contact = site.contact;
  const phoneHref = `tel:${esc(contact.phoneTel)}`;
  const body = `<div class="wrap page-intro">
  ${breadcrumbs([
    { label: "Home", href: url("") },
    { label: "Contact" },
  ])}
  <div class="prose">
    <h1>Contact</h1>
    ${paragraphs(site.company)}
  </div>
  <div class="card-grid">
    <section class="card" aria-labelledby="contact-details">
      <h2 id="contact-details">Contact Details</h2>
      <h3>Street address</h3>
      <address>
        ${esc(contact.street[0])}<br>
        ${esc(contact.street[1])}<br>
        ${esc(contact.street[2])}
      </address>
      <h3>Postal address</h3>
      <address>
        ${esc(contact.street[0])}<br>
        ${esc(contact.street[1])}<br>
        ${esc(contact.street[2])}
      </address>
      <h3>Telephone</h3>
      <p>Australian: <a href="${phoneHref}">${esc(contact.phoneAu)}</a></p>
      <p>International: <a href="${phoneHref}">${esc(contact.phoneIntl)}</a></p>
      <h3>Email address</h3>
      <p><a href="mailto:${esc(contact.emailSales)}">${esc(contact.emailSales)}</a></p>
      <p>Enquiries: <a href="mailto:${esc(contact.emailEnquiries)}">${esc(contact.emailEnquiries)}</a></p>
      <p><a href="${esc(contact.mapUrl)}" rel="noopener noreferrer">Locate us</a></p>
    </section>
    <section class="card" aria-labelledby="contact-form-heading">
      <h2 id="contact-form-heading">Contact Form</h2>
      <p class="fine">Send opens an email to ${esc(contact.emailSales)}. Nothing is stored on this site.</p>
      <form class="form" data-contact-form data-mailto="${esc(contact.emailSales)}">
        <div class="field">
          <label for="your-name">Your Name <span class="req">(required)</span></label>
          <input id="your-name" name="your-name" type="text" autocomplete="name" required maxlength="400">
        </div>
        <div class="field">
          <label for="your-email">Your Email <span class="req">(required)</span></label>
          <input id="your-email" name="your-email" type="email" autocomplete="email" required maxlength="400">
        </div>
        <div class="field">
          <label for="your-mobile">Your Mobile Number</label>
          <input id="your-mobile" name="your-mobile" type="tel" autocomplete="tel" maxlength="400">
        </div>
        <div class="field">
          <label for="your-subject">Your Subject</label>
          <input id="your-subject" name="your-subject" type="text" maxlength="400">
        </div>
        <div class="field">
          <label for="your-message">Your Message</label>
          <textarea id="your-message" name="your-message" maxlength="2000"></textarea>
        </div>
        <button class="btn btn-primary" type="submit">Send</button>
      </form>
    </section>
  </div>
  <div class="prose">
    ${sourceLine("amtechpl.com/contact", "https://www.amtechpl.com/contact/")}
  </div>
</div>`;

  await writeFile("contact/index.html", renderPage({
    title: "Contact - Advanced Molecular Technologies",
    description: "Contact Advanced Molecular Technologies at Unit 1/7-11 Rocco drive, Scoresby VIC 3179. Phone 03 9764 9220 or email sales@amtechpl.com.",
    path: "contact/",
    body,
    head: `<script type="module" src="${url("js/contact.js")}"></script>`,
  }));
}
