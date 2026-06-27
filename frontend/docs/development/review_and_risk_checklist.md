---
summary: "Review and risk checklist for WindieOS changes, mapping common code/doc changes to ownership, tests, docs, security, rollback, and residual-risk reporting."
read_when:
  - When reviewing a WindieOS change before committing or opening a PR.
  - When deciding whether validation, docs, security, or operations coverage is sufficient for a change.
title: "Review and Risk Checklist"
---

# Review and Risk Checklist

Use this before committing non-trivial changes. The checklist is meant to catch boundary drift, missing docs, and under-tested cross-runtime behavior.

## Ownership

- Is the edited layer the producer of the behavior?
- Did the change cross backend, Electron main, renderer, preload, local runtime, or hosted API boundaries?
- Did any Electron client or local-runtime Python code start depending on backend Python imports?
- Did a future/planned concept leak into stable docs as current behavior?

## Contracts

Check whether the change touched:

- HTTP route or payload
- websocket event name or payload
- Electron IPC channel
- preload allowlist
- local-runtime JSON-RPC method or payload
- model-facing tool schema
- local-runtime executable tool schema/result
- environment variable or config field
- transcript/session identifier
- artifact reference shape

If yes, update reference docs and focused contract tests.

## Security And Authority

Escalate review if the change touches:

- install auth or bearer-token handling
- credentials, API keys, OAuth, or provider secrets
- local filesystem/shell/computer/browser authority
- permissions or onboarding grants
- IPC/preload exposure
- hosted tenant/user identity
- plugin/extension loading or future marketplace behavior

Read Security Change Playbook (private backend docs).

## Validation

For each changed boundary:

- run the narrowest focused test first
- widen when behavior is shared or cross-runtime
- run `<windie> docs list` when docs changed
- run `git diff --check`
- record skipped commands and why

## Final Review Questions

1. Does the implementation remove or add complexity in the touched area?
2. Are docs and tests updated at the same boundary?
3. Are current and planned behaviors clearly separated?
4. Is there any user-facing behavior change?
5. Is there residual risk that should be reported?

## Related Docs

- [Validation Matrix](validation_matrix.md)
- [Planning Hub](../planning/README.md)
- Security Change Playbook (private backend docs)
- [Architecture Failure Domain Map](../architecture/failure_domain_map.md)
