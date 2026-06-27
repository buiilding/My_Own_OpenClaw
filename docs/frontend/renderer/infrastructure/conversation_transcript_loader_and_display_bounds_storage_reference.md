---
summary: "Renderer infrastructure reference for SDK-backed desktop conversation loading and Electron-main display-bounds injection after removed localConversationStore, displaySelection, SettingsDisplayUtils.test.js, and ToolExecutionInvoker renderer helpers."
read_when:
  - When searching for removed `localConversationStore.ts`, `displaySelection.ts`, `SettingsDisplayUtils.test.js`, or `ToolExecutionInvoker.ts` renderer helpers.
  - When changing SDK-backed desktop conversation loading through `desktopConversationStore.ts` or `desktopConversationLibraryClient.js`.
  - When changing Electron-main screenshot `display_bounds` injection behavior.
title: "Conversation Transcript Loader and Display-Bounds Storage Reference"
---

# Conversation Transcript Loader and Display-Bounds Storage Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
- `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts`
- `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js`
- `frontend/src/main/sidecar/local_runtime_display_bounds.cjs`
- `frontend/src/main/sidecar/local_runtime_tool_args.cjs`
- `frontend/src/main/sidecar/local_runtime_execute_tool_runtime.cjs`
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `tests/frontend/DesktopConversationStore.test.ts`
- `tests/frontend/DesktopConversationLibraryClient.test.ts`
- `tests/frontend/LocalRuntimeDisplayBounds.test.cjs`
- `tests/frontend/LocalRuntimeToolArgs.test.cjs`
- `tests/frontend/LocalRuntimeExecuteToolRuntime.test.cjs`

## Removed Renderer Helpers Route

`localConversationStore.ts`, `displaySelection.ts`, `SettingsDisplayUtils.test.js`, and `ToolExecutionInvoker.ts`
are no longer current renderer owners:

- conversation loading/listing/searching routes through SDK-shaped
  `invokeAgentSdkCommand(...)` facades and the desktop `ConversationStore`
  adapter
- display-bounds selection and injection happen in Electron main before sidecar
  screenshot execution
- speech-mode config updates are covered by chat surface, AppConfigProvider,
  config storage/filter, and settings-management tests instead of a standalone
  settings-display utility suite
- local tool execution and post-action screenshot policy live in the SDK
  `ToolExecutionCoordinator`, not a renderer invoker service

## Transcript Conversation Loader Contract

`createDesktopConversationStore(userId)` is the renderer-side adapter for SDK
conversation storage commands.

Command mapping:

- `appendEvent`/`appendEvents` -> `conversation.appendEvent`
- `replaceCompactedReplay` -> `conversation.replaceCompactedReplay`
- `replaceDisplayTimeline` -> `conversation.replaceRows`
- `loadEvents` -> `conversation.load`
- `loadForDisplay` and `loadDisplayRows` -> `conversation.loadDisplay`
- `loadForRehydrate` -> `conversation.loadRehydrate`
- `listMetadata` -> `conversations.list`
- `searchMetadata` -> `conversations.search`
- `deleteConversation` -> `conversations.delete`
- `clearConversations` -> `conversations.clearAll`
- `getRevision` -> `conversation.getRevision`

`desktopConversationLibraryClient.js` is the narrower dashboard/list facade. It
uses `conversations.list`, `conversations.search`, `conversations.delete`, and
`conversation.loadDisplay` through `loadConversationView(...)`; it does not load
full event or rehydrate snapshots.

Defaults:

- missing display loads return an empty `DisplayConversation`
- missing rehydrate loads return an empty `RehydrateSnapshot`
- malformed list/search responses normalize to `[]`

Error behavior:

- lower-level `invokeAgentSdkCommand(...)` failures propagate to the caller; the
  store adapter does not invent fallback transcript rows

## Runtime Call Sites

Primary consumers:

- dashboard open-conversation flow (`useDashboardConversations.handleOpenConversation`)
- manual compaction pre-rehydrate flow (`ChatInterface.handleRunAutoCompaction`)
- SDK `ConversationContinuityService` replay/rewrite/rehydrate orchestration

Shared intent:

- keep renderer feature code on SDK-shaped conversation store commands instead
  of direct legacy `GET_CHAT_EVENTS` IPC calls

## Display-Bounds Injection Contract

`resolveScreenshotToolDisplayBounds(...)` computes default screenshot bounds in
Electron main from the active surface display affinity.

`resolveToolArgs(toolName, args, { displayBounds })` behavior:

- non-object args normalize to `{}`
- non-screenshot tools pass cloned args unchanged
- `screenshot` args keep an explicit valid `display_bounds`
- `screenshot` args receive the default display bounds only when no valid
  explicit `display_bounds` exists

Validation:

- `display_bounds.x/y/width/height` must be finite numbers
- width and height must be positive
- values are rounded before local execution
- optional `monitor_id` and nested `desktop_virtual_bounds` are preserved only
  when valid

## Screenshot Injection Semantics

Electron main local execution:

- prepares the active desktop surface before computer-use local execution
- resolves screenshot display bounds from the active surface/display affinity
- injects bounds through `local_runtime_tool_args.cjs`
- sends normalized args to local-runtime Python

SDK/main screenshot paths:

- query screenshots are requested by renderer as `query_screenshot_request` resources
- SDK/main screenshot capture injects stored display bounds before local execution
- tool auto-capture paths run through the SDK/main result envelope, not a renderer screenshot pipeline

Contract effect:

- screenshot capture can target remembered display region while other tools remain unaffected

## Drift Hotspots

1. Reintroducing direct renderer calls to legacy chat-event IPC channels bypasses
   SDK conversation projection.
2. Loading dashboard display rows through full rehydrate/event snapshots makes
   the conversation library facade too broad.
3. Relaxing bounds validation can propagate invalid geometry into screenshot
   tool args.
4. Injecting `display_bounds` for non-screenshot tools risks schema/runtime
   mismatch in unrelated tool paths.

## Related Pages

- [Frontend Renderer Infrastructure Docs Hub](README.md)
- [Chat Interface Header Controls, Model Selection, and Compaction Rehydrate Reference](../chat/chat_interface_header_controls_model_selection_and_compaction_rehydrate_reference.md)
- [Transcript Session and Rehydrate Reference](../transcript_session_and_rehydrate_reference.md)
- [Dashboard Conversation Hook Search, Polling, and Group Bucket Contract Reference](../dashboard/shell/dashboard_conversation_hook_search_polling_and_group_bucket_contract_reference.md)
- [Capture, Artifact URL, and Payload Normalization Reference](capture_artifact_upload_and_payload_normalization_reference.md)
