---
summary: "Realtime execution report for the general agent UI runtime boundary convergence work."
title: "General Agent UI Runtime Boundary Report"
---

# General Agent UI Runtime Boundary Report

Plan: [General Agent UI Runtime Boundary Execution Plan](2026-06-16-general-agent-ui-runtime-boundary-execution-plan.md)
User plan: [`plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md`](../../plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md)

## Current Status

- Status: in progress
- Latest inspected plan checkpoint: `f8d3a2b2d` (`refactor(sdk): keep context enrichment internals private`)
- Current behavior: renderer product copy is skin-owned, Electron main product
  copy is host-skin-owned, voice capture internals use generic naming, and SDK
  default agent display names are generic unless a host supplies product
  identity. SDK helper symbols that are not part of the public package boundary
  stay private behind higher-level runtime APIs.

## Inspection Log

### 2026-06-16 Renderer Skin/Config Slice

- Worktree was clean on `main` at `de7713f72`.
- Recent commits show active frontend/backend boundary cleanup, including narrowed SDK exports and current-turn side-effect isolation.
- `docs/architecture/frontend_architecture.md` says renderer should consume app runtime facades and SDK projections, while renderer feature code should remain UI/display oriented.
- Finding: settings feature components embed WindieOS product copy and runtime wording directly, including browser, workspace, tool-log, and tool catalog descriptions. This works today, but it keeps the renderer from reading as a generic chat desktop UI plus a WindieOS skin/config.
- Decision: introduce a renderer skin module and route settings copy through it without changing behavior.
- Change: added `windieDesktopSkin` for renderer settings copy, local/cloud tool catalog presentation, browser/workspace labels, and display-safe tool acceptance runtime labels.
- Change: updated Agent, General, Browser, and Workspace settings tabs to consume the skin/config boundary.
- Change: added a renderer skin/config boundary test to prevent settings components from reintroducing hard-coded product copy or raw sidecar labels.
- Validation: focused settings and skin boundary tests pass.
- Validation: `git diff --check` passes.
- Fresh inspection: old hard-coded settings copy no longer appears in the touched settings tabs. The only matching settings-area product string left by the inspection is `useMemorySettingsActions.js`, which belongs to a later memory settings copy sweep.

### 2026-06-16 Renderer Memory Skin/Config Slice

- Worktree after the previous commit was ahead of origin with unrelated sidecar/computer-tool edits in `frontend/src/main/python/tools/computer/keyboard_tool.py`, `frontend/src/main/python/tools/computer/scroll_tool.py`, and `tests/sidecar/test_keyboard_tool.py`; these are out of scope and preserved.
- Finding: memory settings and the memory panel still hard-coded WindieOS copy and destructive-action labels in renderer feature modules.
- Decision: extend `windieDesktopSkin` for memory settings and panel copy while leaving `DesktopMemoryRuntimeClient` command routing unchanged.
- Change: memory settings destructive confirmation, success, failure, pending, and active-user messages now come from the renderer skin.
- Change: memory panel heading, empty states, search placeholder, close/toggle labels, and load/delete fallback messages now come from the renderer skin.
- Change: renderer skin boundary test now covers memory settings, the memory action hook, and the memory panel.
- Validation: focused renderer skin, memory panel, and settings tests pass.
- Validation: `git diff --check` passes.
- Fresh inspection: old hard-coded memory/product copy is now limited to `windieDesktopSkin` and the boundary test; memory settings and panel consumers read from the skin.

### 2026-06-16 Renderer Onboarding/Chat Skin Slice

- Finding: onboarding, chat empty state, chat send/replay failure messages, and the live-turn runtime fallback still embedded WindieOS product copy directly in renderer modules.
- Decision: extend `windieDesktopSkin` for onboarding, chat, and runtime fallback copy while preserving the same rendered strings and command flow.
- Change: onboarding dialog label, start button, permission-empty, permission-loading, and missing-permissions messages now come from the renderer skin.
- Change: chat empty title and renderer-local send/replay failure messages now come from the renderer skin.
- Change: the live-turn runtime fallback error message now comes from the renderer skin.
- Change: renderer skin boundary test now covers onboarding/chat/runtime copy consumers.
- Validation: focused renderer skin, onboarding, chat send, chat wiring, and live-turn runtime tests pass.
- Validation: `git diff --check` passes.
- Fresh inspection: moved onboarding/chat/runtime product strings no longer appear in renderer consumers; remaining WindieOS strings are the skin plus voice/audio implementation identifiers and comments.

### 2026-06-16 Main Host Permission Skin Slice

- Compaction recovery: recent commits and current uncommitted work were inspected before continuing. Sidecar `process` and screenshot `ToolResult` refactors landed separately while this slice was in progress and were treated as unrelated context.
- Finding: `main/index.cjs` still embedded WindieOS browser automation and macOS automation permission fallback copy inside the Electron composition root.
- Decision: introduce a main host skin/config module for product-specific host copy while keeping OS/window/permission adapter logic in main.
- Change: browser automation local-backend, Chromium install, runtime unavailable, install failure, and browser-open failure messages now come from the main host skin.
- Change: macOS System Events Automation probe and request fallback messages now come from the main host skin.
- Change: added a main host skin boundary test to prevent these product strings from returning to `main/index.cjs`.

### 2026-06-16 Main Permission Service Skin Slice

- Concurrent-work recovery: a sidecar shell-command `ToolResult` refactor landed separately while this slice was in progress and was treated as unrelated context.
- Finding: browser automation and macOS System Events Automation permission service modules still embedded WindieOS dialog, remediation, browser-open, and ready-state copy.
- Decision: pass `mainHostSkin` through the permission IPC dependency boundary and let permission services consume injected skin copy with generic fallback text.
- Change: browser automation install dialog, profile-open prompt, browser-open fallback, retry fallback, and ready-state message now resolve from the main host skin on the app path.
- Change: macOS Automation probe/request remediation text now resolves from the main host skin on the app path.
- Change: main host skin boundary test now covers the browser and automation permission service modules so WindieOS copy stays in the skin.

### 2026-06-16 Main OS Permission Service Skin Slice

- Concurrent-work recovery: sidecar daemon and tool registry docs/code changes were present in the working tree and treated as unrelated context.
- Finding: screen recording, Accessibility/input control, microphone, and workspace picker permission services still embedded WindieOS product copy directly.
- Decision: continue using the injected `mainHostSkin` dependency, with generic service fallbacks, for the remaining OS permission-service messages.
- Change: screen recording System Settings remediation, waiting, registration, and verification messages now resolve from the main host skin on the app path.
- Change: Accessibility/input control remediation, microphone OS privacy remediation, and workspace picker title now resolve from the main host skin on the app path.
- Change: main host skin boundary test now covers these remaining permission service modules.

### 2026-06-16 Main Query Event Skin Slice

- Finding: `ipc_query_events.cjs` builds generic query failure/interruption events but embedded WindieOS disconnect copy directly.
- Decision: keep the event builders generic by accepting optional copy and let `ipc.cjs` supply `mainHostSkin.queryEvents` on the app path.
- Change: query send failure and backend disconnect interruption messages now resolve from the main host skin in `ipc.cjs`.
- Change: direct event-builder fallbacks use generic app wording when no skin copy is injected.
- Change: main host skin boundary test now covers query event builders.

### 2026-06-16 Main Host Identity Skin Slice

- Finding: SDK wake-up agent name and tray tooltip still embedded WindieOS identity directly in main host modules.
- Decision: add host identity copy to `mainHostSkin` and thread it through existing main/bootstrap dependencies.
- Change: SDK `wakeUp` agent name now reads `mainHostSkin.identity.sdkAgentName`.
- Change: tray tooltip now reads `mainHostSkin.identity.trayTooltip` with a generic fallback in the window runtime.
- Follow-up: MCP runtime identity had separate extension-runtime caller implications and was handled in the next slice.

### 2026-06-16 Main MCP Identity Skin Slice

- Finding: the extension MCP runtime default client info still embedded WindieOS identity.
- Decision: make the MCP runtime default generic, add `mainHostSkin.identity.mcpClientInfo`, and thread that copy through main's MCP refresh/toggle paths.
- Change: MCP stdio client initialization now uses generic default client info unless app code injects a product identity.
- Change: Electron main supplies `mainHostSkin.identity.mcpClientInfo` when refreshing MCP servers directly or through the SDK agent adapter.
- Change: MCP runtime tests now prove configured client info reaches the initialize request.
- Validation gap: `McpControl.test.cjs` was attempted but this environment lacks `sqlite3`, which that test's diagnostics helper requires.

### 2026-06-16 Main Log Prefix Skin Slice

- Concurrent-work recovery: backend cache cleanup changes were staged in the working tree and treated as unrelated context.
- Finding: the shared layer log sink embedded `[WindieOS]` as its default session/error prefix.
- Decision: make the log sink default generic and pass `mainHostSkin.identity.logPrefix` through app/runtime call paths that should keep WindieOS log branding.
- Change: main console logging, main-window renderer console banners, and Windie CLI layer-log helpers now pass `[WindieOS]` explicitly.
- Change: layer log sink tests now pass app-specific prefixes explicitly, and the host boundary test guards that the reusable sink no longer embeds `[WindieOS]`.
- Validation gap: `WindieCli.test.cjs` was attempted but this environment lacks `sqlite3`, which its conversation export tests require.

### 2026-06-16 Main Bundled Runtime Guidance Skin Slice

- Compaction recovery: recent commits and the current worktree were inspected before continuing. Existing backend/sdk deletions and docs updates were present and treated as unrelated work.
- Finding: wakeword and SDK sidecar launch helpers still embedded WindieOS reinstall guidance for missing packaged Python/runtime assets.
- Decision: keep launch helpers generic and inject WindieOS packaged-runtime copy from `mainHostSkin` through main composition paths.
- Change: bundled Python and wakeword executable reinstall guidance now lives in `mainHostSkin.bundledRuntime`.
- Change: wakeword startup/process-error helpers and SDK sidecar launch options use generic app fallbacks unless host copy is provided.
- Change: main window wakeword wiring and SDK sidecar launch planning pass the WindieOS bundled-runtime copy on app paths.
- Validation: focused wakeword, sidecar launch, main-window runtime, and host-skin boundary tests pass.

### 2026-06-16 Main Local Browser/OAuth Skin Slice

- Finding: local browser warmup and OpenAI Codex OAuth token-exchange callback helpers still embedded WindieOS product copy directly.
- Decision: keep helper modules generic and inject WindieOS copy from `mainHostSkin` through existing main composition/IPC paths.
- Change: browser warmup explanation copy now lives in `mainHostSkin.localBackend` and is passed through `initializeLocalBackendBridge`.
- Change: OpenAI Codex OAuth token-exchange callback copy now lives in `mainHostSkin.openAICodexOAuth` and is passed through OAuth IPC handler registration.
- Validation: focused local-backend bridge, OAuth, OAuth IPC handler, main-window runtime, and host-skin boundary tests pass.
- Fresh inspection: `frontend/src/main` now contains WindieOS product naming only in `main_host_skin.cjs`.

### 2026-06-16 SDK Private Helper Export Slice

- Compaction recovery: recent commits and the current worktree were inspected before continuing. A staged SDK export cleanup was present and treated as the active SDK boundary slice; broader generated CJS line-ending noise was left unstaged.
- Finding: websocket URL normalization, capability summarization, and compacted-replay event parsing were exported from their deep SDK modules even though current callers use higher-level SDK contracts.
- Decision: keep those helpers private to their owning modules and protect the public package boundary with a focused CJS export test.
- Change: `normalizeWsUrl`, `summarizeAgentDefinitionCapabilities`, and `compactedReplayFromEvent` are now module-private helpers.
- Change: the CJS package output no longer publishes those helper symbols, while public session, manifest stamping, and compacted replay snapshot APIs remain exported.
- Validation: focused package-boundary/private-export tests pass.

### 2026-06-16 Renderer Voice Naming Slice

- Worktree recovery: new SDK context-enrichment export cleanup edits were present and treated as unrelated to this renderer slice.
- Finding: renderer voice capture internals still used WindieOS naming in an AudioWorklet processor id/class and a voice hook comment.
- Decision: rename those internals to generic desktop-agent terms without changing voice capture behavior.
- Change: the audio capture worklet processor id/class now uses generic desktop-agent naming.
- Change: the voice mode hook describes the backend transcription websocket without product naming.
- Change: renderer skin boundary tests now cover voice capture internals.
- Validation: focused renderer skin, voice runtime boundary, and audio processor tests pass.
- Fresh inspection: `frontend/src/renderer` product naming now appears only in `windieDesktopSkin.js`.

### 2026-06-16 SDK Default Agent Name Slice

- Finding: SDK agent-definition helpers still used WindieOS/Windie display names as defaults even though Electron main now passes product identity from `mainHostSkin`.
- Decision: keep backend contract ids/modes unchanged, but make SDK fallback display names generic so custom hosts do not inherit WindieOS presentation copy.
- Change: `buildAgentDefinition()` now defaults to `Desktop Agent`.
- Change: `WindieClient.wakeUp()` now defaults the handshake agent name to `Agent` unless a caller supplies `name`.
- Validation: focused SDK default-name and package-boundary tests pass.
- Validation gap: the full `WindieSdkClient.test.ts` file was attempted, but two existing local-runtime provider tests failed because their temporary `python-in-env` launcher was unavailable in this environment.

## Checklist

- [x] Renderer skin/config boundary introduced.
- [x] Settings components read product copy from the skin module.
- [x] Boundary test covers the skin module and representative settings consumers.
- [x] Main host permission copy reads from the main skin/config boundary.
- [x] Browser and macOS automation permission services consume injected host skin copy.
- [x] Remaining OS permission services consume injected host skin copy.
- [x] Query failure/interruption event builders consume injected host skin copy.
- [x] SDK agent name and tray tooltip read product identity from the host skin.
- [x] MCP client identity reads product identity from the host skin on the app path.
- [x] Layer log product prefix reads product identity from the host skin on app/script paths.
- [x] Bundled wakeword and sidecar reinstall guidance reads from the host skin on app paths.
- [x] Local browser warmup and OAuth callback copy reads from the host skin on app paths.
- [x] SDK deep modules keep unused internal helpers private.
- [x] Renderer voice capture internals use generic naming.
- [x] SDK default agent display names are generic unless hosts pass product identity.
- [x] Docs/changelog updated.
- [x] Targeted validation recorded.
- [x] Fresh design inspection completed after the slice.

## Validation Log

- `npm.cmd test -- --runTestsByPath ../tests/frontend/RendererSkinConfigBoundary.test.cjs ../tests/frontend/AgentSettingsTab.test.jsx ../tests/frontend/GeneralSettingsTab.test.jsx` passed.
- `git diff --check` passed.
- `rg -n "WindieOS|Windie Browser|hosted WindieOS backend|Local sidecar tools|No sidecar plugins loaded|execution_target \|\| 'sidecar'|Opening…" frontend/src/renderer/features/dashboard/components/sections/settings tests/frontend/RendererSkinConfigBoundary.test.cjs frontend/src/renderer/app/skin/windieDesktopSkin.js` found expected skin/test matches plus the out-of-scope memory action message.

- `npm.cmd test -- --runTestsByPath ../tests/frontend/RendererSkinConfigBoundary.test.cjs ../tests/frontend/MemorySection.test.jsx ../tests/frontend/AgentSettingsTab.test.jsx ../tests/frontend/GeneralSettingsTab.test.jsx` passed.
- `git diff --check` passed.
- `rg -n "WindieOS|Windie Browser|Connect WindieOS|WindieOS builds understanding|Memories will appear as you interact with WindieOS|Search memories\\.\\.\\.|Delete saved episodic interaction|Delete saved chat transcripts|Failed to complete destructive action|Failed to load memories" frontend/src/renderer/features/dashboard/components/sections frontend/src/renderer/app/skin/windieDesktopSkin.js tests/frontend/RendererSkinConfigBoundary.test.cjs` found expected skin/test matches only.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/RendererSkinConfigBoundary.test.cjs ../tests/frontend/FrontendOnboardingSlideshow.test.jsx ../tests/frontend/ChatMessageSender.test.tsx ../tests/frontend/ChatInterfaceWiring.test.jsx ../tests/frontend/DesktopLiveTurnRuntimeClient.test.ts` passed.
- `git diff --check` passed.
- `rg -n "WindieOS onboarding|Start WindieOS|Welcome to WindieOS Demo|WindieOS isn't connected|WindieOS could not prepare|WindieOS runtime|WindieOS is still loading|WindieOS could not find" frontend/src/renderer tests/frontend/RendererSkinConfigBoundary.test.cjs` found expected boundary-test matches only.
- `rg -n "WindieOS|Windie Browser|Welcome to WindieOS|WindieOS Demo|WindieOS isn't connected|WindieOS could not|Start WindieOS|WindieOS onboarding|WindieOS runtime" frontend/src/renderer -g "*.js" -g "*.jsx" -g "*.ts" -g "*.tsx"` found only the skin plus voice/audio implementation identifiers and comments.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/MainHostSkinBoundary.test.cjs ../tests/frontend/PermissionIpcRuntime.test.cjs` passed.
- `git diff --check` passed.
- `rg -n "WindieOS local backend|Click Grant to install Chromium|Reinstall WindieOS|Failed to open the WindieOS browser|WindieOS could not verify macOS Automation|WindieOS could not request macOS Automation" frontend/src/main/index.cjs frontend/src/main/app/main_host_skin.cjs tests/frontend/MainHostSkinBoundary.test.cjs` found expected skin/test matches only.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/MainHostSkinBoundary.test.cjs ../tests/frontend/PermissionService.test.cjs ../tests/frontend/PermissionIpcRuntime.test.cjs` passed.
- `git diff --check` passed.
- `rg -n "WindieOS|WindieOS browser|enable WindieOS under System Events" frontend/src/main/permissions/permission_service_browser.cjs frontend/src/main/permissions/permission_service_automation.cjs frontend/src/main/app/main_host_skin.cjs tests/frontend/MainHostSkinBoundary.test.cjs` found expected skin/test matches only.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/MainHostSkinBoundary.test.cjs ../tests/frontend/PermissionService.test.cjs ../tests/frontend/PermissionIpcRuntime.test.cjs` passed.
- `git diff --check` passed.
- `rg -n "WindieOS|WindieOS browser|enable WindieOS|Select workspace folder for WindieOS" frontend/src/main/permissions frontend/src/main/app/main_host_skin.cjs tests/frontend/MainHostSkinBoundary.test.cjs tests/frontend/PermissionService.test.cjs` found expected skin/test fixture matches only.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/MainHostSkinBoundary.test.cjs ../tests/frontend/IpcQueryRuntime.test.cjs ../tests/frontend/IpcMainBridge.query.test.cjs ../tests/frontend/ChatMessageSender.test.tsx` passed.
- `rg -n "WindieOS isn't connected|WindieOS lost connection|Your message wasn't sent because WindieOS" frontend/src/main/ipc frontend/src/main/app/main_host_skin.cjs tests/frontend/MainHostSkinBoundary.test.cjs tests/frontend/IpcQueryRuntime.test.cjs` found expected test fixture matches only.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/MainHostSkinBoundary.test.cjs ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs ../tests/frontend/MainWindowRuntime.test.cjs ../tests/frontend/MainProcessBootstrapRuntime.test.cjs` passed.
- `rg -n "name: 'WindieOS'|tray\\.setToolTip\\('WindieOS'\\)|setToolTip\\('WindieOS'\\)|sdkAgentName|trayTooltip" frontend/src/main tests/frontend/MainHostSkinBoundary.test.cjs tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs tests/frontend/MainWindowRuntime.test.cjs` found expected skin/test matches plus the deferred MCP default.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/McpRuntime.test.cjs ../tests/frontend/McpControl.test.cjs ../tests/frontend/MainHostSkinBoundary.test.cjs ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs` failed only in `McpControl.test.cjs` because local `sqlite3` is unavailable for its diagnostics reader.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/McpRuntime.test.cjs ../tests/frontend/MainHostSkinBoundary.test.cjs ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs` passed.
- `git diff --check` passed.
- `rg -n "name: 'WindieOS'|mcpClientInfo|Desktop Agent|clientInfo: mainHostSkin.identity.mcpClientInfo" frontend/src/main tests/frontend/MainHostSkinBoundary.test.cjs tests/frontend/McpRuntime.test.cjs` found expected skin/test matches and generic MCP runtime default.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/LayerLogSink.test.cjs ../tests/frontend/MainWindowOverlayRuntime.test.cjs ../tests/frontend/MainWindowRuntime.test.cjs ../tests/frontend/MainProcessBootstrapRuntime.test.cjs ../tests/frontend/WindieRunLayerLog.test.cjs ../tests/frontend/WindieCli.test.cjs ../tests/frontend/MainHostSkinBoundary.test.cjs` failed only in `WindieCli.test.cjs` because local `sqlite3` is unavailable for its conversation export setup.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/LayerLogSink.test.cjs ../tests/frontend/MainWindowOverlayRuntime.test.cjs ../tests/frontend/MainWindowRuntime.test.cjs ../tests/frontend/MainProcessBootstrapRuntime.test.cjs ../tests/frontend/WindieRunLayerLog.test.cjs ../tests/frontend/MainHostSkinBoundary.test.cjs` passed.
- `git diff --check` passed.
- `rg -n "\\[WindieOS\\]|DEFAULT_LOG_PREFIX|logPrefix" frontend/src/main/logging/layer_log_sink.cjs frontend/src/main/app/main_host_skin.cjs frontend/src/main/index.cjs frontend/src/main/surfaces tests/frontend/MainHostSkinBoundary.test.cjs tests/frontend/LayerLogSink.test.cjs scripts/windie` found expected skin/script/test matches and generic log sink default.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WakewordBridgeRuntime.test.cjs ../tests/frontend/SdkSidecarLaunchOptions.test.cjs ../tests/frontend/MainWindowRuntime.test.cjs ../tests/frontend/MainHostSkinBoundary.test.cjs` passed.
- `rg -n "Reinstall WindieOS|Please reinstall WindieOS|Bundled Python runtime not found|Bundled wakeword executable|Please reinstall this app" frontend/src/main/wakeword frontend/src/main/sidecar/sdk_sidecar_launch_options.cjs frontend/src/main/app/main_host_skin.cjs tests/frontend/WakewordBridgeRuntime.test.cjs tests/frontend/SdkSidecarLaunchOptions.test.cjs tests/frontend/MainHostSkinBoundary.test.cjs` found expected skin/test matches plus generic helper fallbacks only.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/LocalBackendBridge.rpc.test.cjs ../tests/frontend/OpenAICodexOAuth.test.cjs ../tests/frontend/IpcOpenAICodexOAuthHandlers.test.cjs ../tests/frontend/MainWindowRuntime.test.cjs ../tests/frontend/MainHostSkinBoundary.test.cjs` passed.
- `rg -n "WindieOS|Return to WindieOS|Open the WindieOS browser|Windie Browser" frontend/src/main -g "*.cjs"` found only `main_host_skin.cjs`.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WindieSdkPrivateExports.test.cjs ../tests/frontend/WindieSdkPackageBoundary.test.ts` passed.
- `rg -n "summarizeAgentDefinitionCapabilities|compactedReplayFromEvent|normalizeWsUrl" packages/windie-sdk-js/src packages/windie-sdk-js/cjs tests/frontend -g "*.ts" -g "*.js" -g "*.cjs"` found those helpers only inside their owning modules plus the private-export boundary test.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/RendererSkinConfigBoundary.test.cjs ../tests/frontend/RendererVoiceRuntimeBoundary.test.ts ../tests/frontend/VoiceAudioProcessorNode.test.ts` passed.
- `rg -n "WindieOS|Windie Browser|Welcome to WindieOS|WindieOS Demo|Start WindieOS|WindieOS onboarding|WindieOS runtime|WindieOS isn't connected|WindieOS could not|WindieOS is still loading|windieos-capture-processor|WindieOSCaptureProcessor" frontend/src/renderer -g "*.js" -g "*.jsx" -g "*.ts" -g "*.tsx"` found only `windieDesktopSkin.js`.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WindieSdkClient.test.ts ../tests/frontend/WindieSdkPackageBoundary.test.ts` failed only in two existing local-runtime provider tests because their temporary `python-in-env` launcher was unavailable.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WindieSdkClient.test.ts ../tests/frontend/WindieSdkPackageBoundary.test.ts -t "buildAgentDefinition|auto-registers hosted install auth|package boundary"` passed.
- `rg -n "WindieOS Agent|Windie Agent|Desktop Agent|name: options.name|name: normalizeString" packages/windie-sdk-js/src/runtime/AgentDefinition.ts packages/windie-sdk-js/src/runtime/WindieClient.ts packages/windie-sdk-js/cjs/runtime/AgentDefinition.js packages/windie-sdk-js/cjs/runtime/WindieClient.js tests/frontend/WindieSdkClient.test.ts` found only the new generic defaults and tests.

## Remaining Findings

- Renderer product naming is now skin-owned in live renderer source. Fresh inspection found WindieOS product naming only in `windieDesktopSkin.js` under `frontend/src/renderer`.
- Main process composition root, permission services, query event builders, SDK agent name, tray tooltip, MCP client identity, layer-log prefixes, bundled wakeword/sidecar reinstall guidance, local browser warmup, and OAuth callback copy now read related product copy from a host skin. Fresh inspection found WindieOS product naming only in `main_host_skin.cjs` under `frontend/src/main`.
- Voice capture internals now use generic desktop-agent naming. The remaining
  renderer voice references are intentional feature/runtime names, not product
  skin copy.
- SDK default agent display names are generic (`Desktop Agent` from
  `buildAgentDefinition(...)`, `Agent` from `wakeUp(...)`) so host skin/config
  remains the product identity owner.
- SDK deep-module export cleanup is complete for the helpers covered by this
  slice: `normalizeWsUrl`, `summarizeAgentDefinitionCapabilities`,
  `compactedReplayFromEvent`, context-enrichment render helpers, tool-output
  content shapes, capability summaries, and internal diagnostic types are
  private behind their owning entrypoints. Broader public SDK API naming still
  intentionally uses Windie-branded class/type names.
