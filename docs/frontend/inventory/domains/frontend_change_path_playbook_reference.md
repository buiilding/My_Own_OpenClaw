---
summary: "Frontend change-path playbook mapping common renderer/main/sidecar scenarios to exact modules and validation checks."
read_when:
  - When implementing frontend features and needing a concrete cross-process change path.
  - When fixing frontend regressions while keeping ownership boundaries clean.
title: "Frontend Change Path Playbook Reference"
---

# Frontend Change Path Playbook Reference

Use this playbook for common frontend change scenarios.

## Playbooks

### 1) Add a new renderer -> backend command

1. Add client method in `renderer/infrastructure/api/client.ts`.
2. Add IPC channel constant if needed in `renderer/infrastructure/ipc/channels.ts`.
3. Handle channel in `main/ipc.cjs`.
4. Relay to backend websocket with stable message type/payload.
5. Add or align backend incoming schema and handler.

Validation:

- Renderer IPC invoke/send tests.
- Main IPC handler tests.
- End-to-end query/control flow tests.

### 2) Add new backend stream event consumption in UI

1. Extend type guards in `renderer/types/backendEvents.ts`.
2. Route event in `renderer/features/chat/hooks/useChatStream.ts` (or relevant feature hook).
3. Update store mutation path in `chatStore.ts` if state model changes.
4. Add/adjust presentation component.

Validation:

- Stream hook unit tests.
- Type guard tests.
- UI snapshot/interaction tests.

### 3) Change tool execution payload/behavior

1. Update runner behavior in `renderer/features/chat/hooks/useToolRunner.ts`.
2. Update payload shaping in `renderer/infrastructure/services/ToolExecutionPayloads.ts`.
3. Update execution orchestration in `ToolExecutionService.ts`.
4. Sync main bridge mapper and sidecar tool schema/registry.
5. Sync backend `tool-result` contract if needed.

Validation:

- Tool runner tests (single + bundle).
- Main local backend bridge tests.
- Sidecar tool schema/registry tests.

### 4) Modify sidecar JSON-RPC method payload

1. Update sidecar method signature in `main/python/local_backend.py`.
2. Update method registration and validation path if needed.
3. Update main bridge request mapper (`local_backend_bridge_rpc_mappers.cjs`).
4. Update renderer invoker/client payload shape.

Validation:

- JSON-RPC mapper tests.
- Sidecar method tests.
- Renderer invoke path tests.

### 5) Modify wakeword or voice runtime

1. Renderer voice hooks (`useWakewordDetection.ts`, `useVoiceMode.ts`).
2. Main wakeword bridge framing/relay (`main/wakeword_bridge.cjs`).
3. Sidecar wakeword service protocol (`main/python/wakeword_service.py`).
4. Update voice status UI/contract docs.

Validation:

- Wakeword bridge tests.
- Voice hook tests.
- Audio framing/protocol tests.

### 6) Modify dashboard memory behavior

1. Update dashboard section component(s).
2. Update memory utility parsing/formatting helpers.
3. Update transcript/memory invoke paths in API client + main bridge as needed.
4. If sidecar storage logic changes, update memory store/summarizer modules.

Validation:

- Dashboard section tests.
- Memory utility tests.
- Sidecar memory operation tests.

## Scope Guards

- Do not patch renderer to hide malformed sidecar payloads; fix sidecar/main contract owners.
- Do not patch main IPC for UI-only state bugs; fix renderer providers/hooks.
- Do not patch sidecar tool logic for missing renderer correlation IDs.
- Do not patch preload to add broad channel exposure for convenience.

## Related Docs

- [Frontend Inventory Domains Hub](README.md)
- [Frontend Domain Ownership Matrix Reference](frontend_domain_ownership_matrix_reference.md)
- [Frontend IPC and Sidecar Contract Touchpoints Reference](../frontend_ipc_and_sidecar_contract_touchpoints_reference.md)
