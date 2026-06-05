---
summary: "Realtime implementation report for the first-class `windie` CLI command surface."
read_when:
  - When continuing or reviewing implementation of the `windie` CLI command surface.
  - When checking which `windie` command groups, tests, docs, validation commands, and follow-up work have landed.
title: "Windie CLI Command Surface Report"
---

# Windie CLI Command Surface Report

Plan: [Windie CLI Command Surface Plan](2026-06-05-windie-cli-command-surface-plan.md)

## Status

Implementation complete.

## Checklist

- [x] Plan approved by user.
- [x] Report created before implementation.
- [x] Root `bin/windie` CLI added.
- [x] Shared command registry/spawn/output helpers added.
- [x] Status and doctor commands implemented.
- [x] Lifecycle and logs commands implemented.
- [x] Test and docs commands implemented.
- [x] Build/package/reinstall commands implemented.
- [x] Backend/endpoint/self-host commands implemented.
- [x] Extension/tools/mock commands implemented.
- [x] Focused tests added.
- [x] Docs updated to prefer `windie ...`.
- [x] Validation completed.
- [x] Final inspection completed.
- [x] Scoped commit prepared.

## Decisions

- Implement the first version as a repo-root Node/CommonJS CLI. This matches the
  existing frontend launcher style, avoids a new Python packaging layer, and can
  wrap shell, npm, Python, PowerShell, and system commands from one place.
- Keep existing scripts as implementation adapters in the first pass. Do not
  delete launch/reinstall/deploy/self-host scripts until the public `windie`
  surface is proven and docs have moved.
- `windie backend deploy` does not run the remote-host deploy script locally by
  default. It now requires either `--host <host>` or explicit `--local`, because
  the deploy helper mutates a checkout and restarts a service.
- `windie self-host status` reports that `systemctl` is unavailable on macOS
  instead of failing with an unhandled spawn error.

## Validation Log

- `node --check scripts/windie-cli.cjs && node --check scripts/windie/commands.cjs && node --check scripts/windie/status.cjs && node --check scripts/windie/docs.cjs && node --check scripts/windie/run.cjs` - passed.
- `bin/windie --help` - passed.
- `bin/windie status --json` - passed.
- `bin/windie status --all --json` - passed.
- `bin/windie doctor --json` - passed.
- `bin/windie doctor --deep --json` - command passed; diagnostic payload correctly reported `ok: false` because no local backend is listening on `127.0.0.1:8765`.
- `bin/windie docs open test selection` - passed and finds `docs/debug/test_selection.md`.
- `bin/windie docs check` - passed.
- `bin/windie test pick backend` - passed.
- `bin/windie test pick sidecar` - passed.
- `bin/windie test backend -- --help` - passed and forwarded to pytest help.
- `bin/windie test sidecar -- --help` - passed and forwarded to pytest help.
- `bin/windie test frontend -- --help` - passed and forwarded to Jest help.
- `cd frontend && npm run test:ci -- WindieCli` - passed.
- `git diff --check` - passed.
- Command-surface inspection script checked 46 approved command help entries -
  passed.

## Implementation Log

- Created this report after approval and before code edits.
- Added `bin/windie` and `scripts/windie-cli.cjs` as the repo-root command
  entrypoint.
- Added shared CLI modules under `scripts/windie/` for paths, process spawning,
  output, status collection, docs search, and command dispatch.
- Implemented all approved command names as wrappers or safe diagnostics:
  status, doctor, start, stop, restart, logs, test, docs, build, package,
  reinstall, backend, endpoint, self-host, extension, tools, and mock.
- Added a docs search helper that searches all markdown docs, not only
  `docs/docs.json`, so unlisted operational/debug docs remain discoverable.
- Added focused Jest coverage in `tests/frontend/WindieCli.test.cjs`.
- Updated README, install docs, endpoint setup docs, test-selection docs,
  process-health docs, and changelog to prefer the new command surface.
- Expanded `windie --help` to list each approved command explicitly instead of
  only grouped shorthand forms.

## Blockers

- None currently.

## Deviations From Plan

- `windie stop` is intentionally conservative in this first implementation. It
  reports that no tracked background processes exist because current start
  commands run in the foreground. This avoids killing unrelated Node, Python, or
  Electron processes.
- Local desktop and sidecar logs remain guidance commands because the current
  reliable streams are foreground Electron/sidecar stderr. No new durable log
  store was introduced.
