---
summary: "Incident triage runbook for WindieOS hosted, packaged, provider, local-runtime, permission, and VM-worker failures."
read_when:
  - When a user-visible failure needs operational triage before code edits.
  - When choosing owner, severity, rollback/mitigation path, validation, and communication notes for a WindieOS incident.
title: "Incident Triage Runbook"
---

# Incident Triage Runbook

Use this when the issue affects a real user path, hosted endpoint, packaged install, provider integration, or VM worker flow. This is not a release checklist; it is the triage path for deciding what is broken and what to do first.

## Severity Split

| Severity | Meaning | First action |
| --- | --- | --- |
| S0 | Hosted backend unavailable for all clients, packaged app cannot connect at all, or data/security risk is active | Stop risky rollout, collect hosted/tunnel/backend evidence, identify mitigation. |
| S1 | Core query loop or local tool execution broken for a broad class of users | Route to the backend, SDK/main, renderer, or local-runtime owner; run focused regression tests; prepare patch. |
| S2 | Provider/model, permission, package, or OS-specific path broken with workaround | Document workaround, patch owner surface, add focused regression. |
| S3 | Docs, diagnostics, non-core UI, or narrow edge case | Fix in normal development flow with docs/tests. |

## Owner Routing

| First bad signal | Owner | Mitigation direction |
| --- | --- | --- |
| Hosted `502` | Cloudflare/origin backend operations | Restart/repair backend or tunnel service; do not patch client first. |
| REST `401` after install registration | Install auth/token propagation | Verify token cache and backend auth DB; avoid disabling auth as a first fix. |
| Websocket `1008` at connect | Backend handshake/auth/schema or Electron headers | Fix handshake/token/schema; collect backend close reason. |
| Query stream starts then errors provider-side | Provider runtime/config | Fail over model/provider if available; patch provider request/stream handling. |
| Tool event appears but no local action | SDK/main local-runtime dispatch, Electron bridge, or local-runtime Python implementation | Validate tool result path and local-runtime JSON-RPC before changing backend schema. |
| Packaged app only | Packaging/runtime/env | Use local reinstall and packaged smoke run; source app evidence is not enough. |
| One OS only | Platform adapter or permission | Use platform-specific docs and tests; do not generalize behavior across OSes. |
| VM run stuck | Runs API/worker control plane | Inspect run timeline, worker heartbeat, runs key, and active run cap. |

## Triage Steps

1. Capture the [Evidence Collection Runbook](evidence_collection_runbook.md) minimum packet.
2. Identify first failing boundary before editing code.
3. Check whether there is a safe mitigation: endpoint override, model fallback, reinstall helper, service restart, or disabling a broken optional capability.
4. Choose focused validation from [Validation Commands](../cli/validation_commands.md) and [Test Selection](../debug/test_selection.md).
5. Patch the enforcing owner, not the first visible symptom.
6. Update docs and changelog in the same change.
7. Commit with the affected runtime in the Conventional Commit scope.

## Mitigation Guardrails

| Mitigation | Guardrail |
| --- | --- |
| Restart backend/tunnel | Only after collecting service status and recent logs. |
| Disable a provider/capability | Document user-visible degradation and make prompt/tool visibility match. |
| Switch endpoint | Record source and destination endpoint; avoid silently moving users between hosted/local backends. |
| Reinstall packaged app | Preserve evidence from old install first when debugging startup/runtime failures. |
| Reset local state | Use only when the issue is state corruption or install identity mismatch; note data loss scope. |
| Add fallback behavior | Add tests so the fallback does not hide producer contract regressions. |

## Closure Checklist

- First failing boundary identified.
- User-visible impact and workaround documented.
- Patch owner matches enforcing boundary.
- Focused tests passed.
- Docs-list and diff whitespace passed for docs changes.
- Changelog entry added.
- Residual risk stated if broad validation was not run.

## Related Docs

- [Operations Hub](README.md)
- [Operational Troubleshooting](operational_troubleshooting.md)
- [Runtime Nodes Hub](../nodes/README.md)
- [Code Change Surface Index](../reference/code_change_surface_index.md)
- [Review and Risk Checklist](../development/review_and_risk_checklist.md)
