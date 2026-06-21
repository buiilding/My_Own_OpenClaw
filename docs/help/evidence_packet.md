---
summary: "Evidence packet template for WindieOS debugging reports, including runtime boundary, reproduction, logs, endpoint, permission, provider, tool, and validation evidence."
read_when:
  - When preparing a bug report, handoff, PR note, or agent investigation summary for a WindieOS failure.
  - When a failure is intermittent, platform-specific, hosted-only, packaged-only, or crosses backend, Electron main, renderer, local-runtime Python, or SDK boundaries.
title: "Evidence Packet"
---

# Evidence Packet

Use this template when a failure is not solved by one local observation. Keep the packet factual: what was run, what happened, which boundary produced the first bad signal, and which checks passed.

## Minimal Packet

```text
Symptom:
Expected:
Actual:
Mode: source | packaged | hosted | VM worker
OS:
Backend endpoint:
Model/provider:
Permissions involved:
Tools involved:
First failing boundary:
Reproduction steps:
Logs/traces collected:
Validation run:
Docs read:
```

## Runtime Evidence

| Boundary | Include |
| --- | --- |
| backend | command used, endpoint, route/status, websocket close code, provider/model, relevant log lines |
| Electron main | endpoint snapshot, websocket state, settings ACK state, local-runtime bridge readiness, IPC route |
| renderer | visible UI state, current turn/session id if relevant, event consumer or hook involved |
| preload | channel name and whether it is allowed in preload/channel constants |
| sidecar | JSON-RPC method, tool name, stderr log, registry entry, result/error payload |
| platform | OS, permission probe result, package type, window/input dependency such as `xdotool` |
| hosted/tunnel | local origin status, hosted route status, Cloudflare/backend service status |

## Trace Flags

Pick only flags that match the boundary:

- stream/event issues: `WINDIE_DEBUG_STREAM_EVENTS=1`
- chat pill/overlay issues: `WINDIE_DEBUG_CHAT_PILL=1`
- screenshot/tool capture issues: `WINDIE_DEBUG_TOOL_SCREENSHOT=1`
- sidecar issues: `WINDIE_SIDECAR_LOG_LEVEL=DEBUG`
- packaged app issues: `WINDIE_LOG_FILE=<path>`

## Reproduction Quality

Good reproduction:

- starts from a clean source or packaged state
- names exact commands and env vars
- records whether the issue reproduces in source, packaged, or both
- identifies the first failing boundary
- includes focused validation commands

Weak reproduction:

- only says "the UI is broken"
- omits source vs packaged mode
- omits endpoint host
- omits OS/platform
- combines multiple bugs in one report

## Handoff Note Shape

Use this when handing an issue to another agent:

```text
I reproduced the issue in <mode> on <OS>.
The first bad signal is <boundary/signal>.
<checks> passed.
<checks> failed with <short error>.
The likely owner is <subsystem/files>.
Next step should be <specific read/test/edit>.
```

## Related Docs

- [Doctor Checklist](doctor_checklist.md)
- [Triage Routes](triage_routes.md)
- [Runtime Traces](../debug/runtime_traces.md)
- [Test Selection](../debug/test_selection.md)
