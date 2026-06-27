---
summary: "Architecture failure-domain map for WindieOS backend, gateway, Electron main, renderer, preload, local runtime, platform, packaging, provider, memory, and VM-run failures."
read_when:
  - When a failure crosses runtime boundaries and needs architectural routing before detailed debugging.
  - When deciding whether a symptom is a producer, transport, consumer, platform, provider, packaging, or operations failure.
title: "Failure Domain Map"
---

# Failure Domain Map

Use this map when a failure is broader than one feature. It complements [Triage Routes](../help/triage_routes.md) with architecture-level failure domains. For implementation changes to error payloads, retries, recovery, or sanitized logs, use [Error and Failure Change Workflow](../debug/error_failure_change_workflow.md).

## Domains

| Failure domain | Typical signal | First owner |
| --- | --- | --- |
| gateway ingress | HTTP `401`/`404`/`502`, websocket `1008`, CORS block | backend API/gateway and Cloudflare/origin |
| agent loop | empty final response, repeated tool parse failures, missing completion | backend agent runtime |
| provider/capability | missing model/tool/search, provider unavailable, circuit breaker | backend provider/config/capability policy |
| stream transport | events emitted but UI stale, stale turn, missing settings ACK | backend websocket, SDK runtime adapter, renderer event consumer |
| IPC/preload | invalid channel, missing `window.ipc`, renderer cannot invoke main | preload/channel allowlist and Electron main IPC |
| local-runtime process | readiness timeout, stdout contamination, import failure | SDK local runtime, Electron launch-option helper, and local-runtime Python entrypoint |
| local tool execution | tool called but OS action fails | SDK runtime tool router, Electron bridge, local-runtime tool registry/executor |
| platform/permission | one OS fails, permission stuck, screenshots include UI | Electron permission/platform policy, local-runtime platform adapter |
| packaging/runtime | source works but installed app fails | Electron Builder config, bundled Python runtime, reinstall helpers |
| memory/transcript | replay drift, stale memory, wrong conversation | renderer transcript, local-runtime memory, backend history |
| VM run control | run never picked up or timeline missing events | backend runs API/service and Electron VM worker runtime |

## Debug Order

1. Identify entry channel: desktop chat, websocket, local-runtime tool, SDK, voice, VM run, or hosted API.
2. Identify producer: the runtime that should create the payload/state.
3. Identify transport: websocket, IPC, JSON-RPC, HTTP, filesystem, or platform API.
4. Identify consumer: the runtime that should validate/render/execute the payload.
5. Only then edit code.

## Common Misroutes

| Symptom | Misroute | Better route |
| --- | --- | --- |
| UI shows no output | edit renderer first | check backend event emission and main relay first |
| tool action fails | change backend tool description | check renderer/main/local execution path |
| macOS permission stuck | change onboarding UI | check OS probe/request and TCC registration |
| hosted route 502 | change route handler | check Cloudflare/origin process first |
| packaged app local runtime fails | change source launcher | check bundled runtime path and package contents |

## Related Docs

- [Triage Routes](../help/triage_routes.md)
- [Error and Failure Change Workflow](../debug/error_failure_change_workflow.md)
- [Process Health Checklist](../debug/process_health_checklist.md)
- [Runtime Node Matrix](../nodes/runtime_node_matrix.md)
- Operational Troubleshooting (private backend docs)

## Evidence Notes

- Classify the first failing boundary before changing recovery behavior.
- Prefer direct logs, traces, route responses, or process health output from
  the suspected owner over symptoms reported by a downstream UI.
