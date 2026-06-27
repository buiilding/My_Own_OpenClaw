---
summary: "Focused test-selection guide mapping WindieOS code areas to pytest and Jest commands."
read_when:
  - When choosing tests for a backend, frontend, sidecar, SDK, provider, tool, or overlay change.
  - When updating docs or code and deciding whether full suites are necessary.
title: "Test Selection"
---

# Test Selection

Use focused tests while iterating, then run the broad suite for the touched runtime when the change crosses contracts or shared state.

## Baseline Commands

```bash
private backend tests
<windie> test local-runtime
<windie> test frontend
cd frontend && npm run lint
```

private backend tests and `<windie> test local-runtime` use
the platform `scripts/python-in-env` wrapper, so do not manually activate conda environments. Use
`<windie> test pick <area>` to find common focused validation commands.

## By Runtime

| Change area | Focused validation |
| --- | --- |
| Backend websocket/API | private backend tests |
| Backend agent loop | private backend tests |
| Backend providers/models | private backend tests |
| Backend tool schemas | private backend tests |
| Backend OCR/vision | private backend tests |
| Backend SDK routes | private backend tests |
| Electron main IPC | `<windie> test frontend -- IpcMainBridge.query.test.cjs IpcQueryRuntime.test.cjs PreloadIpcChannels.test.cjs` |
| Frontend CLI and layer logs | `<windie> test frontend -- WindieCli.test.cjs LayerLogSink.test.cjs WindieRunLayerLog.test.cjs ElectronLauncher.test.cjs IpcDiagnosticsRuntime.test.cjs` |
| User-facing regression pack | `<windie> test user-facing` |
| Core-loop UI regression pack | `<windie> test core-loop` |
| Overlay windows/phases | `<windie> test frontend -- OverlayPhaseContractParity.test.js ResponseOverlayPhaseHandler.test.cjs WindowVisibilityRuntime.test.cjs` |
| Minimal chat pill hit-testing and dragging | `<windie> test frontend -- ChatBoxOverlayMouseIgnore.test.jsx ChatBoxPillLayout.test.js ChatPillSessionFlow.test.ts` |
| Renderer chat stream | `<windie> test frontend -- DesktopChatStreamEventRuntime.test.ts DesktopChatStreamMessageUpdateRuntime.test.ts DesktopChatStreamTurnGuardRuntime.test.ts ChatMessageSender.test.tsx ConversationRuntimeProjectionStream.test.ts` |
| SDK conversation runtime and stop flow | `<windie> test frontend -- AgentSdkConversationRuntime.test.ts DesktopRuntimeTransport.test.ts DesktopLiveTurnRuntimeClient.test.ts IpcMainBridge.lifecycle.test.cjs AgentStopShortcutRuntime.test.cjs AgentStopShortcut.test.js DesktopStopTurnRuntime.test.js` |
| Renderer dashboard/settings | `<windie> test frontend -- DashboardShell.test.jsx DashboardSidebar.test.jsx ModelsSection.test.jsx SettingsSection.test.jsx` |
| Permissions/onboarding | `<windie> test frontend -- PermissionService.test.cjs PermissionIpcRuntime.test.cjs AppPermissionGate.test.jsx DesktopOnboardingSlideshow.test.jsx` |
| Artifacts/screenshots | `<windie> test frontend -- RuntimeEndpointStore.test.ts IpcArtifactFetch.test.cjs QueryScreenshotPipeline.test.ts ChatMessageSender.test.tsx AgentSdkConversationRuntime.test.ts LocalRuntimeExecuteToolRuntime.test.cjs` |
| Voice/wakeword | `<windie> test frontend -- WakewordBridge.test.cjs WakewordSupervisor.test.cjs VoiceModeHook.test.ts TranscriptionHook.test.ts` |
| Local-runtime Python protocol/tools | `<windie> test local-runtime -- tests/sidecar/test_json_rpc_protocol.py tests/sidecar/test_tool_registry.py tests/sidecar/test_tool_result.py -q` |
| Local-runtime filesystem/shell | `<windie> test local-runtime -- tests/sidecar/test_read_file_tool.py tests/sidecar/test_replace_tool.py tests/sidecar/test_shell_process_tool.py -q` |
| Local-runtime browser | `<windie> test local-runtime -- tests/sidecar/test_browser_registry.py tests/sidecar/tools/test_browser_tool.py tests/sidecar/tools/test_browser_use_engine_runtime.py tests/sidecar/tools/test_browser_schemas.py -q` |
| Local-runtime memory and conversation revision storage | `<windie> test local-runtime -- tests/sidecar/test_local_backend.py tests/sidecar/test_memory_operations.py tests/sidecar/test_conversation_search_helpers.py tests/sidecar/test_chat_event_store.py -q` |

## Contract Changes

Run tests on both sides of the boundary when a payload crosses processes.

| Contract | Run |
| --- | --- |
| Backend model-facing tool schema and local-runtime executable tools | private backend tests |
| SDK result envelope and renderer tool display | private backend tests plus `<windie> test frontend -- AgentSdkConversationRuntime LocalRuntimeExecuteToolRuntime ToolOutputMessageState ToolOutputContent` |
| Response overlay phase names | `<windie> test frontend -- OverlayPhaseContractParity.test.js ResponseOverlayPhaseContract.test.js IpcOverlayPhaseContract.test.cjs` |
| Transcript/replay/display rows | `<windie> test frontend -- DesktopConversationContinuityService.test.ts DesktopConversationStore.test.ts ConversationRuntimeProjectionStream.test.ts SdkDisplayChatMessageProjection.test.ts` |
| Artifact refs and URLs | private backend tests plus `<windie> test frontend -- RuntimeEndpointStore.test.ts IpcArtifactFetch.test.cjs` |
| SDK HTTP/trace helpers | private backend tests plus `<windie> test frontend -- AgentSdkClient.test.ts` |
| Frontend CLI command routing and formatter contracts | `<windie> test frontend -- WindieCli.test.cjs` plus private backend tests |

## When To Run Full Suites

Run the full suite for a runtime when:

- A shared contract file changed.
- A store, provider, or service factory changed.
- The patch changes lifecycle timing or cleanup.
- The patch fixes a regression that could reappear in multiple surfaces.
- A test helper changed.

Run all three broad suites when the change crosses backend, Electron main/renderer, and sidecar behavior in one patch.

## Docs-Only Changes

For docs-only edits:

```bash
<windie> docs list
git diff --check
```

Also run a local markdown link check for edited files when adding or moving docs sections. If docs describe code ownership, verify the referenced files exist with `rg --files` or `find` before committing.

When the worktree already contains unrelated code changes, keep docs-only
validation scoped to the files being committed. Use `git diff -- <docs-file>`
to review the exact docs patch, then stage only those docs paths so unrelated
runtime edits do not get bundled into documentation commits.
