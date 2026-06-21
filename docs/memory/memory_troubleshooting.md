---
summary: "Memory troubleshooting guide for missing chats, failed transcript persistence, stale semantic memory, title failures, and rehydrate/tool linkage issues."
read_when:
  - When chats are missing, memory search is stale, conversation titles fail, or replay/rehydrate produces malformed tool rows.
  - When deciding whether a memory bug belongs to renderer transcript, local-runtime memory, or backend rehydrate/history.
title: "Memory Troubleshooting"
---

# Memory Troubleshooting

Start by locating the layer. Most memory bugs are caused by assuming transcript, local-runtime memory, and backend history are the same thing.

## Visible Message Did Not Persist

Inspect:

- `packages/windie-sdk-js/src/projections`
- `packages/windie-sdk-js/src/runtime/Agent.ts`
- `frontend/src/main/python/local_backend_memory_handlers.py`

Validate:

```bash
cd frontend
<windie> test frontend -- AgentSdkConversationRuntime.test.ts ModularRefactorCompletionBoundary.test.ts
```

## Conversation Appears In Dashboard But Replay Is Wrong

Inspect:

- `packages/windie-sdk-js/src/projections`
- desktop conversation store adapter
- `frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js`
- `frontend/src/renderer/app/runtime/desktopConversationReplayRuntime.js`

Validate:

```bash
cd frontend
<windie> test frontend -- AgentSdkConversationRuntime ConversationReplayActions DesktopConversationReplayRuntime
```

## Tool Rows Lose Linkage After Rehydrate

Inspect:

- `backend/src/api/services/rehydrate_tool_call_normalization.py`
- `backend/src/api/services/rehydrate_tool_linkage.py`
- `frontend/src/renderer/infrastructure/transcript/toolCallMessageState.js`
- `frontend/src/renderer/infrastructure/transcript/toolOutputChatMessageState.ts`

Validate:

```bash
<windie> test backend tests/backend/test_rehydrate_tool_call_normalization.py tests/backend/test_rehydrate_tool_linkage.py -q
<windie> test frontend -- AgentSdkConversationRuntime.test.ts DesktopConversationReplayRuntime.test.js
```

## Search Finds Old Or Wrong Memory

Inspect:

- `frontend/src/main/python/memory/operations.py`
- `frontend/src/main/python/memory/conversation_search_helpers.py`
- `frontend/src/main/python/memory/faiss_index.py`
- `frontend/src/main/python/memory/transcript_embedding_policy.py`

Validate:

```bash
<windie> test local-runtime tests/sidecar/test_memory_operations.py tests/sidecar/test_conversation_search_helpers.py tests/sidecar/test_chat_event_store.py -q
```

## Semantic Memory Is Missing

Inspect:

- `frontend/src/main/python/memory/summarizer.py`
- `frontend/src/main/python/memory/conversation_semanticization_runtime.py`
- `frontend/src/main/python/core/remote_semantic_client.py`
- `backend/src/api/routes/memory`

Validate:

```bash
<windie> test local-runtime tests/sidecar/test_memory_summarizer.py tests/sidecar/test_conversation_semanticization_runtime.py tests/sidecar/test_remote_semantic_client.py -q
<windie> test backend tests/backend/test_memory_routes.py tests/backend/test_semantic_parser_service.py -q
```

## Conversation Title Stays Generic

Inspect:

- `frontend/src/main/python/memory/conversation_title_store.py`
- `frontend/src/main/python/local_backend_memory_handlers.py`
- backend semantic/title route tests under `tests/backend/test_memory_routes.py`

Validate:

```bash
<windie> test local-runtime tests/sidecar/test_local_backend.py tests/sidecar/test_chat_event_store.py -q
<windie> test backend tests/backend/test_memory_routes.py -q
```
