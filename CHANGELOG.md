# Changelog

All notable changes to gitpp-action. Versions follow the git tag lineage;
release dates are the tag dates. The fold engine itself is vendored from
git.pp-ng — engine changes are credited to the upstream fix they carry.

## [0.3.2] — 2026-11-02

Documentation and release hygiene only; the action's behaviour is
unchanged from 0.3.1.

- README: the outbound-scanner reference now points at its new home
  (SuperInstance) after the 2026-11-02 organisation tidy.
- Version statements reconciled: `package.json` had lagged at 0.1.0
  since the first tag; it now matches the release. This changelog added.
- Floating tags maintained: `v0` and `v0.3` now point at this release
  (they had not been moved since v0.1 / v0.3.0 respectively, so the
  README's `@v0` pin was serving v0.1-era code).

## [0.3.1] — 2026-10-23

- Check text byte-budget fix: the check-run text is fitted to GitHub's
  65,536-**byte** cap (it previously sliced 65,535 *characters*, which
  could overflow on multibyte text). Truncation is marked, and the
  qualifications block is preserved.
- Qualifications: an "orphan" is now defined in the report, for parity
  with the gitpp-app renderer.

## [0.3.0] — 2026-10-23

- Fold engine re-vendored from git.pp-ng with the issue #38 fix: the
  proto-index conformance family — records the fold previously lost
  silently (`__proto__` / id-less records) are now handled.
- Renderer: the rule-order line states its counting convention
  (transitive ancestors, counted once, self excluded); "intent" is
  defined as task + override.

## [0.2.0] — 2026-10-23

- Renderer parity with gitpp-app: kind vocabulary, the tie-break metric
  shown with both candidates' counts, the advisory line, the rule-order
  line, and commit-scope parity in the report.
- README rewritten to the three-altitude standard; the shipped fixture
  suite re-executed and its assertion count stated in the README.

## [0.1.0] — 2026-10-21

- Initial release: the git.pp fold as a composite GitHub Action.
  Summary mode prints the derivation and writes the job summary;
  check mode additionally posts a neutral `git.pp state` check run.
  Advisory by doctrine — the check never fails a build.
- Correction baked in before the tag: check mode cannot use the
  workflow's `GITHUB_TOKEN` (the Checks API refuses it); it requires
  an App token or a fine-grained PAT with checks: write.
