---
summary: "Hosted backend websocket connection lifecycle from accept and install-token handshake through message validation, task scheduling, timeout, and cleanup."
read_when:
  - When changing the main `/ws` route, handshake message, websocket auth, message size limits, task concurrency, timeout behavior, or disconnect cleanup.
  - When debugging websocket close code `1008`, dropped tool results, stale sessions, duplicate connections, or missing per-user cleanup.
title: "WebSocket Connection Lifecycle"
---

# WebSocket Connection Lifecycle

This page covers the main agent websocket at `GET /ws`. It does not cover the transcription websocket at `GET /ws/transcription`; use [Voice and Audio Channels](../channels/voice_and_audio_channels.md) for that route.

For a task-oriented owner map and validation checklist before changing websocket lifecycle behavior, start with [WebSocket Connection Change Workflow](websocket_connection_change_workflow.md).

The main websocket is owned by `backend/src/api/routes/websocket/router.py` and related helper modules. The websocket is the backend transport for query messages, tool results, settings messages, compaction requests, model listing, wakeword events, and streamed agent output.

## Lifecycle Timeline

| Phase | Owner | Behavior | Failure signal |
| --- | --- | --- | --- |
| Accept | `router.py`, `SafeWebSocket` | Wrap raw FastAPI websocket and call `safe_ws.accept()` before handshake read. | Connect fails before backend can parse client identity. |
| Read handshake | `connection.py` | First text frame must be a JSON object matching `HandshakeMessage`. | Close `1008` on invalid JSON, non-object payload, or validation failure. |
| Install auth | `connection.py`, `InstallAuthService` | If `install_auth_enabled` is true, `Authorization: Bearer <install_token>` is required. | Close `1008` for missing/invalid token or missing auth service. |
| Identity binding | `connection.py` | Authenticated `user_id` overrides the claimed handshake `user_id`; mismatch is logged and ignored. | Wrong-user behavior usually means token propagation or auth-context drift. |
| Session metadata/startup sends | `router.py` | Stores client OS/capability overrides, sends client-tool-manifest and remote-tool-catalog events, and keeps these post-handshake operations inside the cleanup-protected connection lifecycle. | Wrong tool visibility, OS policy drift, or startup send failures can start here. |
| Receive loop | `router.py` | Reads text frames with `websocket_receive_timeout`. | Timeout closes with `1008` and timeout reason. |
| Parse and validate | `message_handler.py`, `message_parse_runtime.py`, `json_parse.py` | Enforces max message size and incoming schema. | Sends websocket error response when a post-handshake message is invalid. |
| Task scheduling | `loop_runtime.py`, `task_manager.py` | Creates one task per validated message under `websocket_max_concurrent_tasks`. | Sends `Too many concurrent requests. Please wait.` on limit exceed. |
| Handler dispatch | `message_handler.py`, handler registry | Routes by message type to query, tool-result, settings, rehydrate, stop, compact, wakeword, or list-models handlers. | Error responses should go through `send_error`. |
| Cleanup | `connection.py`, `task_manager.py`, session manager | Closes websocket, cancels outstanding tasks, decrements connection count, ends session only after the final active connection closes. | Session leaks or premature cleanup show up here. |

## Module Responsibilities

| Module | Responsibility |
| --- | --- |
| `router.py` | Route entrypoint, config lookup, receive loop, session metadata, cleanup orchestration. |
| `connection.py` | Handshake parsing, install-token auth, user identity binding, policy-violation close, final session cleanup. |
| `json_parse.py` | Shared JSON parse policy and large-payload offload threshold. |
| `message_parse_runtime.py` | Incoming payload validation after handshake. |
| `message_handler.py` | Message parse wrapper, handler dispatch, websocket error-response path. |
| `loop_runtime.py` | Timeout close and task-limit scheduling helpers. |
| `task_manager.py` | Per-connection task concurrency and cancellation. |
| `backend/src/api/transport/websocket.py` | Thread-safe websocket send queue and close behavior. |
| `backend/src/api/transport/sender.py` | Transport sender abstraction used by query execution and formatter paths. |

## Incoming Message Families

The handler registry owns the exact dispatch table, but the main websocket currently carries these families:

| Family | Typical owner | Notes |
| --- | --- | --- |
| `query` | `backend/src/api/handlers/query.py`, `backend/src/api/services/query_execution.py` | Starts or continues an agent turn. |
| `tool-result`, `tool-bundle-result` | `backend/src/api/handlers/tool_result.py` | Returns SDK/main local execution results to backend history. |
| `stop-query` | `backend/src/api/handlers/stop_query.py` | Cancels active query work. |
| `rehydrate-conversation` | `backend/src/api/handlers/rehydrate.py` | Rebuilds backend session state from frontend transcript. |
| `compact-history` | `backend/src/api/handlers/compact_history.py` | Runs conversation compaction. |
| `load-settings`, `update-settings`, `list-models` | `backend/src/api/handlers/settings.py` | Reads or updates runtime config and model catalog surfaces. |
| `wakeword-detected` | `backend/src/api/handlers/wakeword.py` | Bridges wakeword event into backend query/runtime behavior. |

When adding a message family, update incoming schemas, handler registry tests, websocket event references, and frontend sender/consumer tests in the same change.

## Configuration Knobs

| Config field | Used by | Why it matters |
| --- | --- | --- |
| `install_auth_enabled` | `router.py`, `connection.py`, auth middleware | Decides whether bearer install token is required at websocket handshake. |
| `websocket_max_message_size` | `router.py`, parse runtime | Rejects oversized incoming frames before handler dispatch. |
| `websocket_max_concurrent_tasks` | `TaskManager` | Prevents one client connection from scheduling unbounded handler tasks. |
| `websocket_receive_timeout` | receive loop and timeout close helper | Closes idle connections with policy-violation semantics. |
| `websocket_task_cancellation_timeout` | `TaskManager.cleanup` | Bounds cleanup when disconnecting with active tasks. |

## Debugging Routes

| Symptom | Check first |
| --- | --- |
| Close code `1008` immediately after connect | Handshake JSON, `HandshakeMessage` shape, missing bearer token, invalid token, or missing install auth service. |
| Error response after handshake | Incoming message schema, max message size, or handler validation. |
| Query starts but later messages fail | Handler registry route, query execution service, or transport sender. |
| Tool result is ignored | `tool-result` schema, conversation ids, tool ids, and tool-result handler logs. |
| Duplicate session state | Multiple active connections for same user and connection-count cleanup semantics. |
| Session disappears while another window is open | `cleanup_connection` and `decrement_connection_count` behavior. |
| Server writes race or fail under streaming/TTS | `SafeWebSocket` queue and transport sender behavior. |

## Focused Tests

| Behavior | Test files |
| --- | --- |
| Handshake auth and identity binding | `tests/backend/test_websocket_connection.py`, `tests/backend/test_install_auth.py` |
| Receive loop, timeout, scheduling | `tests/backend/test_websocket_route.py`, `tests/backend/test_websocket_loop_runtime.py`, `tests/backend/test_websocket_task_manager.py` |
| JSON parse and validation | `tests/backend/test_websocket_json_parse.py`, `tests/backend/test_websocket_message_parse_runtime.py` |
| Handler dispatch and error path | `tests/backend/test_websocket_message_handler.py`, `tests/backend/test_api_handlers.py` |
| Thread-safe send behavior | `tests/backend/test_safe_websocket.py`, `tests/backend/test_transport_sender.py` |

## Related Docs

- [Gateway Protocol Map](gateway_protocol_map.md)
- [WebSocket Connection Change Workflow](websocket_connection_change_workflow.md)
- [WebSocket Event Reference](../reference/websocket_event_reference.md)
- [Streaming and Events](../concepts/streaming_and_events.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)
- [Endpoint and Network Debugging](../debug/endpoint_and_network_debugging.md)
