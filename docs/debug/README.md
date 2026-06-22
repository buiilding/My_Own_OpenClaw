---
summary: "Debug hub for WindieOS runtime failures, logs, trace flags, symptom playbooks, and test selection."
read_when:
  - When triaging a bug before changing code.
  - When deciding which runtime logs, trace flags, or tests apply to a failure.
title: "Debug"
---

# Debug

Use this hub when a WindieOS behavior fails and the next code edit is not obvious. The goal is to identify the owner runtime first, then inspect the narrowest log stream and test slice.

## Runtime Boundaries

| Boundary | Owns | First files |
| --- | --- | --- |
| Hosted backend | Agent loop, providers, tool schemas, websocket events, SDK routes, OCR/vision/TTS/STT | `backend/src/api`, `backend/src/agent`, `backend/src/llm`, `backend/src/tools`, `backend/src/services` |
| Electron main | Windows, overlay orchestration, IPC relay, local config, permission probes, SDK local-runtime host/status context | `frontend/src/main` |
| React renderer | Dashboard, chat UI, response overlay UI, permissions UI, voice controls, projected tool state | `frontend/src/renderer` |
| local-runtime implementation | Local executable tools, memory store, browser runtime, screenshots, shell/process execution backed by local-runtime Python | `frontend/src/main/python` |
| Tests | Contract drift and runtime regressions | `tests/backend`, `tests/frontend`, `tests/sidecar` |

## Debug Pages

- [Logging](logging.md) maps backend, Electron, renderer, local-runtime Python, and packaged app log controls.
- [Observability Change Workflow](observability_change_workflow.md) routes new logs, traces, metrics, diagnostic flags, and evidence signals to the right runtime.
- [Error and Failure Change Workflow](error_failure_change_workflow.md) routes exception mapping, websocket/HTTP errors, IPC failures, local-runtime ToolResult failures, renderer error UI, retries, and sanitized logs.
- [Diagnostic Flags](diagnostic_flags.md) maps backend, Electron, renderer, local-runtime Python, VM worker, and packaged-app debug flags.
- [Runtime Traces](runtime_traces.md) covers stream, chat pill, screenshot, overlay, and local-runtime trace paths.
- [Invariants](invariants.md) is the central ledger for durable product,
  runtime, tool, and extension invariants, with routes to owner docs and
  regression packs.
- [User-Facing Regression Pack](user_facing_regression_pack.md) is the product-level umbrella for discovered user-visible behavior invariants.
- [Core Loop Regression Pack](core_loop_regression_pack.md) is the focused suite for chat pill, dashboard, overlay, SDK projection, conversation runtime, IPC, replay, stop, tool-row, and surface-lease invariants.
- [Endpoint and Network Debugging](endpoint_and_network_debugging.md) routes hosted/local endpoint, websocket, install auth, Cloudflare, and local-runtime backend URL failures.
- [Process Health Checklist](process_health_checklist.md) maps backend, Electron, renderer, local-runtime Python process, wakeword, VM worker, and Cloudflare process health checks.
- [Symptom Playbooks](symptom_playbooks.md) maps common failures to code roots and validation.
- [Test Selection](test_selection.md) maps changed subsystems to focused tests and full-suite commands.

## Debug Order

1. Start at [Diagnostics](../help/diagnostics.md) to classify the boundary.
2. Use [Runtime Traces](runtime_traces.md) if the failure crosses process boundaries or depends on event ordering.
3. Use [Logging](logging.md) if the producer is unclear or a runtime exits silently.
4. Use [Symptom Playbooks](symptom_playbooks.md) to choose the code roots.
5. Use [Error and Failure Change Workflow](error_failure_change_workflow.md) before changing error payloads, retries, or recovery semantics.
6. Use [Test Selection](test_selection.md) before and after edits.

## Rules For Agents

- Do not patch the visible UI symptom until the producing event or state contract is verified.
- For backend, SDK/main, renderer, and local-runtime drift, prefer adding or extending parity tests over importing implementation code across boundaries.
- For overlay timing bugs, write down the phase sequence first. Mixing focus, capture, content protection, and visibility changes in one patch makes regressions hard to isolate.
- For local tool bugs, verify the producer and execution boundary: backend schema/event, Agent SDK tool router, Electron local-runtime bridge, and local-runtime executable result.
- For hosted backend bugs, do not assume local Electron state is wrong until the websocket or HTTP payload is inspected.

## Evidence Notes

- A debug note should name the command, log, trace, database row, screenshot, or
  runtime payload that would reproduce the symptom later.
- If no existing diagnostic exposes the bug, add the missing owned diagnostic
  instead of relying on one-off shell output.
