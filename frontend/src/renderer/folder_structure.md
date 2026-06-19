# Frontend Renderer Folder Structure

## Overview

The renderer process is the React-based UI layer of the Electron desktop application. It handles user interactions, displays chat messages, manages voice/wakeword detection, renders tool-call/tool-output projections, and communicates with the main process via IPC. Local tool execution is owned by the SDK local runtime and implemented below that boundary by the Python sidecar, not the renderer. The architecture follows a feature-based organization with clear separation between UI components, business logic (hooks), and infrastructure services.

---

## Folder Structure

```
frontend/src/renderer/
├── app/                                  # Application root and context providers
│   ├── App.jsx                          # Root component - sets up providers and layout
│   ├── MinimalChatPillApp.jsx           # Minimal chat pill overlay root component
│   ├── MinimalResponseOverlayApp.jsx    # Minimal response overlay root component
│   ├── ToolGhostDebugApp.jsx            # Debug-only tool ghost overlay root component
│   ├── WakewordController.jsx           # WakewordController - Always-on wakeword detection + chatbox trigger
│   ├── main.jsx                         # React entry point - routes App/minimal overlays by ?view=
│   │
│   ├── runtime/                         # App-level SDK/runtime command facades
│   │   ├── desktopArtifactRuntimeClient.ts # Renderer artifact URL, image fetch, screenshot attachment, and content-type facade
│   │   ├── desktopActiveChatSessionRuntime.ts # Renderer active chat session reset helper shared by chat and dashboard
│   │   ├── desktopAudioRuntimeClient.ts # Renderer audio chunk subscription and playback-service creation facade
│   │   ├── desktopAttachmentPresentationRuntime.js # Renderer shared attachment preview label helper
│   │   ├── desktopBrowserSessionRuntimeClient.js # Renderer browser session subscription and control hook facade
│   │   ├── desktopChatStreamEventRuntime.ts # Renderer stream event routing, projection, stale-turn guard, and tracking facade
│   │   ├── desktopChatStreamIngressRuntime.ts # Renderer normalized SDK conversation-event ingress and transcript sync
│   │   ├── desktopChatStreamTerminalHandoffRuntime.ts # Renderer terminal-handoff stale-turn policy helpers
│   │   ├── desktopChatStreamTrackingRuntime.ts # Renderer stream phase/counter transition helpers
│   │   ├── desktopChatStreamTurnGuardRuntime.ts # Renderer active-turn stale event predicate
│   │   ├── desktopChatMessageRuntimeClient.ts # Renderer chat message builders, schema, and text-normalization facade
│   │   ├── desktopChatMessageTypes.ts # Renderer chat message and token-count contract types
│   │   ├── desktopChatLoopUiRuntime.js # Renderer chat loop UI-state reducer shared by dashboard/minimal surfaces
│   │   ├── desktopChatboxLayoutRuntime.js # Renderer shared chatbox visual-anchor, drag-state, and movement helpers
│   │   ├── desktopChatPillSessionRuntime.ts # Renderer chat-pill send lifecycle and response-overlay view intent facade
│   │   ├── desktopCurrentTurnPresentationRuntime.js # Renderer current-turn reply and chatbox surface projection facade
│   │   ├── desktopCurrentTurnMessageRuntime.js # Renderer SDK current-turn projection and presentation entries to chat-message facade
│   │   ├── desktopLiveTurnSurfaceRuntime.js # Renderer SDK current-turn surface/overlay preflight state facade
│   │   ├── desktopMessageSendUiRuntime.ts # Renderer main-window vs overlay-chatbox send-surface UI policy facade
│   │   ├── desktopMessageSourceTagRuntime.js # Renderer dev/source tag label facade for message badges and thinking labels
│   │   ├── desktopMessageTransparencyRuntime.js # Renderer message transparency section descriptor facade
│   │   ├── desktopMessageTokenUsageRuntime.js # Renderer dev token usage tag facade for message badges
│   │   ├── desktopThreadPresentationRuntime.js # Renderer durable thread plus SDK live current-turn message presentation facade
│   │   ├── desktopOverlayTurnLifecycleRuntime.js # Renderer overlay turn lifecycle enum, phase groups, and resolver facade
│   │   ├── desktopResponseOverlayLayoutRuntime.js # Renderer response overlay layout constants, mode, and frame-size helpers
│   │   ├── desktopResponseOverlayPhaseRuntime.js # Renderer response overlay phase enum and preflight guard facade
│   │   ├── desktopResponseOverlayViewRuntime.ts # Renderer response overlay visibility and layout intent facade
│   │   ├── desktopStreamPhaseRuntime.js # Renderer response-overlay awaiting-reply phase predicate facade
│   │   ├── desktopStopTurnRuntime.js # Renderer stop-turn target and terminal current-turn projection facade
│   │   ├── desktopConversationDisplayProjection.ts # Renderer SDK display-row to chat-message projection facade
│   │   ├── desktopConversationRuntimeContracts.ts # Renderer SDK conversation contract and helper facade
│   │   ├── desktopConversationSessionRuntime.ts # Renderer transcript/chat conversation identity helper rules
│   │   ├── desktopDevUiRuntime.js # Renderer dev-ui query flag helper shared by chat and minimal surfaces
│   │   ├── desktopInteractionRuntimeClient.ts # Renderer interaction diagnostics facade for feature-level breadcrumbs
│   │   ├── desktopMarkdownRuntimeClient.ts # Renderer markdown, find highlighting, and LLM output normalization facade
│   │   ├── desktopModelThinkingRuntime.ts # Renderer model-catalog thinking capability facade for stream presentation
│   │   ├── desktopModelSelectionRuntime.js # Renderer shared model-selection reconciliation and config patch helpers
│   │   ├── desktopPermissionGrantEffectsRuntime.js # Renderer permission post-grant config effects shared by onboarding and settings
│   │   ├── desktopRendererHooksRuntimeClient.ts # Renderer shared React hook facade for feature clients
│   │   ├── desktopLiveTurnRuntimeClient.ts # Renderer live-turn facade for SDK send/stop commands
│   │   ├── desktopPresentationSourceChannels.js # Renderer presentation source-channel labels
│   │   ├── desktopShortcutRuntimeClient.ts # Renderer shortcut label, predicate, option, and config-normalization facade
│   │   ├── desktopSettingsEventRuntimeClient.ts # Renderer settings-event handler facade for providers
│   │   ├── desktopSettingsRuntimeClient.ts # Renderer settings/model facade over Electron main IPC
│   │   ├── desktopStorageRuntimeClient.js # Renderer localStorage JSON helper facade for feature clients
│   │   ├── desktopTranscriptSessionInfoRuntimeClient.js # Renderer transcript session info subscription facade
│   │   └── desktopVoiceRuntimeClient.ts # Renderer voice/wakeword facade over Electron main IPC
│   │
│   └── providers/                       # Context providers for global state
│       ├── AppConfigContext.jsx         # AppConfigContext + useAppConfigContext hook
│       ├── AppConfigProvider.jsx        # AppConfigProvider - Manages config/models/wakeword and syncs renderer config through the desktop settings runtime on connect/startup
│       ├── AppProvider.jsx              # AppProvider - Combines AppConfigProvider and AppStatusProvider
│       ├── AppStatusContext.jsx         # AppStatusContext + useAppStatusContext hook
│       ├── AppStatusProvider.jsx        # AppStatusProvider - Manages saveStatus (transient, frequent changes)
│       ├── appConfigEvents.js           # appConfigEvents - Backend event routing + transcript user-id extraction helpers
│       ├── appConfigPersistence.js      # appConfigPersistence - Config sanitization + changed-config apply helpers
│       ├── ChatContext.jsx              # ChatContext constants for ChatProvider wiring
│       ├── ChatProvider.jsx             # ChatProvider - Sets up chat stream hooks and transcript session sync
│       └── configComparison.ts          # configComparison - Shallow config change detection helpers
│
├── components/                           # Shared UI components
│   └── ErrorBoundary.jsx                # ErrorBoundary - Catches React errors and displays fallback UI
│
├── features/                             # Feature modules (organized by domain)
│   │
│   ├── minimalChatPill/                 # Minimal pill and response overlay feature module
│   │   ├── components/
│   │   │   ├── MinimalChatPill.jsx      # Always-on-top minimal chat pill overlay UI
│   │   │   ├── MinimalResponseOverlay.jsx # Response overlay for current SDK turn projection
│   │   │   ├── AttachmentPreviewRow.jsx # Minimal pill attachment preview lane
│   │   │   └── PillIcons.jsx            # Minimal pill icon render helpers
│   │   ├── hooks/
│   │   │   ├── useMinimalChatPillBindings.js # Minimal pill drag/input/window bindings
│   │   │   ├── useResponseOverlayScrollState.js # Response overlay scroll stickiness
│   │   │   ├── useResponseOverlayViewModel.js # SDK current-turn response view model
│   │   │   └── useResponseOverlayWindowSync.js # Response overlay size/visibility IPC sync
│   │
│   ├── chat/                            # Chat/dashboard transcript feature module
│   │   ├── components/                  # Chat UI components
│   │   │   ├── ChatInterface.jsx        # ChatInterface - Main chat orchestrator (composes MessageList + MessageInput; includes new-chat + stop controls)
│   │   │   ├── MessageContent.jsx       # MessageContent - Renders message body by type
│   │   │   ├── MessageInput.jsx         # MessageInput - Input field with voice transcription support
│   │   │   ├── MessageList.jsx          # MessageList - Renders messages with transparency sections
│   │   │   ├── message/                 # Message-specific subcomponents
│   │   │   │   ├── MessageTransparencySections.jsx # MessageTransparencySections - Renders transparency panels
│   │   │   │   ├── ThinkingDisplay.jsx  # ThinkingDisplay - Displays LLM thinking/reasoning tokens (collapsible)
│   │   │   │   ├── TransparencySection.jsx # TransparencySection - Collapsible sections for system prompts/tool schemas/full messages
│   │   │   │   ├── AssistantMessageActions.jsx # Assistant action controls (copy/feedback/retry)
│   │   │   │   ├── UserMessageActions.jsx # User action controls (copy/edit-and-resend)
│   │   │   │   ├── MessageSourceBadge.jsx # Dev source + token badge renderer
│   │   │   │   ├── MessageItem.jsx      # Message row shell + action/transparency composition
│   │   │   │   └── content/             # MessageContent sub-renderers by payload type
│   │   │   │       ├── MarkdownMessage.jsx # Provider-aware markdown rendering
│   │   │   │       ├── ToolCallMessage.jsx # Tool call payload card + details toggle
│   │   │   │       ├── ToolOutputMessage.jsx # Tool output payload card + details toggle
│   │   │   │       ├── UserMessage.jsx   # User message attachments + screenshot gallery
│   │   │   │       ├── ErrorMessage.jsx  # Error message card renderer
│   │   │   │       └── AssistantThinkingSection.jsx # Collapsible assistant thinking panel
│   │   │
│   │   ├── hooks/                       # Chat business logic hooks
│   │   │   ├── useChatMessageSender.ts  # useChatMessageSender - Handles message sending (dashboard sends skip screenshot capture/window handoff)
│   │   │   ├── useCurrentTurnPresentationState.js # useCurrentTurnPresentationState - Shared dashboard/minimal-pill current-turn reply + awaiting/response projection hook
│   │   │   ├── useChatStream.ts         # useChatStream - Handles streaming events (llm-thought, streaming-response, tool-call, etc.)
│   │   │   ├── useCopyMessageAction.js  # useCopyMessageAction - Shared clipboard copy-success state/timer logic for user/assistant message action rows
│   │   │   ├── useStreamMessageUpdaters.ts # useStreamMessageUpdaters - Shared message update callbacks extracted from useChatStream
│   │   │   └── useTranscription.ts      # useTranscription - Manages input state and voice transcription text insertion
│   │   │
│   │   ├── session/                     # Conversation session helpers
│   │   │
│   │   ├── stores/                      # State management
│   │   │   └── chatStore.ts             # chatStore (Zustand) - Messages, isSending, thinkingStatus, tokenCounts
│   │   │
│   │   └── utils/                       # Chat presentation/formatting selectors and helpers
│   │       ├── messageSender/            # messageSender - Payload normalization and SDK turn resource handle utilities
│   │       │   ├── chatMessageSenderUtils.ts # chatMessageSenderUtils - User-message creation, first-message detection, and screenshot artifact mapping helpers
│   │       │   ├── chatMessageSenderPayloads.ts # chatMessageSenderPayloads - Outgoing payload and attachment filename normalization
│   │       │   └── desktopChatSendPreparation.ts # desktopChatSendPreparation - Conversation identity, send preflight, and SDK turn resource handle assembly
│   │       ├── session/                 # session - Conversation/session ref and transcript-rehydrate payload helpers
│   │       │   ├── conversationRef.ts   # conversationRef - Conversation ref creation helper
│   │       │   ├── newChatSession.ts    # newChatSession - New chat reset/rotation flow helper
│   │       ├── state/                   # state - SDK current-turn side-effect projection helpers
│   │       │   ├── currentTurnProjectionSideEffects.ts # currentTurnProjectionSideEffects - SDK current-turn projection side effects
│   │       ├── chatSelectors.js         # chatSelectors - Shared Zustand selectors for ChatInterface/minimal pill
│   │       ├── chatStream/              # chatStream - Stream event/update/thinking/transparency utility helpers
│   │       │   ├── chatStreamDebugTrace.ts # chatStreamDebugTrace - Gated stream + chat-pill renderer trace helpers
│   │       │   ├── chatStreamEventUtils.ts # chatStreamEventUtils - Screenshot attachment and error filtering/text helpers
│   │       │   ├── chatStreamFormatting.ts # chatStreamFormatting - Thinking text accumulation helper
│   │       │   ├── chatStreamMessageUpdates.ts # chatStreamMessageUpdates - Message selection and streaming/system/full-message update shaping helpers
│   │       ├── message/                 # message - Message-focused formatting, screenshot, and source-tag helpers
│   │       │   ├── messageInput.js      # messageInput - Input normalization helper before send dispatch
│   │       │   ├── messageListClasses.js # messageListClasses - Message row class-name builder (sender/type/streaming/screenshot flags)
│   │       │   ├── messageListState.js  # messageListState - Message edit/scroll/runtime state helpers
│   │       │   ├── messageScreenshots.js # messageScreenshots - Screenshot presence predicates and screenshot-src resolution helpers
│   │       └── transcriptionRegions.ts  # transcriptionRegions - Pure cursor/boundary helper logic for transcription updates
│   │
│   ├── dashboard/                        # Dashboard feature module
│   │   ├── hooks/                       # Dashboard business logic hooks
│   │   │   └── useDashboardConversations.js # useDashboardConversations - Recent/search conversation load/search/open/rename/pin/delete runtime
│   │   │
│   │   └── components/                  # Dashboard UI components
│   │       ├── DashboardShell.jsx       # DashboardShell - Conversation-first shell + memory/models/settings modals
│   │       └── sections/                # Dashboard section components
│   │           ├── MemorySection.jsx    # MemorySection - Unified episodic/semantic/procedural memory manager
│   │           ├── MemoryItem.jsx       # MemoryItem - Expand/edit/delete UI row for individual memory entries
│   │           ├── ModelsSection.jsx    # ModelsSection - Model list + API key input
│   │           ├── modelCards.jsx       # modelCards - Provider/model card presentational components
│   │           ├── modelCardData.js     # modelCardData - Provider/model card derivation helpers
│   │           ├── memorySectionData.js # memorySectionData - Memory type metadata + normalization helpers
│   │           ├── providerApiKeys.js   # providerApiKeys - Provider API key defaults/specs + normalization
│   │           └── SettingsSection.jsx  # SettingsSection - Wakeword/TTS/screen/permissions
│   │
│   │   └── utils/                       # Dashboard helpers
│   │       └── conversationGroups.js    # conversationGroups - Time-bucket grouping and search metadata normalization helpers
│   │
│   ├── permissions/                      # Permission settings control center
│   │   ├── components/                  # Permission UI
│   │   ├── stores/                      # Permission state management
│   │   │   └── permissionStore.js       # permissionStore (Zustand) - Manifest/statuses, probes, onboarding gate
│   │   └── utils/                       # Permission persistence helpers
│   │       └── permissionStorage.js     # permissionStorage - localStorage manifest/consent state load/save
│   │
│   └── voice/                            # Voice feature module
│       ├── components/                  # Voice UI components
│       │   └── VoiceStatus.jsx          # VoiceStatus - Displays voice mode status (recording, error, connected)
│       │
│       ├── hooks/                       # Voice business logic hooks
│       │   ├── useVoiceMode.ts          # useVoiceMode - Uses desktop voice runtime gateway connection and audio capture
│       │   └── useWakewordDetection.ts  # useWakewordDetection - Manages wakeword detection via openWakeWord (audio capture + IPC)
│       │
│       └── utils/                       # Voice utility helpers
│           ├── audioEncoding.ts         # audioEncoding - PCM conversion and gateway packet framing helpers
│           └── wakewordEventUtils.ts    # wakewordEventUtils - wakeword confidence/event validation helpers
│
├── infrastructure/                        # Core infrastructure services
│   │
│   ├── api/                              # Hosted SDK client access
│   │   └── agentSdkClient.ts            # Renderer SDK facade for hosted transport wrappers, runtime contracts, and app imports
│   │
│   ├── audio/                            # Audio services
│   │   └── PlayerService.ts            # PlayerService - Audio playback queue management (TTS audio chunks from backend)
│   │
│   ├── interaction/                      # Renderer interaction diagnostics
│   │   └── rendererInteractionLogger.js # rendererInteractionLogger - capture-phase click/control-change logging and send-message traces
│   │
│   ├── ipc/                              # IPC communication layer
│   │   ├── bridge.ts                   # IpcBridge - Type-safe IPC wrapper with channel validation (send, invoke, on, once)
│   │   └── channels.ts                 # Channel constants - SEND_CHANNELS, INVOKE_CHANNELS, ON_CHANNELS (centralized channel names)
│   │
│   ├── markdown.ts                       # markdown - Markdown sanitization/rendering helpers
│   │
│   ├── services/                         # Business logic services
│   │   ├── ArtifactImageUtils.ts        # ArtifactImageUtils - Artifact image type/extension normalization
│   │   ├── RuntimeEndpointStore.ts      # RuntimeEndpointStore - Renderer runtime URL state and artifact/transcription URL builders
│   │
│   └── transcript/                       # SDK-backed transcript projection helpers
│       ├── desktopConversationStore.ts  # desktopConversationStore - Direct SDK conversation command bridge
│       ├── sdkDisplayChatMessageProjection.ts # sdkDisplayChatMessageProjection - SDK display rows to renderer chat messages
│       ├── sessionInfoState.ts          # sessionInfoState - Lazy-loaded session resolver/update state machine
│       ├── sessionInfoStorage.ts        # sessionInfoStorage - sessionStorage read/write + update event emitter
│       ├── transcriptSessionRuntime.ts  # Session-aware transcript identity runtime used by desktop runtime clients
│       └── types.ts                     # types - Shared transcript session/entry/pending message types
│
├── styles/                                # CSS stylesheets
│   ├── accessibility.css                # Accessibility utilities (visually-hidden class)
│   ├── ChatBox.css                      # Chat box overlay styles
│   ├── ChatInterface.css               # Chat interface styles (messages, tool outputs, transparency sections)
│   ├── DashboardShell.css               # Dashboard shell + modal panel styles
│   ├── ErrorBoundary.css                # ErrorBoundary fallback UI styling
│   ├── ThinkingDisplay.css              # Thinking display styles (collapsible reasoning tokens)
│   ├── VoiceStatus.css                  # Voice status badge and state styles
│   └── theme.css                        # Shared CSS variables/theme tokens
│
├── types/                                 # Local renderer types
│   └── toolSchemas.ts                    # Renderer display tool-schema type helpers
│
└── utils/                                 # Utility functions
    ├── configFilter.js                  # configFilter - Filters config to renderer-managed fields only
    ├── configStorage.js                 # configStorage - localStorage utilities for config persistence (optimistic state pattern)
```

---

## Data Flow

### Application Initialization Flow

```
1. ENTRY POINT
   └─> app/main.jsx
       └─> ReactDOM.createRoot() → renders App
           ↓
2. ROOT COMPONENT
   └─> app/App.jsx
       ├─> ErrorBoundary (error handling)
       ├─> AppProvider (config and status contexts)
       ├─> ChatProvider (chat hooks setup)
       └─> AppContent (permission bootstrap gate -> onboarding wizard or DashboardShell)
           ↓
3. PERMISSION BOOTSTRAP
   └─> features/permissions/stores/permissionStore.js
       ├─> invoke LIST_PERMISSIONS (main permission service snapshot + probes)
       ├─> evaluate required-now gate against persisted onboarding completion
       └─> route to onboarding wizard if gate not satisfied
           ↓
4. CONTEXT INITIALIZATION
   ├─> app/providers/AppConfigContext.jsx
   │   ├─> Load config from localStorage (optimistic state)
   │   ├─> Request models list through the desktop settings runtime
   │   └─> Set up IPC listeners
   │
   └─> app/providers/AppStatusContext.jsx
       └─> Set up save status tracking
           ↓
5. CHAT INITIALIZATION
   └─> app/providers/ChatProvider.jsx
       └─> useChatStream() - Set up streaming event listeners and display projections
```

### Message Sending Flow

```
1. USER INPUT
   └─> features/chat/components/MessageInput.jsx
       ├─> Text input or voice transcription
       └─> onSubmit → onSendMessage()
           ↓
2. MESSAGE SENDER HOOK
   └─> features/chat/hooks/useChatMessageSender.ts
       ├─> Create user message (immediate UI display)
       ├─> Add to chatStore
       ├─> Main-window sender path: send query directly (no screenshot capture, no window handoff)
       ├─> Overlay sender path: optional query_screenshot_request SDK resource
       └─> DesktopLiveTurnRuntimeClient.sendQuery() - Send through the renderer runtime facade
           ↓
3. SDK RUNTIME TRANSPORT
   └─> app/runtime/desktopRuntimeTransport.ts
       └─> invokeAgentSdkCommand('conversation.send', payload)
           └─> Main process (`src/main/ipc.cjs`) allowlists the SDK-shaped command and hands query context to the SDK runtime, which owns the hosted backend WebSocket
```

### Streaming Response Flow

```
1. BACKEND EVENT
   └─> Main process receives WebSocket event
       ├─> SDK runtime reduces event into currentTurn projection
       ├─> IPC to renderer: DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN
       └─> IPC to renderer: DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT
           ↓
2. CURRENT-TURN PROJECTION HOOK
   └─> features/chat/hooks/useConversationRuntimeProjectionStream.ts
       ├─> Stores SDK currentTurn projection
       ├─> Tracks first assistant/reasoning deltas for UI state
       ├─> Tracks tool-call/tool-output phases
       └─> Tracks complete/error phases
           ↓
3. CHAT STORE
   └─> features/chat/stores/chatStore.ts
       ├─> setCurrentTurnProjection() - Store SDK live turn state
       ├─> setThinkingStatus() - Update thinking display from projection
       └─> setTokenCounts() - Update token statistics from conversation events
           ↓
4. UI UPDATE
   └─> features/chat/components/MessageList.jsx
       ├─> Renders transcript messages from chatStore
       ├─> Renders active assistant/tool rows from SDK currentTurn projection
       ├─> Displays transparency sections from conversation-event metadata
       └─> Auto-scrolls to bottom
```

### Tool Display and SDK Execution Flow

```
1. TOOL CALL EVENT
   └─> Backend sends tool-call or tool-bundle event
       └─> Agent SDK runtime receives event
           ↓
2. SDK LOCAL EXECUTION
   └─> packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts
       ├─> Route single tool or bundle to local runtime adapter
       ├─> Preserve request_id / bundle_id / tool_call_id
       └─> Return exactly one tool-result or tool-bundle-result to backend
           ↓
3. LOCAL-RUNTIME EXECUTION
   └─> SDK local runtime invokes the Python sidecar daemon
       ├─> Execute filesystem/shell/browser/computer-use/MCP/plugin tools
       └─> Return normalized local result to SDK runtime
           ↓
4. RENDERER DISPLAY
   └─> features/chat/hooks/useChatStream.ts
       ├─> Render display-only tool-call/tool-bundle events
       ├─> Render backend tool-output events
       └─> Persist visible transcript projection
```

### Voice Mode Flow

```
1. MICROPHONE SESSION ACTIVE
   └─> features/chat/components/ChatInterface.jsx
       └─> features/chat/components/MessageInput.jsx toggles local dictation state
           ↓
2. VOICE MODE HOOK
   └─> features/voice/hooks/useVoiceMode.ts
       ├─> Connect through DesktopVoiceRuntimeClient to transcription gateway (/ws/transcription)
       ├─> Request microphone access (getUserMedia)
       ├─> Create AudioContext and required AudioWorklet capture processor
       ├─> Capture audio chunks (Float32Array → Int16Array)
       ├─> Format and send to Gateway (binary protocol)
       └─> Receive transcription results (realtime events)
           ↓
3. TRANSCRIPTION UPDATE
   └─> features/chat/hooks/useTranscription.ts
       ├─> updateTranscription() - Insert transcription text into input
       └─> Handle cursor position and text replacement
           ↓
4. UTTERANCE END
   └─> Gateway sends utterance_end event
       └─> onUtteranceEnd callback
           └─> Stop temporary dictation; keep text in composer for manual send/edit
```

### Wakeword Detection Flow

```
1. WAKEWORD ENABLED
   └─> app/WakewordController.jsx
       └─> wakewordActive (wakewordEnabled && !wakewordSuppressed)
           ↓
2. WAKEWORD DETECTION HOOK
   └─> features/voice/hooks/useWakewordDetection.ts
       ├─> Request microphone access (getUserMedia)
       ├─> Create AudioContext and required AudioWorklet capture processor
       ├─> Capture audio chunks (Float32Array → Int16Array)
       ├─> Send to main process via IPC (SEND_CHANNELS.WAKEWORD_AUDIO_CHUNK)
       └─> Main process forwards to Python wakeword service
           ↓
3. DETECTION EVENT
   └─> Python wakeword service detects wakeword
       └─> Main process → IPC: ON_CHANNELS.WAKEWORD_DETECTED
           └─> useWakewordDetection hook receives event
               └─> onWakewordDetected callback
                   ├─> DesktopVoiceRuntimeClient.wakewordDetected()
                   └─> SHOW_CHATBOX (IPC)
```

### Settings Management Flow

```
1. SETTINGS CHANGE
   └─> features/dashboard/components/DashboardShell.jsx
       └─> User changes model/speech settings
           └─> onConfigChange(newConfig)
               ↓
2. CONFIG UPDATE
   └─> app/providers/AppConfigContext.jsx
       ├─> filterRendererConfig() - Filter to renderer-managed fields
       ├─> Update state immediately
       └─> saveConfigToStorage() - Persist to localStorage
           ↓
3. CONFIG PERSISTENCE
   └─> utils/configStorage.js
       └─> localStorage.setItem() - Save config and version timestamp
```

### Audio Playback Flow (TTS)

```
1. AUDIO CHUNK EVENT
   └─> Runtime forwards audio-chunk event
       └─> IPC: ON_CHANNELS.AUDIO_CHUNK
           ↓
2. AUDIO PLAYER SERVICE
   └─> infrastructure/audio/PlayerService.ts
       ├─> enqueueAudio() - Add chunk to queue
       ├─> playNext() - Play chunks sequentially
       ├─> base64ToArrayBuffer() - Decode base64 PCM data
       ├─> createAudioBuffer() - Convert Int16Array to Float32Array
       └─> AudioContext.createBufferSource() - Play audio
```

### Bundle Display Flow

```
1. BUNDLE EVENT
   └─> Backend sends tool-bundle event through SDK runtime
           ↓
2. SDK MAIN RUNTIME
   └─> Executes bundle deterministically through the SDK local runtime and sends one tool-bundle-result
           ↓
3. UI UPDATE
   └─> features/chat/hooks/useConversationRuntimeProjectionStream.ts
       └─> chatStore.setCurrentTurnProjection()
           └─> app/runtime/desktopCurrentTurnMessageRuntime.js renders projected bundle/tool output
```

---

## Key Design Principles

1. **Feature-Based Organization**: Code organized by feature (chat, settings, voice) rather than by technical layer

2. **Split Contexts**: AppConfigContext (infrequent changes) and AppStatusContext (frequent changes) separated to minimize re-renders

3. **Optimistic State**: Config loaded from localStorage immediately (zero latency) before runtime settings sync

4. **Hook-Based Logic**: Business logic extracted into custom hooks (useChatStream, useVoiceMode, etc.)

5. **Zustand Store**: Lightweight state management for chat messages (no Redux overhead)

6. **Type-Safe IPC**: Typed IPC bridge with channel validation (development only, preload.js validates in production)

7. **Pure Services**: Infrastructure services (PlayerService, system-state capture, artifact helpers) have no React dependencies

8. **Callback Pattern**: Services accept callbacks for UI updates and runtime communication (dependency injection)

9. **Transparency Sections**: Collapsible sections for system prompts, tool schemas, and full messages (debugging/transparency)

10. **Computer-Use Tools**: Automatic screenshot/system state capture for mouse, keyboard, scroll, wait, switch_window tools

11. **Bundle Execution**: Atomic tool bundles executed sequentially with fail-fast behavior

12. **Voice Integration**: Desktop voice runtime gateway for real-time transcription with backend-owned provider policy and utterance end detection

13. **Wakeword Detection**: openWakeWord integration via Python subprocess with audio chunk streaming

14. **Audio Playback**: Queue-based audio player for TTS chunks from backend

15. **Window Management**: Linux-only chat-pill hide modules avoid screenshot self-capture; Windows/macOS rely on phase-driven Electron content protection for protected overlays rather than capture-time hide/show behavior; chat box overlay is click-through by default

16. **Memory Storage**: SDK-shaped memory runtime commands and SDK-owned invalidation events; Python sidecar RPC names stay below the SDK/local-runtime boundary

17. **Config Filtering**: Renderer only manages subset of config (model_mode, selected_model_id, speech_mode_enabled, wakeword flags, etc.)

18. **Error Boundaries**: React error boundaries prevent full app crashes

19. **Conversation-First Shell**: Chat remains mounted while memory/models/settings open in modal panels

---

## Component Hierarchy

```
App
├── ErrorBoundary
│   └── AppProvider
│       ├── AppConfigProvider
│       │   └── AppStatusProvider
│       │       └── ChatProvider
│       │           ├── WakewordController
│       │           └── AppContent
│       │               └── DashboardShell
│       │                   ├── Sidebar
│       │                   ├── ChatInterface
│       │                   │   ├── MessageList
│       │                   │   │   ├── Message (user/assistant)
│       │                   │   │   ├── TransparencySection (system prompt, tool schemas, full messages)
│       │                   │   │   └── ThinkingDisplay
│       │                   │   ├── MessageInput
│       │                   │   │   └── VoiceStatus
│       │                   ├── MemoryModal
│       │                   ├── ModelsModal
│       │                   └── SettingsModal
```

---

## IPC Channel Usage

### Send Channels (Renderer → Main)
- `WAKEWORD_DETECTED` - Notify Electron main of wakeword activation through the SDK-shaped runtime command path
- `WAKEWORD_AUDIO_CHUNK` - Send audio chunks for wakeword detection
- `WAKEWORD_ENABLE` - Enable wakeword detection
- `WAKEWORD_DISABLE` - Disable wakeword detection

### Invoke Channels (Renderer → Main, async)
- SDK runtime commands - conversation send/stop/retry/edit/resend/projection
  loading plus memory list/delete/clear through SDK-shaped app runtime clients
- `GET_SYSTEM_STATE` - Get system state (active window, mouse, clipboard, etc.)

### On Channels (Main → Renderer, events)
- `DESKTOP_RUNTIME_CURRENT_TURN` - SDK current-turn projection updates for live dashboard/overlay rendering
- `DESKTOP_RUNTIME_CONVERSATION_EVENT` - SDK-normalized chat side-effect events for transcript/session/metadata handlers
- `BACKEND_SETTINGS_EVENT` - Typed settings/model ACK and error control events
- `AGENT_CAPABILITY_EVENT` - Typed tool manifest and remote tool catalog updates
- `AUDIO_CHUNK` - Typed text-to-speech audio chunk side-channel
- `IPC_STATUS` - IPC connection status
- `LOG` - Log messages from main process
- `WAKEWORD_DETECTED` - Wakeword detection event
- `WAKEWORD_STATUS` - Wakeword service status

### Renderer Interaction Logs

- `infrastructure/interaction/rendererInteractionLogger.js` installs one capture-phase renderer listener for user clicks and control changes.
- Click logs include the resolved control label, element role/type, class/test id metadata, and current renderer view.
- Chat rows provide an explicit interaction label so logs include the visible chat title when a user opens a chat.
- Message sends log from `useChatMessageSender` after the message is accepted into UI state, with message text redacted by default and only exposed by an explicit diagnostic flag.
- Interaction logs use schema version `1`, are sent over `SEND_CHANNELS.RENDERER_LOG`, and are normalized/redacted again by Electron main before being stored under the `renderer.interaction` diagnostics path.

---

## State Management

### Chat Store (Zustand)
- `messages: ChatMessage[]` - Conversation messages
- `isSending: boolean` - Whether a message is being sent
- `thinkingStatus: string | null` - Accumulated thinking tokens
- `tokenCounts: TokenCounts | null` - Token usage statistics

### App Config Context
- `config` - Application configuration (model settings, voice settings)
- `availableModels` - List of available LLM models
- `wakewordEnabled` - Wakeword detection preference
- `wakewordSuppressed` - Temporary suppression while chatbox is visible
- `wakewordActive` - Computed active state (enabled + not suppressed)
- `updateConfig()` - Update config and persist to localStorage

### App Status Context
- `saveStatus` - Settings save operation status (idle, saving, success, error)
- `setSaving()` - Set saving status (called by AppConfigContext)

---

## Tool Execution Architecture

Renderer does not execute local tools or return backend tool results. It renders
SDK display projections and runtime phase state. Electron main hosts the SDK
runtime, resolves the SDK local runtime backed by the Python sidecar, and
returns exactly one `tool-result` or `tool-bundle-result` to the hosted backend.

### Computer-Use Tool Projections
Tools that may appear in renderer display projections:
- `mouse_control`
- `keyboard_control`
- `scroll_control`
- `screenshot`
- `wait`
- `switch_window`
- `run_shell_command` (if `wait` parameter provided)

### Tool Execution Options
- `skipAutoCapture` - SDK/main-side capture policy marker shown in debug payloads
- `correlationId` - Request or bundle ID for display correlation

### Bundle Execution
- SDK runtime executes atomic bundles sequentially through the local runtime
- Bundle result delivery is main-process SDK runtime behavior
- Renderer receives display-only bundle/tool output projections

---

## Voice Integration

### Voice Mode (Desktop Voice Runtime Gateway)
- `DesktopVoiceRuntimeClient` opens the transcription gateway WebSocket derived from the active backend endpoint
- Gateway route remains `/ws/transcription`; backend owns STT provider policy behind that route
- Real-time transcription with incremental updates
- Utterance end detection (silence) stops temporary dictation and keeps text in the composer
- Audio format: 16kHz, mono, Int16Array PCM

### Wakeword Detection (openWakeWord)
- Audio capture in renderer process
- Chunks sent to main process via IPC
- Main process forwards to Python wakeword service
- Detection threshold: 0.5
- Cooldown period: 2 seconds between detections

---

## Message Types

### Chat Message Types
- `llm-text` - Streaming LLM text response
- `tool-call` - Tool call request from LLM
- `tool-output` - Tool execution result
- `error` - Error message

### Transparency Data
- `systemPrompt` - System prompt sent to LLM
- `toolSchemas` - Available tool schemas
- `fullUserMessage` - Complete user message with memory sections and user query
- `fullAssistantMessage` - Complete assistant response

---

## Styling Architecture

- **Component-scoped CSS**: Each major component has its own CSS file
- **Utility classes**: `visually-hidden` for accessibility
- **Theme support**: Dark mode support via `prefers-color-scheme`
- **Responsive design**: Mobile-friendly breakpoints
- **Color coding**: Tool outputs (orange), tool calls (green), screenshots (purple)

---

## Performance Optimizations

1. **Split Contexts**: Config and status contexts separated to minimize re-renders
2. **Conversation-First Shell**: Chat interface stays mounted while modals handle dashboard panels
3. **Memoization**: Callbacks memoized with `useCallback`
4. **Zustand Selectors**: Components subscribe only to needed store slices
5. **Channel Validation**: Only in development (preload.js validates in production)
6. **Optimistic State**: Config loaded from localStorage immediately
7. **Refs for Stable Values**: Callbacks stored in refs to avoid effect re-runs
