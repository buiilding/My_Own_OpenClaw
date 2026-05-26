# Repository Guidelines

## Project Overview

WindieOS is a desktop AI operator with persistent memory, terminal access, and computer-use and browser-use tools. It also supports voice and wakeword flows for hands-free interaction.

### Runtime Model

- Electron app for UX
  - Renderer for UI
  - Main process for native shell behavior, windows, IPC, permissions, platform policy, and SDK host adapters
- Windie SDK runtime for agent/client orchestration that should be reusable by Electron, CLI, custom UI, plugins, and tests
- Python sidecar for local tool execution and local memory services
- Python FastAPI backend for the agent loop, LLM orchestration, streaming, remote tools, and internal processing such as OCR and vision
- The backend is part of this repository and may be self-hosted or hosted
- Frontend and sidecar must not import backend code at runtime; use public transport contracts, manifests, docs, and tests for parity

### User Experience Goal

- The user gives a goal in natural language
- WindieOS selects and runs tools to achieve it safely and reliably

## Project Structure

- Backend Python: `backend/src/`
  - agent, tools, llm, api, core, sdk, services
- Frontend Electron and React: `frontend/src/`
  - main process in `src/main`
  - renderer in `src/renderer`
- Frontend Python sidecar: `frontend/src/main/python/`
  - IPC, tools, memory
- Tests: `tests/`
  - `tests/backend`
  - `tests/sidecar`
  - `tests/frontend`
  - `tests/sdk`
- Docs: `docs/`

## Codebase Operating Guide

Use this section to orient before editing. The filesystem and the docs remain
canonical, but these are the load-bearing entry points and dependency chains
agents should understand first.

### Runtime Dependency Chain

```text
React renderer
  -> Electron preload allowlist
  -> Electron main IPC/runtime facades
  -> Windie SDK runtime
  -> hosted/self-hosted backend websocket + HTTP APIs
  -> LLM providers and backend-owned remote services

Electron main
  -> Python sidecar JSON-RPC or SDK sidecar daemon
  -> local tools, local memory, browser runtime, system state

Backend agent loop
  -> prompt construction + provider policy
  -> model-visible tool schemas
  -> SDK/main local-tool dispatch
  -> sidecar executable tools
  -> tool results back into backend history
```

### Backend Entry Points

- App entry: `backend/src/main.py`
- FastAPI assembly: `backend/src/api/app_assembly.py`
- Canonical route registration: `backend/src/api/routes/__init__.py::API_ROUTERS`
- Websocket query path: `backend/src/api/routes/websocket/`
- Incoming websocket handlers: `backend/src/api/handlers/`
- Query handler: `backend/src/api/handlers/query.py`
- Query orchestration service: `backend/src/api/services/query_execution.py`
- Query support helpers: `backend/src/api/services/query_execution_support/`
- Agent session lifecycle: `backend/src/agent/session/`
- Agent executor and interaction loop: `backend/src/agent/execution/executor.py`, `backend/src/agent/execution/interaction_loop.py`
- Prompt construction and repo instruction loading: `backend/src/llm/prompts/`
- Provider adapters and OpenAI Responses handling: `backend/src/llm/providers/`
- Backend tool registry and model-visible schema source: `backend/src/tools/registry.py`
- Static remote-tool catalog: `backend/src/tools/tool_catalog.py`
- Tool policy and provider projection: `backend/src/tools/tool_policy.py`, `backend/src/tools/provider_projection.py`
- SDK HTTP routes: `backend/src/api/routes/sdk/`
- Artifacts routes: `backend/src/api/routes/artifacts/`
- VM run-control routes: `backend/src/api/routes/runs/`

Backend owns the model-facing prompt, provider routing, hosted APIs, OCR/vision
services, artifacts, compaction decisions, and final tool-schema projection. It
does not own local mouse, keyboard, browser, filesystem, shell, or OS permission
execution.

Backend startup is `main.py` -> `create_api_app(...)` -> `API_ROUTERS` plus the
lifespan `InitializationCoordinator`, which builds the dependency container and
`SessionManager`. A websocket `query` message flows through `QueryMessageHandler`
into `QueryExecutionService`, then into `AgentSession.process_query(...)`,
`AgentExecutor.process_query(...)`, and `InteractionLoop.run_loop(...)`.

Backend tool registration is not only the static remote catalog. `ToolRegistry`
registers remote stubs from `tool_catalog.py`, then backend-owned tools such as
`web_search`, `RemoteGroundedMouseTool`, and `RemoteGroundedScrollTool`. When
changing tool visibility, inspect the registry, policy, provider projection, and
the sidecar manifest/parity path together.

### SDK Runtime Entry Points

- TypeScript SDK package: `packages/windie-sdk-js/src/`
- Public exports: `packages/windie-sdk-js/src/index.ts`
- Primary client: `packages/windie-sdk-js/src/runtime/WindieClient.ts`
- Agent/session runtime: `WindieAgent.ts`, `WindieChatSession.ts`, `ConversationRuntime.ts`
- Conversation stores: `InMemoryConversationStore.ts`, `FileConversationStore.ts`, `SidecarConversationStore.ts`
- Local sidecar runtime: `LocalSidecarRuntime.ts`
- Tool coordination: `tools/ToolExecutionCoordinator.ts`, `tools/toolCorrelationIds.ts`
- Backend transport: `transport/ManagedBackendSession.ts`, `transport/BackendSocketFactory.ts`
- Standalone websocket session: `transport/WindieAgentSession.ts`
- Event normalization and projections: `transport/backendEventNormalizer.ts`, `projections/currentTurnProjection.cjs`
- Python SDK package: `packages/windie-sdk-python/`
- Sidecar Python re-export: `frontend/src/main/python/core/windie_sdk_client.py`

Use `WindieClient.wakeUp(...)` for new agent sessions. The SDK owns hosted
backend websocket lifecycle, normalized conversation events, local-tool result
return, conversation stores, replay/rehydrate helpers, and projections that
Electron and future clients should share.

For source edits, prefer `packages/windie-sdk-js/src/`; `dist/` is build output.
Electron main currently imports the SDK CJS source shims directly from
`packages/windie-sdk-js/src/.../*.cjs`, so changes to those runtime shims can
affect the desktop app before a package build. `WindieClient.wakeUp(...)` is the
external SDK path; Electron main uses `createWindieSdkMainRuntime(...)` around
`ManagedBackendSession`, while renderer feature code goes through desktop
facades rather than instantiating `WindieClient`.

### Electron Main Entry Points

- Composition root: `frontend/src/main/index.cjs`
- Renderer IPC bridge and event fan-out: `frontend/src/main/ipc.cjs`
- SDK runtime host adapter: `frontend/src/main/windie_sdk_runtime.cjs`
- SDK command router: `frontend/src/main/ipc/ipc_sdk_command_router.cjs`
- SDK tool router bridge: `frontend/src/main/ipc/ipc_sdk_tool_router.cjs`
- Window ownership and overlay state: `frontend/src/main/surface_runtime.cjs`
- Window visibility and platform policy: `window_visibility_runtime.cjs`, `window_platform_policy.cjs`
- Sidecar process bridge: `local_backend_bridge.cjs`, `local_backend_supervisor.cjs`
- Sidecar request transport: `local_backend_bridge_request_transport.cjs`
- Sidecar local tool execution adapter: `local_backend_bridge_execute_tool_runtime.cjs`
- Sidecar daemon manager: `sidecar_daemon_manager.cjs`
- Permission service: `permission_service.cjs` plus focused `permission_service_*` modules
- Wakeword subprocess bridge: `wakeword_bridge.cjs`, `wakeword_supervisor.cjs`
- VM worker mode: `runtime_mode.cjs`, `vm_worker_runtime.cjs`

Electron main owns desktop shell behavior: windows, IPC, menus, app lifecycle,
native permissions, sidecar and wakeword supervision, endpoint selection, and
host adapters. It should not become a second agent loop, prompt compiler,
conversation store, or tool-routing authority.

Renderer chat sends enter main through the typed `send-chat-query` IPC handler,
not the generic `to-backend` channel. Main prepares screenshots, local user echo,
system state, memory context, workspace `AGENTS.md` prompt layers, settings sync,
and install auth before sending through the SDK main runtime. Backend events are
routed through `windie_sdk_runtime.cjs`, where tool events are first offered to
the SDK tool router for local execution, then projected as
`conversation-runtime-updated`, `conversation-event`, and compatibility renderer
events.

### Renderer Entry Points

- App composition: `frontend/src/renderer/app/`
- Chat UI and stream presentation: `frontend/src/renderer/features/chat/`
- Dashboard, settings, models, memory, search: `frontend/src/renderer/features/dashboard/`
- Voice and wakeword UI: `frontend/src/renderer/features/voice/`
- Renderer API/client boundary: `frontend/src/renderer/infrastructure/api/`
- SDK client wrapper: `frontend/src/renderer/infrastructure/api/windieSdkClient.ts`
- Desktop runtime facades: `frontend/src/renderer/app/runtime/`
- Chat provider composition: `frontend/src/renderer/app/providers/ChatProvider.jsx`
- Message send hook: `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- SDK projection listener: `frontend/src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream.ts`
- Transcript/metadata stream side effects: `frontend/src/renderer/features/chat/hooks/useChatStream.ts`

Renderer owns user-facing state and display. Feature code should call desktop
runtime facades or SDK projections instead of rebuilding backend websocket
loops, transcript replay, compaction, model sync, or tool-routing semantics.

`DesktopLiveTurnRuntimeClient.sendQuery(...)` creates a short-lived
`SdkConversationRuntime` with an `InMemoryConversationStore` and
`createDesktopBackendTransport(...)` to submit one live turn through typed IPC.
It is a renderer command facade, not the durable conversation store. Durable
history browsing, transcript projection, rehydrate, retry, edit/resend, and
manual compaction live in the focused desktop continuity/transcript runtime
facades under `frontend/src/renderer/app/runtime/`.

### Python Sidecar Entry Points

- JSON-RPC sidecar entry: `frontend/src/main/python/local_backend.py`
- SDK sidecar daemon: `frontend/src/main/python/sidecar_daemon.py`
- JSON line writer and IPC protocol: `core/stdout_json.py`, `core/ipc_protocol.py`
- Hosted SDK transport client: `core/windie_sdk_client.py`
- Tool registry: `frontend/src/main/python/tools/registry.py`
- Executable tool manifest: `frontend/src/main/python/tools/manifest.py`
- Exposed tool-name parity: `frontend/src/main/python/tools/exposed_tool_names.py`
- Browser runtime: `frontend/src/main/python/tools/browser/`
- Computer tools: `frontend/src/main/python/tools/computer/`
- Filesystem tools: `frontend/src/main/python/tools/filesystem/`
- Shell/process/system tools: `frontend/src/main/python/tools/system/`
- Local memory store: `frontend/src/main/python/memory/`
- Wakeword service: `frontend/src/main/python/wakeword_service.py`

The sidecar owns local machine authority and local storage. It may call hosted
backend services through transport clients, but it must not import backend
Python packages for runtime behavior.

`local_backend.py` registers JSON-RPC methods for `execute_tool`, system state,
memory, chat history, browser install helpers, and diagnostics over
stdin/stdout. `sidecar_daemon.py` wraps the same `LocalBackend` in token-gated
HTTP/WebSocket routes: `/tools`, `/tools/register-module`, `/plugins/register`,
`/mcps/register`, `/execute-tool`, `/rpc`, `/events`, and `/shutdown`.
Dynamic module, plugin, and MCP tools are registered into the same sidecar
`ToolRegistry` and then appear in the executable manifest returned to the SDK.
Built-in sidecar schemas come from `tools/manifest.py`; backend-expected names
are checked through `tools/exposed_tool_names.py`.

### Common Change Routes

- New backend API route: start in `docs/backend/api/api_route_change_workflow.md`, then update route schema, service code, tests, docs, and changelog.
- New SDK route or SDK client method: start in `docs/sdk/sdk_route_change_workflow.md`, then update backend route models, TypeScript/Python clients, examples or tests, docs, and changelog.
- New model-visible tool: start in `docs/tools/tool_schema_policy_change_workflow.md`, then update backend catalog/policy, sidecar executable contract if local, SDK/main dispatch, tests, docs, and changelog.
- Local filesystem/shell behavior: start in `docs/tools/filesystem_shell_change_workflow.md`, then route through backend schema/policy, SDK/main dispatch, Electron argument shaping, sidecar execution, result formatting, and tests.
- Browser automation behavior: start in `docs/browser/browser_change_workflow.md`, then keep backend schema, shared browser contract, sidecar runtime, Electron bridge, renderer controls, and tests aligned.
- Renderer/main/sidecar ownership bug: start in `docs/architecture/frontend_architecture.md` and `docs/architecture/runtime_boundary_matrix.md`, then identify the producer before editing the consumer.
- Storage or transcript change: start in `docs/architecture/storage_persistence_change_workflow.md`, then state the migration or no-migration reason explicitly.
- Permission or local authority change: start in `docs/security/permissions_and_local_authority_workflow.md`, then verify trust-boundary and platform behavior.

### Runtime Flow Cheatsheet

- Query send: `useChatMessageSender` -> `DesktopLiveTurnRuntimeClient` -> short-lived `SdkConversationRuntime` -> `createDesktopBackendTransport` -> `send-chat-query` IPC -> main query payload builder -> SDK main runtime -> backend websocket.
- Backend loop: websocket `query` -> `QueryMessageHandler` -> `QueryExecutionService` -> `AgentSession` -> `AgentExecutor` -> `InteractionLoop` -> provider call -> final answer or tool calls.
- Stream receive: backend websocket event -> SDK main runtime projection -> `conversation-runtime-updated` and SDK-normalized `conversation-event` -> renderer projection/transcript side effects.
- Tool turn: backend model-visible tool call -> SDK main tool router -> Electron local execution callback -> sidecar executable tool -> SDK result return -> backend history.
- Conversation history: renderer-visible transcript and sidecar-backed SDK store are the durable local authority; backend sessions are inference state that can be rebuilt from local transcript.
- Memory: local memory lives in the sidecar store; hosted backend provides embeddings, semantic summarization, title generation, and policy.
- Browser: sidecar owns browser mechanics and dedicated session state; renderer controls are display/control surfaces, not independent browser runtimes.

## Tooling and Architecture Notes

- Tools execute on the frontend Python sidecar unless they are explicit backend remote tools such as `web_search`
- The intended frontend direction is SDK-first: Electron should become the first official Windie SDK client, not a parallel runtime implementation
- New chat/runtime behavior should move into the SDK runtime first when it is useful outside one Electron surface
- Electron-specific code should stay limited to true desktop shell concerns: BrowserWindow lifecycle, IPC transport, menus, app lifecycle, native permissions, platform window policy, tray/shortcuts, and host capability adapters
- Avoid adding new Electron-only bridges for behavior that belongs to `WindieClient`, `WindieAgent`, `ConversationRuntime`, `LocalSidecarRuntime`, SDK stores, SDK projections, or SDK tool routing
- When replacing Electron bridge behavior with SDK behavior, include a deletion milestone for the old bridge/store/helper path in the same phase or in the next explicit phase
- Do not add adapter layers whose only job is to rename and forward payloads; adapters must enforce a real runtime boundary, security boundary, lifecycle boundary, or testable invariant
- Windie Agent/frontend owns local tool implementations and model-facing schemas for client-local tools
- The backend validates client-provided tool manifests, applies policy/provider projection, owns backend remote tools, and owns final prompt compilation
- Frontend and sidecar must not import backend code for schema parity
- Tool changes must update the client tool manifest, docs, and focused tests in the same change
- Extensions must keep contribution types separated inside one package: metadata in `extensions/<id>/extension.json`, plugin code in `plugin/index.cjs`, MCP server config in `mcp/servers.json`, skills in `skills/<skill-id>/SKILL.md`, sidecar schemas in `tools/`, and sidecar code in `python/`. Python sidecar tools use `name`, `schema`, and `entrypoint`; main-process plugin tools use `api.registerTool({ name, schema, execute })`; plugin code may call `api.registerMcpServer(...)`; skills become prompt layers, not executable tools
- When adding developer extension docs, keep `docs/development/extensions.md` as the canonical authoring guide and `docs/plugins/README.md` as the routing hub
- Built-in grounded tools must preserve the model-schema vs prepared-argument distinction. Use `backend_grounding` only when OCR/vision/prediction prepares executable sidecar arguments; otherwise use `passthrough`
- The preferred parity mechanism is tests that verify schemas and registries do not drift

### Tool Schema Example

- Backend may resolve OCR or higher-level tool intent
- Frontend receives a simpler executable action

Example:

- backend resolves higher-level screen intent into coordinates
- frontend executes `click(100, 200)`

## Product-Specific Notes

### Minimal Chat Pill

Linux double-flicker after screenshot was caused by overlay awaiting state not being latched across cross-window phase timing, plus a pre-hide show flash path.

Stable fix contract:

* use a hide-only collapse path with `hide-chatbox`
* do not pre-hide with `show-chatbox`
* latch awaiting indicator from shared `response-overlay-phase`

  * `tool-call`
  * `tool-output`
  * `awaiting-first-chunk`
* keep the latch through transient `idle`
* clear the latch on:

  * `streaming`
  * `complete`
  * `error`
  * or when response content becomes visible
* mount the typing indicator in a stable awaiting shell
* do not animate awaiting-to-response transitions in the minimal pill loop
* Linux is the only OS that should hide WindieOS overlay surfaces for screenshot capture and restore them after capture
* Windows and macOS must not add capture-time hide/show for the minimal chat pill or response overlay
* Windows and macOS should enable overlay `setContentProtection(true)` only during active loop phases (`awaiting-first-chunk`, `streaming`, `tool-call`, `tool-output`) and disable it again for idle and terminal phases

## Environment and Commands

### Baseline

- Python 3.11
- Node 18+

### Conda Environments

- Backend runtime and backend tests: `jarvis`
- Frontend app, sidecar, and frontend tests: `frontend_jarvis`

### Environment Launcher

- Do not manually activate environments
- Use `./scripts/python-in-env <backend|frontend|sidecar> <cmd...>`
- If the expected conda env is missing, the script falls back to the current shell environment

### Install

- Backend deps: `pip install -r backend/requirements.txt`
- Frontend deps: `cd frontend && npm install`

### Run

- Backend dev server: `python -m backend.src.main`
- Frontend UI with Vite: `cd frontend && npm run dev`
- Electron dev app: `cd frontend && npm run electron:dev`
- Electron customer app: `cd frontend && npm run electron`

### Test and Lint

- Backend tests: `./scripts/test-backend`
- Sidecar tests: `./scripts/test-sidecar`
- Frontend tests: `cd frontend && npm run test`
- Frontend CI tests: `cd frontend && npm run test:ci`
- Frontend lint: `cd frontend && npm run lint`

## Coding Standards

### General

- Keep modules focused
- Split large files when it improves clarity or testability
- Prefer simple, intuitive implementations
- Remove unused code in touched areas
- Do not keep backward-compatibility shims unless the user explicitly requests compatibility or there is a verified dependency

### Backend

- Use Python with type hints
- Prefer async I/O where appropriate
- Follow existing patterns in `backend/src`
- Use `black` and `isort` when touching related backend code

### Frontend

- Use TypeScript or JavaScript with ESM and React
- Keep renderer logic in `src/renderer`
- Keep main process and IPC logic in `src/main`
- Use `eslint` when touching related frontend code

## Refactoring Policy

- Fix root causes, not symptoms
- Do not layer workarounds on top of messy local design if a small refactor can remove the problem
- Before changing code, identify the owning runtime or layer: backend, SDK runtime, Electron main, renderer, preload, sidecar, docs, or tests
- Prefer deleting, collapsing, or moving existing behavior over adding new surfaces
- Add code only when it enables a simpler ownership boundary, removes duplication, unlocks deletion of legacy paths, or makes a real invariant testable
- Treat net-new wrappers, compatibility shims, fallback aliases, and duplicate state stores as suspicious by default
- If an implementation adds a new layer, name what existing layer, branch, compatibility path, or duplicated behavior it will remove
- Prefer bounded, local refactors in the same codepath when they make the implementation simpler, clearer, or easier to test
- Escalate to the user before widening scope if the cleanup would:
  - cross subsystem boundaries
  - change public contracts
  - require a large multi-file rewrite
- Leave touched areas better than you found them by removing dead code, collapsing duplication, tightening interfaces, or renaming misleading symbols where it directly supports the task

### Refactor Triggers

Pause and propose a refactor if the planned change would otherwise:

- duplicate existing behavior
- add special-case logic to an already confusing flow
- extend a large mixed-responsibility function or component
- make testing awkward because responsibilities are poorly separated
- add another bridge/facade/store for chat, tool execution, sidecar events, conversation history, replay, memory, model settings, or overlay phase without deleting or retiring the older path
- keep Electron and SDK paths as parallel sources of truth for the same runtime behavior

### Completion Check

Before finishing, verify:

- the touched path is not more duplicated or more coupled without a clear reason
- tests cover the cleaned-up behavior and boundaries
- you removed at least as much complexity as you added
- any new abstraction has a deletion or consolidation payoff
- no obsolete UI, bridge, alias, compatibility path, or fallback remains in the touched area without a stated reason
- security-sensitive changes were checked for trust-boundary, permission, credential, IPC, tool-execution, and machine-specific path regressions
- storage, API, event-payload, tool-schema, settings, or persisted-data changes include an explicit migration or compatibility note, even when the note is that no migration is required

In the final summary, briefly note any meaningful refactor performed and any important debt intentionally left behind.
For every completed fix or behavior change, explain:

- how you implemented it
- what the previous behavior was
- what the current behavior is after the fix
- which validation commands were run, including focused tests, lint/typecheck/build checks, docs-list, and diff checks when relevant
- any validation command that was intentionally skipped or could not run, with the reason

## Documentation

Before coding/answering questions:

- Run docs listing if available
  - prefer `./bin/docs-list`
  - fallback `node scripts/docs-list.js`
  - ignore if neither is installed
- Follow doc links and read them until the domain and relevant behavior are clear
- Honor `read_when` hints

When behavior or APIs change:

- update docs in the same change
- update existing tests and add new tests in the same change for the changed behavior, affected regressions, and realistic edge cases you can identify
- add `read_when` hints for cross-cutting docs when useful

### docs-list Notes

- `bin/docs-list` is optional
- It lists `docs/` and enforces front matter
- If needed, rebuild it with:
  - `bun build scripts/docs-list.ts --compile --outfile bin/docs-list`

## Testing

- Use `pytest` for backend and sidecar tests
- Use `jest` for frontend tests
- New tests should go into `tests/backend`, `tests/sidecar`, `tests/frontend`, or `tests/sdk` unless extending an existing test module
- Prefer unit-level tests with minimal I/O
- Mock network and system calls
- For any behavior change, update existing tests and add new coverage in the same change
- Cover the primary path, regressions the change could reintroduce, and realistic edge or failure cases you can identify within the touched scope
- If you change tool parsing, execution flow, or IPC, add tests across backend, sidecar, and frontend as needed
- Add or expand tests while implementation context is still fresh
- Purely visual UI tweaks may skip new tests when they would be low-signal

## PR Workflow

### Review Mode

- Use `gh pr view` and `gh pr diff`
- Do not switch branches
- Do not change code

### Landing Mode

- Create an integration branch from `main`
- Bring in PR commits, preferring rebase or squash
- Apply fixes
- Run relevant tests
- Merge back to `main`
- Delete the temporary branch

### PR Summaries

Always mention:

- testing performed
- any user-facing changes

## Release Flow

- Look for release instructions in `docs/`, `RELEASING.md`, or `release.md`
- Do not change version numbers or publish artifacts without explicit approval
- Before any release step, run the relevant tests
- If UI is touched, include frontend test, lint, and build checks as appropriate
- For local macOS reinstalls, skip Apple notarization so local rebuild/reinstall loops do not wait on Apple services

## Security and Configuration

- API keys must come from environment variables
- Core config lives in:
  - `backend/src/core/config/app_config.py`
  - `backend/src/core/config/models.py`
- Do not commit real credentials, user data, or machine-specific paths to docs or tests
- Never edit `node_modules` or vendored dependency output
- Dependency patching, overrides, or vendored changes require explicit approval

## Working Style

- When answering questions, verify in code and docs first
- Avoid guessing
- If unsure, read more code first
- If still blocked, ask with short options
- Call out conflicts and choose the safer path
- Leave concise breadcrumb notes in the thread when useful
- For larger refactors or multi-turn changes, maintain a scratch log of decisions, tradeoffs, validation commands, blockers, and assumptions so the work can be audited later

### Handling Other Changes in the Workspace

- If unrelated changes from other agents are present, continue with your scoped task
- Report only the files and behavior you changed
- Ignore unexpected changes outside your scope
- Stop and ask only if unexpected changes affect files you are actively editing

## Explanation Style

- For architectural or product-flow questions, explain conceptually first
- Describe how the runtime works, where a change fits, what boundaries change, and why
- Do not mention file paths, symbol names, or implementation breadcrumbs unless the user explicitly asks

## Frontend Runtime Wiring Protocol

For complex UI or runtime bugs:

- define the state machine and event timeline before changing code
- keep one behavior scope per patch
- avoid mixing focus, visibility, click-through, and transport changes in one implementation
- declare phase invariants explicitly
- centralize cross-process surface control in one orchestrator or module
- add deterministic transition logging for each phase change
- keep dev and prod gating explicit
- test both paths when behavior differs by mode
- add scenario tests for race-prone flows

If requirements conflict or timing semantics are ambiguous, resolve the spec conflict before implementation.

### Safe Defaults

- Allowed by default:
  - `git status`
  - `git diff`
  - `git log`
- Push only when the user asks
- `git checkout` is allowed for PR review or explicit user request
- Branch changes require user consent

### Forbidden Without Explicit Approval

- destructive commands such as:
  - `git reset --hard`
  - `git clean`
  - `git restore`
  - `rm`

### Commit Policy

- Commits are pre-authorized for completed work
- If you change files, commit that work before handing the turn back unless the user explicitly says not to commit
- Prefer small, frequent commits
- No amend unless asked
- Update `CHANGELOG.md` before committing repo-visible changes

### Commit Helper

- Preferred helper: `committer`
- This repo includes `./scripts/committer`
- Use either the PATH version or the script directly
- `--body` is required for every commit
- The commit body must describe:
  - the issue being fixed or changed
  - the fix and what improvements it makes
  - the previous behavior
  - the behavior after the fix
- On Windows PowerShell, do not invoke `./scripts/committer` directly
- On PowerShell, use Git Bash or fall back to plain `git add` and `git commit`

### Commit Message Format

Use Conventional Commits with a body section.

Example:

```text
feat(frontend-dashboard): delete semantic memory entries

Issue: semantic memory rows could not be deleted from the dashboard.

Fix: removed the stale action path, wired the delete flow through the owning dashboard runtime, and added regression coverage.

Previous behavior: users could see semantic memory rows but deletion did not complete reliably.

Behavior after fix: deleting a semantic memory row updates the backend, refreshes the dashboard state, and is covered by focused tests.
```

### Additional Git Notes

* Use HTTPS remotes
* Flip SSH to HTTPS before pull or push if needed
* Do not delete or rename unexpected files
* No repo-wide search-and-replace scripts
* Keep edits small and reviewable
* Avoid manual `git stash`
* If Git auto-stashes during pull or rebase, that is fine
* If the user types a command like “pull and push”, that counts as consent for that command
* For large reviews, use `git --no-pager diff --color=never`
* In multi-agent situations, check `git status` and `git diff` before editing

## Issues and PR Comments

* Use literal multiline strings or heredocs for real newlines
* Do not use `\\n` in posted text

## tmux

Use tmux only when you need persistence or interactive debugging.

Quick refs:

* `tmux new -d -s codex-shell`
* `tmux attach -t codex-shell`
* `tmux list-sessions`
* `tmux kill-session -t codex-shell`

## Frontend Aesthetics

Avoid generic AI-looking UI. Be distinctive and intentional.

### Do

* Pick a real font
* Avoid Inter, Roboto, Arial, and generic system-default feel when a stronger choice exists
* Commit to a palette
* Use CSS variables
* Prefer bold accents over timid gradients
* Use one or two high-impact motion moments
* Add depth to backgrounds with gradients or patterns

### Avoid

* purple-on-white clichés
* generic component grids
* predictable layouts
* random micro-animations
