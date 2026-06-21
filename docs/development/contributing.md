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

## Commit Messages

Use Conventional Commits for the subject line (`feat|fix|refactor|build|ci|chore|docs|style|perf|test`), and include a short description body when it improves reviewability.

Example:

```
feat(frontend-dashboard): delete semantic memory entries

- Add right-click delete menu in Semantic Memory section.
- Wire IPC bridge to the local-runtime delete handler.
- Add regression tests.
```

## Where to Edit

- Backend: `backend/src/`
- Frontend: `frontend/src/`
- Local-runtime tool implementations: `frontend/src/main/python/`
- Docs: `docs/`

## Tests

- Broad test gate: `<windie> test all`
- Tests only: `<windie> test all`
- Docs sanity: `<windie> docs list`
- Frontend typecheck: `cd frontend && npm run typecheck`
- Frontend lint: `cd frontend && npm run lint`
- Frontend audits: `cd frontend && npm run lint:audit && npm run audit:jscpd && npm run audit:knip`
- Frontend checks auto-skip when `frontend/node_modules` is missing.

There is no current repo-root `scripts/check` in this checkout. Use
[Validation Matrix](validation_matrix.md) to compose the right docs/test/lint
gate for the changed boundary.
