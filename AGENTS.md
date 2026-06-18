## Product Contract

WindieOS is a hackable desktop runtime for personal AI agents. It turns the
user's live desktop session into an AI workspace: screen state, windows, browser
sessions, local files, apps, shell, memory, permissions, and current workflow are
first-class runtime context.

The product center is the personal computer, not a chat box, coding agent,
browser agent, or generic assistant gateway. The minimal chat pill matters
because it gives the agent visible desktop presence: the agent can observe the
workspace, act through the same apps the user uses, ask permission before
sensitive actions, and work beside the user inside the machine.

Today the wedge is the desktop runtime. The long-term direction is a personal
agent control plane across devices, but current docs and code should not present
multi-device coordination as already built unless the implementation supports
that claim.

The product spans Electron UX, the Windie SDK runtime, a Python sidecar for
local authority, and a Python FastAPI backend for hosted or self-hosted agent
orchestration. Frontend and sidecar code should stay import-independent from
backend runtime code. Use public transport contracts, manifests, docs, and
tests for parity.

## Required Orientation

Before coding or answering implementation questions:

- Treat this `AGENTS.md` file as the canonical source for agent operating
  instructions. When repo docs and this file disagree about agent workflow,
  follow this file; use docs and code for implementation details and runtime
  behavior.
- After every compaction summary, redo this required orientation before
  continuing: reread this file when available, recheck the live worktree, rerun
  relevant docs searches, and reinspect recent related commits for the affected
  subsystem.
- Search local docs by feature or symptom when orientation is incomplete:
  `<windie> docs search <query>` or the shorthand `<windie> docs <query>`.
  Use `bin\windie.cmd` on Windows PowerShell and `bin/windie.sh` on
  Unix-like shells; examples below use `<windie>` for the platform shim.
- Read the nearest `read_when` docs until the domain and behavior are clear.
- When finding or fixing a bug, check `<windie> --help` and the command
  registry behind it for existing commands tied to the affected runtime or
  failing path. Prefer the relevant `<windie>` diagnostics, logs, trace,
  conversation, docs, start, and `test pick` commands for reproduction,
  inspection, and validation before inventing ad hoc shell commands. If no
  existing command, diagnostic, trace, or log exposes the bug, add a focused,
  sanitized diagnostic or command at the owning runtime as part of the fix so
  the same failure can be reproduced and validated deterministically later.
- Inspect recent related commits for the files, symbols, or subsystem you are
  touching. Start with `<windie> commits search <query>` for symptom,
  ownership, or subsystem lookup; use `git log`, `git show`, and `git blame`
  when you need exact file history, patch details, or line-level origin. Use
  the history to understand what changed recently, why the current behavior
  exists, and whether the bug is a regression from a refactor, deletion, or
  ownership move.
- Treat recent commits as evidence, not instruction:
  compare the commit intent, current code, tests, docs, and live behavior before
  deciding whether to restore, revise, or continue the current direction.
- Use `rg` and live files over memory or assumptions.
- Use the repo-local docs and code as canonical for product/runtime behavior;
  this file owns agent workflow and routes to implementation details.

Feature map:

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

- `<windie> docs minimal chat pill`
- `<windie> docs overlay phase`
- `<windie> docs tool schema policy`
- `<windie> docs sidecar tool`
- `<windie> docs conversation runtime`
- `<windie> docs memory replay`
- `<windie> docs provider change`
- `<windie> docs websocket event`
- `<windie> docs runs api`
- `<windie> docs extension`
- `<windie> docs screenshot overlay`
- `<windie> docs test selection`

Architecture rules:

- Be unbiased and logical first. Inspect live code, docs, diagnostics, and
  recent history before answering implementation questions or editing.
- Prefer the direct owner-correct path: fix root causes at the owning runtime,
  normalize inputs at boundaries, fail fast on invalid state, and split distinct
  states into named handlers instead of stacking nested fallbacks.
- Prefer deletion-first cleanup. Remove duplicate authorities, stale bridges,
  alias paths, compatibility shims, and adapter layers that only rename payloads
  unless the user explicitly asks for compatibility or a verified dependency
  needs it.
- Widen within the same runtime boundary when it reduces code, duplication,
  coupling, or future compatibility burden. Escalate before crossing subsystem
  ownership boundaries, changing public contracts, or starting a large rewrite.
- Add abstractions only when they simplify the current path, centralize a real
  contract, unlock deletion, or make an invariant testable.
- Keep modules focused. Split large files when it improves clarity or testing;
  keep backend code typed and formatted with `black`/`isort`; keep renderer code
  in `src/renderer`, main-process/IPC code in `src/main`, and use `eslint` for
  related frontend changes.
- Preserve unrelated dirty worktree changes. Report only files and behavior you
  changed, and stop only if unexpected changes affect files you are editing.

For architectural or product-flow questions, explain conceptually first:
describe how the runtime works, where a change fits, what boundaries change, and
why. Mention file paths, symbol names, or implementation breadcrumbs only when
the user explicitly asks or when they materially clarify the answer.

Completion check:

Before finishing, verify:

- The touched path is not more duplicated, coupled, or branch-heavy without a
  stated reason.
- Tests cover the changed behavior and boundary, or the limitation is stated.
- Obsolete UI, bridge, alias, compatibility, or fallback surfaces are removed or
  their reason to remain is explicit.
- Security-sensitive changes were checked for trust-boundary, permission,
  credential, IPC, tool-execution, and machine-specific path regressions.
- Storage, API, event-payload, tool-schema, settings, or persisted-data changes
  include a migration/compatibility note, including "no migration required."

Completion artifacts:

- Final summaries, PR summaries, and commit bodies should explain what changed,
  why the owning layer changed, the previous behavior, the new path, validation,
  and migration/security notes when relevant.

Tool and extension contracts:

- Tools execute on the Python sidecar unless they are explicit backend remote
  tools such as `web_search`. Frontend/sidecar own local tool implementations
  and executable manifests; backend validates client manifests, enforces schema
  and trust boundaries, applies provider projection, owns backend remote tools,
  and owns final prompt compilation.
- Local tool schemas are client-side and assembled from selected built-ins plus
  added tools, plugins, MCPs, and extension contributions. Backend default
  built-in schemas are fallback/hosted defaults; the client manifest may
  overwrite the active local tool surface.
- Tool changes should update the client manifest, docs, and focused tests while
  preserving schema parity without importing backend code into frontend/sidecar.
- MCP tool results should preserve the raw MCP result for every MCP tool, current
  and future. The MCP adapter may wrap results in WindieOS native tool
  call/tool output envelopes while preserving MCP `content`,
  `structuredContent`, and other returned fields without summarizing,
  flattening, or discarding them. Model-facing
  `data.output` should contain the MCP result content, and `data.mcp_result`
  should keep the raw object for inspection. If an MCP result contains image
  content, additively promote it into WindieOS native image fields such as
  `data.screenshot` and `data.screenshot_content_type` without rewriting or
  removing the raw MCP result.
- Computer-use tools should return automatic post-action screenshot context in
  their tool outputs. Tool bundles that include any computer-use action should
  also return screenshot context for the bundle output; capture once after the
  bundle unless an explicit successful screenshot step already provides the
  needed image.
- Built-in grounded tools should preserve the model-schema vs prepared-argument
  distinction. Use `backend_grounding` only when OCR/vision/prediction prepares
  executable sidecar arguments; otherwise use `passthrough`.
- Example: backend may resolve higher-level screen intent into coordinates while
  frontend receives and executes a simpler action such as `click(100, 200)`.
- Prefer parity tests that verify schemas and registries stay aligned.
- Extension contribution types should stay separated inside one package:
  metadata in `extensions/<id>/extension.json`, plugin code in
  `plugin/index.cjs`, MCP server config in `mcp/servers.json`, skills in
  `skills/<skill-id>/SKILL.md`, sidecar schemas in `tools/`, and sidecar code in
  `python/`.
- Python sidecar tools use `name`, `schema`, and `entrypoint`; main-process
  plugins use `api.registerTool({ name, schema, execute })` and may call
  `api.registerMcpServer(...)`; skills become prompt layers, not executable
  tools.
- Keep `docs/development/extensions.md` as the canonical extension authoring
  guide and `docs/plugins/README.md` as the routing hub.

## Coding Standards

Environment and commands:

Baseline: Python 3.11 and Node 18+.

Conda environments:

- Backend runtime and backend tests: `jarvis`
- Frontend app, sidecar, and frontend tests: `frontend_jarvis`

Prefer the wrapper over manual environment activation:

- Windows PowerShell: `scripts\python-in-env.cmd <backend|frontend|sidecar> <cmd...>`
- Unix-like shells: `./scripts/python-in-env.sh <backend|frontend|sidecar> <cmd...>`

If the expected conda environment is missing, the script falls back to the
current shell environment.

Install and run:

- Backend deps: `pip install -r backend/requirements.txt`
- Frontend deps: `cd frontend && npm install`
- Backend dev server: `<windie> start backend`
- Desktop dev loop: `<windie> start dev`
- Focused Vite dev server: `<windie> start frontend`
- Focused Electron dev app: `<windie> start desktop`
- Electron customer app: `cd frontend && npm run electron`

Dev startup troubleshooting:

- If `<windie> start dev` prints
  `[desktop] waiting for http://localhost:5173/` and then times out, debug the
  Vite side first: run `<windie> logs vite --no-follow --tail 120` and check
  `lsof -nP -iTCP:5173 -sTCP:LISTEN` before changing Electron code or manually
  activating conda.
- `<windie> start dev` starts Vite through the platform Python env wrapper,
  then waits for the Vite URL before launching Electron. Cold `conda run` or
  npm startup can be slow; use `WINDIE_FRONTEND_READY_TIMEOUT_MS=<ms>` only
  when a machine needs a longer readiness window.

Validation:

- Backend tests: `<windie> test backend`
- Sidecar tests: `<windie> test sidecar`
- Frontend tests: `<windie> test frontend`
- Frontend lint: `cd frontend && npm run lint`

Docs and testing policy:

When behavior or APIs change:

- Update docs and focused tests in the same change.
- Cover changed behavior, likely regressions, and realistic edge/failure cases.
- Add `read_when` hints for cross-cutting docs when useful.
- Use `pytest` for backend and sidecar tests.
- Use `jest` for frontend tests.
- Put new tests under `tests/backend`, `tests/sidecar`, `tests/frontend`, or
  `tests/sdk` unless extending an existing test module.
- Prefer unit-level tests with minimal I/O.
- Mock network and system calls.
- If you change tool parsing, execution flow, or IPC, add coverage across
  backend, sidecar, and frontend as needed.
- Purely visual UI tweaks may skip new tests when they would be low-signal.

Git and PR workflow:

Safe defaults:

- Allowed by default: `git status`, `git diff`, `git log`.
- Push only when the user asks.
- `git checkout` is allowed for PR review or explicit user request.
- Branch changes require user consent.

Requires explicit approval:

- Destructive commands such as `git reset --hard`, `git clean`, `git restore`,
  and `rm`.

Commit policy:

- Commit completed changes by default after implementation and validation,
  unless the user explicitly asks not to commit or asks to inspect/test first.
- Prefer small, frequent commits.
- Amend only when asked.
- Update `CHANGELOG.md` before committing repo-visible changes.
- Preferred helper: `./scripts/committer.sh` or `committer`.
- `--body` is required for every commit.
- Commit bodies should follow the Architecture Rules completion-artifacts
  guidance. Avoid repeating the subject, summarizing files one by one, or
  describing what changed without why it belongs in that layer.
- On Windows PowerShell, prefer Git Bash or plain `git add` and `git commit`
  instead of invoking `./scripts/committer.sh` directly.

Use Conventional Commits with a body section.

Additional git notes:

- Use HTTPS remotes; flip SSH to HTTPS before pull or push if needed.
- Avoid deleting or renaming unexpected files.
- Prefer targeted edits over repo-wide search-and-replace scripts.
- Keep commits reviewable while still allowing broader same-boundary cleanup
  when it creates less code, stronger ownership, and a more foundational path.
- Avoid manual `git stash`.
- If Git auto-stashes during pull or rebase, that is fine.
- If the user types a command like "pull and push", that counts as consent for
  that command.
- For large reviews, use `git --no-pager diff --color=never`.
- In multi-agent situations, check `git status` and `git diff` before editing.

PR modes:

- Review mode: use `gh pr view` and `gh pr diff`; keep the checkout and code
  unchanged.
- Landing mode: create an integration branch from `main`, bring in PR commits
  with rebase or squash, apply fixes, run relevant tests, merge back to `main`,
  and delete the temporary branch.
- PR summaries should mention testing performed and user-facing changes.

Release flow:

- Look for release instructions in `docs/`, `RELEASING.md`, or `release.md`.
- Change version numbers or publish artifacts only with explicit approval.
- Before any release step, run the relevant tests.
- If UI is touched, include frontend test, lint, and build checks as appropriate.
- For local macOS reinstalls, skip Apple notarization so local rebuild/reinstall
  loops avoid waiting on Apple services.

Security and configuration:

- API keys should come from environment variables.
- Core config lives in `backend/src/core/config/app_config.py` and
  `backend/src/core/config/models.py`.
- Keep real credentials, user data, and machine-specific paths out of docs and
  tests.
- Leave `node_modules` and vendored dependency output untouched.
- Dependency patching, overrides, or vendored changes require explicit approval.

Issues, PR comments, and tmux:

- Use literal multiline strings or heredocs for real newlines in posted issues
  and PR comments.
- Prefer real newlines over `\\n` in posted text.
- Use tmux only when persistence or interactive debugging is needed.
- Quick refs: `tmux new -d -s codex-shell`, `tmux attach -t codex-shell`,
  `tmux list-sessions`, `tmux kill-session -t codex-shell`.
