# Repository Guidelines

## Product Contract

WindieOS is a desktop AI operator. The user gives a goal in natural language;
WindieOS selects and runs tools to achieve it safely and reliably.

The product spans Electron UX, the Windie SDK runtime, a Python sidecar for
local authority, and a Python FastAPI backend for hosted or self-hosted agent
orchestration. Frontend and sidecar code must not import backend code at
runtime. Use public transport contracts, manifests, docs, and tests for parity.

## Project Structure

File counts and generated artifacts change often. Treat the filesystem as
canonical; the map below names the source roots and load-bearing files agents
usually need to edit.

```text
WindieOS/
├── backend/                       # Python FastAPI backend and agent runtime
│   └── src/
│       ├── main.py                # backend app entrypoint
│       ├── api/                   # FastAPI app assembly, routes, websocket handlers
│       ├── agent/                 # AgentSession, AgentExecutor, InteractionLoop, history
│       ├── llm/                   # prompt construction, provider adapters, model routing
│       ├── tools/                 # model-visible schema registry, policy, projection
│       ├── services/              # OCR, vision, artifacts, token, TTS, VM run services
│       ├── sdk/                   # backend SDK route/tool context helpers
│       └── core/                  # config, validation, logging, events, interfaces
├── frontend/                      # Electron desktop app, React renderer, Python sidecar
│   └── src/
│       ├── main/                  # Electron main, IPC, SDK host adapter, sidecar bridge
│       ├── main/python/           # local Python sidecar: tools, memory, browser, system
│       ├── preload.js             # context-isolated IPC allowlist bridge
│       ├── renderer/              # React app, chat, dashboard, settings, voice surfaces
│       └── shared/                # shared IPC constants/contracts
├── packages/
│   ├── windie-sdk-js/             # TypeScript SDK runtime used by Electron and clients
│   └── windie-sdk-python/         # Python SDK client package
├── tests/
│   ├── backend/                   # backend route, agent, provider, tool, service tests
│   ├── sidecar/                   # Python sidecar and local tool tests
│   ├── frontend/                  # Electron/main/renderer contract tests
│   └── sdk/                       # SDK runtime, transport, projection, store tests
├── docs/                          # agent-facing docs, runtime maps, workflows, references
├── scripts/                       # test wrappers, environment launchers, commit helper
├── bin/                           # generated or wrapper commands such as docs-list
├── plugins/                       # WindieOS extension/plugin examples and contracts
├── skills/                        # WindieOS skill prompt layers
├── mcps/                          # MCP server docs/config examples
└── examples/                      # SDK/client/tool integration examples
```

## File Dependency Chain

Keep these chains in mind before moving code. They are ownership chains, not
permission to import across runtime boundaries.

```text
Renderer feature code
  -> renderer app runtime facades
  -> preload allowlisted IPC
  -> Electron main IPC/runtime modules
  -> Windie SDK runtime host adapter
  -> hosted/self-hosted backend HTTP/WebSocket
  -> backend agent loop and provider/tool policy
```

```text
Backend tool catalog/policy
  -> model-visible provider projection
  -> backend tool-call events
  -> SDK tool coordination
  -> Electron main local execution callback
  -> Python sidecar executable manifest/registry
  -> local tool result
  -> SDK tool-result return
  -> backend history
```

```text
Python sidecar tool files
  -> frontend/src/main/python/tools/registry.py
  -> frontend/src/main/python/tools/manifest.py
  -> SDK/local runtime executable tool manifest
  -> backend manifest validation and policy projection
```

Frontend and sidecar must not import backend code for parity. Backend should use
schemas, manifests, transport contracts, and tests to understand client-local
capability.

## Runtime Ownership

Start every change by identifying the owning runtime before editing code.

| Runtime | Owns | Must not own |
| --- | --- | --- |
| Backend | Prompt construction, provider routing, hosted APIs, OCR/vision services, artifacts, compaction decisions, backend remote tools, final model-facing tool-schema projection | Local mouse, keyboard, browser, filesystem, shell, OS permissions, or desktop window behavior |
| SDK runtime | Hosted backend websocket lifecycle, normalized conversation events, local-tool result return, conversation stores, replay/rehydrate helpers, projections reusable by Electron, CLI, plugins, and tests | Electron-only shell policy or sidecar tool implementation details |
| Electron main | BrowserWindow lifecycle, IPC transport, menus, app lifecycle, native permissions, platform window policy, sidecar and wakeword supervision, endpoint selection, host adapters | Agent loop, prompt compiler, durable conversation store, or duplicate tool-routing authority |
| Renderer | User-facing state and display, dashboard/chat/settings/voice surfaces, transcript projection display, display-only tool state | Backend websocket loops, durable transcript storage, tool execution, model sync, or local authority |
| Preload | Narrow allowlisted bridge between renderer and main | Business logic or policy decisions |
| Python sidecar | Local machine authority, local tools, local memory/storage, browser mechanics, filesystem/shell/process/system execution | Backend orchestration, prompt policy, provider routing, or backend package imports |
| Docs and tests | Durable contracts, routing maps, parity checks, and regression evidence | Runtime behavior |

## Backend Agent Runtime

WindieOS does not have a single Hermes-style `AIAgent` class. The equivalent
backend agent surface is deliberately split:

- `backend/src/agent/session/session.py::AgentSession` owns per-user/session
  identity, conversation history, runtime state, compaction engine, current
  screenshot/system state, LLM client config, and the executor instance.
- `backend/src/agent/execution/executor.py::AgentExecutor` owns the per-query
  pipeline setup: prompt formatting, user-history append, screenshot/OCR setup,
  tool preparation/sending/result processing components, completion side
  effects, and delegation into the interaction loop.
- `backend/src/agent/execution/interaction_loop.py::InteractionLoop` owns the
  model/tool iteration loop: build prompt/tool schemas, call the provider,
  parse stream/tool calls, branch between final answer and tool execution, emit
  streaming events, and stop on completion or hard limits.

Usual backend call path:

```text
websocket query
  -> QueryMessageHandler
  -> QueryExecutionService.execute(...)
  -> SessionManager get/create AgentSession
  -> AgentSession.process_query(...)
  -> AgentExecutor.process_query(...)
  -> InteractionLoop.run_loop(...)
  -> LLM provider stream
  -> final response or tool calls
```

Agent classes are backend-owned. Do not mirror their state machines in Electron,
renderer, SDK clients, or the sidecar. Those runtimes may transport events,
render projections, execute local tools, or return tool results, but backend
keeps prompt policy, provider routing, history compaction, and model-facing loop
control.

### Agent Loop Shape

The real loop is async and event-streaming, not a synchronous `chat()` helper.
Conceptually:

```text
for each user query:
  build final user content and append it to backend history
  maybe compact before sampling
  while iteration budget remains:
    build current prompt and model-visible tool schemas
    stream provider response
    if provider yields final assistant text:
      emit completion and stop
    if provider yields tool calls:
      prepare executable arguments and emit tool-call events
      wait for local SDK/main/sidecar results or run backend-owned tools
      commit tool outputs to backend history
      continue the loop
  emit deterministic limit/error completion on hard stop
```

Tool results must flow back through the backend history path. Renderer transcript
rows are display/storage projections, not replacements for backend inference
history during a live turn.

## Required Orientation

Before coding or answering implementation questions:

- Check canonical docs navigation in `docs/docs.json` and the compact route map
  in `docs/getting-started/docs_directory.md` when choosing docs.
- Run docs listing when available: prefer `./bin/docs-list`, fall back to
  `node scripts/docs-list.js`, ignore only if neither exists.
- Read the nearest `read_when` docs until the domain and behavior are clear.
- Use `rg` and live files over memory or assumptions.
- Use the repo-local docs and code as canonical; this file is a routing guide,
  not an exhaustive source map.
- `bin/docs-list` is optional. It lists `docs/` and enforces front matter. If
  needed, rebuild it with
  `bun build scripts/docs-list.ts --compile --outfile bin/docs-list`.

Key entry points:

- Backend: `backend/src/main.py`, `backend/src/api/app_assembly.py`,
  `backend/src/api/routes/__init__.py`, `backend/src/api/handlers/query.py`,
  `backend/src/agent/execution/interaction_loop.py`,
  `backend/src/llm/providers/`, `backend/src/tools/registry.py`.
- SDK: `packages/windie-sdk-js/src/index.ts`,
  `packages/windie-sdk-js/src/runtime/WindieClient.ts`,
  `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`,
  `packages/windie-sdk-js/src/transport/ManagedBackendSession.ts`,
  `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`.
- Electron main: `frontend/src/main/index.cjs`, `frontend/src/main/ipc.cjs`,
  `frontend/src/main/windie_sdk_runtime.cjs`,
  `frontend/src/main/ipc/ipc_sdk_command_router.cjs`,
  `frontend/src/main/ipc/ipc_sdk_tool_router.cjs`,
  `frontend/src/main/surface_runtime.cjs`.
- Renderer: `frontend/src/renderer/app/`,
  `frontend/src/renderer/features/chat/`,
  `frontend/src/renderer/features/dashboard/`,
  `frontend/src/renderer/infrastructure/api/`,
  `frontend/src/renderer/app/runtime/`.
- Sidecar: `frontend/src/main/python/local_backend.py`,
  `frontend/src/main/python/sidecar_daemon.py`,
  `frontend/src/main/python/tools/manifest.py`,
  `frontend/src/main/python/tools/registry.py`,
  `frontend/src/main/python/tools/exposed_tool_names.py`.

For deeper source maps, start with `docs/getting-started/docs_hub.md`,
`docs/reference/code_change_surface_index.md`,
`docs/architecture/runtime_boundary_matrix.md`, and the subsystem docs listed by
`docs-list`.

## SDK Architecture

The Windie SDK runtime is the reusable agent/client boundary. Electron is the
first first-party SDK host, not a separate agent implementation.

Key TypeScript SDK surfaces:

- `packages/windie-sdk-js/src/runtime/WindieClient.ts`: public wake-up
  orchestration, backend websocket/session creation, local runtime setup, and
  tool/plugin/MCP manifest assembly.
- `packages/windie-sdk-js/src/runtime/WindieAgent.ts`: high-level agent helpers
  such as `ask`, `run`, `stream`, model updates, conversation management,
  memory/title commands, system prompt/tool schema commands, and artifact
  helpers.
- `packages/windie-sdk-js/src/runtime/WindieChatSession.ts`: chat-style session
  helper for an existing conversation.
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`: reusable
  conversation command/runtime surface over a store and backend transport.
- `packages/windie-sdk-js/src/transport/ManagedBackendSession.ts`: hosted
  backend websocket lifecycle, typed query/stop/rehydrate/settings/model sends,
  backend event fan-out, and tool-result return.
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`: client-local
  tool claim, execution callback, result correlation, and backend result return.
- `packages/windie-sdk-js/src/runtime/LocalSidecarRuntime.ts`: local sidecar
  daemon discovery/start/reuse, sidecar-backed storage, builtin tool selection,
  local memory/title RPCs, and module-tool registration helpers.

SDK ownership rules:

- Put reusable chat/session/tool/result/projection behavior in the SDK when it
  should work for Electron, CLI, custom UI, plugins, or tests.
- Keep Electron-specific window, IPC, screenshot, permissions, and app lifecycle
  code in Electron main or renderer facades behind SDK interfaces.
- Keep sidecar execution and local storage mechanics in the Python sidecar; the
  SDK coordinates and normalizes them.
- Keep backend model/provider/prompt/tool-policy decisions in the backend; the
  SDK reports local capability but does not grant backend capability.

## Frontend Architecture

WindieOS frontend has four live runtimes:

- React renderer owns UX state and display: chat, dashboard, settings, voice,
  active transcript projection, and display-only tool rows.
- Preload owns the narrow allowlisted IPC bridge exposed to the renderer.
- Electron main owns desktop shell policy: windows, overlays, menus, lifecycle,
  IPC handlers, endpoint selection, permission prompts, SDK host adapters,
  sidecar supervision, wakeword supervision, screenshots, and platform policy.
- Python sidecar owns local authority: filesystem, shell/process, computer use,
  browser mechanics, local memory, system state, and wakeword subprocess code.

Frontend query flow:

```text
MessageInput / chat hook
  -> renderer desktop runtime facade
  -> SDK ConversationRuntime command
  -> typed send-chat-query IPC
  -> Electron main query payload builder and SDK host adapter
  -> ManagedBackendSession websocket query
  -> backend agent loop
```

Frontend stream flow:

```text
backend websocket event
  -> SDK main runtime normalization/projection
  -> Electron main broadcasts conversation-runtime-updated + conversation-event
  -> renderer projection listener updates live rows
  -> renderer stream side effects persist transcript metadata/events
```

Frontend tool flow:

```text
backend model-visible tool call
  -> SDK tool coordinator
  -> Electron main local execution callback
  -> Python sidecar executable tool
  -> SDK tool result return
  -> backend history
```

Do not rebuild the chat transcript, websocket loop, tool runner, model sync,
rehydrate, compaction, or replay semantics directly in renderer feature code.
Add or adjust renderer facades when UI needs a boundary, and move reusable
runtime behavior into the SDK instead of adding another Electron-only bridge.

## Runtime Flow Cheatsheet

- Query send: renderer chat sender -> desktop live-turn runtime facade -> typed
  `send-chat-query` IPC -> Electron main query payload builder -> SDK main
  runtime -> backend websocket.
- Backend loop: websocket `query` -> query handler/service -> agent session ->
  executor -> interaction loop -> provider call -> final answer or tool calls.
- Stream receive: backend websocket event -> SDK main runtime projection ->
  `conversation-runtime-updated` and SDK-normalized `conversation-event` ->
  renderer projection and transcript side effects.
- Tool turn: backend model-visible tool call -> SDK main tool router -> Electron
  local execution callback -> sidecar executable tool -> SDK result return ->
  backend history.
- Conversation history: renderer-visible transcript and sidecar-backed SDK store
  are durable local authority; backend sessions are inference state that can be
  rebuilt from local transcript.

## Change Routing

| Change type | Start with | Required follow-through |
| --- | --- | --- |
| Backend API route | `docs/backend/api/api_route_change_workflow.md` | Route schema, service code, tests, docs, changelog |
| SDK route or client method | `docs/sdk/sdk_route_change_workflow.md` | Backend route models, TS/Python clients, examples or tests, docs, changelog |
| Model-visible tool | `docs/tools/tool_schema_policy_change_workflow.md` | Backend catalog/policy, sidecar executable contract if local, SDK/main dispatch, tests, docs, changelog |
| Filesystem or shell behavior | `docs/tools/filesystem_shell_change_workflow.md` | Backend schema/policy, SDK/main dispatch, Electron argument shaping, sidecar execution, result formatting, tests |
| Browser automation | `docs/browser/browser_change_workflow.md` | Backend schema, shared browser contract, sidecar runtime, Electron bridge, renderer controls, tests |
| Renderer/main/sidecar ownership bug | `docs/architecture/frontend_architecture.md` and `docs/architecture/runtime_boundary_matrix.md` | Identify the producer before editing the consumer |
| Storage or transcript behavior | `docs/architecture/storage_persistence_change_workflow.md` | State migration or no-migration reason explicitly |
| Permission or local authority | `docs/security/permissions_and_local_authority_workflow.md` | Verify trust boundary and platform behavior |
| Overlay/chat pill/runtime surface bug | `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md` and `docs/desktop/minimal_chat_pill.md` | Define the state machine and event timeline before editing |
| Release or packaging | `docs/operations/release_packaging_change_workflow.md`, `RELEASING.md`, or `release.md` if present | Run relevant tests first; do not change versions or publish without approval |

## Architecture Rules

- Prefer deletion-first cleanup over compatibility layers that keep duplicate
  authorities alive.
- Fix root causes, not symptoms, and do not layer workarounds on top of messy
  local design when a small refactor can remove the problem.
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
- Escalate before widening scope if cleanup would cross subsystem boundaries,
  change public contracts, or require a large multi-file rewrite.

## Tool and Extension Contracts

- Tools execute on the Python sidecar unless they are explicit backend remote
  tools such as `web_search`.
- Backend validates client-provided tool manifests, applies policy/provider
  projection, owns backend remote tools, and owns final prompt compilation.
- Frontend/sidecar own local tool implementations and executable manifests for
  client-local tools; they must not import backend code for schema parity.
- Tool changes must update the client tool manifest, docs, and focused tests in
  the same change.
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

In the final summary, briefly note any meaningful refactor performed and any
important debt intentionally left behind.

For every completed fix or behavior change, explain:

- How you implemented it.
- What the previous behavior was.
- What the current behavior is after the fix.
- Which validation commands were run, including focused tests,
  lint/typecheck/build checks, docs-list, and diff checks when relevant.
- Any validation command that was intentionally skipped or could not run, with
  the reason.

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

- Commits are pre-authorized for completed work.
- If you change files, commit that work before handing the turn back unless the
  user explicitly says not to commit.
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
- Keep edits small and reviewable.
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
- Avoid guessing; if unsure, read more code first.
- If still blocked, ask with short options.
- Call out conflicts and choose the safer path.
- Preserve unrelated dirty worktree changes.
- Report only files and behavior you changed.
- Stop and ask only if unexpected changes affect files you are actively editing.
- For larger refactors or multi-turn changes, maintain a scratch log of
  decisions, tradeoffs, validation commands, blockers, and assumptions.

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
