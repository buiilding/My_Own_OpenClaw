---
summary: "Renderer and Electron main SDK desktop transport command contract for DesktopRuntimeTransport, SDK_RUNTIME_COMMANDS, renderer app-runtime client inventory classification, windie:invoke conversation commands, canonical snake_case command contract fields, camelCase query payload alias rejection, and removed query-payload aliases."
read_when:
  - When changing `frontend/src/renderer/app/runtime/desktopRuntimeTransport.ts`, `DesktopLiveTurnRuntimeClient`, or renderer-to-main `windie:invoke` command payloads.
  - When changing `packages/windie-sdk-js/src/runtime/SdkRuntimeCommands.ts`, the SDK `SDK_RUNTIME_COMMANDS` export, renderer app-runtime facades that call `invokeAgentSdkCommand`, Electron main `handleAgentSdkInvoke`, its internal `buildAgentSdkCommandHandlers` table, or shared SDK-shaped command names.
  - When inventorying renderer app-runtime clients as real transport boundaries, state/rule facades, presentation/helper facades, forwarding-only adapters, or migration shims before deleting or widening one.
  - When resolving stale references to the removed renderer `windieCommandInvokeClient.ts` file or `invokeWindieCommand(...)` helper; the current generic renderer helper is `agentSdkCommandInvokeClient.ts` and `invokeAgentSdkCommand(...)`.
  - When resolving stale references to the removed `handleWindieSdkInvoke` or `buildWindieSdkCommandHandlers` helper names; the current generic Electron-host helper names are `handleAgentSdkInvoke` and `buildAgentSdkCommandHandlers`.
  - When searching for main ipc buildWindieSdkCommandHandlers SDK_RUNTIME_COMMANDS conversation.send command-shape routing; this transport contract is the current owner.
  - When debugging removed camelCase query payload aliases, snake_case command contract fields, `conversation.send`, `conversation.stop`, `conversations.list`, `memories.list`, `diagnostics.append`, or typed SDK dispatch between renderer facades and Electron main.
title: "SDK Desktop Transport Command Contract Reference"
---

# SDK Desktop Transport Command Contract Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopRuntimeTransport.ts`
- `frontend/src/renderer/app/runtime/desktopActiveChatSessionRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopAppConfigRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopAudioRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopAttachmentPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopComposerAttachmentRuntime.js`
- `frontend/src/renderer/app/runtime/desktopClientSessionRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopConversationRuntimeEventClient.ts`
- `frontend/src/renderer/app/runtime/desktopDevUiRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatStreamEventPayloadRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamModelContextRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamMessageUpdateRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatSurfaceSelectorRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatboxLayoutRuntime.js`
- `frontend/src/renderer/app/runtime/desktopNewChatSessionRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayLayoutRuntime.js`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayPhaseRuntime.js`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayViewRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopToolGhostRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopModelSelectionRuntime.js`
- `frontend/src/renderer/app/runtime/desktopModelCardPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopProviderCredentialRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMemoryRetrievalPreferenceRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMemoryPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopDashboardNavigationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopDashboardConversationLoadRuntime.js`
- `frontend/src/renderer/app/runtime/desktopDashboardConversationGroupRuntime.js`
- `frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopRendererHooksRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopAppearanceThemeRuntime.js`
- `frontend/src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js`
- `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js`
- `frontend/src/renderer/app/runtime/desktopSettingsUpdateErrorRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopSettingsTabRuntime.js`
- `frontend/src/renderer/app/runtime/desktopRendererTraceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopStreamPhaseRuntime.js`
- `frontend/src/renderer/app/runtime/desktopAttachmentImageRuntime.js`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioEncodingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioCaptureCleanupRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioInputDeviceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioProcessorNodeRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopWakewordEventRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopWakewordCaptureGuardRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceDebugTraceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopLiveSurfaceTraceRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopPendingTurnRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopWindowRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopWorkspaceRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopPermissionGrantEffectsRuntime.js`
- `frontend/src/renderer/app/runtime/desktopPermissionPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopOnboardingSlideRuntime.js`
- `frontend/src/renderer/app/runtime/agentSdkCommandInvokeClient.ts`
- `packages/windie-sdk-js/src/runtime/SdkRuntimeCommands.ts`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/ipc/ipc_query_send_runtime.cjs`
- `tests/frontend/DesktopRuntimeTransport.test.ts`
- `tests/frontend/DesktopLiveTurnRuntimeClient.test.ts`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/IpcQueryRuntime.test.cjs`

## Boundary

`desktopRuntimeTransport.ts` is the renderer-side adapter from SDK-style
conversation runtime calls into the main-process `windie:invoke` command
surface. The module exposes `DesktopRuntimeTransport` as the app-runtime facade;
its `createDesktopRuntimeTransport(...)` factory stays private to the facade so
callers import the runtime owner instead of a standalone helper export.

Renderer runtime facades and Electron main import command names from the SDK
package `SDK_RUNTIME_COMMANDS` export. The SDK package owns the string
constants so first-party renderer facades, main-process handler keys, and
non-renderer SDK callers use one command vocabulary instead of duplicating
literals in each facade or IPC handler map. There is no exported
`SdkRuntimeCommand` type alias; callers that need a command-name union should
derive it from `SDK_RUNTIME_COMMANDS` locally.

`desktopRuntimeTransport.ts` calls:

- `conversation.send`
- `conversation.stop`
- `conversation.rehydrate`
- `conversation.compact`
- `wakeword.detected`
- `settings.update`
- `models.list`

Other desktop renderer facades use the same SDK export for SDK library,
transcript, memory, and diagnostics commands such as
`conversations.list`, `conversation.loadDisplay`, `memories.list`,
`memories.delete`, `conversations.clearAll`, and `diagnostics.append`.
Those SDK-shaped library commands use canonical SDK object fields such as
`userId`, `conversationRef`, `messageId`, and `turnRef`; removed snake_case
input aliases such as `user_id`, `conversation_ref`, `message_id`, and
`turn_ref` are rejected at the Electron main validation boundary. Query
transport commands are separate and keep the backend transport payload contract
described below.

Electron main exports `handleAgentSdkInvoke(...)` as the `windie:invoke`
boundary. Its internal command table uses those same `SDK_RUNTIME_COMMANDS`
members as computed handler keys. The string values remain the wire contract on
`windie:invoke`, but the helper itself takes generic Electron-host dependencies
such as `ensureAgent`; the source of truth for adding or renaming a supported
SDK-shaped command is
`packages/windie-sdk-js/src/runtime/SdkRuntimeCommands.ts`.

## Renderer App-Runtime Client Inventory

Use this inventory before deleting or widening a renderer app-runtime client.
The label describes why the file exists today, not a permanent promise that it
must stay forever.

| File(s) | Classification | Why it remains | Cleanup signal |
| --- | --- | --- | --- |
| `agentSdkCommandInvokeClient.ts`, `desktopRuntimeTransport.ts`, `desktopLiveTurnRuntimeClient.ts`, `desktopSettingsRuntimeClient.ts`, `desktopMemoryRuntimeClient.ts`, `desktopConversationLibraryClient.js` | Real SDK-command boundary | These are renderer adapters into `windie:invoke` / SDK-shaped commands. They hide bridge lookup, command names, and result shape from feature code. | Delete only after the generic SDK UI package receives an injected `AgentRuntimeTransport` that callers use directly without importing Electron bridge details. |
| `desktopPendingTurnRuntimeClient.ts`, `desktopLiveSurfaceTraceRuntimeClient.ts`, `desktopConversationRuntimeEventClient.ts`, `desktopClientSessionRuntimeClient.ts`, `desktopAppConfigRuntimeClient.ts`, `desktopTranscriptSessionInfoRuntimeClient.js`, `desktopWindowRuntimeClient.ts`, `desktopResponseOverlayRuntimeClient.ts`, `desktopArtifactRuntimeClient.ts`, `desktopAudioRuntimeClient.ts`, `desktopVoiceRuntimeClient.ts`, `desktopWorkspaceRuntimeClient.ts`, `desktopPermissionRuntimeClient.ts`, `desktopMcpRuntimeClient.ts`, `desktopExtensionRuntimeClient.ts` | Real Electron-host adapter boundary | These clients own renderer access to Electron main channels, Electron host events, native windows, local runtime status, artifacts, permissions, MCPs, extensions, audio, and voice. Feature code keeps UI policy and should not import channel constants or host-shaped registry payload fields directly. | Widen or split only when one client mixes unrelated host capabilities; delete only when the capability moves behind a generic injected host adapter with equivalent tests. |
| `desktopActiveChatSessionRuntime.ts`, `desktopConversationSessionRuntime.ts`, `desktopConversationSessionRuntimeClient.ts`, `desktopTranscriptSessionRuntime.ts`, `desktopTranscriptSessionRuntimeClient.ts`, `desktopNewChatSessionRuntime.ts`, `desktopChatStreamIngressRuntime.ts`, `desktopChatStreamEventRuntime.ts`, `desktopChatStreamEventPayloadRuntime.ts`, `desktopChatStreamModelContextRuntime.ts`, `desktopChatStreamMessageUpdateRuntime.ts`, `desktopChatStreamTurnGuardRuntime.ts`, `desktopChatStreamTrackingRuntime.ts`, `desktopChatStreamTerminalHandoffRuntime.ts`, `desktopSdkLiveTurnEffectsRuntime.ts`, `desktopChatStreamThinkingRuntime.ts`, `desktopManualCompactionRuntime.js`, `desktopChatSendPreparationRuntime.ts`, `desktopChatSendPayloadRuntime.ts`, `desktopChatSendStateRuntime.ts`, `desktopChatSurfaceSelectorRuntime.ts`, `desktopMemoryRetrievalPreferenceRuntime.js`, `desktopMemoryPresentationRuntime.js`, `desktopDashboardNavigationRuntime.js`, `desktopDashboardConversationLoadRuntime.js`, `desktopDashboardConversationGroupRuntime.js`, `desktopAppearanceThemeRuntime.js`, `desktopRendererConfigFilterRuntime.js`, `desktopRendererConfigStorageRuntime.js`, `desktopSettingsUpdateErrorRuntime.ts`, `desktopSettingsTabRuntime.js`, `desktopVoiceAudioEncodingRuntime.ts`, `desktopVoiceAudioCaptureCleanupRuntime.ts`, `desktopVoiceAudioInputDeviceRuntime.ts`, `desktopVoiceAudioProcessorNodeRuntime.ts`, `desktopWakewordEventRuntime.ts`, `desktopWakewordCaptureGuardRuntime.ts`, `desktopVoiceDebugTraceRuntime.ts`, `desktopConversationContinuityService.ts`, `desktopConversationDisplayProjection.ts`, `desktopConversationReplayRuntime.js`, `desktopConversationRuntimeContracts.ts`, `desktopChatLoopUiRuntime.js`, `desktopCurrentTurnPresentationRuntime.js`, `desktopToolGhostRuntime.ts`, `desktopStreamPhaseRuntime.js`, `desktopChatPillSessionRuntime.ts`, `desktopMessageSendUiRuntime.ts`, `desktopModelSelectionRuntime.js`, `desktopModelCardPresentationRuntime.js`, `desktopChatModelOptionsRuntime.js`, `desktopModelThinkingRuntime.ts`, `desktopStopTurnRuntime.js`, `desktopPermissionGrantEffectsRuntime.js`, `desktopPermissionPresentationRuntime.js`, `desktopOnboardingSlideRuntime.js` | State/rule facade | These files centralize active chat reset, conversation identity, transcript binding, current renderer session-info projection and empty fallback, new-chat local conversation creation and workspace binding, stream ingress, stale-turn guards, terminal handoff, stream local-user text/content alias resolution, stream terminal/error/screenshot/compaction payload and compaction failure error-text normalization, shared settings-update failure classification, settings tab descriptors, stream model/provider context typing, stream message targeting/metadata update payload normalization, SDK live-turn side effects, stream thinking/compaction labels, manual compaction command orchestration, chat send preflight, pending-turn acceptance, SDK turn resource assembly, live-turn dispatch, chat send payload normalization, first-user-message send predicates, shared chat surface state projection, memory retrieval preference persistence, `DesktopMemoryPresentationRuntime` dashboard memory row projection/search policy, dashboard sidebar navigation descriptors, `DesktopDashboardConversationLoadRuntime` recent-conversation metadata projection/normalization/retry policy, dashboard time/workspace grouping and search metadata normalization, renderer appearance theme normalization/system matching/document token application, renderer app-config allowlisting and local persistence defaults, voice audio encoding/framing/capture cleanup/input-device adapters/processor construction, wakeword event normalization, wakeword missing-device guard state, voice debug tracing, continuity, display projection and renderer annotation merge, replay row selection, replay tool-message pairing and replay payload/turn shaping, chat loop UI state, current-turn presentation state, debug tool-ghost timing, stream phase predicates, chat-pill send/view intent, send-surface UI policy, selected-model reconciliation, dashboard model-card/provider projection, `DesktopChatModelOptionsRuntime` provider/model/reasoning option projection, model-catalog thinking capability resolution, `DesktopStopTurnRuntime` target/source classification and terminal projection state, permission post-grant config effects, permission status/presentation mapping, onboarding slide-index/slide-kind derivation, and shared contracts that would otherwise be duplicated across chat, dashboard, onboarding, settings, and provider surfaces. | Delete only after the rule is owned by the SDK projection, a generic chat package, a generic dashboard package, a generic voice package, a generic permission package, or a generic theme package and all renderer consumers stop carrying duplicate session-info/session/model-selection/model-capability/dashboard-memory/dashboard-sidebar-nav/dashboard-model-card/dashboard-retry/dashboard-grouping/settings-tab/appearance-theme/voice-capture/wakeword-guard/tool-ghost-timing/stop-turn/permission-effect/permission-presentation/onboarding-slide logic. |
| `desktopProviderCredentialRuntime.js` | State/rule facade | Owns skin-configured provider API-key spec access, fixed provider-key entry normalization, and renderer-persistence secret stripping shared by dashboard API-key controls and config storage. | Delete only after provider credential normalization moves into a generic settings package or SDK projection and renderer consumers no longer duplicate provider-key rules. |
| `desktopChatEvents.js`, `desktopDashboardLayoutRuntime.js`, `desktopChatMessageTypes.ts`, `desktopChatMessageRuntimeClient.ts`, `desktopCurrentTurnMessageRuntime.js`, `desktopLiveTurnSurfaceRuntime.js`, `desktopThreadPresentationRuntime.js`, `desktopPresentationSourceChannels.js`, `desktopMessageContentRuntime.js`, `desktopMessageClassRuntime.js`, `desktopMessageInputRuntime.js`, `desktopMessageListRuntime.js`, `desktopAttachmentImageRuntime.js`, `desktopMessageSourceTagRuntime.js`, `desktopMessageTransparencyRuntime.js`, `desktopMessageTokenUsageRuntime.js`, `desktopMarkdownMessageRuntime.js`, `desktopMarkdownRuntimeClient.ts`, `desktopThreadFindRuntime.js`, `desktopTranscriptionRegionRuntime.ts`, `desktopChatboxLayoutRuntime.js`, `desktopAttachmentPresentationRuntime.js`, `desktopComposerAttachmentRuntime.js`, `desktopResponseOverlayLayoutRuntime.js`, `desktopResponseOverlayPhaseRuntime.js`, `desktopResponseOverlayViewRuntime.ts` | Presentation contract/helper facade | These keep renderer-only chat events behind `DesktopChatEventsRuntime`, dashboard layout resize pulses plus dashboard shell opening/scroll-lock browser adapters behind `DesktopDashboardLayoutRuntime`, message kinds, markdown/output normalization, markdown message render models, `DesktopThreadFindRuntime` thread-find match projection, transcription-region edit reconciliation, SDK current-turn message projection, live-turn surface state, durable-thread/live-row presentation including SDK presentation-entry precedence and SDK live-turn fallback rows, presentation-source strings, message content render kinds, message row classes, outgoing message payload normalization, message-list scroll/action/thinking-update/compaction state, typed attachment descriptors and async artifact image source resolution, source/thinking badge presentation, source tag labels, transparency section descriptors/render models, dev token usage labels, shared chatbox layout, window-position, and drag-state rules, attachment preview labels, composer data URL/clipboard/file attachment parsing, response-overlay layout/frame helpers, response-overlay phase enums, and response-overlay view intent resolution out of individual components while the renderer UI is still being separated from the WindieOS skin. | Delete only when the generic chat desktop UI package owns the presentation/layout contract and WindieOS skin/config imports it as a stable package API. |
| `desktopRendererConfigRuntimeClient.js`, `desktopRendererHooksRuntimeClient.ts`, `desktopRendererTraceRuntime.ts`, `desktopShortcutRuntimeClient.ts`, `desktopStartupRuntimeClient.ts`, `desktopRuntimeEndpointClient.ts`, `desktopLocalRuntimeStatusRuntimeClient.ts`, `desktopBrowserSessionRuntimeClient.js`, `desktopInteractionRuntimeClient.ts`, `desktopAppProviderRuntime.js`, `desktopDevUiRuntime.js` | Forwarding/helper facade with current boundary value | These are thin on purpose: they keep feature modules from importing app providers, renderer infrastructure, global env, browser/session stores, diagnostics installers, startup root-element lookup, startup surface selection, startup/view query parsing, URL-query dev flags, provider listener/timer adapters, or debug trace channel clients directly. | Treat as deletion candidates only after the caller receives dependency injection from the generic UI package or app shell. Do not delete a helper merely because it forwards. |
| `desktopStorageRuntimeClient.js` | Removed forwarding-only adapter | This file only re-exported JSON localStorage helpers and its sole production caller was another app-runtime module, not feature code. `desktopPermissionOnboardingStorageRuntime.js` now owns the permission-onboarding storage boundary and imports the storage helper directly. | Do not reintroduce. New feature code should consume a purpose-named app-runtime owner instead of a generic localStorage forwarding facade. |
| Historical `DesktopAgent*`, `windieCommandInvokeClient.ts`, `invokeWindieCommand(...)`, `DesktopBackendCommandRuntimeClient`, renderer `BackendTransport` aliases | Removed migration shims | These names described historical product/backend ownership rather than the current generic SDK host-UI and Electron host boundary. | Do not reintroduce. Stale searches should route here or to the specific runtime client above. |

No current app-runtime client is a verified deletion target just because it is
thin. A cleanup slice should first name the consumer, prove the replacement
owner, update tests, and remove exactly one obsolete path.

`DesktopChatSendPreparationRuntime` owns renderer chat send preflight,
pending-turn acceptance, SDK turn resource assembly, workspace binding, and
live-turn dispatch. Chat feature hooks inject the chat-store state callbacks it
needs instead of letting the app-runtime module import feature store internals.

`DesktopChatSurfaceSelectorRuntime` owns shared chat surface projection rules
consumed by the chat interface and minimal response overlay. The chat store
exposes feature-facing selectors while delegating reusable projection
shape to the app-runtime facade.

`desktopMemoryRetrievalPreferenceRuntime.js` owns the renderer persisted toggle
for SDK memory retrieval injection. Dashboard memory settings and query-send
runtime clients consume this facade instead of sharing a root renderer utility.

`desktopMemoryPresentationRuntime.js` owns dashboard memory row projection,
semantic summary/facts parsing, episodic assistant-response extraction, runtime
memory delete routing fields, procedural placeholder rows, active-type fallback,
and search matching policy. `MemorySection` keeps panel state, fetch
orchestration, delete actions, and rendering while consuming projected rows
from the app-runtime facade instead of section-local data helpers.

`DesktopModelCardPresentationRuntime` owns dashboard model-card projection,
provider display fallback consumption through the renderer skin config, context
hint formatting, thinking/recommended badges, provider label normalization, and
provider-card grouping. `ModelsSection` keeps provider drilldown, hover state,
selection side effects, catalog refresh, model-reset warning state, and API-key
rendering while consuming projected card rows from the app-runtime facade.
`DesktopModelSelectionRuntime` owns selected-model reconciliation and the
browser timer adapter used to clear missing-model reset warnings instead of
leaving timeout calls in the section.

`desktopStartupRuntimeClient.ts` owns renderer startup query parsing for VM
mode, default startup surface selection, entrypoint `view` routing, React
root-element lookup, and initial wakeword suppression seeding. `main.jsx`, `App.jsx`, and
`AppConfigProvider` consume this facade instead of reading raw
`document.getElementById(...)`, `window.location.search`, or importing the
VM-mode helper directly.

`desktopProviderCredentialRuntime.js` owns renderer provider API-key entry
normalization, skin-configured API-key specs, and renderer-persistence secret
stripping through `DesktopProviderCredentialRuntime`. Dashboard API-key
controls and local config storage consume this runtime facade instead of
duplicating fixed provider-key rules under a section helper.

`desktopDashboardConversationLoadRuntime.js` owns recent-conversation row
normalization, row identity/title helpers, pinned-reference pruning, row
rename/delete/pin list updates, bounded retry policy, SDK conversation event
classification for recent-list reload/title-poll actions, and title-visibility
poll schedule/visibility rules. `useDashboardConversations` keeps dashboard
state, search, timer side effects, open/delete handlers, and grouping
orchestration while delegating reusable list-load, row-update, pin-state, and
title-poll rules to this app-runtime facade.

`desktopDashboardConversationGroupRuntime.js` owns dashboard conversation
time-bucket descriptors, time-bucket and workspace grouping rules, including
title fallbacks, pinned ordering, search metadata normalization, group display
labels, matched-role labels, and search snippet matched-role prefix display.
`useDashboardConversations` keeps state and actions while delegating reusable
grouping and search-row presentation policy to this app-runtime facade instead
of a feature utility or modal-local prefix comparison.

`DesktopToolGhostRuntime.getToolGhostClickSyncDelayMs(...)` owns the debug
tool-ghost click animation timing used by `ToolGhostDebugApp`, and
`DesktopToolGhostRuntime` owns the browser timer schedule/clear adapters for
the debug hide/restart loop. The debug app keeps rendering, visibility, and
run-token lifecycle state, while reusable timing and timer-adapter helpers stay
in the app-runtime facade instead of the chat feature constant tree, raw browser
calls, or standalone helper exports.

`desktopAppearanceThemeRuntime.js`, `desktopRendererConfigFilterRuntime.js`,
and `desktopRendererConfigStorageRuntime.js` own renderer-managed appearance
theme application, settings allowlisting, and local app-config persistence
defaults. App config providers consume these app-runtime facades instead of
root renderer utilities or standalone theme helpers.

`desktopShortcutRuntimeClient.ts` owns renderer shortcut labels, supported
global-stop shortcut options, shortcut accelerator normalization, focused-window
stop-key matching, and global-stop shortcut status presentation values for
fallback and registration-failure notices. It also resolves whether a shortcut
status snapshot contains a persistable fallback accelerator. General settings
keeps rendering, copy, and config-patch behavior while consuming shortcut
status presentation from this runtime client; app config provider keeps state
and persistence orchestration while consuming fallback accelerator values
instead of reading raw shortcut status fields.

`desktopPendingTurnRuntimeClient.ts` owns the renderer adapter for the desktop
pending-turn IPC send channel. Chat hooks and message-send utilities update
their local store state, then call this runtime client instead of importing
desktop IPC channel constants directly.

`desktopLiveSurfaceTraceRuntimeClient.ts` owns the renderer adapter for the
live-surface trace IPC send channel. Chat stream debug utilities decide whether
to emit diagnostics and build redacted payloads, then call this runtime client
instead of importing desktop IPC channel constants directly.

`DesktopRendererTraceRuntime` owns renderer debug-trace gating, workspace
snapshot enrichment, response-surface stream-trace envelope logging,
chat-pill state trace field shaping, response-overlay state/render trace field
shaping, and response-overlay size trace field shaping. Minimal chat-pill state effects pass value-level `conversationRef`,
`turnRef`, `currentTurnPhase`, `liveTurnPhase`, `liveTurnSource`,
`busy`, `stopAvailable`, and `messageCount` inputs; the trace
runtime maps those values to diagnostic `conversation_ref`, `turn_id`,
`current_turn_phase`, `live_turn_phase`, `live_turn_source`, `busy`,
`stop_available`, and `message_count` fields. Minimal response-overlay
state/render effects pass value-level phase, response, visibility, layout,
entry-count, text-length, and message-count inputs; the trace runtime
maps those values to the existing response-surface diagnostic fields. Response
overlay hooks pass value-level `layoutMode`, `responseVisible`, `thinkingText`,
`compactHover`, `turnRef`, and `staleGuardRef` inputs; the trace runtime maps
those values to diagnostic `layout_mode`, `response_visible`,
`thinking_text_length`, `compact_hover`, `turn_ref`, and `stale_guard_ref`
fields.

`desktopWindowRuntimeClient.ts` owns renderer adapter calls for desktop window
commands used by generic runtime flows, such as restoring the chatbox after
overlay-origin sends, applying startup surface visibility, handling wakeword
chatbox restore, main-window controls, and minimal chatbox overlay focus, drag,
hit-test, visual-anchor, text-entry, hide/show commands, and main-window
open-target fan-out plus open-target payload normalization. It assembles
chatbox/main-window visibility option payloads from value-level focus,
maximize, open-target, and reason inputs. It also owns chatbox visual-anchor
height payload assembly from value-level height and optional frame-height
inputs, chatbox hit-test payload assembly from boolean active-state inputs, and
chatbox text-entry activation payloads from value-level reason inputs. Callers
keep UI policy and call this runtime client instead of importing window IPC
channel constants, parsing host-shaped window event payloads directly, or
assembling native window payload objects.

`desktopResponseOverlayRuntimeClient.ts` owns renderer response overlay window
IPC for responsebox size, hit-test, visibility fan-out, visibility payload
normalization, boolean visibility subscription projection, responsebox size
payload assembly from value-level size/turn/guard/hover/dismissal inputs, and
responsebox hit-test payload assembly from boolean active-state inputs.
Response overlay view-model/window-sync hooks keep overlay selection,
stale-turn, sizing, re-report, and scroll policy while delegating responsebox
channel names and host-shaped visibility/size/hit-test payloads to this app
runtime client.

`desktopArtifactRuntimeClient.ts` owns renderer adapter calls for desktop
artifact image commands used by generic message presentation, including
authenticated artifact image fetches and native image context-menu actions.
Message screenshot resolution and user screenshot presentation keep only display
policy and call this runtime client instead of importing artifact IPC channel
constants directly.

`desktopAppConfigRuntimeClient.ts` owns renderer config disk persistence and
settings-event fan-out/normalization for app-level config/status providers.
It classifies settings-update failure events into normalized status fields so
providers do not import config persistence, settings-event channel constants,
or host-shaped settings error payload details directly. It also exposes
value-level save-status actions so `AppStatusProvider` owns timer/state
transitions without switching on settings-event payload fields.

`desktopSettingsEventRuntimeClient.ts` owns model-list settings-event handler
state and raw `models-listed` type dispatch via
`DesktopSettingsEventRuntimeClient.routeDesktopSettingsEvent(...)` so
`AppConfigProvider` does not parse raw settings-event `type` values directly.

`desktopClientSessionRuntimeClient.ts` owns renderer adapter calls for the
Electron client/session snapshot and IPC transport status subscription, including
user id normalization while preserving endpoint metadata. It exposes the full
normalized snapshot for callers that need metadata, a direct session-user helper
for dashboard fallback state, a transport-status view that normalizes raw
`isConnected` payloads into `{ isConnected, hasConnectionState }`, and
observed-connection helpers that filter snapshots without a boolean connection
field and emit boolean connection values before chat-loop recovery consumes
them. It also exposes app-config IPC status values that pair the preserved
snapshot with normalized transcript user id, connection, and global stop
shortcut status fields.
Chat session bootstrap, loop transport projection, dashboard user snapshot
fallback, and app config runtime snapshot handling call this runtime client
instead of importing `get-client-user-id` or `ipc-status` channel constants,
trimming raw snapshot fields, or deciding raw connection/shortcut field
validity directly.

`desktopWorkspaceRuntimeClient.ts` owns workspace-access update fan-out, live
workspace payload normalization, host-source classification such as
`isWorkspacePickerSelection`, and value-level workspace selection helpers for
chat and settings surfaces, including active-workspace selection equality,
empty selection defaults, and selected-workspace display presentation. Chat
owns active-workspace refresh and conversation binding policy; workspace
settings owns active workspace row layout and folder selection while consuming
workspace values and display text from this runtime client instead of reading
normalized workspace result/event envelopes or raw workspace name/path fields.

`desktopMemoryRuntimeClient.ts` owns SDK-shaped memory list/delete/clear
commands, active-user resolution for destructive memory settings actions, and
the desktop memory-store change fan-out. Dashboard memory UI owns tabs, search,
normalization, and delete presentation while delegating memory runtime
commands, active-user sentinel handling, and refresh subscriptions to this
client. `desktopMemorySettingsDialogRuntime.js` owns browser confirmation for
destructive memory settings actions so the settings hook stays on runtime
intent and status orchestration.

`desktopMcpRuntimeClient.ts` owns desktop MCP registry list, refresh,
enablement commands, MCP registry payload normalization, enablement result
normalization, registry-or-error projection, and MCP server card/status
presentation values such as display name, enablement id, enabled state, status
label/class/text, debug spec, and registry error key/text values. The MCP
dashboard section owns rendering, load/refresh/toggle state, and error display
while consuming normalized registries, presentation values, and runtime-thrown
enablement errors from this client instead of formatting raw registry error
fields.

`desktopExtensionRuntimeClient.ts` owns extension metadata loading, extension
runtime payload normalization, and agent capability event fan-out/type
classification into normalized `manifestStatus` and `remoteToolCatalog` fields
plus direct manifest/catalog update callbacks and remote-tool catalog
availability presentation plus extension runtime error presentation for
settings UI. It also owns local/remote tool enabled-state and config-patch
helpers, local-tool manifest presentation lookup from accepted/rejected
manifest entries, and plugin metadata presentation for extension details,
including skill and MCP metadata debug projections. Agent settings owns
extension/tool layout and manifest/catalog display state while delegating the
desktop event, metadata channels, tool-toggle disabled-list interpretation,
remote-tool availability field interpretation, extension diagnostic error
formatting, local-tool manifest status lookup, plugin
permission/settings-panel/tool/config-schema display projection, and raw
skill/MCP metadata shaping to this client instead of reading normalized event,
catalog, manifest, plugin, skill, MCP, or error fields.

`desktopRendererHooksRuntimeClient.ts` owns renderer app-runtime access to
shared React hook helpers such as `useLatestRef`. App providers and feature
hooks keep their component/effect policy while importing shared hook helpers
through the `DesktopRendererHooksRuntimeClient` object instead of reaching into
renderer infrastructure directly or importing hook re-exports from a passive
barrel.

`desktopChatMessageRuntimeClient.ts` and `desktopMarkdownRuntimeClient.ts`
expose renderer chat-message builders, text/schema normalization, markdown,
find-highlight, and LLM output helpers through `DesktopChatMessageRuntimeClient`
and `DesktopMarkdownRuntimeClient` objects. Chat presentation runtimes and
message components depend on those named runtime clients rather than importing
individual helper re-exports, keeping helper ownership visible while the generic
chat UI package boundary is still being split from the WindieOS skin.

`desktopConversationRuntimeContracts.ts` preserves the renderer's SDK
conversation type exports while exposing concrete SDK values through
`DesktopConversationRuntimeContracts`. Renderer runtime clients use that object
for SDK command constants, continuity service construction, model settings
patches, and tool-correlation helpers instead of importing named value
re-exports from the contracts facade.

`desktopLocalRuntimeStatusRuntimeClient.ts` owns renderer access to shared
local-runtime status snapshots and value-level readiness subscriptions. Dashboard
recent-conversation reloads consume `onReady(...)` so dashboard code owns the
reload side effect without reading raw status snapshot `ready` fields.

`desktopPermissionRuntimeClient.ts` owns renderer permission list, probe,
request, and batch-check commands, including result-envelope resolution into
manifest/status values or runtime-thrown errors and permission status
normalization into id-indexed value maps. `permissionStore` owns gate
derivation, onboarding persistence, and action errors while delegating desktop
permission transport and raw status field parsing to this client.

`DesktopPermissionGrantEffectsRuntime` owns renderer post-grant permission
effects that update app config, such as enabling browser automation after the
dedicated browser capability is granted, and external-grant watch policy for
permissions that require a follow-up probe after the OS settings surface opens.
Onboarding and settings UI pass permission status plus config updater callbacks
into this runtime facade instead of keeping cross-surface config side effects or
raw permission status-field checks under the permissions feature.

`DesktopPermissionPresentationRuntime` owns renderer permission status and
presentation mapping shared by onboarding and settings: access-kind labels,
granted labels, action-label defaults, granted-status normalization, and badge
pill label/class projection from either a status value or a full status object.
It also normalizes permission status detail presentation such as reason text,
status class names, remediation text, and permission manifest entry lookup with
fallback values plus permission-status map lookup by id for focused settings
rows. Permission surfaces import this app-runtime facade instead of reaching
into another feature's utility folder, scanning raw permission ids, indexing
raw status maps, or reading raw status/detail fields directly.

`DesktopOnboardingSlideRuntime` owns the pure renderer onboarding slide-state
rules: permission-slide counts, active slide clamping, permission-vs-stop-slide
classification, and title/body copy selection. `DesktopOnboardingSlideshow`
keeps UI routing, controls, and rendering while delegating reusable startup
wizard state to this app-runtime facade instead of a feature utility.

`desktopConversationRuntimeEventClient.ts` owns renderer subscriptions for the
SDK conversation runtime fan-out channels: conversation events, pending turns,
current-turn projections, and display rows. It also normalizes pending-turn
broadcast envelopes into pending/clear actions, current-turn projection
envelopes into explicit projection events, and display-row payloads into
projection events before chat hooks consume them. `useChatStream`,
`useDashboardConversations`, and `useConversationRuntimeProjectionStream`
retain stale-turn policy, list refresh/title polling, projection side effects,
and pending-turn state application while `desktopConversationDisplayProjection.ts`
owns SDK display-row to chat-message projection plus renderer annotation and
optimistic-row merging. The feature hooks delegate channel names,
`IpcBridge.on(...)` calls, pending-turn broadcast classification, SDK projection
payload validation, and display-row merge semantics to app runtime clients.

`DesktopChatStreamEventPayloadRuntime` owns chat-stream payload alias
normalization for mutable renderer side effects, including local-user
`text`/`content` message text, terminal errors, token counts, compaction
metadata, and tool-schema metadata. Event handlers keep turn/workspace side
effects while consuming normalized payload fields from this runtime facade.

`DesktopActiveChatSessionRuntime` owns active chat-session reset behavior
shared by new-chat, dashboard conversation delete, and clear-chat flows. Chat
and dashboard modules pass their store setter callbacks into this runtime
helper so transcript/session reset policy does not live under either feature.

`DesktopModelSelectionRuntime` owns renderer selected-model reconciliation
and config patch shaping shared by chat model-option helpers and the dashboard
Models settings UI. Feature modules keep display, grouping, and control policy
while delegating model/provider fallback and mismatch rules to this app-runtime
state facade.

`desktopAudioRuntimeClient.ts` owns the renderer subscription to the untyped
backend `audio-chunk` side channel and validates that payload into normalized
audio chunks before chat code sees it. Chat interface bindings keep playback
queue policy while delegating channel subscription and payload parsing to this
app runtime client.

`desktopVoiceRuntimeClient.ts` owns renderer voice runtime commands and local
wakeword bridge IPC. Wakeword hooks keep capture lifecycle, cooldown,
thresholding, and local error policy while delegating wakeword audio chunks,
enable/disable sends, value-level wakeword detection projection, value-level
wakeword ready/error status projection, and app-level wakeword-toggle state
fan-out to this app runtime client. The same runtime client owns transcription gateway URL
resolution, WebSocket construction, setup/reset payloads, inbound gateway
message normalization/dispatch, and audio sends; voice-mode hooks keep
connection lifecycle, reconnect policy, capture lifecycle, and user-facing
transcription callbacks.

`desktopVoiceAudioEncodingRuntime.ts`,
`desktopVoiceAudioCaptureCleanupRuntime.ts`,
`desktopVoiceAudioInputDeviceRuntime.ts`, and
`desktopVoiceAudioProcessorNodeRuntime.ts` own renderer voice audio conversion,
gateway frame construction, capture cleanup, browser input-device adapters, and
AudioWorklet processor construction shared by voice mode and wakeword hooks.
Hooks keep capture lifecycle and UI/error policy while delegating reusable
capture primitives to these app-runtime facades instead of feature utilities.

`desktopWakewordEventRuntime.ts`, `desktopWakewordCaptureGuardRuntime.ts`, and
`desktopVoiceDebugTraceRuntime.ts` own renderer wakeword event normalization,
missing-device lockout/global guard state, audio-input probing, and gated voice
debug tracing shared by wakeword and voice-mode hooks.

The previous renderer helper file `windieCommandInvokeClient.ts` and function
`invokeWindieCommand(...)` were renamed to
`agentSdkCommandInvokeClient.ts` and the
`AgentSdkCommandInvokeClient.invokeAgentSdkCommand(...)` facade method. Inside
that renderer helper, the private bridge type/helper use
`AgentSdkCommandBridge` and `getAgentSdkCommandBridge(...)`. The preload bridge
is still exposed as `window.agentSdk`; the IPC channel string remains
`windie:invoke` as the existing wire contract.

The previous internal helper names `handleWindieSdkInvoke(...)` and
`buildWindieSdkCommandHandlers(...)` were removed from the Electron main
boundary. Stale searches for those names should route here and update callers to
the generic `handleAgentSdkInvoke(...)` and `buildAgentSdkCommandHandlers(...)`
names.

It does not talk to the backend websocket directly and does not execute tools.
Electron main remains responsible for settings gates, query enrichment,
websocket send, replay buffers, synthetic send-failure events, and local tool
execution routing.

## Query Payload Shape

`conversation.send`, `conversation.stop`, `conversation.rehydrate`, and
`conversation.compact` payloads sent from the renderer transport to main use
the canonical backend-transport command contract. `conversation.send` accepts:

- `conversation_ref`
- `query_message_id`
- `screenshot_ref`
- `screenshot`
- `screenshot_url`
- `screenshot_refs`
- `capture_meta`
- `attachment_context`
- `attachment_filenames`
- `workspace_path`
- `memory_retrieval_enabled`

The transport and Electron main query command boundary reject removed aliases such as
`conversationRef`, `screenshotRef`, `screenshotUrl`, `screenshotRefs`,
`attachmentContext`, `attachmentFilenames`, `workspacePath`, `turnRef`,
`queryMessageId`, `messageId`, `message_id`, or `id`.

If a caller passes removed aliases into `desktopRuntimeTransport` or
directly through `windie:invoke`, those fields fail fast. Fix the caller to send
the canonical snake_case runtime shape and use `query_message_id` for the turn
identifier instead of reintroducing alias fallback in the transport or main
query runtime.

`conversation.rehydrate` accepts `conversation_ref`, `messages`,
`rehydrate_mode`, and `workspace_path`; removed `conversationRef` and
`workspacePath` aliases fail fast. `conversation.compact` accepts `force` and
`conversation_ref`; removed `conversationRef` and `turnRef` aliases fail fast.
Electron main uses those snake_case fields only for the backend transport
commands. SDK library commands such as `conversation.loadDisplay`,
`conversation.loadDisplayTimeline`, `conversation.replaceRows`, and
`conversations.list` continue to require SDK-shaped camelCase fields.

## Command Return and Error Contract

`sendQuery(...)`:

1. invokes `windie:invoke` with `conversation.send`
2. throws when main returns `{ ok: false, error }`
3. returns the accepted `messageId` from main when provided
4. otherwise returns the caller-provided message id

`compactHistory(...)`, `wakewordDetected(...)`, and `updateSettings(...)` return
the snake_case `turn_ref` when present. Removed `turnRef` aliases are rejected.

`stop(...)` sends only `conversation_ref` and `turn_ref` to
`conversation.stop`; camelCase stop aliases are rejected.

## Drift Hotspots

1. Re-adding query alias fallback in `desktopRuntimeTransport` or
   `ipc_query_runtime.cjs` keeps duplicate
   renderer command authorities alive and hides callers that failed to normalize
   at the SDK/runtime boundary.
2. Moving query enrichment into this adapter duplicates Electron main ownership.
3. Treating `DesktopRuntimeTransport` as a websocket client bypasses main-owned
   settings gates, overlay phase, replay buffers, and failure synthesis.
4. Letting `workspacePath` override `workspace_path` can send queries with stale
   workspace context after the active workspace binding has changed.

## Related Pages

- [Renderer Runtime](renderer_runtime.md)
- [Query Send and Stream Relay Change Workflow](../main/query_send_and_stream_relay_change_workflow.md)
- [Query Payload and Relay Reference](../main/query_payload_and_relay_reference.md)
- [IPC Channel and Handler Reference](../contracts/ipc_channel_and_handler_reference.md)
- [Session and Transcript Reference](../../reference/session_and_transcript_reference.md)
