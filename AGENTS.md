# Repository Guidelines

Be unbiased. Be logical first. Verify in code, docs, logs, or tests before
claiming something is true.

## Product Contract

WindieOS is a desktop AI operator. The user gives a goal in natural language;
WindieOS selects and runs tools to achieve it safely and reliably.

The product spans Electron UX, the Windie SDK runtime, a Python sidecar for
local authority, and a Python FastAPI backend for hosted or self-hosted agent
orchestration. Frontend and sidecar code must not import backend code at
runtime. Keep parity through public transport contracts, manifests, docs, and
tests.

## Where To Start

Keep this file short. Use it as the first routing guide, then read the detailed
docs for the area you are touching:

- Runtime ownership and change routing:
  `docs/development/agent_runtime_ownership_and_change_routing.md`
- Detailed architecture map:
  `docs/development/agent_architecture_reference.md`
- Docs navigation:
  `docs/docs.json` and `docs/getting-started/docs_directory.md`
- Product contracts:
  `docs/desktop/minimal_chat_pill.md`,
  `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`, and
  `docs/platforms/screenshot_overlay_policy.md`

Before coding or answering implementation questions:

- Identify the owning runtime first.
- Run `bin/windie docs list` when available.
- Search docs with `bin/windie docs <query>` when orientation is incomplete.
- Read the nearest `read_when` docs until the behavior is clear.
- Use `rg`, live files, recent commits, logs, and tests over memory.
- For bugs, check `bin/windie --help` for existing diagnostics before inventing
  ad hoc commands. If no deterministic diagnostic exists for the failing path,
  add one at the owning runtime when it is part of the fix.
- Inspect recent related commits with `git log`, `git show`, or `git blame`
  before changing behavior.

Fast docs queries:

- `bin/windie docs minimal chat pill`
- `bin/windie docs overlay phase`
- `bin/windie docs conversation runtime`
- `bin/windie docs sidecar tool`
- `bin/windie docs tool schema policy`
- `bin/windie docs websocket event`
- `bin/windie docs extension`
- `bin/windie docs test selection`

## Runtime Ownership

- Backend owns hosted orchestration, provider policy, prompt compilation,
  backend remote tools, API routes, websocket query streams, and deploy/runtime
  operations.
- SDK owns reusable runtime semantics: `WindieClient`, `WindieAgent`,
  conversation runtime, live turn projection, replay, compaction, and local or
  hosted query routing.
- Electron main owns native shell, process lifecycle, IPC trust boundaries,
  desktop windows, permissions, and native surface control.
- Renderer owns presentation and interaction state for the dashboard, chat pill,
  overlays, onboarding, and user-visible transcript surfaces.
- Python sidecar owns local authority: executable tools, computer-use,
  browser-use, filesystem, shell, screenshots, OCR/vision, wakeword, voice, and
  local memory.

Do not keep parallel sources of truth across these layers. Move behavior to the
owner, delete the duplicate path, and use public contracts at runtime
boundaries.

## Architecture Rules

- Prefer deletion-first cleanup over compatibility layers that keep duplicate
  authorities alive.
- Fix root causes, not symptoms.
- Normalize inputs at runtime boundaries, fail fast on invalid state, and keep
  core flows deterministic.
- Put reusable chat/runtime behavior in the SDK before adding Electron-only
  bridges.
- Do not add adapters whose only job is to rename and forward payloads.
  Adapters must enforce a real runtime, security, lifecycle, or test boundary.
- Do not keep backward-compatibility shims unless explicitly requested or backed
  by a verified dependency.
- Widen scope inside the same owning runtime when it removes code, duplication,
  coupling, or future compatibility burden.
- Escalate before widening when cleanup crosses subsystem ownership boundaries,
  changes public contracts, or requires a large multi-file rewrite.
- Pause and propose a refactor if the requested change would add another store,
  bridge, facade, or special case while preserving the wrong source of truth.

## Tool And Extension Contracts

- Tools execute on the Python sidecar unless they are explicit backend remote
  tools such as `web_search`.
- Client-local tool schemas come from the SDK/Electron/sidecar manifest:
  selected built-ins plus added tools, plugins, MCPs, and extension
  contributions.
- Backend validates client-provided manifests, enforces schema limits and trust
  boundaries, applies provider projection, owns backend remote tools, and owns
  final prompt compilation.
- Tool changes must update the client manifest, docs, and focused tests.
- MCP tool results must preserve the raw MCP result in `data.mcp_result` and
  model-facing content in `data.output`. Add native fields such as screenshots
  only additively.
- Computer-use tools and bundles must return post-action screenshot context.
- Preserve the model-schema vs prepared-argument distinction. Use
  `backend_grounding` only when OCR, vision, or prediction prepares executable
  sidecar arguments; otherwise use `passthrough`.
- Keep extension contribution types separated:
  `extension.json`, `plugin/index.cjs`, `mcp/servers.json`,
  `skills/<skill-id>/SKILL.md`, `tools/`, and `python/`.
- Use `docs/development/extensions.md` as the canonical extension authoring
  guide and `docs/plugins/README.md` as the routing hub.

## Commands

Baseline: Python 3.11 and Node 18+.

Do not manually activate conda environments. Use:

- `./scripts/python-in-env <backend|frontend|sidecar> <cmd...>`

Common commands:

- Backend deps: `pip install -r backend/requirements.txt`
- Frontend deps: `cd frontend && npm install`
- Backend dev server: `bin/windie start backend`
- Desktop dev loop: `bin/windie start dev`
- Focused Vite server: `bin/windie start frontend`
- Focused Electron app: `bin/windie start desktop`
- Backend tests: `bin/windie test backend`
- Sidecar tests: `bin/windie test sidecar`
- Frontend tests: `bin/windie test frontend`
- Frontend lint: `cd frontend && npm run lint`
- Docs listing: `bin/windie docs list`

If `bin/windie start dev` waits for `http://localhost:5173/` and times out,
debug Vite first with `bin/windie logs vite --no-follow --tail 120` and
`lsof -nP -iTCP:5173 -sTCP:LISTEN`.

## Coding Standards

- Keep modules focused.
- Prefer simple, direct implementations.
- Minimize conditionals by making ownership, state, and input shape explicit
  before core logic runs.
- Remove unused code in touched areas.
- Backend code uses Python type hints, async I/O where appropriate, and existing
  `backend/src` patterns. Use `black` and `isort` when touching backend code.
- Frontend code uses TypeScript or JavaScript with ESM and React. Keep renderer
  logic in `src/renderer`, main-process and IPC logic in `src/main`, and use
  `eslint` when touching frontend code.

For complex UI or runtime bugs, define the state machine and event timeline
before changing code. Keep one behavior scope per patch, centralize
cross-process surface control, log deterministic phase transitions, and test
race-prone flows.

## Docs And Tests

When behavior or APIs change:

- Update docs in the same change.
- Add or update focused tests for changed behavior, likely regressions, and
  realistic edge cases.
- Add `read_when` hints for cross-cutting docs when useful.
- Use `pytest` for backend and sidecar tests.
- Use `jest` for frontend tests.
- Put new tests under `tests/backend`, `tests/sidecar`, `tests/frontend`, or
  `tests/sdk` unless extending an existing test module.
- Mock network and system calls.
- Purely visual UI tweaks may skip new tests when tests would be low-signal.

For moderate or major implementation changes, follow
`pending/compaction_safe_plan_execution.md`: create the dated plan, get
approval, keep the report current, and complete its design-inspection loop.

## Git And PRs

Safe by default:

- `git status`, `git diff`, and `git log`
- `git checkout` for PR review or explicit user request

Forbidden without explicit approval:

- `git reset --hard`, `git clean`, `git restore`, and `rm`
- Branch changes
- Pushing
- Version bumps or release publishing

Commit completed changes by default after validation unless the user asks not
to commit or asks to inspect first.

Commit rules:

- Update `CHANGELOG.md` before committing repo-visible changes.
- Prefer `./scripts/committer` or `committer`.
- Use Conventional Commits.
- Include `--body`.
- The body must describe the issue, the fix and improvements, previous
  behavior, and behavior after the fix.
- Do not amend unless asked.

PR modes:

- Review mode: use `gh pr view` and `gh pr diff`; do not switch branches or
  change code.
- Landing mode: create an integration branch from `main`, bring in PR commits,
  apply fixes, run relevant tests, merge back to `main`, and delete the temp
  branch.
- PR summaries must mention testing and user-facing changes.

## Security And Configuration

- API keys must come from environment variables.
- Core config lives in `backend/src/core/config/app_config.py` and
  `backend/src/core/config/models.py`.
- Do not commit credentials, user data, or machine-specific paths to docs or
  tests.
- Never edit `node_modules` or vendored dependency output.
- Dependency overrides or vendored patches require explicit approval.
- Check trust boundaries for changes touching credentials, permissions, IPC,
  tool execution, storage, or persisted data. Include migration or compatibility
  notes when those surfaces change.

## Working Style

- When the user asks a question, inspect the relevant code and report first.
  Do not modify files unless the user explicitly asks for implementation or
  approves changes after the report.
- Preserve unrelated dirty worktree changes.
- Stop and ask only if unexpected changes affect files you are actively
  editing.
- Report only files and behavior you changed.
- For fixes, reconstruct the producer, consumer, deleted path, and intended
  replacement before patching.
- For new development, read adjacent implementation patterns and recent commits
  before adding code.
- For architecture or product-flow answers, explain the runtime path and
  ownership conceptually first. Mention file paths only when useful or asked.
- Use literal multiline strings or heredocs for real newlines in posted issues
  and PR comments.
- Use tmux only when persistence or interactive debugging is needed.

## Frontend Aesthetics

Avoid generic AI-looking UI. Pick a real font, commit to a palette, use CSS
variables, and prefer one or two high-impact motion moments over random
micro-animations. Avoid purple-on-white cliches, generic component grids, and
predictable layouts.

## Completion Check

Before finishing, verify:

- The touched path is not more duplicated or more coupled without a clear
  reason.
- Tests or validation match the risk of the change.
- You removed at least as much complexity as you added.
- No obsolete UI, bridge, alias, compatibility path, or fallback remains in the
  touched area without a stated reason.
- Security-sensitive changes were checked for trust-boundary, permission,
  credential, IPC, tool-execution, and machine-specific path regressions.

In the final summary, explain what changed, what layer is affected, and the new
path. Keep the summary focused on behavior, not breadcrumbs, unless file names
matter.
