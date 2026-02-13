# Repository Guidelines

- Repo: /media/peter-bui/E/Assistants/WindieOS
- Issues/PR comments: use literal multiline strings or heredocs for real newlines; avoid "\\n" in posted text.

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
- Start: run docs list (`docs:list` script, or `bin/docs-list` here if present; ignore if not installed); open docs before coding.
- Follow links until domain makes sense; honor `Read when` hints.
- Keep notes short; update docs when behavior/API changes (no ship w/o docs).
- Add `read_when` hints on cross-cutting docs.

## Testing Guidelines

- Use `pytest` for backend/sidecar tests and `jest` for frontend tests.
- New tests go into the `tests/new_*` suites unless you are extending an existing test module.
- Prefer unit-level tests with minimal I/O; mock network and system calls.
- If you change tool parsing/execution or IPC, add tests across backend + sidecar + frontend as needed.

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

## Git
- Safe by default: `git status/diff/log`. Push only when user asks.
- Commits are pre-authorized: make commits automatically for completed work without waiting for additional user confirmation.
- Prefer small, frequent commits during code changes so each commit is easy to review and revert.
- `git checkout` ok for PR review / explicit request.
- Branch changes require user consent.
- Destructive ops forbidden unless explicit (`reset --hard`, `clean`, `restore`, `rm`, …).
- Prefer HTTPS remotes; flip SSH->HTTPS before pull/push.
- Commit helper on PATH: `committer` (bash). Prefer it; if repo has `./scripts/committer`, use that.
- Commit message: Conventional Commit subject + short description body (when it helps review). Example:
  - `feat(frontend-dashboard): delete semantic memory entries`
  - blank line
  - bullets: what changed, where wired, tests added
- After committing work, update `CHANGELOG.md` with the changes.
- Don’t delete/rename unexpected stuff; stop + ask.
- No repo-wide S/R scripts; keep edits small/reviewable.
- Avoid manual `git stash`; if Git auto-stashes during pull/rebase, that’s fine (hint, not hard guardrail).
- If user types a command (“pull and push”), that’s consent for that command.
- No amend unless asked.
- Big review: `git --no-pager diff --color=never`.
- Multi-agent: check `git status/diff` before edits; ship small commits.

### bin/docs-list / scripts/docs-list.ts
- Optional. Lists `docs/` + enforces front-matter. Ignore if `bin/docs-list` not installed. Rebuild: `bun build scripts/docs-list.ts --compile --outfile bin/docs-list`.

### tmux
- Use only when you need persistence/interaction (debugger/server).
- Quick refs: `tmux new -d -s codex-shell`, `tmux attach -t codex-shell`, `tmux list-sessions`, `tmux kill-session -t codex-shell`.

<frontend_aesthetics>
Avoid “AI slop” UI. Be opinionated + distinctive.

### committer
- Commit helper (PATH). Stages only listed paths; required here. Repo may also ship `./scripts/committer`.

Do:
- Typography: pick a real font; avoid Inter/Roboto/Arial/system defaults.
- Theme: commit to a palette; use CSS vars; bold accents > timid gradients.
- Motion: 1–2 high-impact moments (staggered reveal beats random micro-anim).
- Background: add depth (gradients/patterns), not flat default.

Avoid: purple-on-white clichés, generic component grids, predictable layouts.
</frontend_aesthetics>
