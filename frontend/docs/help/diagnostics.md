---
summary: "Diagnostics guide for isolating WindieOS failures across backend, Electron main, renderer, local-runtime implementation, providers, and tools."
read_when:
  - When triaging failures before changing code.
  - When deciding which logs, commands, or docs to inspect first.
title: "Diagnostics"
---

# Diagnostics

WindieOS failures are easiest to debug by locating the runtime boundary first.

## Boundary Checklist

| Symptom | First place to inspect |
| --- | --- |
| No backend response | Electron main agent host, SDK backend transport traces, backend websocket logs, private backend implementation |
| Model list missing or stale | settings ACK path, private backend implementation |
| Tool call appears but does not execute | SDK runtime tool router, main local-runtime bridge, `frontend/src/main/python/tools/registry.py` |
| Tool result reaches SDK/main but model does not continue | SDK tool-result relay plus backend tool-result ingestion/waiting/processing modules |
| Screenshot includes overlay | platform screenshot guard and overlay visibility docs |
| Browser action fails | backend browser schema first, then local-runtime browser adapter/runtime |
| Memory/search/title issue | local-runtime memory store, backend semantic/title routes, embedding provider health |
| Packaged app starts but tools fail | bundled Python runtime path, local-runtime requirements, install auth, backend URL config |

## Useful Commands

```bash
<windie> docs list
git status --short --branch
private backend tests
<windie> test local-runtime
<windie> test frontend
cd frontend && npm run lint
```

For trace flags, logging controls, symptom playbooks, and focused test selection, read [Debug](../debug/README.md).

Use app diagnostics for persistent desktop/runtime evidence that is not tied to
one conversation turn:

```bash
<windie> diagnostics paths
<windie> diagnostics list --path desktop.startup --limit 50
<windie> diagnostics list --path ipc.bridge --limit 50
<windie> diagnostics list --path surface.visibility --limit 50
<windie> diagnostics list --path wakeword.lifecycle --limit 50
```

For a report that is not yet tied to a subsystem, start with [Triage Routes](triage_routes.md), then use Doctor Checklist (private backend docs) and [Evidence Packet](evidence_packet.md) to collect only the evidence the owner runtime needs.

## Diagnostic Rule

Do not patch the first failing UI symptom until you know whether the producer contract is valid. Many WindieOS bugs are contract drift across backend formatter/schema, Electron bridge mapping, renderer guards, and local-runtime executable tools.

For cross-runtime failures, capture at least one producer-side signal and one
consumer-side signal before deciding ownership. Examples include a backend
websocket event plus renderer handling, an SDK tool dispatch plus local result,
or an Electron main diagnostic row plus renderer surface state. If one side is
missing evidence, treat that absence as the next diagnostic target rather than
as proof that the other side is wrong.
