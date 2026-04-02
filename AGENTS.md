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

### Explanation Style

- When the user asks architectural or product-flow questions, answer in a conceptual, system-level manner first.
- Describe how the runtime works, where a change fits in the flow, what boundaries would change, and why.
- Do not lead with file paths, symbol names, or implementation breadcrumbs unless the user explicitly asks for them.
- If code was inspected, use that to make the explanation accurate, but present the answer as an integration narrative rather than a file tour.
- After the conceptual explanation is clear, optionally add implementation detail or file-level pointers only if the user asks for them.

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
- Never generate a new conversation ref during first-send/startup until all three are checked: transcript session, chat store active ref, main-process session snapshot.
- Closing dashboard must not reset chat continuity; chat pill send path must continue the active conversation if main process still has one.
- `local-user-message` screenshot attachment contract: optimistic user row + dashboard replay must render `screenshotRef/screenshotUrl` immediately when provided; no UI-only drops.
- Overlay startup contract: first query in minimal chat pill must show awaiting/response phases without needing a second send; phase listeners must be resilient to late mount timing.
- Any change touching chat-pill send/session/overlay startup behavior requires regression tests in same PR (`ChatMessageSender`, `ChatProvider`, `IpcMainBridge` minimum).

## Git
- Safe by default: `git status/diff/log`. Push only when user asks.
- Commits are pre-authorized: make commits automatically for completed work without waiting for additional user confirmation.
- Prefer small, frequent commits during code changes so each commit is easy to review and revert.
- `git checkout` ok for PR review / explicit request.
- Branch changes require user consent.
- Destructive ops forbidden unless explicit (`reset --hard`, `clean`, `restore`, `rm`, …).
- Prefer HTTPS remotes; flip SSH->HTTPS before pull/push.
- Commit helper on PATH: `committer` (bash). This repo ships `./scripts/committer` (executable); use it directly or via PATH `committer`.
- On Windows PowerShell, do not invoke `./scripts/committer` directly; it can trigger the shell "How do you want to open this file?" dialog. Use Git Bash explicitly, or fall back to plain `git add` + `git commit` from PowerShell.
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

## Critical Thinking
- Fix root cause (not band-aid).
- Unsure: read more code; if still stuck, ask w/ short options.
- Conflicts: call out; pick safer path.
- Unrecognized changes: assume other agent; keep going; focus your changes. If it causes issues, stop + ask user.
- Leave breadcrumb notes in thread.
- Prefer simple, intuitive implementations. 

## WindieOS Minimal Chat Pill Note
- Linux double-flicker after screenshot: root cause was overlay awaiting state not latched across cross-window phase timing (plus pre-hide show flash path).
- Stable fix contract:
- collapse path hide-only (`hide-chatbox`; no pre-hide `show-chatbox`).
- await indicator latch from shared `response-overlay-phase` (`tool-call|tool-output|awaiting-first-chunk`) and keep through transient `idle`.
- clear latch on `streaming|complete|error` or when response content is visible.
- typing indicator should be mounted in stable awaiting shell; no await<->response animation in minimal pill loop.

## WindieOS tool schema note
- Backend is in charge of model-facing tool schema
- Frontend has a tool schema but its for tool executions, and the tool schema is simpler since the sidecar is a dumb executor (no ocr, no vision, no web_search, just click at a coordinate, some tools or functions of a tool are executed in the backend and brought its output for frontend to execute). Ex:
- click_ocr ("file") backend sends "file" text coordinate to frontend to click
- frontend: click : (100,200)
- the best way to ensure parity is through parity tests, frontend is not supposed to use code from backend.

Do:
- Typography: pick a real font; avoid Inter/Roboto/Arial/system defaults.
- Theme: commit to a palette; use CSS vars; bold accents > timid gradients.
- Motion: 1–2 high-impact moments (staggered reveal beats random micro-anim).
- Background: add depth (gradients/patterns), not flat default.

Avoid: purple-on-white clichés, generic component grids, predictable layouts.
</frontend_aesthetics>
