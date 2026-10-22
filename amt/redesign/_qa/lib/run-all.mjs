import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { gitMeta, help, locate, parseArgs } from "./common.mjs";
import { renderCheckSection, upsertBlock } from "./report.mjs";

const CHECKS = ["check-meta", "check-links", "check-counts", "check-a11y", "lighthouse"];

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (args.help) {
    console.log(
      `${help("run-all", " [--live] [--runs 3]")}\nRuns every check. A skipped check (its inputs are not in the tree yet) is success. Any failure exits non-zero after the rest have run.\n`,
    );
    return;
  }
  const located = locate(args);
  const checks = [];
  let failed = false;
  for (const name of CHECKS) {
    console.log(`\n=== ${name} ===`);
    const bin = path.join(located.qaDir, name);
    const result = spawnSync(bin, argv, { stdio: "inherit" });
    const code = result.status ?? 1;
    if (code !== 0) failed = true;
    const jsonPath = path.join(located.results, `${name}.json`);
    if (fs.existsSync(jsonPath)) {
      checks.push(JSON.parse(fs.readFileSync(jsonPath, "utf8")));
    } else {
      checks.push({
        name,
        status: code === 0 ? "pass" : "fail",
        failures: code === 0 ? [] : [`${name} exited ${code} without writing a result`],
        skips: [],
        notes: [],
      });
    }
  }
  if (fs.existsSync(located.reportFile)) {
    upsertBlock(
      located.reportFile,
      `harness-${located.label}`,
      renderCheckSection({
        label: located.label,
        git: gitMeta(located.repo),
        scanRedesign: located.scanRedesign,
        checks,
        at: new Date().toISOString(),
      }),
    );
  }
  process.exit(failed ? 1 : 0);
}

main();
