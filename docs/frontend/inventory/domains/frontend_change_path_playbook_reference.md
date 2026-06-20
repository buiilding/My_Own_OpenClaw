---
summary: "Frontend change-path playbook mapping common renderer/main/local-runtime scenarios to exact modules and validation checks."
read_when:
  - When implementing frontend features and needing a concrete cross-process change path.
  - When fixing frontend regressions while keeping ownership boundaries clean.
title: "Frontend Change Path Playbook Reference"
---

# Frontend Change Path Playbook Reference

Use this playbook for common frontend change scenarios.

## Playbooks

### 1) Add a new renderer -> SDK/runtime command

1. Add a runtime facade method under `renderer/app/runtime`.
2. Add IPC channel constant if needed in `renderer/infrastructure/ipc/channels.ts`.
3. Handle channel in `main/ipc.cjs`.
4. Route through the SDK runtime command or host adapter that owns the behavior.
5. Only add or align backend websocket schema/handler code when the command is
   explicitly a hosted-backend capability.

Validation:

- Renderer IPC invoke/send tests.
- Main IPC handler tests.
- SDK runtime or end-to-end query/control flow tests.

### 2) Add new SDK conversation-event consumption in UI

1. Add or confirm backend stream normalization in the SDK backend-event normalizer.
2. Route the SDK `ConversationEvent` in `renderer/features/chat/hooks/useChatStream.ts` (or relevant feature hook).
3. Keep pre-dispatch conversation identity, turn-map, and transcript sync in `renderer/app/runtime/desktopChatStreamIngressRuntime.ts`.
4. Update store mutation path in `chatStore.ts` if state model changes.
5. Add/adjust presentation component.

Validation:

- Stream hook unit tests.
- SDK normalizer and renderer runtime boundary tests.
- UI snapshot/interaction tests.

### 3) Change tool execution payload/behavior

1. Update SDK tool coordination in `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`.
2. Update the SDK conversation/local-runtime client in `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts` or `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`.
3. Sync local-runtime tool schema/registry.
4. Sync backend `tool-result` contract if needed.
5. Update renderer display handlers only when the visible tool card changes.

Validation:

- SDK tool coordinator tests (single + bundle).
- Main local-runtime bridge tests.
- Local-runtime Python tool schema/registry tests.

### 4) Modify local-runtime JSON-RPC method payload

1. Update the Python JSON-RPC method signature in `main/python/local_backend.py`.
2. Update method registration and validation path if needed.
3. Update the SDK local-runtime caller or scoped host bridge that builds the
   local-runtime JSON-RPC params.
4. Update renderer invoker/client payload shape when the command contract
   changes.

Validation:

- SDK local-runtime caller or scoped bridge tests.
- Python JSON-RPC method tests.
- Renderer invoke path tests.

### 5) Modify wakeword or voice runtime

1. Renderer voice hooks (`useWakewordDetection.ts`, `useVoiceMode.ts`).
2. Main wakeword bridge framing/relay (`main/wakeword_bridge.cjs`).
3. Local-runtime wakeword service protocol backed by `main/python/wakeword_service.py`.
4. Update voice status UI/contract docs.

Validation:

- Wakeword bridge tests.
- Voice hook tests.
- Audio framing/protocol tests.

### 6) Modify dashboard memory behavior

1. Update dashboard section component(s).
2. Update memory utility parsing/formatting helpers.
3. Update transcript/memory invoke paths in API client + main bridge as needed.
4. If local-runtime memory storage logic changes, update memory store/summarizer modules.

Validation:

- Dashboard section tests.
- Memory utility tests.
- Local-runtime memory operation tests.

## Scope Guards

- Do not patch renderer to hide malformed local-runtime payloads; fix SDK/main contract owners.
- Do not patch main IPC for UI-only state bugs; fix renderer providers/hooks.
- Do not patch local-runtime tool logic for missing renderer correlation IDs.
- Do not patch preload to add broad channel exposure for convenience.

## Related Docs

- [Frontend Inventory Domains Hub](README.md)
- [Frontend Domain Ownership Matrix Reference](frontend_domain_ownership_matrix_reference.md)
- [Frontend IPC and Local-Runtime Contract Touchpoints Reference](../frontend_ipc_and_sidecar_contract_touchpoints_reference.md)
