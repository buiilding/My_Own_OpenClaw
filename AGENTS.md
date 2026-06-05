# Repository Guidelines

## Purpose

WindieOS is a desktop AI operator. The user gives a goal in natural language;
WindieOS selects and runs tools to achieve it safely and reliably.

This file is the operating guide for coding agents. It should explain how to
work in this repo, how to choose the owning runtime, and which rules must not be
violated. Detailed architecture belongs in `docs/`, not here.

## Prime Rules

- Be unbiased and logical first.
- Before editing, identify the owning runtime: backend, SDK, Electron main,
  renderer frontend, preload, or Python sidecar.
- Use live files, docs, tests, logs, and recent commits over assumptions.
- Prefer deletion-first simplification over compatibility layers that keep
  duplicate authorities alive.
- Preserve the intended feature set while simplifying ownership.
- Do not make frontend or sidecar import backend code at runtime. Use public
  transport contracts, manifests, docs, and tests for parity.
- Do not add another bridge, store, facade, or runtime loop for behavior the SDK
  or backend already owns.
- Keep edits small, reviewable, and scoped to the requested behavior.
- Preserve unrelated dirty worktree changes.

## Runtime Ownership

Start every change by choosing the producer of truth, then update consumers.

| Runtime | Owns | Must not own |
| --- | --- | --- |
| Backend | Agent loop, prompt construction, provider routing, hosted APIs, backend remote tools, model-facing policy, history, compaction, OCR/vision/artifacts, hosted auth | Local mouse/keyboard/browser/filesystem/shell execution, desktop windows, Electron settings UI |
| SDK runtime | `WindieClient.wakeUp(...)`, backend websocket lifecycle, local sidecar startup/reuse, conversation runtime, local-tool coordination, tool-result return, normalized conversation events, stores, replay/rehydrate projections | Electron-only window policy, sidecar implementation details, backend prompt/provider policy |
| Electron main | BrowserWindow lifecycle, app/menu/tray lifecycle, IPC handlers, preload-facing transport, endpoint diagnostics, native permissions, platform window policy, sidecar/wakeword supervision, Electron-specific tool surface leases | Agent loop, prompt compiler, durable conversation semantics, websocket/tool orchestration duplicated outside SDK |
| Renderer frontend | User-facing display state: dashboard, chat surfaces, settings, models, memory, usage, search, voice, transcript rendering, display-only tool state | Tool execution, backend websocket loops, durable runtime authority, raw local machine authority, secret-bearing auth decisions |
| Preload | Narrow context-isolated IPC allowlist | Business logic, policy decisions, storage semantics |
| Python sidecar | Local machine authority: filesystem, shell/process, computer-use actions, browser mechanics, local memory/storage, system probes, sidecar executable tool validation | Backend orchestration, prompt policy, provider routing, hosted auth, renderer UI state |
| Docs and tests | Durable contracts, routing maps, parity checks, regression evidence | Runtime behavior |

If ownership is ambiguous, use:

- `docs/getting-started/docs_directory.md`
- `docs/reference/code_change_surface_index.md`
- `docs/architecture/runtime_boundary_matrix.md`
- `docs/architecture/change_ownership_decision_tree.md`

## Required Orientation

Before coding or answering implementation questions:

- Run docs listing when available: prefer `./bin/docs-list`, fall back to
  `node scripts/docs-list.js`.
- Check `docs/docs.json` and `docs/getting-started/docs_directory.md` when
  choosing docs.
- Read the nearest `read_when` docs until the domain and behavior are clear.
- Inspect recent related commits for files, symbols, or subsystems you will
  touch. Use `git log`, `git show`, and `git blame` to understand why the
  current behavior exists.
- Do not treat recent commits as automatically correct. Compare intent, current
  code, tests, docs, and live behavior before deciding whether to restore,
  revise, or continue the current direction.
- Use `rg` and live files over memory or assumptions.

## Change Routing

Use the docs as the detailed source map. Common routes:

| Change type | Start with |
| --- | --- |
| Backend API route | `docs/backend/api/api_route_change_workflow.md` |
| SDK route or client method | `docs/sdk/sdk_route_change_workflow.md` |
| Model-visible tool | `docs/tools/tool_schema_policy_change_workflow.md` |
| Filesystem or shell behavior | `docs/tools/filesystem_shell_change_workflow.md` |
| Browser automation | `docs/browser/browser_change_workflow.md` |
| Renderer/main/sidecar ownership bug | `docs/architecture/frontend_architecture.md` and `docs/architecture/runtime_boundary_matrix.md` |
| Storage or transcript behavior | `docs/architecture/storage_persistence_change_workflow.md` |
| Permission or local authority | `docs/security/permissions_and_local_authority_workflow.md` |
| Overlay/chat pill/runtime surface bug | `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md` and `docs/desktop/minimal_chat_pill.md` |
| Release or packaging | `docs/operations/release_packaging_change_workflow.md` |

## Architecture Behavior Rules

- Fix the producing runtime first, then update consumer projections.
- Keep backend-owned model/provider/prompt/tool-policy decisions in backend.
- Keep reusable chat/session/tool/result/projection behavior in the SDK when it
  should work for Electron, CLI, custom UI, plugins, or tests.
- Treat Electron as a first-party SDK host, not a separate agent runtime.
- Electron-specific window, IPC, screenshot, permission, and app lifecycle code
  stays in Electron main or renderer facades.
- Renderer code displays state and sends user intent. It must not execute local
  tools, route backend tool results, rebuild transcript semantics, or own model
  sync.
- Sidecar owns local execution and local storage mechanics. It must not
  construct backend prompt context or import backend code.
- Normalize inputs at runtime boundaries. Fail fast on invalid state.
- Prefer named handlers, typed dispatchers, or explicit state tables over
  nested conditionals and branch-heavy fallback paths.
- Do not keep backward-compatibility shims unless the user explicitly requests
  compatibility or there is a verified dependency.
- If a narrow patch would preserve the wrong source of truth, pause and state
  the larger boundary movement required.

## Tool and Extension Contracts

- Tools execute on the Python sidecar unless they are explicit backend remote
  tools such as `web_search`.
- Client-local tool schemas and executable argument validation are client-side:
  the SDK/Electron/sidecar manifest is assembled from selected built-ins plus
  added tools, plugins, MCPs, and related extension contributions, and the
  sidecar/local executor validates executable payloads before running them.
- Backend validates client-provided tool manifests only as a trust/envelope and
  model-facing contract: shape, size, reserved names, policy gates, provider
  projection, and accepted/rejected transparency. Backend default built-in
  schemas exist as a hosted fallback, but client-local executable arguments are
  not backend-owned.
- Backend-owned remote tools keep backend-owned schemas, backend argument
  validation, execution, result conversion, history commit, and final prompt
  compilation.
- Frontend/sidecar own local tool implementations and executable manifests for
  client-local tools; they must not import backend code for schema parity.
- Tool changes must update the client tool manifest, docs, and focused tests in
  the same change.
- Computer-use tools must return automatic post-action screenshot context in
  their tool outputs. Tool bundles that include any computer-use action must
  also return screenshot context for the bundle output.
- Built-in grounded tools must preserve the model-schema vs prepared-argument
  distinction. Use `backend_grounding` only when OCR/vision/prediction prepares
  executable sidecar arguments; otherwise use `passthrough`.
- Prefer parity tests that verify schemas and registries do not drift.
- Extensions keep contribution types separated: metadata in
  `extensions/<id>/extension.json`, plugin code in `plugin/index.cjs`, MCP
  server config in `mcp/servers.json`, skills in `skills/<skill-id>/SKILL.md`,
  sidecar schemas in `tools/`, and sidecar code in `python/`.
- Keep `docs/development/extensions.md` as the extension authoring guide and
  `docs/plugins/README.md` as the routing hub.

## Frontend Runtime Wiring

For complex UI or runtime bugs:

- Define the state machine and event timeline before changing code.
- Keep one behavior scope per patch.
- Avoid mixing focus, visibility, click-through, and transport changes in one
  implementation.
- Declare phase invariants explicitly.
- Centralize cross-process surface control in one orchestrator or module.
- Add deterministic transition logging for each phase change.
- Keep dev and prod gating explicit.
- Test both paths when behavior differs by mode.
- Add scenario tests for race-prone flows.

If requirements conflict or timing semantics are ambiguous, resolve the spec
conflict before implementation.

## Environment and Commands

Baseline: Python 3.11 and Node 18+.

Conda environments:

- Backend runtime and backend tests: `jarvis`
- Frontend app, sidecar, and frontend tests: `frontend_jarvis`

Do not manually activate environments. Use:

- `./scripts/python-in-env <backend|frontend|sidecar> <cmd...>`

If the expected conda environment is missing, the script falls back to the
current shell environment.

Install and run:

- Backend deps: `pip install -r backend/requirements.txt`
- Frontend deps: `cd frontend && npm install`
- Backend dev server: `python -m backend.src.main`
- Frontend UI with Vite: `cd frontend && npm run dev`
- Electron dev app: `cd frontend && npm run electron:dev`
- Electron customer app: `cd frontend && npm run electron`

Validation:

- Backend tests: `./scripts/test-backend`
- Sidecar tests: `./scripts/test-sidecar`
- Frontend tests: `cd frontend && npm run test`
- Frontend CI tests: `cd frontend && npm run test:ci`
- Frontend lint: `cd frontend && npm run lint`
- Docs listing: `./bin/docs-list`

## Coding Standards

- Keep modules focused and split large files when it improves clarity or
  testability.
- Prefer simple, intuitive implementations.
- Minimize conditionals by making ownership, state, and input shape explicit
  before core logic runs.
- Remove unused code in touched areas.
- Backend code uses Python with type hints, async I/O where appropriate, and
  existing `backend/src` patterns. Use `black` and `isort` when touching related
  backend code.
- Frontend code uses TypeScript or JavaScript with ESM and React. Keep renderer
  logic in `src/renderer`, main-process and IPC logic in `src/main`, and use
  `eslint` when touching related frontend code.
- Add comments only where they clarify non-obvious behavior.

## Docs and Testing Policy

When behavior or APIs change:

- Update docs in the same change.
- Update existing tests and add focused coverage for changed behavior, likely
  regressions, and realistic edge/failure cases.
- Add `read_when` hints for cross-cutting docs when useful.
- Use `pytest` for backend and sidecar tests.
- Use `jest` for frontend tests.
- Put new tests under `tests/backend`, `tests/sidecar`, `tests/frontend`, or
  `tests/sdk` unless extending an existing test module.
- Prefer unit-level tests with minimal I/O.
- Mock network and system calls.
- If you change tool parsing, execution flow, or IPC, add tests across backend,
  sidecar, frontend, and SDK as needed.
- Purely visual UI tweaks may skip new tests when they would be low-signal.

## Completion Check

Before finishing, verify:

- The touched path is not more duplicated or more coupled without a clear
  reason.
- Tests cover the cleaned-up behavior and boundaries.
- You removed at least as much complexity as you added.
- Any new abstraction has a deletion or consolidation payoff.
- No obsolete UI, bridge, alias, compatibility path, or fallback remains in the
  touched area without a stated reason.
- Security-sensitive changes were checked for trust-boundary, permission,
  credential, IPC, tool-execution, and machine-specific path regressions.
- Storage, API, event-payload, tool-schema, settings, or persisted-data changes
  include an explicit migration or compatibility note, even when the note is
  that no migration is required.

For every completed fix or behavior change, explain:

- How you implemented it.
- What the previous behavior was.
- What the current behavior is after the fix.
- Which validation commands were run.
- Any validation command that was intentionally skipped or could not run, with
  the reason.

## Git and PR Workflow

Safe defaults:

- Allowed by default: `git status`, `git diff`, `git log`.
- Commits are pre-authorized for completed work.
- Push only when the user asks.
- Branch changes require user consent.
- `git checkout` is allowed for PR review or explicit user request.

Forbidden without explicit approval:

- Destructive commands such as `git reset --hard`, `git clean`, `git restore`,
  and `rm`.

Commit policy:

- If you change files, commit that work before handing the turn back unless the
  user explicitly says not to commit.
- Update `CHANGELOG.md` before committing repo-visible changes.
- Preferred helper: `./scripts/committer` or `committer`.
- `--body` is required for every commit.
- The commit body must describe the issue, the fix and improvements, previous
  behavior, and behavior after the fix.
- Use Conventional Commits with a body section.

Additional git notes:

- Use HTTPS remotes; flip SSH to HTTPS before pull or push if needed.
- Do not delete or rename unexpected files.
- No repo-wide search-and-replace scripts.
- Keep edits small and reviewable.
- Avoid manual `git stash`.
- For large reviews, use `git --no-pager diff --color=never`.
- In multi-agent situations, check `git status` and `git diff` before editing.

PR modes:

- Review mode: use `gh pr view` and `gh pr diff`; do not switch branches or
  change code.
- Landing mode: create an integration branch from `main`, bring in PR commits
  with rebase or squash, apply fixes, run relevant tests, merge back to `main`,
  and delete the temporary branch.
- PR summaries must mention testing performed and user-facing changes.

Release flow:

- Look for release instructions in `docs/`, `RELEASING.md`, or `release.md`.
- Do not change version numbers or publish artifacts without explicit approval.
- Before any release step, run the relevant tests.
- If UI is touched, include frontend test, lint, and build checks as appropriate.
- For local macOS reinstalls, skip Apple notarization so local rebuild/reinstall
  loops do not wait on Apple services.

## Security and Configuration

- API keys must come from environment variables.
- Core config lives in `backend/src/core/config/app_config.py` and
  `backend/src/core/config/models.py`.
- Do not commit real credentials, user data, or machine-specific paths to docs
  or tests.
- Never edit `node_modules` or vendored dependency output.
- Dependency patching, overrides, or vendored changes require explicit approval.

## Working Style

- When the user asks a question, inspect the relevant code and report first; do
  not modify files unless the user asks for implementation or approves changes
  after the report.
- Avoid guessing; if unsure, read more code first.
- If still blocked, ask with short options.
- Call out conflicts and choose the safer path.
- Report only files and behavior you changed.
- Stop and ask only if unexpected changes affect files you are actively editing.
- For fixes, first reconstruct the recent change history around the failing
  path: identify the producer, consumer, deleted path, and intended replacement.
- Prefer fixes that preserve the latest architecture direction instead of
  reverting to an older duplicated path.
- For new development, read recent related commits and adjacent implementation
  patterns before adding code.
- For larger refactors or multi-turn changes, maintain a scratch log of
  decisions, tradeoffs, validation commands, blockers, and assumptions.
- For moderate or major implementation changes, create or update `task.md`
  before editing code. After writing `task.md`, stop and ask the user to
  confirm before proceeding.
- While executing an approved `task.md`, keep the checklist and success
  criteria current.

For architectural or product-flow questions, explain conceptually first:
describe how the runtime works, where a change fits, what boundaries change, and
why. Do not mention file paths, symbol names, or implementation breadcrumbs
unless the user explicitly asks.

## Issues, PR Comments, and tmux

- Use literal multiline strings or heredocs for real newlines in posted issues
  and PR comments.
- Do not use `\\n` in posted text.
- Use tmux only when persistence or interactive debugging is needed.

## Product-Specific Regression Contracts

Keep narrow product contracts in docs with `read_when` hints instead of growing
this file into an implementation ledger.

- Chat pill and response overlay behavior:
  `docs/desktop/minimal_chat_pill.md` and
  `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`
- Platform screenshot and overlay policy:
  `docs/platforms/screenshot_overlay_policy.md`
