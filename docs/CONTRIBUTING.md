---
summary: "Contributing"
read_when:
  - When preparing PRs or working on dev workflow.
---

# Contributing

## Workflow

1. Create a branch for your change.
2. Make updates and keep docs in sync.
3. Run tests when relevant.
4. Submit a PR with a clear summary.

## Where to Edit

- Backend: `backend/src/`
- Frontend: `frontend/src/`
- Sidecar tools: `frontend/src/main/python/`
- Docs: `docs/`

## Tests

- Full gate: `scripts/check`
- Tests only: `scripts/test`
- Docs sanity: `bin/docs-list`
- Frontend checks auto-skip when `frontend/node_modules` is missing.
