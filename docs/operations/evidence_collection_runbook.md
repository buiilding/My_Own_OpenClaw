---
summary: "Operations evidence collection runbook for WindieOS hosted backend, Cloudflare Tunnel, Electron main, renderer, local runtime, packaged app, VM worker, provider, and permission failures."
read_when:
  - When preparing an operations handoff, bug report, incident note, or debugging packet.
  - When a failure is hosted-only, packaged-only, platform-specific, intermittent, or crosses backend, Electron main, renderer, local-runtime, or SDK boundaries.
title: "Evidence Collection Runbook"
---

# Evidence Collection Runbook

Use this runbook before editing code for a production, packaged, hosted, or cross-runtime failure. The goal is to identify the first bad boundary and collect enough evidence for the next agent or developer to act without rediscovering the environment.

## Minimum Packet

```text
Symptom:
Expected:
Actual:
Mode: source | packaged | hosted backend | VM worker
OS:
Backend HTTP URL:
Backend WS URL:
Install auth enabled: yes | no | unknown
Model/provider:
Tools involved:
Permissions involved:
First failing boundary:
Commands run:
Logs/traces:
Validation:
Likely owner:
Next action:
```

## Boundary Evidence

| Boundary | Evidence to collect | Useful commands or files |
| --- | --- | --- |
| Hosted origin backend | Local route status, backend service status, recent backend logs | `curl -fsSL http://127.0.0.1:8765/api/embeddings/health`, `systemctl --user status windieos-backend.service --no-pager`, `journalctl --user -u windieos-backend.service -n 100 --no-pager` |
| Cloudflare Tunnel | Hosted route status, tunnel service status, tunnel logs | `curl -fsSL https://api.windieos.com/api/embeddings/health`, `systemctl --user status windieos-cloudflared.service --no-pager`, `journalctl --user -u windieos-cloudflared.service -n 100 --no-pager` |
| Backend route/auth | HTTP status, response body, headers present, install token source | `curl -i`, [REST Route Auth Matrix](../gateway/rest_route_auth_matrix.md) |
| Main websocket | close code, first handshake payload shape, bearer token presence, backend logs | [WebSocket Connection Lifecycle](../gateway/websocket_connection_lifecycle.md) |
| Electron main | endpoint candidates, token registration state, websocket state, local-runtime bridge readiness | Electron logs, `frontend/src/main/app/backend_endpoints.cjs`, `WINDIE_LOG_FILE=<path>` |
| Renderer | visible state, active conversation/session, SDK projection event type, tool display state | focused frontend test or browser/devtools observation |
| Local-runtime Python implementation | JSON-RPC method, stderr, tool result payload, remote client URL | `WINDIE_SIDECAR_LOG_LEVEL=DEBUG`, focused local-runtime Python pytest target |
| Packaged app | package type, runtime path, install location, local app state, packaged log | reinstall runbook, `~/windieos-packaged-run.log` on macOS helper path |
| VM worker | worker env, heartbeat route status, assignment payload, run timeline | `/api/runs/*`, `WINDIE_VM_*`, runs API key |
| Provider | provider id/model id, credential presence, health/circuit state, provider error | provider-specific backend tests and docs |
| Permissions/platform | OS, permission probe result, actual privileged operation result | permission matrix, platform notes, local-runtime Python platform tests |

## Trace Flags

| Issue | Flag |
| --- | --- |
| Backend stream or event order | `WINDIE_DEBUG_STREAM_EVENTS=1` |
| Chat pill or overlay phase | `WINDIE_DEBUG_CHAT_PILL=1` |
| Screenshot/tool capture | `WINDIE_DEBUG_TOOL_SCREENSHOT=1` |
| Local-runtime Python tool/runtime | `WINDIE_SIDECAR_LOG_LEVEL=DEBUG` |
| Packaged app log file | `WINDIE_LOG_FILE=<path>` |
| Verbose local-runtime stderr forwarding | `WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR=1` through WindieOS host skin; generic helper fallback is `AGENT_VERBOSE_LOCAL_RUNTIME_STDERR=1` |

Use the narrowest flag that matches the failing boundary. Do not enable broad logging in docs examples that might expose credentials.

## First-Bad-Signal Examples

| Observation | First bad boundary | Next doc |
| --- | --- | --- |
| Local health works, hosted health returns `502` | Cloudflare Tunnel or origin service reachability | [Cloudflared Self-Host Runbook](cloudflared_self_host_windieos.md) |
| Hosted health works, `/api/artifacts/*` returns `401` | Install auth propagation | [Hosted Backend Auth](hosted_backend_auth.md) |
| Websocket closes `1008` before query | Handshake/auth/schema | [WebSocket Connection Lifecycle](../gateway/websocket_connection_lifecycle.md) |
| Query streams but local tool fails | SDK/main local-runtime dispatch or local-runtime Python implementation | [Local-Runtime Tool Change Workflow](../frontend/local_runtime_tool_change_workflow.md) |
| Source app works but packaged app tool fails | Bundled runtime or packaged env | [Packaging and Reinstall Runbooks](packaging_and_reinstall_runbooks.md) |
| Only Linux screenshot path flickers | Platform screenshot/overlay policy | [Screenshot and Overlay Policy](../platforms/screenshot_overlay_policy.md) |
| Model missing from picker | Backend model catalog/list-models | [Model Catalog Change Workflow](../providers/model_catalog_change_workflow.md) |
| Memory search missing old chat | Local-runtime memory/search backed by local-runtime Python modules | [Memory Change Workflow](../memory/memory_change_workflow.md) |

## Report Shape

Use this shape in a PR, issue, or handoff:

```text
I reproduced <symptom> in <mode> on <OS>.
The first failing boundary is <boundary> because <evidence>.
These checks passed: <commands/results>.
These checks failed: <commands/results>.
Likely owner: <files/docs>.
Recommended next step: <specific edit/test/read>.
```

Keep logs short. Include the relevant error lines and surrounding state, not full service output.

## Related Docs

- [Operational Troubleshooting](operational_troubleshooting.md)
- [Evidence Packet](../help/evidence_packet.md)
- [Runtime Traces](../debug/runtime_traces.md)
- [Diagnostic Flags](../debug/diagnostic_flags.md)
- [Doctor Checklist](../help/doctor_checklist.md)
