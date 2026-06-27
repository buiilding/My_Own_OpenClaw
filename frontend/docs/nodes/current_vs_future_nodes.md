---
summary: "Current versus future WindieOS node boundaries, separating implemented desktop/backend/local-runtime implementation/VM worker nodes from planned mobile, edge, and multi-agent VM node work."
read_when:
  - When documenting node-like features without implying that planned mobile, edge, scheduler, or multi-agent VM infrastructure already exists.
  - When planning future node orchestration, remote control, mobile companion, edge workers, or agent-to-agent runtime features.
title: "Current vs Future Nodes"
---

# Current vs Future Nodes

WindieOS should use OpenClaw-style node docs for discoverability, but the current product does not have all OpenClaw node categories. Keep current runtime docs factual and put future-state architecture under planning docs until code exists.

## Implemented Today

| Node category | Current status | Notes |
| --- | --- | --- |
| Hosted backend node | implemented | FastAPI app exposes `/ws`, `/ws/transcription`, and `/api/*` routes; owns agent loop, providers, route auth, artifacts, OCR/vision, memory APIs, and runs control plane. |
| Desktop app node | implemented | Electron main + React renderer + preload bridge own local UX, windows, IPC, endpoint selection, and SDK-runtime adaptation. |
| Local-runtime Python implementation node | implemented | SDK/main local runtime owns local executable authority and starts/reuses a local Python subprocess that implements executable tools, local memory, system state, shell/filesystem/computer/browser actions, and JSON-RPC protocol. |
| Wakeword service node | implemented | Separate local subprocess for wakeword audio/model framing. |
| VM worker node | implemented as control-plane worker | Electron main worker polls `/api/runs/*`, dispatches assigned work through `/ws`, and relays stream events. |
| Cloudflare/origin service node | implemented as deployment plumbing | Scripts support self-hosting backend origin behind Cloudflare Tunnel. |

## Planned or Future

| Future node category | Current status | Planning docs |
| --- | --- | --- |
| One-agent-per-VM runtime node | planned | [VM Multi-Agent Plan](../planning/windieos_vm_multi_agent_plan.md) |
| Remote VM control/viewer node | planned | [VM Multi-Agent Plan](../planning/windieos_vm_multi_agent_plan.md) |
| Multi-agent coordination node | planned | [Agent-to-Agent Communication Plan](../planning/windieos_agent_to_agent_communication_plan.md) |
| Mobile companion node | planned | [Mobile App Plan](../planning/windieos_mobile_app_plan.md) |
| Durable scheduler/cron/webhook node | planned | [Automation Boundaries](../automation/automation_boundaries.md) |
| Edge worker or regional gateway node | not implemented | Keep in planning until there is a concrete service, route, deployment target, and tests. |
| Plugin marketplace node | not implemented | [Current vs Future Plugin Boundary](../plugins/current_vs_future_plugin_boundary.md) |

## Documentation Rules

- If there is no code root, do not document a future node as an active runtime.
- If a future node needs API examples, label them as proposed and keep them under `docs/planning/` unless the route exists.
- If a node is implemented only as a mode of Electron main, document it as such. The current VM worker is `frontend/src/main/app/vm_worker_runtime.cjs`, not a standalone worker service.
- If a feature needs persistence, scheduling, billing, or tenant isolation, do not hide it inside the desktop worker. Plan a backend control-plane node first.
- Update this page when a planned node gets an implemented process, route, deployment target, or test suite.

## Promotion Checklist

Before moving a future node from planning into active docs, verify:

- code root exists
- lifecycle/start command exists
- protocol boundary is defined
- auth/identity model is defined
- failure signals are known
- tests cover the primary lifecycle
- operations docs explain how to run or debug it
- top-level hubs link to the active docs

## Related Docs

- [Runtime Nodes Hub](README.md)
- [Runtime Node Matrix](runtime_node_matrix.md)
- [Automation Hub](../automation/README.md)
- [Plugins and Extensions Hub](../plugins/README.md)
- [Planning Hub](../planning/README.md)
