---
summary: "Public validation command guide for frontend docs, local-runtime Python, frontend tests, lint/typecheck, packaging, and focused contributor checks."
read_when:
  - When deciding which public validation command to run for docs, frontend,
    Electron main, local-runtime, packaging, or public tooling changes.
  - When reporting validation in a final summary or PR description.
title: "Validation Commands"
---

# Validation Commands

Pick validation based on the owner boundary you changed. Private backend tests
and backend validation commands live in private backend docs.

Commands below use `<windie>` for the active platform shim.

## Baseline

| Scope | Command |
| --- | --- |
| docs front matter and read hints | `<windie> docs list` |
| docs plus whitespace check | `<windie> docs check` |
| whitespace in changed files | `git diff --check` |
| local-runtime Python tests | `<windie> test local-runtime` |
| frontend tests | `<windie> test frontend` |
| frontend lint | `cd frontend && npm run lint` |
| frontend typecheck | `cd frontend && npm run typecheck` |

## Focused Commands

| Change | Start with |
| --- | --- |
| local-runtime JSON-RPC/tool | `<windie> test local-runtime -- <focused_test>` |
| frontend renderer/hook/store | `<windie> test frontend -- <test_file>` |
| Electron main/IPC | focused frontend test under `tests/frontend`, then `<windie> test frontend` if shared |
| public tool manifest or schema parity | executable manifest generation plus local-runtime tests |
| docs-only | `<windie> docs check`, focused markdown link check, `git diff --check` |
| packaging | target OS package command plus smoke helper where available |

## Environment Notes

Use the repo's launcher scripts when a local-runtime Python environment matters.
Default public frontend/local-runtime environment name is `frontend_jarvis` or
`WINDIE_FRONTEND_ENV`.

If conda or the named env is unavailable, the launcher prints a warning and runs
in the current shell environment.

## Reporting

When handing work back, report:

- commands run,
- pass/fail result,
- skipped validation and why,
- residual risk if only docs checks were appropriate.

## Related Docs

- [Development Validation Matrix](../development/validation_matrix.md)
- [Debug Test Selection](../debug/test_selection.md)
- [Command Matrix](command_matrix.md)
