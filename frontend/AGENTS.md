## Public Frontend Agent Instructions

These instructions apply to the public Windie repository and to the
`frontend/` subtree inside the private WindieOS monorepo. Treat this file as
self-contained. Do not climb to a parent private `AGENTS.md` unless the user
explicitly asks you to work in the private monorepo outside this public
frontend surface.

## Required Orientation

Before coding or answering implementation questions:

- Search local docs by feature or symptom:
  `<windie> docs search <query>` or the shorthand `<windie> docs <query>`.
  Use `bin\windie.cmd` on Windows PowerShell/CMD and `bin/windie.sh` on
  Unix-like shells; examples below use `<windie>` for the platform shim.
- Read the nearest `read_when` docs until the domain and behavior are clear.
- Check `<windie> --help` and the command registry for existing commands tied
  to the affected runtime or failing path.
- Search recent public commits by affected feature or symptom:
  `<windie> commits search <query>`.
- Read `docs/debug/invariants.md` only when an invariant, regression, or
  durable behavior rule is relevant.

Fast routing queries:

- `<windie> docs test selection`
- `<windie> docs frontend architecture`
- `<windie> docs renderer state`
- `<windie> docs main process`
- `<windie> docs ipc change`
- `<windie> docs local runtime`
- `<windie> docs sidecar tool`
- `<windie> docs tool schema policy`
- `<windie> docs extension`
- `<windie> docs mcp`
- `<windie> docs landing page`
- `<windie> docs release packaging`

## Public Surface

This repository owns the public Windie developer surface:

- Electron main-process code in `src/main`.
- React renderer code in `src/renderer`.
- Preload and IPC client boundaries.
- Local runtime and local-runtime Python implementation under `src/main/python`.
- SDK/package code under `packages`.
- Public docs under `docs`.
- Public extension, skill, plugin, MCP, example, and safe `bin/windie` tooling.
- Public workflows that build, test, or package this frontend surface.

Backend implementation code, private deployment operations, backend private
docs, production secrets, and private runbooks are not part of this public
surface.
Public docs may describe hosted backend contracts, SDK routes, websocket
events, or model/tool behavior, but do not treat those docs as permission to
edit private backend implementation.

If a change truly requires private backend source, say that the private
WindieOS repo is required and stop at the public contract boundary.

## Architecture Rules

- Be unbiased and logical first.
- Treat every user-visible or runtime bug as a discovered invariant.
- Prefer the direct owner-correct path: fix root causes at the owning runtime,
  normalize inputs at boundaries, fail fast on invalid state, and split
  distinct states into named handlers instead of stacking nested fallbacks.
- Prefer deletion-first cleanup. Remove duplicate authorities, stale bridges,
  alias paths, compatibility shims, legacy code, and adapter layers that only
  rename payloads unless the user explicitly asks for compatibility or a
  verified dependency needs it.
- Widen only within the same public runtime boundary when it reduces code,
  duplication, coupling, or future compatibility burden.
- Escalate before crossing from public frontend/local-runtime/SDK contracts
  into private backend implementation or deploy operations.
- Add abstractions only when they simplify the current path, centralize a real
  contract, unlock deletion, or make an invariant testable.
- Keep renderer code in `src/renderer`, main-process and IPC code in
  `src/main`, preload code in `src/preload.js`, local-runtime Python under
  `src/main/python`, and public package code under `packages`.
- Preserve unrelated dirty worktree changes. Report only files and behavior you
  changed, and stop only if unexpected changes affect files you are editing.

## Commands

Run commands from the public repository root. Inside the private monorepo, that
root is `frontend/`.

Environment baseline: Python 3.11 and Node 18+.

Prefer the public wrapper over manual environment activation:

- Windows PowerShell/CMD: `bin\windie.cmd <command> [options]`
- Unix-like shells: `./bin/windie.sh <command> [options]`

Useful validation commands:

- Docs check: `<windie> docs check`
- Frontend tests: `<windie> test frontend`
- Focused frontend tests: `<windie> test frontend -- <pattern-or-file>`
- Local-runtime Python tests: `<windie> test local-runtime`
- Local-runtime compatibility alias: `<windie> test sidecar`
- Frontend lint: `npm run lint`
- Frontend build: `<windie> build frontend`
- Local-runtime build: `<windie> build local-runtime`

Do not use backend-only commands from this public surface. Backend validation,
deployment, service control, and private-doc search belong to the private
WindieOS repo.

## Docs And Testing Policy

When behavior, APIs, IPC contracts, tool schemas, package surfaces, config,
packaging, or public docs change:

- Update public docs and focused tests in the same change.
- Cover changed behavior, likely regressions, and realistic edge/failure cases.
- Add `read_when` hints for cross-cutting docs when useful.
- Use Jest for frontend/main/renderer/IPC/package tests.
- Use pytest for local-runtime Python tests.
- Put new tests under `tests/frontend`, `tests/sidecar`, or `tests/sdk` unless
  extending an existing test module.
- Prefer unit-level tests with minimal I/O.
- Mock network and system calls.
- If you change tool parsing, execution flow, IPC, SDK contracts, or local
  runtime execution, add owner-correct coverage at the changed boundary.
- Purely visual UI tweaks may skip new tests when they would be low-signal, but
  still run lint/build or the relevant focused check.

## Git And PR Workflow

Safe defaults:

- Allowed by default: `git status`, `git diff`, `git log`.
- Push only when the user asks.
- Branch changes require user consent.
- Use HTTPS remotes.
- Avoid deleting or renaming unexpected files.
- Prefer targeted edits over repo-wide search-and-replace scripts.

Requires explicit approval:

- Destructive commands such as `git reset --hard`, `git clean`,
  `git restore`, and `rm`.
- Dependency patching, overrides, or vendored changes.
- Version changes or publishing release artifacts.

Commit policy:

- Commit completed changes by default after implementation and validation,
  unless the user explicitly asks not to commit or asks to inspect/test first.
- Prefer small, reviewable commits.
- Use Conventional Commits with a body section.
- Update `CHANGELOG.md` before committing repo-visible changes.
- Do not amend unless asked.

## Security And Configuration

- API keys and tokens must come from environment variables or platform secret
  storage, never source files, docs, tests, or browser-visible bundles.
- Keep real credentials, user data, and machine-specific paths out of docs and
  tests.
- Leave `node_modules` and vendored dependency output untouched.
- Public docs may describe backend contracts, but must not include private
  backend source, deploy secrets, internal runbooks, or production credentials.

## Public Repo Split Notes

The public repo is mirrored into the private repo at the `frontend/` subtree.
Public changes made here should remain safe to push to the public Windie repo.
Public commit search is scoped to this public root, so running
`<windie> commits search` from the private monorepo's `frontend/` subtree must
not surface backend-only private history.
