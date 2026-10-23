#!/usr/bin/env bun
/**
 * test.mjs — end-to-end tests of the action core against the committed
 * fixtures. Run: bun run test.mjs   (or: bun test.mjs)
 *
 * Fixtures are the two canonical projects of the git.pp programme:
 *  - fixtures/quilt — poc-quilt-1, the 8-record frozen evidence project.
 *  - fixtures/race  — demo-race-1, 11 records racing on one key.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? "ok" : "FAIL"} - ${label}`);
  if (!cond) failures += 1;
}
function runFold(args, env = {}) {
  const r = spawnSync("bun", ["run", "fold.mjs", ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(`fold.mjs failed: ${r.stderr}`);
  return r.stdout;
}

// --- quilt: config.timeout = 45 via override-1 -------------------------
const quilt = runFold(["--records", "fixtures/quilt", "--project", "poc-quilt-1"]);
check("quilt: title names the project", quilt.includes("# git.pp state — poc-quilt-1"));
check("quilt: advisory line directly under the title",
  quilt.includes("# git.pp state — poc-quilt-1\n> Advisory — a mechanical derivation under the fold's rules, not an approval. A winner means precedence, not correctness or authorisation. This report never gates a merge."));
check("quilt: outranked lines use kind vocabulary, never class",
  quilt.includes("(kind priority is absolute)") && !quilt.includes("class"));
check("quilt: config.timeout = 45", quilt.includes("`config.timeout` = 45"));
check("quilt: winner is override-1", quilt.includes("winner `override-1` (override"));
check("quilt: winner reason quoted", quilt.includes("captain: 45 is the safe value"));
for (const loser of ["task-a", "task-b", "task-d"]) {
  check(`quilt: loser ${loser} preserved`, quilt.includes(`loser \`${loser}\``));
}
check("quilt: feature.cache = on (task-a's uncontested key)",
  quilt.includes("`feature.cache` = on"));
check("quilt: qualifications printed",
  quilt.includes("Arrival order is never an input") &&
  quilt.includes("Digests authenticate content, not authorship"));
check("quilt: qualifications define an orphan",
  quilt.trimEnd().endsWith(
    "Arrival order is never an input. " +
    "An orphan is a record whose parent is missing or did not itself derive."));

// --- rule-order line: present, directly under the advisory ---------------
const RULE_ORDER_LINE = "> How a winner is chosen: kind first (override beats task beats witness); within a kind, a record that descends from a rival supersedes it; any remaining tie breaks on ancestry — ancestors are all transitive ancestors, counted once each, excluding the record itself: most intent ancestors (task and override records) wins, then fewest witness ancestors, then smallest id. A record's reason is its author's note, never an input to the fold.";
check("quilt: rule-order line present", quilt.includes(RULE_ORDER_LINE));
check("quilt: rule-order line directly under the advisory",
  quilt.includes("This report never gates a merge.\n" + RULE_ORDER_LINE));

// --- commit scope parity: GITHUB_SHA prefixes the counts line ------------
const scoped = runFold(["--records", "fixtures/quilt", "--project", "poc-quilt-1"],
  { GITHUB_SHA: "1234567890abcdef" });
check("scope: counts line prefixed with Commit `<sha7>` when GITHUB_SHA is set",
  scoped.includes("Commit `1234567` · 8 records · 8 keys · 1 conflict(s) · 0 orphan(s)"));
check("scope: no Commit prefix when GITHUB_SHA is unset",
  !quilt.includes("Commit `"));

// --- race: race-a wins the tie-break at 30, 9 losers --------------------
const race = runFold(["--records", "fixtures/race"]);
check("race: config.timeout = 30", race.includes("`config.timeout` = 30"));
check("race: winner is race-a", race.includes("winner `race-a` (task"));
const loserCount = (race.match(/  - loser `race-/g) ?? []).length;
check(`race: exactly 9 losers preserved (got ${loserCount})`, loserCount === 9);
check("race: tie-break explanation present", race.includes("lost the tie-break"));
check("race: rule-order line present", race.includes(RULE_ORDER_LINE));
check("race: tie-break line states the metric with both candidates' counts",
  race.includes("lost the tie-break among incomparable candidates of the same kind (intent ancestors 1 vs winner's 1, witness ancestors 0 vs winner's 0 — most intent ancestors wins, then fewest witness ancestors, then smallest id)"));

// --- step summary is written when GITHUB_STEP_SUMMARY is set ------------
const dir = mkdtempSync(join(tmpdir(), "gitpp-action-"));
const summaryFile = join(dir, "summary.md");
runFold(["--records", "fixtures/quilt"], { GITHUB_STEP_SUMMARY: summaryFile });
check("summary: GITHUB_STEP_SUMMARY receives the report",
  readFileSync(summaryFile, "utf8").includes("`config.timeout` = 45"));

// --- check mode without CI coordinates degrades to print ----------------
const checkRun = spawnSync(
  "bun", ["run", "fold.mjs", "--records", "fixtures/quilt", "--mode", "check", "--token", "x"],
  { encoding: "utf8", env: { ...process.env, GITHUB_REPOSITORY: "", GITHUB_SHA: "" } },
);
check("check mode without repo/sha still prints and exits 0",
  checkRun.status === 0 && checkRun.stdout.includes("`config.timeout` = 45") &&
  checkRun.stderr.includes("no check run posted"));

console.log(failures === 0 ? "\nALL TESTS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
