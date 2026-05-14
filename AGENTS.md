# Repository Guidelines

## Project Overview

WindieOS is a desktop AI operator with persistent memory, terminal access, and computer-use and browser-use tools. It also supports voice and wakeword flows for hands-free interaction.

### Runtime Model

- Electron app for UX
  - Renderer for UI
  - Main process for orchestration bridges
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
  - `tests/new_backend`
  - `tests/new_sidecar`
  - `tests/new_frontend`
- Docs: `docs/`

## Tooling and Architecture Notes

- Tools execute on the frontend Python sidecar unless they are explicit backend remote tools such as `web_search`
- Windie Agent/frontend owns local tool implementations and model-facing schemas for client-local tools
- The backend validates client-provided tool manifests, applies policy/provider projection, owns backend remote tools, and owns final prompt compilation
- Frontend and sidecar must not import backend code for schema parity
- Tool changes must update the client tool manifest, docs, and focused tests in the same change
- Extension tools must use `extensions/<id>/extension.json` with `schema`, prompt-layer, and Python `entrypoint` contributions. Ordinary extension tools should not edit the built-in sidecar registry or manifest modules
- Built-in grounded tools must preserve the model-schema vs prepared-argument distinction. Use `backend_grounding` only when OCR/vision/prediction prepares executable sidecar arguments; otherwise use `passthrough`
- The preferred parity mechanism is tests that verify schemas and registries do not drift

### Tool Schema Example

- Backend may resolve OCR or higher-level tool intent
- Frontend receives a simpler executable action

Example:

- backend resolves `click_ocr("file")`
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

### Completion Check

Before finishing, verify:

- the touched path is not more duplicated or more coupled without a clear reason
- tests cover the cleaned-up behavior and boundaries
- you removed at least as much complexity as you added

In the final summary, briefly note any meaningful refactor performed and any important debt intentionally left behind.

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
- New tests should go into `tests/new_*` unless extending an existing test module
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
- After committing, update `CHANGELOG.md`

### Commit Helper

- Preferred helper: `committer`
- This repo includes `./scripts/committer`
- Use either the PATH version or the script directly
- On Windows PowerShell, do not invoke `./scripts/committer` directly
- On PowerShell, use Git Bash or fall back to plain `git add` and `git commit`

### Commit Message Format

Use Conventional Commits. Add a short body when it helps review.

Example:

```text
feat(frontend-dashboard): delete semantic memory entries

- remove unused dashboard action
- wire updated flow
- add regression tests
````

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
