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

## Testing Guidelines

- Use `pytest` for backend/sidecar tests and `jest` for frontend tests.
- New tests go into the `tests/new_*` suites unless you are extending an existing test module.
- Prefer unit-level tests with minimal I/O; mock network and system calls.
- If you change tool parsing/execution or IPC, add tests across backend + sidecar + frontend as needed.

## Commit & Pull Request Guidelines

- Keep commits scoped and action-oriented (e.g., "Backend: validate tool schema cache").
- Group related changes; avoid bundling unrelated refactors.
- Prefer `committer` (if on PATH) or `./scripts/committer` (if present) to keep staging scoped; fall back to `git add`/`git commit` when unavailable.
- After you change anything in the codebase, update CHANGELOG.md and always create commits, add a detailed description to each commit, no need for my consent.
- Only commit your own, scoped changes, ignore other uncommitted changes.

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
