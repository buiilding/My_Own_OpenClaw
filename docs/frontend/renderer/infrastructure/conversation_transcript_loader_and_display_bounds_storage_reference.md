---
summary: "Renderer infrastructure reference for paginated transcript conversation loading and local display-bounds retrieval used by screenshot tool invocation/capture paths."
read_when:
  - When changing `localConversationStore.ts` pagination behavior for `get-conversation`.
  - When changing `displaySelection.ts` storage/parse validation or screenshot `display_bounds` injection behavior.
title: "Conversation Transcript Loader and Display-Bounds Storage Reference"
---

# Conversation Transcript Loader and Display-Bounds Storage Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/transcript/localConversationStore.ts`
- `frontend/src/renderer/utils/displaySelection.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionInvoker.ts`
- `frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline.ts`
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `tests/frontend/ToolExecutionInvoker.test.ts`
- `tests/frontend/ScreenshotAttachmentPipeline.test.ts`
- `tests/frontend/ToolExecutionService.test.ts`

## Transcript Conversation Loader Contract

`loadConversationTranscriptMemories(...)` is the renderer-side pagination helper for loading full conversation transcript rows from local DB IPC.

Input normalization:

- `userId` and `conversationRef` are trimmed strings
- blank/missing normalized values return `[]` immediately

Defaults:

- `pageSize = 1000`
- `maxPages = 250`
- `recordKind = "transcript"`

Pagination behavior:

1. invoke `GET_CONVERSATION` with `{ userId, conversationId, limit, recordKind, afterMessageIndex }`
2. append `result.data.memories` to accumulator
3. stop when:
   - page returns empty list
   - returned page has fewer rows than `pageSize`
   - `message_index` cannot be resolved from last row
   - resolved next index equals current cursor (loop guard)
4. otherwise continue with `afterMessageIndex = lastMessageIndex`

Error behavior:

- IPC failure/`success=false` throws `Error(result.error || "Failed to load conversation")`

Index parsing helper (`resolveMemoryMessageIndex`):

- accepts finite numeric `message_index`
- accepts numeric strings via base-10 parse
- otherwise returns `null`

## Runtime Call Sites

Primary consumers:

- dashboard open-conversation flow (`useDashboardConversations.handleOpenConversation`)
- manual compaction pre-rehydrate flow (`ChatInterface.handleRunAutoCompaction`)

Shared intent:

- always rehydrate backend from the same full local transcript view before stateful operations (open/compaction)

## Display-Bounds Storage Contract

`getStoredDisplayBounds()` reads local key:

- `desktop-assistant-display-bounds`

Parse/validation (`parseDisplayBounds`):

- JSON must parse to object
- required fields: `x`, `y`, `width`, `height` (finite numbers)
- `width` and `height` must be `> 0`
- invalid payload returns `null`

Storage access behavior:

- localStorage read failures are caught
- parse/storage failures log warning and return `null` (fail-open, no throw)

## Screenshot Injection Semantics

`ToolExecutionInvoker.invokeTool(...)`:

- injects `display_bounds` only for `toolName === "screenshot"`
- normalizes screenshot args to object before merge
- non-screenshot tools pass args unchanged

`ScreenshotAttachmentPipeline.buildScreenshotArgs(...)`:

- injects `display_bounds` into internal screenshot tool call when stored bounds exist
- used by both message-send screenshot capture and tool auto-capture paths

Contract effect:

- screenshot capture can target remembered display region while other tools remain unaffected

## Drift Hotspots

1. Removing loop guards in transcript pagination can create long-running/duplicate page fetches.
2. Changing default `pageSize`/`maxPages` without matching dashboard expectations can truncate conversation rehydrate input.
3. Relaxing bounds validation can propagate invalid geometry into screenshot tool args.
4. Injecting `display_bounds` for non-screenshot tools risks schema/runtime mismatch in unrelated tool paths.

## Related Pages

- [Frontend Renderer Infrastructure Docs Hub](README.md)
- [Chat Interface Header Controls, Model Selection, and Compaction Rehydrate Reference](../chat/chat_interface_header_controls_model_selection_and_compaction_rehydrate_reference.md)
- [Transcript Session and Rehydrate Reference](../transcript_session_and_rehydrate_reference.md)
- [Dashboard Conversation Hook Search, Polling, and Group Bucket Contract Reference](../dashboard/shell/dashboard_conversation_hook_search_polling_and_group_bucket_contract_reference.md)
- [Capture, Artifact Upload, and Payload Normalization Reference](capture_artifact_upload_and_payload_normalization_reference.md)
