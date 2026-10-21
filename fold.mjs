#!/usr/bin/env bun
/**
 * fold.mjs — the git.pp Action core.
 *
 * Reads every record JSON file in a records directory, derives the state
 * with the vendored git.pp fold engine (lib/fold.ts), and reports it as an
 * advisory summary: state winners per key, losers preserved, and for every
 * conflict the winner, the losers, and the ancestry that decided.
 *
 * Surfaces:
 *  - stdout (always);
 *  - $GITHUB_STEP_SUMMARY markdown, when that env var is set (CI);
 *  - a GitHub check run named "git.pp state" (conclusion: neutral —
 *    advisory, never a gate), when --mode check and a token are present.
 *
 * Locally (no CI env), it just prints. Exit code is 0 on any successful
 * derivation; non-zero only for unreadable input or bad arguments.
 *
 * Usage:
 *   bun run fold.mjs --records <dir> [--project <name>]
 *                    [--mode summary|check] [--token <token>]
 */
import { readdirSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { derive } from "./lib/fold.ts";

export const QUALIFICATIONS =
  "Mechanical resolution of labelled key conflicts only; the fold does " +
  "not settle semantic conflicts. Digests authenticate content, not " +
  "authorship. Arrival order is never an input.";

const CLASS_RANK = { override: 0, task: 1, witness: 2 };

export function loadRecords(dir) {
  let names;
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
  } catch (e) {
    throw new Error(`cannot read records directory ${dir}: ${e.message}`);
  }
  const records = [];
  for (const name of names) {
    const path = join(dir, name);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      throw new Error(`cannot parse record file ${path}: ${e.message}`);
    }
    if (Array.isArray(parsed)) records.push(...parsed);
    else records.push(parsed);
  }
  return records;
}

function fmtValue(v) {
  return typeof v === "string" ? v : JSON.stringify(v);
}

function kindOf(rec) {
  return typeof rec?.kind === "string" ? rec.kind : "witness";
}

/** Human explanation of one conflict, from the records themselves. */
export function explainConflict(conflict, byId) {
  const winner = byId.get(conflict.winner);
  const wClass = kindOf(winner);
  const lines = [];
  lines.push(
    `- **${conflict.key}** = ${fmtValue(winner?.effects?.[conflict.key])} ` +
      `— winner \`${conflict.winner}\` (${wClass}` +
      (winner?.reason ? `, reason: "${winner.reason}"` : "") +
      `, parents: [${(winner?.parents ?? []).join(", ")}])`,
  );
  for (const loserId of conflict.losers) {
    const loser = byId.get(loserId);
    const lClass = kindOf(loser);
    let why;
    if ((CLASS_RANK[wClass] ?? 2) < (CLASS_RANK[lClass] ?? 2)) {
      why = `outranked — ${wClass} beats ${lClass} (class priority is absolute)`;
    } else if ((winner?.parents ?? []).includes(loserId)) {
      why = "superseded — the winner descends from it";
    } else {
      why =
        "lost the tie-break among incomparable candidates of the same " +
        "class (cleanest ancestry chain, then smallest id)";
    }
    lines.push(
      `  - loser \`${loserId}\` (${lClass}) set ${fmtValue(loser?.effects?.[conflict.key])} — ${why}; preserved in the record`,
    );
  }
  return lines;
}

export function renderReport(records, project) {
  const out = derive(records);
  const byId = new Map(records.map((r) => [String(r.id), r]));
  const title = project ? `git.pp state — ${project}` : "git.pp state";
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(
    `${records.length} records · ${Object.keys(out.state).length} keys · ` +
      `${out.conflicts.length} conflict(s) · ${out.orphans.length} orphan(s)`,
  );
  lines.push("");
  lines.push("## State");
  lines.push("");
  for (const key of Object.keys(out.state).sort()) {
    lines.push(`- \`${key}\` = ${fmtValue(out.state[key])}`);
  }
  if (out.conflicts.length > 0) {
    lines.push("");
    lines.push("## Conflicts (losers preserved)");
    lines.push("");
    for (const c of out.conflicts) lines.push(...explainConflict(c, byId));
  }
  if (out.orphans.length > 0) {
    lines.push("");
    lines.push("## Orphans (excluded from state)");
    lines.push("");
    lines.push(out.orphans.map((o) => `- \`${o}\``).join("\n"));
  }
  lines.push("");
  lines.push(`> ${QUALIFICATIONS}`);
  return { text: lines.join("\n") + "\n", out };
}

export async function postCheckRun({ token, repo, sha, title, summary, text }) {
  const res = await fetch(`https://api.github.com/repos/${repo}/check-runs`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "git.pp state",
      head_sha: sha,
      status: "completed",
      conclusion: "neutral",
      output: { title, summary, text: text.slice(0, 65535) },
    }),
  });
  if (!res.ok) {
    throw new Error(`check run POST failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function parseArgs(argv) {
  const args = { records: ".gitpp/records", project: "", mode: "summary", token: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--records") args.records = argv[++i];
    else if (a === "--project") args.project = argv[++i];
    else if (a === "--mode") args.mode = argv[++i];
    else if (a === "--token") args.token = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "usage: bun run fold.mjs --records <dir> [--project <name>] [--mode summary|check] [--token <token>]",
    );
    return;
  }
  if (args.mode !== "summary" && args.mode !== "check") {
    throw new Error(`--mode must be summary or check, got: ${args.mode}`);
  }
  const records = loadRecords(args.records);
  const { text } = renderReport(records, args.project);
  process.stdout.write(text);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) appendFileSync(summaryPath, text);

  const token = args.token || process.env.GITHUB_TOKEN || "";
  if (args.mode === "check" && token) {
    const repo = process.env.GITHUB_REPOSITORY;
    const sha = process.env.GITHUB_SHA;
    if (!repo || !sha) {
      console.error("mode=check: GITHUB_REPOSITORY/GITHUB_SHA not set — printed only, no check run posted.");
      return;
    }
    const title = args.project ? `git.pp state — ${args.project}` : "git.pp state";
    const summaryLine = text.split("\n").find((l) => l.includes("records ·")) ?? title;
    const created = await postCheckRun({ token, repo, sha, title, summary: summaryLine, text });
    console.error(`check run posted: ${created.html_url ?? created.id}`);
  } else if (args.mode === "check") {
    console.error("mode=check but no token provided — printed only, no check run posted.");
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`gitpp-action: ${e.message}`);
    process.exit(1);
  });
}
