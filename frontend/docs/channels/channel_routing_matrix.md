---
summary: "Matrix mapping WindieOS user/developer channels to transports, payload owners, code roots, docs, and validation targets."
read_when:
  - When debugging why a query, control message, tool result, voice event, or SDK request reached the wrong owner.
title: "Channel Routing Matrix"
---

# Channel Routing Matrix

This matrix maps entry channels to the transport and code that own them. Start here when a bug description says "chat", "voice", "SDK", "worker", "tool", or "API" but does not identify the runtime layer.

## Routing Matrix

| Channel | Primary input | Transport path | Backend owner | Desktop/local owner | Validate |
| --- | --- | --- | --- | --- | --- |
| Dashboard chat query | dashboard composer submit | renderer `windie:invoke` command `conversation.send` -> Electron main agent host -> Agent SDK backend transport -> `/ws` `query` | private backend implementation | `frontend/src/renderer/features/chat/**`, `frontend/src/main/ipc.cjs`, Electron agent host | backend query tests, frontend chat/IPC tests |
| Minimal pill query | overlay composer submit | overlay renderer `windie:invoke` command `conversation.send` -> Electron main agent host -> Agent SDK backend transport -> `/ws` `query` | same backend query path | `frontend/src/renderer/app/ChatBox*.jsx`, overlay IPC/window runtime, Electron agent host | overlay/main-process tests, query-send tests |
| Settings/model messages | dashboard settings or startup sync | renderer `windie:invoke` commands `settings.update` / `models.list` -> Electron main agent host -> Agent SDK backend transport -> `/ws` non-query handlers | private backend implementation, model/list handlers | settings provider, `ipc_settings_sync.cjs`, Electron agent host | settings ACK and model-list tests |
| Tool result ingress | SDK/main local execution completion | SDK/main local runtime -> Electron local adapter -> local-runtime Python executor -> SDK/main local runtime -> `/ws` `tool-result` or `tool-bundle-result` | backend tool-result receiver/router/history commit | SDK/main local runtime, local-runtime Python executor, renderer SDK display rows | backend tool-result tests, SDK/IPC router tests, local-runtime Python tests |
| Backend stream events | agent loop output | backend `/ws` outgoing event -> SDK normalization/projection -> Electron main -> renderer `windie:conversation-event`, `windie:rows`, `windie:current-turn` | formatter registry, outgoing schemas, SafeWebSocket sender | SDK conversation runtime, main event fan-out, renderer stream consumers | formatter/schema tests, renderer event guards |
| Voice dictation | voice-mode microphone capture | renderer audio -> `/ws/transcription` | transcription route/services/providers | voice hooks/utils | STT gateway tests, voice hook tests |
| Wakeword | background microphone chunks | renderer IPC -> main wakeword bridge -> local-runtime wakeword helper backed by the Python subprocess | optional wakeword activation handler on `/ws` | `wakeword_bridge*.cjs`, `wakeword_service.py`, `WakewordController.jsx` | wakeword bridge and controller tests |
| TTS playback | backend audio chunk event | `/ws` `audio-chunk` -> typed renderer `audio-chunk` side-channel -> renderer playback queue | API TTS manager/session | renderer audio playback service | TTS backend tests, renderer audio tests |
| Local-runtime tool | model-visible tool call | backend emits tool-call -> SDK/main local runtime executes via the local-runtime Python executor and fans out display-only renderer event | backend schema/preparation/waiting/history | SDK/main local runtime, `local_runtime_bridge.cjs`, local-runtime Python executors | schema parity, local-runtime tool, SDK/IPC router tests |
| SDK hosted query | external SDK client | direct WebSocket `/ws` | same websocket query path | TypeScript/Python SDK clients | SDK client and backend route tests |
| SDK HTTP routes | external SDK client | direct `/api/sdk/*`, `/api/artifacts/*` | SDK/artifact routes/services | SDK client wrappers | SDK route/client tests |

## Payload Ownership

Backend-owned payloads:

- `/ws` incoming/outgoing Pydantic schemas
- formatter output envelopes
- model-facing tool schemas
- transcription websocket provider protocol normalization

Electron client-owned payloads:

- renderer-to-main IPC channel payloads
- renderer-local config and settings subset
- overlay/window control payloads
- renderer chat state and transcript queue payloads
- local-runtime JSON-RPC request envelopes created by SDK/main local-runtime dispatch

Local-runtime implementation payloads:

- executable tool argument validation
- local JSON-RPC method responses
- local memory, browser, filesystem, shell, computer, system-state, and wakeword subprocess protocols

Do not use one channel's payload shape as a silent compatibility layer for another. If two channels need parity, add an explicit adapter or parity test.

## Decision Rules

Use `/ws` when:

- the message changes an agent session
- a query is sent
- a query is stopped
- a tool result returns to the agent loop
- backend stream events must reach the renderer
- wakeword activation should trigger a backend greeting/query flow

Use `/ws/transcription` when:

- audio frames are for live dictation/transcription
- voice-mode control messages such as language reset/start-over are sent
- STT provider changes must be hidden behind one renderer protocol



Use local-runtime JSON-RPC when:

- local machine state or control is required
- browser/computer/filesystem/shell/system/memory tools execute locally
- a subprocess protocol is needed for wakeword or memory service behavior

Use `/api/sdk/*` when:

- a developer tool needs hosted OCR/vision/query-plan/prompt introspection
- the operation should work without Electron renderer IPC
- local desktop action execution is not required

## Debugging by Symptom

| Symptom | Likely channel | First docs |
| --- | --- | --- |
| Query never reaches backend | SDK command path or backend websocket | [IPC Channel Reference](../frontend/contracts/ipc_channel_and_handler_reference.md), Backend WebSocket Reference (private backend docs) |
| Query streams but UI does not update | backend outgoing event or renderer stream consumer | Backend Contracts Events Hub (private backend docs), [Frontend Backend Event Consumer Matrix](../frontend/contracts/backend_event_consumer_matrix_reference.md) |
| Tool call appears but local action does not run | SDK runtime tool router or local-runtime Python executor | [Local Tool Channels](sidecar_and_tool_channels.md), [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md) |
| Voice text does not appear | `/ws/transcription` or voice renderer state | [Voice and Audio Channels](voice_and_audio_channels.md) |
| Wakeword fires repeatedly or not at all | wakeword bridge/subprocess | [Voice and Audio Channels](voice_and_audio_channels.md) |
| SDK route works but desktop action fails | hosted SDK vs local-runtime split | [SDK Hub](../sdk/README.md), [Local Tool Channels](sidecar_and_tool_channels.md) |

## Validation Checklist

Before finishing a channel change:

1. identify the owning channel and payload contract.
2. update the owner docs and this matrix if the routing changes.
3. add tests at the producer and consumer boundary.
4. verify no unrelated channel started depending on private payload shape.
5. run `<windie> docs list`.
