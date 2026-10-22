/**
 * Turns the contact form into a mailto to AMT's published sales address.
 * Without this module the form still uses a mailto action.
 */
const form = document.querySelector("[data-contact-form]");
if (form) {
  form.addEventListener("submit", (event) => {
    const address = form.getAttribute("data-mailto") || "sales@amtechpl.com";
    const data = new FormData(form);
    const subject = String(data.get("your-subject") || "Enquiry from the AMT catalogue");
    const body = [
      `Name: ${data.get("your-name") || ""}`,
      `Email: ${data.get("your-email") || ""}`,
      `Mobile: ${data.get("your-mobile") || ""}`,
      `Subject: ${data.get("your-subject") || ""}`,
      "",
      String(data.get("your-message") || ""),
    ].join("\n");
    event.preventDefault();
    window.location.href = `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
}
