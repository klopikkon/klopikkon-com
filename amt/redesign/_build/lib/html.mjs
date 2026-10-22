/** Escape text for HTML element and attribute contexts. */
export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Render plain text that may contain markdown-style links: [label](url).
 * Everything else is escaped. External URLs get rel="noopener noreferrer".
 */
export function rich(value) {
  const text = String(value ?? "");
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let html = "";
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    html += esc(text.slice(last, match.index));
    const label = match[1];
    const href = match[2];
    const external = /^https?:/i.test(href);
    const rel = external ? ' rel="noopener noreferrer"' : "";
    html += `<a href="${esc(href)}"${rel}>${esc(label)}</a>`;
    last = match.index + match[0].length;
  }
  html += esc(text.slice(last));
  return html;
}

export function paragraphs(items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items.map((item) => `<p>${rich(item)}</p>`).join("\n");
}

export function bulletList(items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return `<ul>\n${items.map((item) => `<li>${rich(item)}</li>`).join("\n")}\n</ul>`;
}
