# Repository Guidelines

- Repo: /media/peter-bui/E/Assistants/WindieOS
- Issues/PR comments: use literal multiline strings or heredocs for real newlines; avoid "\\n" in posted text.

## Project Conceptual Overview

WindieOS is a desktop AI operator. Conceptually:

- Chat-first assistant with execution ability, not chat-only Q&A.
- Understands live screen/context, plans actions, executes tools, reports results.
- Controls both browser and system-level operations (mouse/keyboard/scroll/screenshot/files/processes).
- Keeps local memory (episodic + semantic) to improve continuity across sessions.
- Supports voice/wakeword flow for hands-free interaction.

Runtime model (what powers this):

- Electron app for UX (renderer) + orchestration bridges (main process).
- Python sidecar for local tool execution and local memory services.
- Python FastAPI backend for agent loop, LLM orchestration, and streaming responses.

User experience target:

- User gives a goal in natural language.
- WindieOS can inspect context, act on the computer, and iterate until completion.
- Transparency is preserved via streamed reasoning/events and tool-result feedback.

## Conceptual Map (General Data Flows)

Treat this as the high-level mental model of WindieOS behavior.

### 1) Turn lifecycle (outer loop)

- User message -> optimistic user row appears immediately.
- Backend opens one turn -> streams events for that turn.
- Turn ends only on terminal event (`streaming-complete` or error).

### 2) Agent loop (inner loop)

- User goal -> model response.
- If tool calls exist: execute tools -> feed tool outputs back to model.
- Repeat until model stops calling tools -> final normal assistant text.

### 3) Tool-call handshake

- Model emits tool call -> system assigns execution identity.
- Frontend executes tool -> sends result with same identity.
- Backend matches result to waiting call -> loop continues.

### 4) Grounding frame contract

- Every screenshot produces a frame identity.
- OCR/manual grounding is tied to that exact frame.
- Click execution uses that same frame mapping, not global screen heuristics.

### 5) OCR ambiguity contract

- OCR text query -> 0/1/many matches.
- If many matches: system returns stable candidates for that frame.
- Model selects one candidate -> retry on same frame identity.

### 6) Stale-frame safety contract

- If click was grounded on old frame but current frame changed -> reject click.
- Required next step: re-ground on latest frame, then retry.

### 7) Bundle atomicity contract

- Model emits bundle -> steps run in order as one unit.
- Bundle resolves to one aggregate result before next model iteration.
- No partial advance to next iteration before bundle completes.

### 8) Stale-turn event gate

- Active turn identity is tracked in UI/runtime.
- Late tool events from older turns are canceled/ignored.
- Old outputs cannot mutate current turn state.

### 9) Message send and capture flow

- Send action -> optional screenshot/context capture -> backend query.
- Capture/upload failures degrade gracefully; query still sends.
- Uploaded artifacts become the shared visual context for that turn.

### 10) Surface mode flow (dashboard vs chat pill)

- Dashboard mode: main window is primary.
- Overlay mode: chat pill is primary lightweight surface.
- Tool/capture phases may temporarily alter surfaces, then restore.

### 11) Chat pill hide/show flow

- Interactive tool phases may hide the chat pill for clean control.
- Non-interactive phases keep normal visibility behavior.
- Restore happens after phase completion using scoped lifecycle tokens.

### 12) Focus handoff flow

- External interaction needed -> WindieOS yields focus.
- Target app gets focus -> action/capture executes.
- Flow then restores expected assistant/window focus state.

### 13) Click-through flow

- Idle/chatting -> chat UI clickable.
- Interactive computer-use phase -> click-through toggled to avoid interception.
- Phase end -> click-through reset to normal interactive state.

### 14) Stop flow

- User stop -> cancel signal issued immediately.
- Active or just-starting query is canceled.
- UI always receives terminal completion for clean exit.

### 15) Rehydrate flow

- Opening prior conversation -> transcript snapshot loaded.
- Backend rebuilds model-usable history from transcript.
- New turns continue from reconstructed context.

### 16) Compaction flow

- History growth crosses policy -> compaction lifecycle events emitted.
- Manual compaction allowed only when no active query race.
- Result: history reduced or explicitly skipped with reason.

### 17) Permission gate flow

- App boot -> permission manifest + probes.
- Missing required permissions -> onboarding gate blocks normal shell.
- Granted/consented state -> main chat surfaces unlocked.

### 18) Memory flow

- Completed interaction -> episodic memory write.
- Background processing may distill semantic memory.
- Future queries retrieve memory only when enabled.

### 19) Transcript durability flow

- User/assistant/tool events -> persisted transcript entries.
- Temporary persistence failure -> queued retry.
- UI and backend can rehydrate from persisted transcript state.

### 20) Connection identity flow

- Client connects -> handshake provides identity.
- Backend validates handshake identity once, then binds it to that socket.
- Later messages use connection identity; disconnect triggers task/session cleanup.

### 21) Query optimistic + failure fallback flow

- Query send starts -> local optimistic user event is broadcast immediately.
- Backend send succeeds -> normal streaming continues.
- Backend send fails/disconnects -> synthetic error event + UI phase reset.

### 22) Completion guarantee flow

- Stream may end with explicit terminal event, or may end unexpectedly.
- If terminal event is missing, backend emits fallback completion events.
- UI still receives deterministic turn close-out.

### 23) Malformed tool-call recovery flow

- Model emits malformed tool-call arguments.
- System classifies recoverable cases -> emits synthetic failed tool output with retry guidance.
- Agent loop continues same turn instead of hard-aborting immediately.

### 24) Settings sync gate flow

- On new connection, frontend pushes latest settings and waits for ack tracking.
- Early query/wakeword sends pass through this sync gate.
- Result: turns run against intended active runtime settings.

## Project Structure & Module Organization

- Backend (Python): `backend/src/` (agent, tools, llm, api, core, sdk, services).
- Frontend (Electron/React): `frontend/src/` (main process in `src/main`, renderer in `src/renderer`).
- Frontend Python sidecar: `frontend/src/main/python/` (IPC, tools, memory).
- Tests: `tests/` (new suites in `tests/new_backend`, `tests/new_sidecar`, `tests/new_frontend`).
- Docs: `docs/` (architecture, tool system, configuration, integration, troubleshooting).

## Build, Test, and Development Commands

- Runtime baseline: **Python 3.11**, **Node 18+**.
- Conda env names (authoritative): backend/runtime+backend tests => `jarvis`; frontend app/sidecar/frontend tests => `frontend_jarvis`.
- No manual activation required: use `./scripts/python-in-env <backend|frontend|sidecar> <cmd...>` (falls back to current shell env if conda env missing).
- Install backend deps: `pip install -r backend/requirements.txt`
- Install frontend deps: `cd frontend && npm install`
- Run backend (dev): `./scripts/run-backend` (or `./scripts/python-in-env backend python -m backend.src.main`).
- Run frontend UI (Vite): `./scripts/run-frontend-dev`
- Run Electron app: `./scripts/run-frontend-electron`
- Backend tests: `./scripts/test-backend`
- Sidecar tests: `./scripts/test-sidecar`
- Frontend tests: `cd frontend && npm run test` (CI: `npm run test:ci`).
- Lint frontend: `cd frontend && npm run lint`.

## Coding Style & Naming Conventions

- Backend: Python with type hints; prefer async I/O; follow existing patterns in `backend/src`.
- Frontend: TypeScript/JavaScript (ESM) with React; keep renderer logic in `src/renderer` and main/IPC in `src/main`.
- Formatting: use `black`/`isort` for backend, `eslint` for frontend when touching related code.
- Keep modules focused; split large files when it improves clarity/testability.
- When modifying code, do not keep backward compatibility, remove anything unused.

## Docs
- Start: run docs list (`docs:list` script, or `./bin/docs-list` here if present; fallback: `node scripts/docs-list.js`; ignore if not installed); open docs before coding.
- Follow links until domain makes sense; honor `Read when` hints.
- Keep notes short; update docs when behavior/API changes (no ship w/o docs).
- Add `read_when` hints on cross-cutting docs.

## Testing Guidelines

- Use `pytest` for backend/sidecar tests and `jest` for frontend tests.
- New tests go into the `tests/new_*` suites unless you are extending an existing test module.
- Prefer unit-level tests with minimal I/O; mock network and system calls.
- If you change tool parsing/execution or IPC, add tests across backend + sidecar + frontend as needed.
- After each non-trivial feature/fix, add tests immediately while implementation context is still active; this yields stronger tests and often catches bugs in the new code.
- Purely visual/UI-only tweaks can skip new tests when low-signal; default is still to add tests for everything else.

### PR Workflow (Review vs Land)

- Review mode: use `gh pr view` / `gh pr diff`; do not switch branches or change code.
- Landing mode: create an integration branch from `main`, bring in PR commits (prefer rebase or squash), apply fixes, run tests, then merge back to `main` and delete the temp branch.
- Always mention testing performed and any user-facing changes in PR summaries.

### Release Flow

- Look for release docs in `docs/` (or a `RELEASING.md`/`release.md`); follow them if present.
- Do not change version numbers or publish artifacts without explicit approval.
- Before any release step, run relevant tests (`pytest` + `frontend` test/lint/build if the release touches UI).

## Security & Configuration Tips

- API keys are provided via environment variables (see `backend/src/core/config/models.py`).
- Core config lives in `backend/src/core/config/app_config.py` and `backend/src/core/config/models.py` (no YAML).
- Do not commit real credentials, user data, or machine-specific paths to docs/tests.

## Agent-Specific Notes

- Tools execute on the frontend Python sidecar; backend orchestrates schemas/coord resolution.
- When updating tool schemas or execution flow, check both backend tool registry and frontend tool registry.
- Use absolute, explicit dates when clarifying time-sensitive behavior in tests or docs.
- Never edit `node_modules` or vendored dependency output; changes will be overwritten.
- Dependency patching (overrides/patches/vendored changes) requires explicit approval.
- When answering questions, verify in code first; avoid guessing.
- If unrelated changes from other agents are present, continue with your scoped task and report only the files/behavior you changed.

### Frontend Wiring Protocol

- For complex UI/runtime bugs, define state machine + event timeline before code changes.
- Use one behavior scope per patch; avoid combining focus, visibility, click-through, and transport changes in one implementation.
- Declare phase invariants explicitly (expected focus owner, overlay visibility, click-through mode, stop interactivity, capture timing).
- Centralize cross-process surface control in one orchestrator/module; avoid duplicated toggles across renderer/main/sidecar.
- Add deterministic transition logging for each phase change (turn/tool correlation id + before/after state snapshot).
- Prefer fail-safe retries for focus/surface prep with bounded attempts and explicit terminal errors.
- Keep dev/prod gating explicit and test both paths when behavior differs by mode.
- Add scenario tests for race-prone flows (tool execution start/stop, screenshot hide/show, focus verification, resume after failure).
- If requirements conflict or timing semantics are ambiguous, stop and resolve spec conflicts before implementation.

## Git
- Safe by default: `git status/diff/log`. Push only when user asks.
- Commits are pre-authorized: make commits automatically for completed work without waiting for additional user confirmation.
- Prefer small, frequent commits during code changes so each commit is easy to review and revert.
- `git checkout` ok for PR review / explicit request.
- Branch changes require user consent.
- Destructive ops forbidden unless explicit (`reset --hard`, `clean`, `restore`, `rm`, …).
- Prefer HTTPS remotes; flip SSH->HTTPS before pull/push.
- Commit helper on PATH: `committer` (bash). This repo ships `./scripts/committer` (executable); use it directly or via PATH `committer`.
- Commit message: Conventional Commit subject + short description body (when it helps review). Example:
  - `feat(frontend-dashboard): delete semantic memory entries`
  - blank line
  - bullets: what changed, where wired, tests added
- After committing work, update `CHANGELOG.md` with the changes.
- Don’t delete/rename unexpected stuff.
- If unexpected workspace changes appear in files outside your current implementation scope, ignore them and continue.
- Stop + ask only if unexpected changes touch files you are actively implementing in this task.
- No repo-wide S/R scripts; keep edits small/reviewable.
- Avoid manual `git stash`; if Git auto-stashes during pull/rebase, that’s fine (hint, not hard guardrail).
- If user types a command (“pull and push”), that’s consent for that command.
- No amend unless asked.
- Big review: `git --no-pager diff --color=never`.
- Multi-agent: check `git status/diff` before edits; ship small commits.

### bin/docs-list / scripts/docs-list.ts
- Optional. Lists `docs/` + enforces front-matter. Ignore if `bin/docs-list` not installed. Rebuild: `bun build scripts/docs-list.ts --compile --outfile bin/docs-list`.
- `bin/docs-list` is executable here: use `./bin/docs-list` for direct runs.

### tmux
- Use only when you need persistence/interaction (debugger/server).
- Quick refs: `tmux new -d -s codex-shell`, `tmux attach -t codex-shell`, `tmux list-sessions`, `tmux kill-session -t codex-shell`.

<frontend_aesthetics>
Avoid “AI slop” UI. Be opinionated + distinctive.

### committer
- Commit helper (PATH). Stages only listed paths; required here. If `committer` is unavailable on PATH, use `./scripts/committer` directly (executable).

Do:
- Typography: pick a real font; avoid Inter/Roboto/Arial/system defaults.
- Theme: commit to a palette; use CSS vars; bold accents > timid gradients.
- Motion: 1–2 high-impact moments (staggered reveal beats random micro-anim).
- Background: add depth (gradients/patterns), not flat default.

Avoid: purple-on-white clichés, generic component grids, predictable layouts.
</frontend_aesthetics>
