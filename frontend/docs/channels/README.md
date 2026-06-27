---
summary: "Channel hub for WindieOS desktop, websocket, voice, local-runtime, SDK, and VM-run communication paths."
read_when:
  - When deciding which WindieOS transport or entry channel owns a behavior.
  - When changing desktop chat, overlay chat, voice/STT/TTS, SDK clients,
    local-runtime tools, or VM run control flows.
title: "Channels Hub"
---

# Channels Hub

WindieOS has several user and developer entry channels that eventually meet the
backend agent loop or SDK local-runtime tools. Use this hub before changing
routing behavior so the implementation lands in the owner channel instead of
patching the wrong consumer.

## Channel Map

| Channel | User/developer entry | Primary transport | Owner docs |
| --- | --- | --- | --- |
| Dashboard chat | Main React dashboard composer | renderer SDK command -> Electron agent host -> Agent SDK backend transport -> backend `/ws` | [Channel Routing Matrix](channel_routing_matrix.md), [Desktop Dashboard](../desktop/dashboard.md) |
| Minimal chat pill | Floating overlay composer | overlay renderer SDK command -> Electron agent host -> Agent SDK backend transport -> backend `/ws` | [Channel Routing Matrix](channel_routing_matrix.md), [Minimal Chat Pill](../desktop/minimal_chat_pill.md) |
| Backend agent stream | Main query/control protocol | WebSocket `/ws` | [Backend API and Transport](../backend/api/api_and_transport.md), [HTTP and WebSocket API Surface](../reference/http_api_surface.md) |
| Voice dictation | Voice-mode microphone capture | renderer audio -> backend `/ws/transcription` | [Voice Audio Change Workflow](voice_audio_change_workflow.md), [Voice and Wakeword](../desktop/voice_and_wakeword.md), [Voice and Audio Channels](voice_and_audio_channels.md) |
| Wakeword | Background hotword listener | renderer audio -> Electron wakeword bridge -> local-runtime wakeword helper backed by the Python subprocess | [Voice Audio Change Workflow](voice_audio_change_workflow.md), [Voice and Wakeword](../desktop/voice_and_wakeword.md), [Voice and Audio Channels](voice_and_audio_channels.md) |
| TTS playback | Backend audio response | backend `/ws` `audio-chunk` events -> renderer playback queue | [Voice Audio Change Workflow](voice_audio_change_workflow.md), [Voice and Audio Channels](voice_and_audio_channels.md), [Backend TTS Manager](../backend/api/processing/tts/tts_manager_audio_stream_and_cleanup_reference.md) |
| Local tools | Computer, browser, filesystem, shell, memory | SDK/main local runtime -> local-runtime Python executor | [Local Tool Channels](sidecar_and_tool_channels.md), [Tools Hub](../tools/README.md) |
| SDK clients | External programmatic clients | direct hosted HTTP + WebSocket | [Channel Routing Matrix](channel_routing_matrix.md), [SDK Hub](../sdk/README.md) |
| VM runs | Hosted dashboard or worker execution | `/api/runs/*` HTTP control plane + backend `/ws` dispatch | [Automation Hub](../automation/README.md), [VM Runs and Workers](../automation/vm_runs_and_workers.md) |

## Rules

- Use `/ws` for normal agent queries, settings/model messages, tool-result ingress, rehydrate, stop-query, wakeword activation, and stream events.
- Use `/ws/transcription` only for voice-mode STT audio/control messages.
- Use `/api/runs/*` only for VM worker assignment, run control, and run timeline events.
- Use `/api/sdk/*` for hosted developer introspection and perception routes, not SDK local-runtime execution.
- Use the SDK local-runtime path for local desktop control, browser actions, shell/filesystem tools, local memory, and system state.
- Do not make Electron client or local-runtime Python implementation code import
  backend modules to share channel schemas.

## Common Change Paths

### Change a WebSocket Event Contract

Read:

- [WebSocket Event Contract Change Workflow](websocket_event_contract_change_workflow.md)
- [Streaming and Events](../concepts/streaming_and_events.md)
- [WebSocket Event Reference](../reference/websocket_event_reference.md)

Use this route for backend streamed event names, formatter payloads, outgoing
schemas, SDK runtime normalization, typed SDK/backend-event guards, chat stream
handlers, terminal events, and audio side-channel payloads.

### Add a Query Input Surface

Read:

- [Channel Routing Matrix](channel_routing_matrix.md)
- [Frontend Chat Stream + Tool Runtime](../frontend/renderer/chat_stream_and_tool_execution_reference.md)
- [IPC Channel and Handler Reference](../frontend/contracts/ipc_channel_and_handler_reference.md)
- [Backend API and Transport](../backend/api/api_and_transport.md)

Likely code:

- renderer surface/component under `frontend/src/renderer`
- `frontend/src/main/ipc.cjs` query send path
- backend `/ws` query handler only if the payload contract changes

Validate renderer send-path tests, main-process IPC tests, and backend query contract tests when payloads change.

### Change an Electron IPC Channel

Read:

- [IPC Change Workflow](../frontend/ipc_change_workflow.md)
- [Frontend Contracts IPC Docs Hub](../frontend/contracts/ipc/README.md)
- [Preload Allowlist and Channel-Constant Parity Reference](../frontend/contracts/ipc/preload_allowlist_and_channel_constant_parity_reference.md)
- [Main-Process IPC Handler Ownership and RPC Mapper Reference](../frontend/contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)

Likely code:

- `frontend/src/shared/ipcChannels.json`
- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc`
- `frontend/src/main/ipc.cjs`
- owning `frontend/src/main/*_ipc_runtime.cjs` or `frontend/src/main/ipc/*.cjs` helper
- `frontend/src/main/sidecar/local_runtime*.cjs` when the channel reaches local-runtime Python execution

Validate preload/registry parity, the owning main-process handler, and the renderer consumer or sidecar mapper. Do not add generic renderer IPC access to bypass the preload allowlist.

### Add a Voice or Audio Feature

Read:

- [Voice Audio Change Workflow](voice_audio_change_workflow.md)
- [Voice and Audio Channels](voice_and_audio_channels.md)
- [Voice and Wakeword](../desktop/voice_and_wakeword.md)
- [Backend TTS + Wakeword Audio Runtime Reference](../backend/services/tts_and_wakeword_audio_runtime_reference.md)

Likely code:

- `frontend/src/renderer/features/voice/**`
- `frontend/src/main/wakeword/wakeword_bridge*.cjs`
- `frontend/src/main/python/wakeword_service.py`
- `backend/src/api/routes/transcription/**`
- `backend/src/api/processing/tts/**`

Validate voice hook, wakeword bridge, STT gateway, and TTS stream tests.

### Add a Local Tool Capability

Read:

- [Local Tool Channels](sidecar_and_tool_channels.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)
- [Local-Runtime Tools Docs Hub](../frontend/sidecar/tools/README.md)

Likely code:

- backend model-facing schema under `backend/src/tools`
- SDK runtime under `packages/windie-sdk-js/src/runtime/AgentClient.ts`,
  `packages/windie-sdk-js/src/runtime/Agent.ts`,
  `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, and
  `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`
- executable local tool under `frontend/src/main/python/tools`
- IPC bridge only when a new local bridge channel is required

Validate backend schema tests, SDK runtime/router tests, local-runtime Python tool tests, renderer projection tests, and schema parity tests.

## Deep Docs

- [Channel Routing Matrix](channel_routing_matrix.md)
- [WebSocket Event Contract Change Workflow](websocket_event_contract_change_workflow.md)
- [Voice Audio Change Workflow](voice_audio_change_workflow.md)
- [Voice and Audio Channels](voice_and_audio_channels.md)
- [Local Tool Channels](sidecar_and_tool_channels.md)
- [Communication Flow](../architecture/communication_flow.md)
- [IPC Channel and Handler Reference](../frontend/contracts/ipc_channel_and_handler_reference.md)
- [HTTP and WebSocket Endpoint Reference](../backend/api/http_and_ws_endpoint_reference.md)
