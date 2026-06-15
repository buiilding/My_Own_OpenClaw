# Repository Guidelines

## Product Contract

WindieOS is a desktop AI operator. The user gives a goal in natural language;
WindieOS selects and runs tools to achieve it safely and reliably.

The product spans Electron UX, the Windie SDK runtime, a Python sidecar for
local authority, and a Python FastAPI backend for hosted or self-hosted agent
orchestration. Frontend and sidecar code must not import backend code at
runtime. Use public transport contracts, manifests, docs, and tests for parity.

## Detailed Architecture Reference

Keep this file focused on rules, coding behavior, and ownership boundaries.
Detailed project structure, dependency chains, backend agent runtime, SDK and
frontend architecture notes, runtime flows, and source-map entry points live in
`docs/development/agent_architecture_reference.md`.
The detailed runtime ownership matrix and change-routing table live in
`docs/development/agent_runtime_ownership_and_change_routing.md`.

## Required Orientation

Before coding or answering implementation questions:

- Identify the owning runtime before editing code. Use
  `docs/development/agent_runtime_ownership_and_change_routing.md` for the
  owner matrix and common change routes.
- Check canonical docs navigation in `docs/docs.json` and the compact route map
  in `docs/getting-started/docs_directory.md` when choosing docs.
- Run docs listing when available: use `bin/windie docs list`; ignore only if
  the Windie CLI is unavailable.
- Search local docs by feature or symptom when orientation is incomplete:
  `bin/windie docs search <query>` or the shorthand `bin/windie docs <query>`.
- Read the nearest `read_when` docs until the domain and behavior are clear.
- When finding or fixing a bug, check `bin/windie --help` and the command
  registry behind it for existing commands tied to the affected runtime or
  failing path. Prefer the relevant `bin/windie` diagnostics, logs, trace,
  conversation, docs, start, and `test pick` commands for reproduction,
  inspection, and validation before inventing ad hoc shell commands. If no
  existing command, diagnostic, trace, or log exposes the bug, add a focused,
  sanitized diagnostic or command at the owning runtime as part of the fix so
  the same failure can be reproduced and validated deterministically later.
- Before fixing a bug or adding behavior, inspect recent related commits for
  the files, symbols, or subsystem you are touching. Use `git log`, `git show`,
  and `git blame` to understand what changed recently, why the current behavior
  exists, and whether the bug is a regression from a refactor, deletion, or
  ownership move.
- Do not treat recent commits as automatically correct. Use them as context:
  compare the commit intent, current code, tests, docs, and live behavior before
  deciding whether to restore, revise, or continue the current direction.
- Use `rg` and live files over memory or assumptions.
- Use the repo-local docs and code as canonical; this file is a routing guide,
  not an exhaustive source map.

Detailed source-map entry points are in
`docs/development/agent_architecture_reference.md`.

## First-Context Feature Map

`AGENTS.md` is the first durable context most coding agents receive. Keep this
map current enough that an agent can discover implemented features quickly, then
route to docs/code for details instead of relying on memory.

Core WindieOS feature areas:

- Desktop shell: minimal chat pill, response overlay, dashboard, onboarding,
  permissions, window/overlay lifecycle, and desktop logs.
- Agent runtime: SDK `WindieClient`/`WindieAgent`, conversation runtime, live
  turn projection, replay, compaction, title generation, and local/hosted query
  routing.
- Local authority: Python sidecar, executable tool catalog, computer-use,
  browser-use, filesystem, shell, screenshots, OCR/vision, wakeword, voice, and
  local memory.
- Hosted/backend authority: FastAPI routes, websocket query stream, provider
  policy, prompt compilation, remote tools such as `web_search`, artifacts,
  runs API, install auth, and deploy/runtime operations.
- Extensibility: SDK tools, built-in tool manifests, extension packages, plugin
  tools, MCP server config, skills as prompt layers, provider integrations, and
  future marketplace/plugin boundaries.
- Persistence and memory: renderer transcripts, session/conversation identity,
  backend active history, sidecar episodic/semantic memory, artifacts, caches,
  and migration/compatibility notes.

Fast routing queries:

- `bin/windie docs minimal chat pill`
- `bin/windie docs overlay phase`
- `bin/windie docs tool schema policy`
- `bin/windie docs sidecar tool`
- `bin/windie docs conversation runtime`
- `bin/windie docs memory replay`
- `bin/windie docs provider change`
- `bin/windie docs websocket event`
- `bin/windie docs runs api`
- `bin/windie docs extension`
- `bin/windie docs screenshot overlay`
- `bin/windie docs test selection`

## Architecture Rules

- Prefer deletion-first cleanup over compatibility layers that keep duplicate
  authorities alive.
- Prefer the cleanest ownership refactor that fixes the problem at its source.
  Do not default to the narrowest patch when a broader change deletes code,
  removes duplicate authorities, centralizes a contract, or makes the boundary
  more foundational with less total complexity. If converging duplicated
  runtimes, stores, bridges, or transport paths realistically needs cross-module
  or cross-runtime work, state that scope plainly, name the boundaries that must
  move, and explain why a smaller patch would preserve the wrong source of
  truth.
- Fix root causes, not symptoms, and do not layer workarounds on top of messy
  local design when a small refactor can remove the problem.
- Prefer clear, deterministic execution paths over branch-heavy defensive code.
  Normalize inputs at the runtime boundary, fail fast on invalid state, and
  split distinct states into named handlers instead of stacking nested `if`,
  fallback, and compatibility paths through one flow.
- New chat/runtime behavior should move into the SDK runtime first when useful
  outside one Electron surface.
- Avoid new Electron-only bridges for behavior that belongs to `WindieClient`,
  `WindieAgent`, `ConversationRuntime`, `LocalSidecarRuntime`, SDK stores, SDK
  projections, or SDK tool routing.
- When replacing Electron bridge behavior with SDK behavior, include a deletion
  milestone for the old bridge/store/helper path in the same change or the next
  explicit phase.
- Do not add adapter layers whose only job is to rename and forward payloads.
  Adapters must enforce a real runtime, security, lifecycle, or test boundary.
- Do not keep backward-compatibility shims unless the user explicitly requests
  compatibility or there is a verified dependency.
- Add code only when it enables a simpler ownership boundary, removes
  duplication, unlocks deletion of legacy paths, or makes a real invariant
  testable.
- Leave touched areas better than you found them by removing dead code,
  collapsing duplication, tightening interfaces, or renaming misleading symbols
  where it directly supports the task.
- Pause and propose a refactor if the planned change would otherwise duplicate
  existing behavior, add special-case logic to an already confusing flow, extend
  a large mixed-responsibility function or component, make testing awkward
  because responsibilities are poorly separated, add another bridge/facade/store
  for chat, tool execution, sidecar events, conversation history, replay, memory,
  model settings, or overlay phase without retiring the older path, or keep
  Electron and SDK paths as parallel sources of truth for the same runtime
  behavior.
- Widen scope without hesitation when the wider change is still owned by the
  same runtime boundary and reduces code, duplication, coupling, or future
  compatibility burden. Escalate before widening only when cleanup would cross
  subsystem ownership boundaries, change public contracts, or require a large
  multi-file rewrite.

## Tool and Extension Contracts

- Tools execute on the Python sidecar unless they are explicit backend remote
  tools such as `web_search`.
- Local tool schemas are client-side: the SDK/Electron/sidecar manifest is
  assembled from selected built-ins plus added tools, plugins, MCPs, and related
  extension contributions. Backend default built-in schemas exist as a fallback
  and hosted default, but the client manifest may overwrite the active local
  tool surface.
- Backend validates client-provided tool manifests, enforces schema limits and
  trust boundaries, applies policy/provider projection, owns backend remote
  tools, and owns final prompt compilation.
- Frontend/sidecar own local tool implementations and executable manifests for
  client-local tools; they must not import backend code for schema parity.
- Tool changes must update the client tool manifest, docs, and focused tests in
  the same change.
- MCP tool results must preserve the raw MCP result for every MCP tool, current
  and future. The MCP adapter may wrap results in WindieOS native tool
  call/tool output envelopes, but must not summarize, flatten, or discard MCP
  `content`, `structuredContent`, or other returned fields. Model-facing
  `data.output` should contain the MCP result content, and `data.mcp_result`
  should keep the raw object for inspection. If an MCP result contains image
  content, additively promote it into WindieOS native image fields such as
  `data.screenshot` and `data.screenshot_content_type` without rewriting or
  removing the raw MCP result.
- Computer-use tools must return automatic post-action screenshot context in
  their tool outputs. Tool bundles that include any computer-use action must
  also return screenshot context for the bundle output; capture once after the
  bundle unless an explicit successful screenshot step already provides the
  needed image.
- Built-in grounded tools must preserve the model-schema vs prepared-argument
  distinction. Use `backend_grounding` only when OCR/vision/prediction prepares
  executable sidecar arguments; otherwise use `passthrough`.
- Example: backend may resolve higher-level screen intent into coordinates while
  frontend receives and executes a simpler action such as `click(100, 200)`.
- Prefer parity tests that verify schemas and registries do not drift.
- Extensions must keep contribution types separated inside one package:
  metadata in `extensions/<id>/extension.json`, plugin code in
  `plugin/index.cjs`, MCP server config in `mcp/servers.json`, skills in
  `skills/<skill-id>/SKILL.md`, sidecar schemas in `tools/`, and sidecar code in
  `python/`.
- Python sidecar tools use `name`, `schema`, and `entrypoint`; main-process
  plugin tools use `api.registerTool({ name, schema, execute })`; plugin code may
  call `api.registerMcpServer(...)`; skills become prompt layers, not executable
  tools.
- Keep `docs/development/extensions.md` as the canonical extension authoring
  guide and `docs/plugins/README.md` as the routing hub.

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
- Backend dev server: `bin/windie start backend`
- Desktop dev loop: `bin/windie start dev`
- Focused Vite dev server: `bin/windie start frontend`
- Focused Electron dev app: `bin/windie start desktop`
- Electron customer app: `cd frontend && npm run electron`

Dev startup troubleshooting:

- If `bin/windie start dev` prints
  `[desktop] waiting for http://localhost:5173/` and then times out, debug the
  Vite side first: run `bin/windie logs vite --no-follow --tail 120` and check
  `lsof -nP -iTCP:5173 -sTCP:LISTEN` before changing Electron code or manually
  activating conda.
- `bin/windie start dev` starts Vite through `scripts/python-in-env frontend`,
  then waits for the Vite URL before launching Electron. Cold `conda run` or
  npm startup can be slow; use `WINDIE_FRONTEND_READY_TIMEOUT_MS=<ms>` only
  when a machine needs a longer readiness window.

Validation:

- Backend tests: `bin/windie test backend`
- Sidecar tests: `bin/windie test sidecar`
- Frontend tests: `bin/windie test frontend`
- Frontend CI tests: `bin/windie test frontend`
- Frontend lint: `cd frontend && npm run lint`
- Docs listing: `bin/windie docs list`

## Coding Standards

- Keep modules focused and split large files when it improves clarity or
  testability.
- Prefer simple, intuitive implementations.
- Minimize conditionals by making ownership, state, and input shape explicit
  before core logic runs. A small typed dispatcher, state table, or boundary
  normalizer is better than repeated local checks spread through consumers.
- Remove unused code in touched areas.
- Backend code uses Python with type hints, async I/O where appropriate, and
  existing `backend/src` patterns. Use `black` and `isort` when touching related
  backend code.
- Frontend code uses TypeScript or JavaScript with ESM and React. Keep renderer
  logic in `src/renderer`, main-process and IPC logic in `src/main`, and use
  `eslint` when touching related frontend code.

## Docs and Testing Policy

When behavior or APIs change:

- Update docs in the same change.
- Update existing tests and add focused coverage for the changed behavior,
  likely regressions, and realistic edge/failure cases.
- Add `read_when` hints for cross-cutting docs when useful.
- Use `pytest` for backend and sidecar tests.
- Use `jest` for frontend tests.
- Put new tests under `tests/backend`, `tests/sidecar`, `tests/frontend`, or
  `tests/sdk` unless extending an existing test module.
- Prefer unit-level tests with minimal I/O.
- Mock network and system calls.
- If you change tool parsing, execution flow, or IPC, add tests across backend,
  sidecar, and frontend as needed.
- Add tests while implementation context is fresh.
- Purely visual UI tweaks may skip new tests when they would be low-signal.

## Frontend Runtime Wiring Protocol

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

## Completion Check

Before finishing, verify:

- The touched path is not more duplicated or more coupled without a clear reason.
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
- For work running under an approved `docs/plans/` plan, this completion check
  is not a substitute for the required design-inspection loop. Complete the
  workflow in `pending/compaction_safe_plan_execution.md` before returning.

After writing code, in the final summary, explain what changed, what layer is
affected, explain the new path. When explaining questions, explain the related
path, the architecture, no need to state file names unless explicitly told so.

## Git and PR Workflow

Safe defaults:

- Allowed by default: `git status`, `git diff`, `git log`.
- Push only when the user asks.
- `git checkout` is allowed for PR review or explicit user request.
- Branch changes require user consent.

Forbidden without explicit approval:

- Destructive commands such as `git reset --hard`, `git clean`, `git restore`,
  and `rm`.

Commit policy:

- Commit completed changes by default after implementation and validation,
  unless the user explicitly asks not to commit or asks to inspect/test first.
- Prefer small, frequent commits.
- No amend unless asked.
- Update `CHANGELOG.md` before committing repo-visible changes.
- Preferred helper: `./scripts/committer` or `committer`.
- `--body` is required for every commit.
- The commit body must describe the issue, the fix and improvements, previous
  behavior, and behavior after the fix.
- On Windows PowerShell, do not invoke `./scripts/committer` directly; use Git
  Bash or fall back to plain `git add` and `git commit`.

Use Conventional Commits with a body section.

Additional git notes:

- Use HTTPS remotes; flip SSH to HTTPS before pull or push if needed.
- Do not delete or rename unexpected files.
- No repo-wide search-and-replace scripts.
- Keep commits reviewable, but do not keep implementation artificially narrow
  when a broader same-boundary cleanup creates less code, stronger ownership,
  and a more foundational path.
- Avoid manual `git stash`.
- If Git auto-stashes during pull or rebase, that is fine.
- If the user types a command like "pull and push", that counts as consent for
  that command.
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

- Be unbiased and logical first.
- Verify in code and docs before answering implementation questions.
- When the user asks a question, inspect the relevant code and report first;
  do not modify files unless the user explicitly asks for implementation or
  approves changes after the report.
- Avoid guessing; if unsure, read more code first.
- If still blocked, ask with short options.
- Call out conflicts and choose the safer path.
- Preserve unrelated dirty worktree changes.
- Report only files and behavior you changed.
- Stop and ask only if unexpected changes affect files you are actively editing.
- For fixes, first reconstruct the recent change history around the failing
  path: identify the producer, consumer, deleted path, and intended replacement.
  Prefer fixes that preserve the latest architecture direction instead of
  reverting to an older duplicated path.
- For new development, read recent related commits and adjacent implementation
  patterns before adding code. New code should fit the current ownership model,
  naming, tests, and architecture direction unless there is a clear reason to
  change that direction explicitly.
- For moderate or major implementation changes, follow the workflow in
  `pending/compaction_safe_plan_execution.md`.

For architectural or product-flow questions, explain conceptually first:
describe how the runtime works, where a change fits, what boundaries change, and
why. Do not mention file paths, symbol names, or implementation breadcrumbs
unless the user explicitly asks.

## Issues, PR Comments, and tmux

- Use literal multiline strings or heredocs for real newlines in posted issues
  and PR comments.
- Do not use `\\n` in posted text.
- Use tmux only when persistence or interactive debugging is needed.
- Quick refs: `tmux new -d -s codex-shell`, `tmux attach -t codex-shell`,
  `tmux list-sessions`, `tmux kill-session -t codex-shell`.

## Frontend Aesthetics

Avoid generic AI-looking UI. Be distinctive and intentional.

Do:

- Pick a real font.
- Avoid Inter, Roboto, Arial, and generic system-default feel when a stronger
  choice exists.
- Commit to a palette.
- Use CSS variables.
- Prefer bold accents over timid gradients.
- Use one or two high-impact motion moments.
- Add depth to backgrounds with gradients or patterns.

Avoid:

- Purple-on-white cliches.
- Generic component grids.
- Predictable layouts.
- Random micro-animations.

## Product-Specific Regression Contracts

Keep narrow product contracts in docs with `read_when` hints instead of growing
this file into an implementation ledger.

- Minimal chat pill and response overlay behavior: `docs/desktop/minimal_chat_pill.md`
  and `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`.
- Platform screenshot and overlay policy: `docs/platforms/screenshot_overlay_policy.md`.
