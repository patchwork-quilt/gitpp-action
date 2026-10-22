# gitpp-action

**Runs the git.pp fold over a directory of provenance records inside your own CI, and reports the derived state — the winning value for every key, every loser preserved, and the ancestry that decided each conflict.**

For teams whose agents or people land concurrent work against the same shared state — config values, task claims, feature flags — and want the collision resolved by rule and explained, instead of found later as a silent overwrite. Not for resolving code or text merge conflicts: this resolves *labelled key* conflicts only (see Honest limits). No install, no external service, nothing phones home; the derivation runs in your runner.

## Run it in thirty seconds

From a clone of this repo:

```bash
bun run fold.mjs --records fixtures/quilt --project poc-quilt-1
```

Eight records go in; the derived state comes out:

```text
# git.pp state — poc-quilt-1

8 records · 8 keys · 1 conflict(s) · 0 orphan(s)

## State

- `config.timeout` = 45
- `feature.cache` = on
- `feature.inherited` = true
# …five more keys…

## Conflicts (losers preserved)

- **config.timeout** = 45 — winner `override-1` (override, reason: "captain: 45 is the safe value", parents: [task-a, task-b])
  - loser `task-a` (task) set 30 — outranked — override beats task (class priority is absolute); preserved in the record
  - loser `task-b` (task) set 60 — outranked — override beats task (class priority is absolute); preserved in the record
  - loser `task-d` (task) set 99 — outranked — override beats task (class priority is absolute); preserved in the record

> Mechanical resolution of labelled key conflicts only; the fold does not settle semantic conflicts. Digests authenticate content, not authorship. Arrival order is never an input.
```

What just happened: three records set `config.timeout` to 30, 60, and 99, and a fourth — an *override* whose parents are two of them — set it to 45 with a stated reason. The fold took the override's value, kept all three losing values on the record with the rule that beat them, and derived every uncontested key from whoever set it. Nobody's work was silently overwritten, and the explanation is part of the output, not a log you have to dig for.

In your own workflow, the same derivation is one step:

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
          # github-token: ${{ secrets.GITPP_CHECK_TOKEN }}  # …with an App or fine-grained PAT token (see "The GITHUB_TOKEN fact")
```

## The model

Five concepts, in the order they compose:

- **Record** — one JSON file: an `id`, a `kind`, `parents` (the ids of records it builds on), `effects` (the key/value pairs it sets), and an optional `reason`.

  ```json
  {
    "id": "override-1",
    "kind": "override",
    "parents": ["task-a", "task-b"],
    "effects": { "config.timeout": 45 },
    "reason": "captain: 45 is the safe value"
  }
  ```

- **Kind is authority.** `override` > `task` > `witness`, and the priority is absolute: a higher class wins a key against any number of lower-class records, whatever the ancestry. A witness *saw* a value; it did not decide it — a witness never outranks a task, even when the witness descends from it.
- **Ancestry** — the parent graph. Within the highest class competing for a key, ancestry decides: a record supersedes the ancestors it descends from. Records whose ancestry is incomplete (a parent is missing) are **orphans**: excluded from state, and named in the report.
- **Effects** — the labelled keys a record sets. Only keys are resolved; the fold has no opinion about what a value *means*.
- **The fold** — the pure function from a set of records to `{state, conflicts, orphans}`. Same set in, same answer out, in any order (this is load-bearing; see the deep layer).

The record format and the fold semantics are specified in [git.pp-ng](https://github.com/patchwork-quilt/git.pp-ng) (`DESIGN.md`). This repo is the CI wrapper around that engine — it adds no semantics of its own.

## Inputs and surfaces

| Input | Default | What it does |
|---|---|---|
| `records-dir` | `.gitpp/records` | Directory holding the record JSON files. Every `*.json` file is read; a file may hold one record or an array of records. |
| `project` | *(empty)* | Project name shown in the report title. |
| `mode` | `summary` | `summary`: print + job summary. `check`: additionally POST the neutral check run (needs `github-token`, and the right kind of token — see below). |
| `github-token` | *(empty)* | Used only in `check` mode, to create the check run. Must be a **GitHub App installation token or fine-grained PAT** with `checks: write`. Never used for anything else; the action makes no other network calls. |

Defaults verified against `action.yml`: all four inputs are wired into the composite step's run line.

The report reaches up to three surfaces:

- **stdout** — always.
- **The job summary** (`$GITHUB_STEP_SUMMARY`) — when that variable is set, as it is in Actions. This is the action's *native* surface: it needs no permissions beyond the workflow's own.
- **A check run** named **git.pp state**, conclusion always `neutral` — only in `check` mode, and only with the right token:

> **The `GITHUB_TOKEN` fact (verified against GitHub's Checks API docs, 2026-10-21).** Creating a check run requires a GitHub App token or a fine-grained PAT. The workflow's built-in `GITHUB_TOKEN` **cannot do it** — GitHub does not list it among the token types the Checks endpoints accept. So with a plain `GITHUB_TOKEN`, `check` mode's POST is refused and the action degrades to summary-only, with the refusal in the log and the state still printed. If you want real check runs posted natively, that surface is the sibling app, [gitpp-app](https://github.com/patchwork-quilt/gitpp-app) — or supply an App/PAT token via `github-token`.

## Failure behaviour

Measured against the shipped code, not intended behaviour:

| Input problem | What happens |
|---|---|
| A record's parents name a record that isn't there | The record is reported as an **orphan**, excluded from state; the run still succeeds (exit 0) and every other key derives normally. |
| A `*.json` file that doesn't parse | The run fails (exit 1) and the error **names the file**: `cannot parse record file <path>: …`. One bad file stops the run rather than deriving from a partial set. |
| Records directory missing/unreadable | Fails (exit 1), naming the directory. |
| `--mode` set to anything but `summary`/`check` | Fails (exit 1) with the offending value. |
| `check` mode without `GITHUB_REPOSITORY`/`GITHUB_SHA` (e.g. run locally) | Prints the report, logs `no check run posted`, exits 0. Degradation, not failure. |
| `check` mode without a token | Prints only, exits 0. |

Locally, the same core runs without any CI environment:

```bash
bun run fold.mjs --records fixtures/quilt --project poc-quilt-1
bun run fold.mjs --records fixtures/race
bun run test.mjs        # the fixture test suite
```

Two fixtures ship in `fixtures/`: `quilt` (above) and `race` — eleven records race on `config.timeout`; with no override and no supersession among them, the tie-break picks `race-a` at 30 and preserves all nine other candidates as losers. Run it and count the loser lines.

## Honest limits

- **Mechanical resolution of labelled key conflicts only.** The fold does not settle semantic conflicts. If two records set the same key to different values, it picks a winner by rule and explains itself — it does not know which value is *right*.
- **Digests authenticate content, not authorship.** A record says what it says; who really wrote it is your platform's question, not the fold's.
- **Advisory, by doctrine.** The check run's conclusion is `neutral`, hardcoded in `fold.mjs` — the action cannot fail your build over a state conflict. Making it a required gate is your call, to take later, with your own evidence.
- **Status: built and working** (v0.1.0). The wrapper is deliberately thin; everything semantic lives upstream in the spec repo.

## The deep layer

Four things a senior reader should take away, each with its receipt.

**Arrival order is never an input — and that's the whole design.** Derivation is a pure function of the record *set*. Concurrency-safe resolution usually smuggles in a timestamp or a sequence number and calls the result deterministic; here there is nothing to smuggle — class, ancestry, and id are all the fold may use. Receipt you can run: pack the eight quilt records into a single file as an array, reversed, and the output is byte-identical:

```bash
# (any reordering of the same set — this was verified with the reversed array)
bun run fold.mjs --records <your-shuffled-dir> --project poc-quilt-1
```

**Seeing is not deciding.** The class rule that surprises people is the witness rule: a witness that *descends from* a task still loses to it. Observation records (heartbeats, environment readings — `witness-1`/`witness-2` in the quilt fixture) can carry keys nobody contests, but the moment a task contests the key, the witness's later, better-informed value loses. Provenance of *intent* outranks recency of *observation*, by design, because the failure mode it prevents — a monitor silently overriding a decision — is the one that pages you at 3 a.m. The rule is stated in the engine's own header (`lib/fold.ts`) and exercised by the quilt fixture's class-priority conflict.

**The engine is not a reimplementation.** `lib/fold.ts` is vendored **byte-identical** below its provenance header from git.pp-ng `src/fold.ts` at commit `c130862b354f8895e68a4a0d8349f27389e570e3` — verifiable by diffing the file below the header against that upstream path. That matters because the upstream engine is held identical to a Python referee (and an independent BEAM port) by a conformance corpus: at the vendored commit, upstream's `RESULTS.md` records 863/863 cases identical across ports and 16,290 closure-root digests matching — so the semantics this action runs in your CI are the semantics three implementations agree on, not a port's opinion. Fixes belong upstream; this copy is refreshed by re-vendoring from a named commit, never edited locally.

**The platform fact shaped the product.** The `GITHUB_TOKEN` restriction above was found by reading GitHub's Checks API docs before building on the assumption — the summary-first design, and the check mode's degrade-don't-fail behaviour, are the consequences. The sibling split is the other consequence: one tool that advises inside CI (this repo), one app that posts natively (gitpp-app), each in its own repo, neither pretending to be the other.

### Verify it yourself

```bash
bun run test.mjs
```

15 assertions over both fixtures, the step-summary write, and the check-mode degradation path — expected final line:

```text
ALL TESTS PASS
```

The full conformance contract (863 cases, differential fuzzing, the root digests) lives upstream in [git.pp-ng](https://github.com/patchwork-quilt/git.pp-ng); this repo's suite covers the wrapper end-to-end against the two canonical fixtures.

## The family

One tool, one repo — the shelf:

- [git.pp-ng](https://github.com/patchwork-quilt/git.pp-ng) — the specification, the fold engine, and the conformance corpus this action vendors. Go there for the semantics, the checkpoint format, and the measured results ledger.
- [gitpp-app](https://github.com/patchwork-quilt/gitpp-app) — the GitHub App: the same fold, posting real Check runs natively with an App token, fed by webhooks instead of your CI. Want this when the summary surface isn't enough.
- [gitpp-beam](https://github.com/patchwork-quilt/gitpp-beam) — the same fold ported to Elixir/BEAM from the spec alone; the second-implementation proof.
- [outbound-scanner](https://github.com/patchwork-quilt/outbound-scanner) — a pre-send egress scanner for agent harnesses: catches session secrets in outbound replies before they ship. A different tool for a different leak; the sibling example of the one-tool-one-repo rule.

## Licence

MIT — SuperInstance. See `LICENSE`.
