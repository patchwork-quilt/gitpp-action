# gitpp-action

**A GitHub Action that runs the git.pp fold in your own CI over a directory of provenance records, and reports the derived state — winners per key, losers preserved, conflicts explained — as an advisory summary.** For teams whose agents (or people) land concurrent work against the same shared state and want the collision resolved deterministically and explained, instead of discovered as a merge failure: no install, no external service, nothing phones home — the derivation runs in your runner, under your token.

## What it does

Point it at a directory of git.pp record files (one JSON record per file). It derives the state with the git.pp fold — the same engine, vendored byte-identically from [git.pp-ng](https://github.com/patchwork-quilt/git.pp-ng) — and reports:

- the winning value for every key;
- every conflict: the winner, the **losers (preserved, never silently overwritten)**, and the ancestry that decided — class priority (override > task > witness), supersession, or the tie-break;
- orphans (records whose ancestry is incomplete) excluded from state, named.

Output goes to the log and to the job summary (`$GITHUB_STEP_SUMMARY`) — that is the Action's native surface, and it needs no permissions beyond the workflow's own. In `check` mode it additionally posts a check run named **git.pp state** — always conclusion `neutral`. **Platform fact (verified against GitHub's Checks API docs, 2026-10-21): creating a check run requires a GitHub App token or a fine-grained PAT — the workflow's built-in `GITHUB_TOKEN` cannot do it.** So `check` mode needs `github-token` set to such a token with `checks: write`; with a plain `GITHUB_TOKEN` the API refuses and the action degrades to summary-only with a note in the log. (The full App — `gitpp-app`, sibling repo — is the surface that posts checks natively.) The action is advisory: it never fails your build.

## Usage

```yaml
name: git.pp state
on: [push, pull_request]
jobs:
  gitpp:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: patchwork-quilt/gitpp-action@v0
        with:
          records-dir: .gitpp/records
          project: my-project
          # mode: check            # also post the check run…
          # github-token: ${{ secrets.GITHUB_TOKEN }}  # …with this token
```

Records are plain JSON, one per file:

```json
{
  "id": "override-1",
  "kind": "override",
  "parents": ["task-a", "task-b"],
  "effects": { "config.timeout": 45 },
  "reason": "captain: 45 is the safe value"
}
```

The record format and fold semantics are specified in [git.pp-ng](https://github.com/patchwork-quilt/git.pp-ng) (`DESIGN.md`); this repo is only the CI wrapper.

## Inputs

| Input | Default | What it does |
|---|---|---|
| `records-dir` | `.gitpp/records` | Directory holding the record JSON files. Every `*.json` file is read; a file may hold one record or an array of records. |
| `project` | *(empty)* | Project name shown in the report title. |
| `mode` | `summary` | `summary`: print + job summary. `check`: additionally POST the neutral check run (needs `github-token`). |
| `github-token` | *(empty)* | Used only in `check` mode, to create the check run. Must be a **GitHub App installation token or fine-grained PAT** with `checks: write` — the workflow `GITHUB_TOKEN` cannot create check runs (Checks API restriction). Never used for anything else; the action makes no other network calls. |

## Run it locally

```bash
bun run fold.mjs --records fixtures/quilt --project poc-quilt-1
bun run fold.mjs --records fixtures/race
bun run test.mjs        # the fixture test suite
```

Two fixtures ship in `fixtures/` — `quilt` (the 8-record poc-quilt-1 project: `config.timeout` resolves to 45 via `override-1`, losers task-a/task-b/task-d preserved) and `race` (demo-race-1: eleven records race on one key; race-a wins the tie-break at 30, nine losers preserved).

## Honest limits

- **Mechanical resolution of labelled key conflicts only.** The fold does not settle semantic conflicts: if two records set the same key to different values, the fold picks a winner by rule and explains itself — it does not know which value is *right*.
- **Digests authenticate content, not authorship.** A record says what it says; who really wrote it is your platform's question, not the fold's.
- **Arrival order is never an input.** Derivation is a pure function of the record set; shuffling the files cannot change the answer.
- **Advisory, by doctrine.** The check run is always `neutral`. Making this a required gate is your call to take later, with your own evidence.
- **Testing.** The engine is vendored byte-identically (below its provenance header) from git.pp-ng `src/fold.ts` at commit `c130862`, where it passes the git.pp conformance corpus (863/863 cases · 16,290 closure-root digests · frontier and format-v2 families green — see git.pp-ng `RESULTS.md`). This repo's own tests cover the wrapper end-to-end against the two fixtures above.

## The family

One tool, one repo:

- [git.pp-ng](https://github.com/patchwork-quilt/git.pp-ng) — the specification, the fold engine, and the conformance corpus this action vendors.
- [gitpp-beam](https://github.com/patchwork-quilt/gitpp-beam) — the same fold, ported to Elixir/BEAM from the spec alone.
- [outbound-scanner](https://github.com/patchwork-quilt/outbound-scanner) — a pre-send egress scanner for agent harnesses: the sibling example of the one-tool-one-repo rule.

## Licence

MIT — SuperInstance. See `LICENSE`.
