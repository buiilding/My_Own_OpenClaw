---
summary: "Local development setup for WindieOS backend, frontend, Electron app, sidecar, tests, and environment launcher."
read_when:
  - When setting up WindieOS for source development.
  - When changing developer commands or environment assumptions.
title: "Local Development"
---

# Local Development

Use the repository scripts instead of manually activating conda environments. `./scripts/python-in-env` selects the expected environment when it exists and falls back to the current shell environment otherwise.

## Prerequisites

- Python 3.11
- Node 18+
- Backend conda env name: `jarvis`
- Frontend/sidecar conda env name: `frontend_jarvis`

## Install

```bash
pip install -r backend/requirements.txt
cd frontend
npm install
```

## Run

```bash
./scripts/python-in-env backend python -m backend.src.main
cd frontend && npm run dev
cd frontend && npm run electron:dev
```

Convenience scripts also exist:

- `scripts/run-backend`
- `scripts/run-frontend-dev`
- `scripts/run-frontend-electron`

## Test

```bash
./scripts/test-backend
./scripts/test-sidecar
cd frontend && npm run test
cd frontend && npm run test:ci
cd frontend && npm run lint
```

## Docs

Run `./bin/docs-list` from the repo root before implementation work. If `bin/docs-list` is missing, use `node scripts/docs-list.js`.
