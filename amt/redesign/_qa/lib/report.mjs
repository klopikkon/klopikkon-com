import fs from "node:fs";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Insert or replace a marked block in QA.md. */
export function upsertBlock(file, id, body) {
  const start = `<!-- ${id}:start -->`;
  const end = `<!-- ${id}:end -->`;
  const block = `${start}\n${body.trim()}\n${end}`;
  let text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  if (pattern.test(text)) {
    text = text.replace(pattern, block);
  } else {
    const anchor = "<!-- harness-blocks -->";
    text = text.includes(anchor) ? text.replace(anchor, `${anchor}\n\n${block}`) : `${text.trim()}\n\n${block}\n`;
  }
  fs.writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`);
}

export function renderCheckSection({ label, git, scanRedesign, checks, at }) {
  const where = git?.sha ? `\`${git.branch || "detached"}\` @ \`${git.sha}\`` : "no git metadata";
  const rows = checks
    .map((check) => `| ${check.name} | ${check.status} |`)
    .join("\n");
  const detail = [];
  for (const check of checks) {
    const skips = check.skips || [];
    const notes = check.notes || [];
    const failures = check.failures || [];
    if (!skips.length && !notes.length && !failures.length) continue;
    detail.push(`**${check.name}**`);
    for (const skip of skips) detail.push(`- skip: ${skip}`);
    const shownNotes = notes.slice(0, 24);
    for (const note of shownNotes) detail.push(`- ${note}`);
    if (notes.length > shownNotes.length) {
      detail.push(`- … ${notes.length - shownNotes.length} more notes in \`_qa/results/${check.name}.json\``);
    }
    const shown = failures.slice(0, 40);
    for (const failure of shown) detail.push(`- ${failure}`);
    if (failures.length > shown.length) {
      detail.push(`- … ${failures.length - shown.length} more in \`_qa/results/${check.name}.json\``);
    }
    detail.push("");
  }
  return `### ${label}

Scanned \`${scanRedesign}\` (${where}) at ${at}.

| Check | Result |
| --- | --- |
${rows || "| — | not run |"}

${detail.join("\n").trim()}
`;
}
