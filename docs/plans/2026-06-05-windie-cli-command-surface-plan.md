---
summary: "Plan for adding a first-class `windie` CLI that replaces scattered developer scripts with clean status, doctor, lifecycle, logs, test, docs, build, backend, endpoint, self-host, extension, and tools commands."
read_when:
  - When adding or changing WindieOS root-level developer, operator, diagnostic, lifecycle, packaging, backend, endpoint, self-hosting, extension, or docs commands.
  - When deciding whether a helper belongs in the public `windie` CLI, an internal script, frontend npm scripts, backend operations docs, or sidecar/runtime implementation.
title: "Windie CLI Command Surface Plan"
---

# Windie CLI Command Surface Plan

## User Intent

The user wants WindieOS to have clean, memorable commands like OpenClaw's
command surface instead of scattered scripts, `cd frontend && npm run ...`
invocations, ad hoc diagnostics, and copied command blocks in docs.

The desired public command surface is:

```bash
windie status
windie status --all
windie doctor
windie doctor --fix
windie doctor --deep
windie doctor --json

windie start backend
windie start frontend
windie start desktop
windie start all
windie stop
windie restart desktop
windie logs backend
windie logs backend --remote --host windie-prod
windie logs desktop
windie logs sidecar

windie test backend [pytest args...]
windie test sidecar [pytest args...]
windie test frontend [jest args...]
windie test all
windie test pick <area>

windie docs list
windie docs check
windie docs open <topic>

windie build frontend
windie build sidecar-runtime
windie package mac
windie package win
windie package linux
windie reinstall mac
windie reinstall win
windie reinstall linux

windie backend health
windie backend deploy
windie backend service status
windie backend service start
windie backend service stop
windie backend service restart

windie endpoint show
windie endpoint local
windie endpoint hosted
windie endpoint probe

windie self-host bootstrap
windie self-host tunnel setup
windie self-host service install-backend
windie self-host service install-cloudflared
windie self-host status

windie extension create <id>
windie tools manifest generate
windie mock backend
```

The command surface must benefit both humans and coding agents:

- short commands for common work
- predictable noun/verb grouping
- readable terminal output by default
- `--json` for status, doctor, probes, and other diagnostic commands
- no hidden environment activation burden for Python commands
- no requirement to remember frontend working-directory changes
- no leak of implementation-only scripts as the main user interface

## OpenClaw Pattern To Adapt

OpenClaw's useful pattern is not the exact command list; it is the structure:

- one root binary
- noun-grouped subcommands
- lifecycle commands such as start, stop, restart, status, health, probe, and
  logs
- diagnostic commands with rich human output and machine-readable `--json`
- fast read-only routes for status/health where possible
- shared table/progress/output helpers instead of one-off formatting
- scripts remain implementation details behind stable public commands

WindieOS should adapt that pattern to WindieOS ownership boundaries rather than
copying OpenClaw architecture wholesale.

## Current WindieOS Command Problems

Current useful commands exist, but the interface is fragmented:

- backend launch is `./scripts/run-backend` or
  `./scripts/python-in-env backend python -m backend.src.main`
- frontend launch is `./scripts/run-frontend-dev` or
  `cd frontend && npm run dev`
- desktop launch is `./scripts/run-frontend-electron` or
  `cd frontend && npm run electron:dev`
- backend and sidecar tests are script-based, while frontend tests are npm
  working-directory based
- docs validation is `./bin/docs-list`
- backend host logs are `scripts/dev/backend-logs`
- package and reinstall workflows live under frontend npm scripts and
  platform-specific reinstall scripts
- self-hosting setup lives under `scripts/cloudflared/*`
- extension scaffolding is `scripts/create-windie-extension`
- tool manifest generation is `scripts/generate-builtin-tool-manifest`
- mock backend startup is `scripts/mock-backend.cjs`

These scripts are useful and should not be deleted first. They should become
internal implementation targets behind a stable `windie` command surface.

## Architectural Change

Add a repo-root `windie` CLI as the public developer/operator interface:

```text
User or coding agent
  -> windie <group> <command> [options]
  -> command dispatcher and shared output/runtime helpers
  -> existing scripts/npm/python/system commands as adapters
  -> backend, frontend, sidecar, docs, packaging, or remote operation
```

The source of truth changes from scattered command snippets to a single command
surface. Existing scripts remain valid implementation details while the CLI is
introduced. After the CLI is stable, docs should prefer `windie ...`, and old
scripts can be classified as internal, compatibility aliases, or deletion
candidates.

## Ownership Contract

Root `windie` CLI owns:

- user-facing command names
- argument parsing and help text
- shared human output formatting
- JSON output shape for diagnostics and status
- process lifecycle tracking for commands it starts
- command routing to the correct runtime/script/npm task

Existing scripts own, temporarily:

- low-level launch details already proven in the repo
- platform-specific reinstall details
- self-hosting bootstrap details
- remote deploy mechanics
- generated manifest implementation

Backend owns:

- backend app startup behavior
- backend health route responses
- backend service semantics on deployed hosts

Frontend/Electron owns:

- Vite, Electron, packaging, and packaged reinstall implementation details
- desktop logs produced by Electron main and renderer

Sidecar owns:

- sidecar import/runtime diagnostics
- local tool manifest generation inputs
- sidecar logs and local JSON-RPC protocol behavior

Docs own:

- command documentation
- command replacement map from old script snippets to new `windie` commands
- test-selection and troubleshooting command references

## Public Command Groups

### Status And Doctor

`windie status` should be quick and read-only. It should report the current
repo/runtime state without starting heavyweight services.

Minimum useful checks:

- repo root detected
- Node available
- Python available through `scripts/python-in-env`
- frontend dependencies present or missing
- docs navigation valid enough to run `docs-list`
- common backend/frontend/sidecar command targets exist

`windie status --all` should add more detail:

- backend, frontend, sidecar, docs, package, endpoint, and service summaries
- relevant command suggestions for missing dependencies
- no interactive prompts

`windie doctor` should be a diagnostic pass. It can be slower than status but
must remain safe by default. `--fix` may perform only narrow safe repairs.
`--deep` may run slower probes such as port checks, local health checks,
endpoint auth checks, and sidecar import checks. `--json` must return a stable
diagnostic object for coding agents.

### Lifecycle And Logs

`windie start backend`, `windie start frontend`, and `windie start desktop`
should wrap the existing launcher scripts.

`windie start all` should coordinate multiple long-running processes and print
clear process labels. It must not lose logs behind a silent background daemon.
The first version can keep foreground orchestration and terminate children on
Ctrl-C.

`windie stop` should stop only processes started and tracked by `windie` unless
the user passes an explicit broader option. This avoids killing unrelated user
or agent processes.

`windie logs backend --remote --host windie-prod` should wrap
`scripts/dev/backend-logs`. Local desktop and sidecar logs should start with
what the repo can reliably access today; if no durable local log path exists,
the command should explain which foreground command currently owns that stream.

### Tests

`windie test backend` wraps `./scripts/test-backend`.

`windie test sidecar` wraps `./scripts/test-sidecar`.

`windie test frontend` runs frontend Jest from the repo root without requiring
the caller to `cd frontend`.

`windie test all` wraps the existing full test script behavior.

`windie test pick <area>` should use the existing test-selection docs as the
source map for common focused test groups. The first version may print the
recommended commands without executing; execution can be added once the mapping
is structured.

### Docs

`windie docs list` wraps `./bin/docs-list`.

`windie docs check` runs `./bin/docs-list` and `git diff --check`.

`windie docs open <topic>` searches docs metadata and `read_when` text, then
prints the best matching docs path. It should not launch a browser by default;
plain paths are better for coding agents and terminals.

### Build, Package, Reinstall

`windie build frontend` wraps `npm --prefix frontend run build`.

`windie build sidecar-runtime` wraps the existing sidecar-runtime build.

`windie package mac|win|linux` wraps the platform package npm scripts.

`windie reinstall mac|win|linux` wraps the existing platform reinstall helpers.
These commands are more invasive than normal build commands and must print what
they will remove/reset before running. Add `--dry-run` where platform scripts
support it or where the CLI can safely preview.

### Backend, Endpoint, Self-Host

`windie backend health` should probe configured or explicit backend health
routes and explain expected auth-related statuses.

`windie backend deploy` should wrap the remote deploy script only in the correct
context. If run locally, it should either SSH to a target explicitly provided by
the user or print the remote-host command to run. It must not assume a host.

`windie backend service ...` should manage known backend systemd service names
for explicit local/remote targets. Service commands must be clear about system
vs user scope.

`windie endpoint show|local|hosted|probe` should make backend endpoint
selection visible. This is especially important because Electron, SDK, and
sidecar endpoint propagation can diverge if environment variables are unclear.

`windie self-host ...` should wrap the existing Cloudflare/self-host scripts
without pretending they are generic local development commands.

### Extension, Tools, Mock

`windie extension create <id>` wraps `scripts/create-windie-extension`.

`windie tools manifest generate` wraps
`scripts/generate-builtin-tool-manifest`.

`windie mock backend` wraps `scripts/mock-backend.cjs`.

These are developer-facing convenience commands and should remain narrow.

## Implementation Strategy

Use a small Node-based CLI at the repo root.

Reasons:

- Windie already requires Node for frontend/Electron work.
- Node handles cross-platform process spawning more cleanly than shell.
- The frontend package already uses CommonJS launcher scripts.
- The CLI can call shell, npm, Python, and PowerShell helpers without forcing a
  new Python packaging layer.

Initial file shape:

```text
bin/windie
scripts/windie-cli.cjs
scripts/windie/
  command_registry.cjs
  output.cjs
  run.cjs
  status.cjs
  doctor.cjs
  lifecycle.cjs
  logs.cjs
  tests.cjs
  docs.cjs
  build_package.cjs
  backend.cjs
  endpoint.cjs
  self_host.cjs
  extension.cjs
  tools.cjs
```

Keep modules smaller if the actual implementation stays simple. Do not add a
large framework unless the implementation clearly needs it.

## Ordered Implementation Plan

1. Re-read relevant docs and command surfaces:
   - `AGENTS.md`
   - `docs/install/README.md`
   - `docs/install/local_backend_and_endpoint_setup.md`
   - `docs/debug/test_selection.md`
   - `docs/debug/process_health_checklist.md`
   - `docs/debug/diagnostic_flags.md`
   - `docs/debug/logging.md`
   - `docs/operations/remote_backend_auto_deploy.md` if touching deploy
   - `docs/operations/cloudflared_self_host_windieos.md` if touching self-host
2. Inventory existing command targets with `rg` and classify each as:
   public CLI command, internal adapter, docs-only snippet, deprecated helper,
   or out of scope.
3. Add the root CLI skeleton:
   - executable `bin/windie`
   - command registry
   - shared spawn helper
   - shared output helpers
   - `--help` and unknown-command errors
4. Implement the MVP commands:
   - `windie status`
   - `windie status --all`
   - `windie doctor`
   - `windie doctor --json`
   - `windie start backend`
   - `windie start frontend`
   - `windie start desktop`
   - `windie test backend`
   - `windie test sidecar`
   - `windie test frontend`
   - `windie test all`
   - `windie docs list`
   - `windie docs check`
5. Add tests for command parsing, spawn routing, JSON status/doctor output, and
   command suggestions. Mock spawned commands; do not launch real Electron in
   unit tests.
6. Add lifecycle orchestration:
   - `windie start all`
   - process label output
   - Ctrl-C child cleanup
   - `windie stop` for tracked processes only
   - `windie restart desktop`
7. Add logs:
   - backend local guidance
   - backend remote wrapper
   - desktop/sidecar log guidance or concrete log paths where available
8. Add docs helpers:
   - `windie docs open <topic>` using docs metadata/search
   - command replacement docs for old snippets
9. Add build/package/reinstall commands, preserving platform-specific behavior
   and safety prompts/messages for destructive reinstall flows.
10. Add backend and endpoint commands:
    - health
    - endpoint show/local/hosted/probe
    - backend service commands
    - deploy wrapper or clear remote-host instructions
11. Add self-host, extension, tools, and mock commands.
12. Update docs and `AGENTS.md` command sections to prefer `windie ...`.
13. Update `CHANGELOG.md` with the new user-facing command surface.
14. Run validation and inspect the final command map for duplicate or leaking
    public surfaces.

## First Slice Success Criteria

The first implementation slice is complete when:

- `bin/windie` exists and is executable.
- `windie --help` shows grouped commands.
- `windie status` returns useful concise human output.
- `windie status --all --json` returns a stable JSON object.
- `windie doctor --json` returns machine-readable diagnostics.
- `windie start backend|frontend|desktop` route to existing launchers.
- `windie test backend|sidecar|frontend|all` route to existing test commands.
- `windie docs list` and `windie docs check` work from repo root.
- Unit tests cover parsing and spawn routing without launching services.
- Docs mention the new commands and keep old scripts as internal/compatibility
  details where still needed.

## Full Command Surface Success Criteria

The full plan is complete when every user-approved command listed in this plan
exists, has help text, has human-readable output, and either has `--json` where
diagnostic/status-like or clearly documents why JSON is not useful.

Additionally:

- public docs prefer `windie ...` over scattered script/npm invocations
- old scripts are either internal implementation details or marked for future
  deletion
- command behavior is deterministic from repo root
- Python commands always route through `scripts/python-in-env`
- frontend npm commands never require users or coding agents to `cd frontend`
- backend/endpoint/self-host commands distinguish local, hosted, and remote
  operations explicitly
- no command silently mutates system services, app data, permissions, or remote
  hosts without clear command intent

## Validation Plan

Docs-only plan validation:

```bash
./bin/docs-list
git diff --check
```

First implementation slice validation:

```bash
./bin/docs-list
git diff --check
bin/windie --help
bin/windie status
bin/windie status --all --json
bin/windie doctor --json
bin/windie docs list
bin/windie docs check
node scripts/windie-cli.cjs --help
```

Focused test validation after CLI unit tests are added:

```bash
cd frontend && npm run test:ci -- WindieCli
```

Runtime routing smoke checks:

```bash
bin/windie test backend -- --help
bin/windie test sidecar -- --help
bin/windie test frontend -- --help
```

Long-running process checks should be run manually when that slice lands:

```bash
bin/windie start backend
bin/windie start frontend
bin/windie start desktop
bin/windie start all
```

Packaging, reinstall, backend deploy, and self-host commands need targeted
validation only when their slices are implemented because they can be slow,
platform-specific, or stateful.

## Out Of Scope

- Rewriting backend, SDK, Electron, renderer, or sidecar runtime ownership.
- Replacing the desktop app UI.
- Changing package publishing/versioning.
- Deleting existing scripts before the `windie` replacements are proven.
- Making `windie` an npm-published package in the first pass.
- Automatically managing unrelated processes that were not started by
  `windie`.
- Running destructive reinstall/deploy/self-host actions during the first CLI
  slice.

## Risks And Constraints

- Long-running process orchestration can become messy if `start all` tries to
  act like a full supervisor too early. Keep the first version foreground,
  labeled, and Ctrl-C friendly.
- `windie stop` must not kill unrelated Electron, Python, or Node processes.
  It should stop tracked child processes only unless a later explicit
  `--force-all` style option is approved.
- Remote backend and self-hosting commands must not assume `windie-prod` or a
  Cloudflare account unless the user passes explicit options or documented env.
- Reinstall commands are intentionally destructive to app state and permission
  grants. They need clear previews and platform-specific guardrails.
- JSON output must be stable enough for coding agents. Avoid emitting ad hoc
  strings where a typed status object is expected.

## Reread Anchors After Compaction

Before continuing implementation after context loss, reread:

- this plan
- the matching report file, once it exists
- `AGENTS.md`
- `docs/debug/test_selection.md`
- `docs/debug/process_health_checklist.md`
- `docs/install/README.md`
- `frontend/package.json`
- `scripts/run-backend`
- `scripts/run-frontend-dev`
- `scripts/run-frontend-electron`
- `scripts/test`
- `scripts/test-backend`
- `scripts/test-sidecar`
- `scripts/dev/backend-logs`
- `scripts/deploy/update-remote-backend`
- `scripts/cloudflared/*`
- `scripts/create-windie-extension.cjs`
- `scripts/generate-builtin-tool-manifest`
- `scripts/mock-backend.cjs`

Then run a fresh command inventory:

```bash
rg -n "scripts/run|run-backend|run-frontend|electron:dev|test-backend|test-sidecar|backend-logs|docs-list|npm run|python-in-env|deploy/update-remote-backend|reinstall-windieos|create-windie-extension|generate-builtin-tool-manifest|mock-backend|windie " docs README* AGENTS.md frontend/package.json scripts bin -S --glob '!frontend/node_modules/**'
```

Classify every hit before deciding the next implementation slice.
