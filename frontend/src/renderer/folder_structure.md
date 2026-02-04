# Frontend Renderer Folder Structure

## Overview

The renderer process is the React-based UI layer of the Electron desktop application. It handles user interactions, displays chat messages, manages voice/wakeword detection, executes tools, and communicates with the main process via IPC. The architecture follows a feature-based organization with clear separation between UI components, business logic (hooks), and infrastructure services.

---

## Folder Structure

```
frontend/src/renderer/
├── app/                                  # Application root and context providers
│   ├── App.jsx                          # Root component - sets up providers and layout
│   ├── ChatBoxApp.jsx                   # ChatBox root component
│   ├── WakewordController.jsx           # WakewordController - Always-on wakeword detection + chatbox trigger
│   ├── main.jsx                         # React entry point - renders App with StrictMode in dev
│   │
│   └── providers/                       # Context providers for global state
│       ├── AppConfigContext.jsx         # AppConfigContext + useAppConfigContext hook
│       ├── AppConfigProvider.jsx        # AppConfigProvider - Manages config, availableModels, wakewordEnabled/active (infrequent changes)
│       ├── AppContextHooks.js           # AppContext hooks (useAppContext, useAppConfigContext, useAppStatusContext)
│       ├── AppProvider.jsx              # AppProvider - Combines AppConfigProvider and AppStatusProvider
│       ├── AppStatusContext.jsx         # AppStatusContext + useAppStatusContext hook
│       ├── AppStatusProvider.jsx        # AppStatusProvider - Manages saveStatus (transient, frequent changes)
│       ├── ChatContext.jsx              # ChatContext + useChatContext hook
│       └── ChatProvider.jsx             # ChatProvider - Sets up chat hooks (useChatStream, useToolRunner)
│
├── components/                           # Shared UI components
│   ├── ErrorBoundary.jsx                # ErrorBoundary - Catches React errors and displays fallback UI
│   └── MainLayout.jsx                   # MainLayout - Two-column layout (section selector + content)
│
├── features/                             # Feature modules (organized by domain)
│   │
│   ├── chat/                            # Chat feature module
│   │   ├── components/                  # Chat UI components
│   │   │   ├── ChatBox.jsx              # ChatBox - Floating quick chat overlay UI
│   │   │   ├── ChatInterface.jsx        # ChatInterface - Main chat orchestrator (composes MessageList, MessageInput, TokenCountDisplay)
│   │   │   ├── MessageContent.jsx       # MessageContent - Renders message body by type
│   │   │   ├── MessageInput.jsx         # MessageInput - Input field with voice transcription support
│   │   │   ├── MessageList.jsx          # MessageList - Renders messages with transparency sections
│   │   │   ├── MessageTransparencySections.jsx # MessageTransparencySections - Renders transparency panels
│   │   │   ├── ThinkingDisplay.jsx      # ThinkingDisplay - Displays LLM thinking/reasoning tokens (collapsible)
│   │   │   ├── TokenCountDisplay.jsx    # TokenCountDisplay - Shows token usage statistics
│   │   │   └── TransparencySection.jsx  # TransparencySection - Collapsible sections for system prompts, tool schemas, full messages
│   │   │
│   │   ├── hooks/                       # Chat business logic hooks
│   │   │   ├── useChatMessageSender.ts  # useChatMessageSender - Handles message sending with screenshot capture
│   │   │   ├── useChatStream.ts         # useChatStream - Handles streaming events (llm-thought, streaming-response, tool-call, etc.)
│   │   │   ├── useToolRunner.ts         # useToolRunner - Connects UI to ToolExecutionService, handles tool execution events
│   │   │   └── useTranscription.ts      # useTranscription - Manages input state and voice transcription text insertion
│   │   │
│   │   └── stores/                      # State management
│   │       └── chatStore.ts             # chatStore (Zustand) - Messages, isSending, thinkingStatus, tokenCounts
│   │
│   ├── dashboard/                        # Dashboard feature module
│   │   └── components/                  # Dashboard UI components
│   │       ├── DashboardContent.jsx     # DashboardContent - Section-specific content panels
│   │       └── sections/                # Dashboard section components
│   │           ├── MemorySection.jsx    # MemorySection - Episodic/Semantic placeholders
│   │           ├── ModelsSection.jsx    # ModelsSection - Model list + API key input
│   │           ├── ProceduralSection.jsx # ProceduralSection - Skills placeholder
│   │           ├── SettingsSection.jsx  # SettingsSection - Wakeword/TTS/screen/permissions
│   │           └── UsageSection.jsx     # UsageSection - Usage placeholder
│   │
│   │   └── utils/                       # Dashboard helpers
│   │       └── storage.js               # storage - localStorage helpers for dashboard sections
│   │
│   ├── settings/                         # Settings feature module
│   │   └── hooks/                       # Settings business logic hooks
│   │       └── useSettingsManagement.ts # useSettingsManagement - Handles model listing events from backend
│   │
│   └── voice/                            # Voice feature module
│       ├── components/                  # Voice UI components
│       │   └── VoiceStatus.jsx          # VoiceStatus - Displays voice mode status (recording, error, connected)
│       │
│       └── hooks/                       # Voice business logic hooks
│           ├── useVoiceMode.ts          # useVoiceMode - Manages Nova-Voice Gateway WebSocket connection and audio capture
│           └── useWakewordDetection.ts  # useWakewordDetection - Manages wakeword detection via openWakeWord (audio capture + IPC)
│
├── infrastructure/                        # Core infrastructure services
│   │
│   ├── api/                              # API client
│   │   └── client.ts                    # ApiClient - Typed API client for backend communication (sendQuery, listModels, wakewordDetected)
│   │
│   ├── audio/                            # Audio services
│   │   └── PlayerService.ts            # PlayerService - Audio playback queue management (TTS audio chunks from backend)
│   │
│   ├── ipc/                              # IPC communication layer
│   │   ├── bridge.ts                   # IpcBridge - Type-safe IPC wrapper with channel validation (send, invoke, on, once)
│   │   └── channels.ts                 # Channel constants - SEND_CHANNELS, INVOKE_CHANNELS, ON_CHANNELS (centralized channel names)
│   │
│   └── services/                         # Business logic services
│       ├── MessageFormatter.ts          # MessageFormatter - Pure functions for formatting tool output with system context XML
│       ├── SystemCapture.ts            # SystemCapture - extractOSstate() - Unified screenshot and system state capture
│       ├── ToolExecutionBundleRunner.ts # ToolExecutionBundleRunner - Runs atomic tool bundles and collects results
│       ├── ToolExecutionCapture.ts     # ToolExecutionCapture - Auto-capture decisions and OS state capture helpers
│       ├── ToolExecutionInvoker.ts     # ToolExecutionInvoker - IPC invocation wrapper with timing
│       ├── ToolExecutionLogger.ts      # ToolExecutionLogger - Timing/log helpers
│       ├── ToolExecutionService.ts     # ToolExecutionService - Tool execution orchestration (single tools and bundles)
│       └── ToolExecutionTypes.ts       # ToolExecutionTypes - Type definitions and constants (COMPUTER_USE_TOOLS, etc.)
│
├── styles/                                # CSS stylesheets
│   ├── accessibility.css                # Accessibility utilities (visually-hidden class)
│   ├── ChatBox.css                      # Chat box overlay styles
│   ├── ChatInterface.css               # Chat interface styles (messages, tool outputs, transparency sections)
│   ├── MainLayout.css                   # Main layout styles (two-column grid)
│   ├── SettingsPanel.css                # Dashboard section styles (cards, toggles, model list)
│   ├── ThinkingDisplay.css              # Thinking display styles (collapsible reasoning tokens)
│   └── TokenCountDisplay.css            # Token count display styles
│
├── types/                                 # Local renderer types
│   └── backendEvents.ts                  # Backend event payload types + guards
│
└── utils/                                 # Utility functions
    ├── configFilter.js                  # configFilter - Filters config to frontend-managed fields only
    └── configStorage.js                 # configStorage - localStorage utilities for config persistence (optimistic state pattern)
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
       └─> AppContent (MainLayout with ChatInterface or DashboardContent)
           ↓
3. CONTEXT INITIALIZATION
   ├─> app/providers/AppConfigContext.jsx
   │   ├─> Load config from localStorage (optimistic state)
   │   ├─> Request models list from backend
   │   └─> Set up IPC listeners
   │
   └─> app/providers/AppStatusContext.jsx
       └─> Set up save status tracking
           ↓
4. CHAT INITIALIZATION
   └─> app/providers/ChatProvider.jsx
       ├─> useChatStream() - Set up streaming event listeners
       └─> useToolRunner() - Initialize ToolExecutionService
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
       ├─> Minimize window (delayed, after message display)
       ├─> extractOSstate() - Capture screenshot and system state
       └─> ApiClient.sendQuery() - Send to backend via IPC
           ↓
3. IPC BRIDGE
   └─> infrastructure/ipc/bridge.ts
       └─> IpcBridge.send(SEND_CHANNELS.TO_BACKEND, { type: 'query', ... })
           └─> Main process → Backend WebSocket
```

### Streaming Response Flow

```
1. BACKEND EVENT
   └─> Main process receives WebSocket event
       └─> IPC to renderer: ON_CHANNELS.FROM_BACKEND
           ↓
2. STREAMING HOOK
   └─> features/chat/hooks/useChatStream.ts
       ├─> handleLlmThought() - Accumulate thinking tokens
       ├─> handleStreamingResponse() - Append chunks to assistant message
       ├─> handleToolCall() - Create tool-call message
       ├─> handleToolOutput() - Create tool-output message (backend failures only)
       ├─> handleSystemPrompt() - Attach to last user message
       ├─> handleUserMessageFull() - Attach transparency data
       ├─> handleAssistantMessageFull() - Attach transparency data
       ├─> handleToolSchemas() - Attach to first user message
       ├─> handleStreamingComplete() - Mark message as complete
       └─> handleError() - Display error message
           ↓
3. CHAT STORE
   └─> features/chat/stores/chatStore.ts
       ├─> addMessage() - Add new messages
       ├─> updateMessage() - Update existing messages (streaming chunks)
       ├─> setThinkingStatus() - Update thinking display
       └─> setTokenCounts() - Update token statistics
           ↓
4. UI UPDATE
   └─> features/chat/components/MessageList.jsx
       ├─> Renders messages from chatStore
       ├─> Displays transparency sections (system prompt, tool schemas, full messages)
       └─> Auto-scrolls to bottom
```

### Tool Execution Flow

```
1. TOOL CALL EVENT
   └─> Backend sends tool-call or tool-bundle event
       └─> IPC: ON_CHANNELS.FROM_BACKEND
           ↓
2. TOOL RUNNER HOOK
       └─> features/chat/hooks/useToolRunner.ts
       ├─> Handle tool-call → ToolExecutionService.executeTool()
       ├─> Handle tool-bundle → ToolExecutionService.executeToolBundle()
       └─> Handle memory-store → IPC invoke STORE_MEMORY
           ↓
3. TOOL EXECUTION SERVICE
   └─> infrastructure/services/ToolExecutionService.ts
       ├─> Execute tool via IPC (INVOKE_CHANNELS.EXECUTE_TOOL)
       ├─> Check if computer-use tool (needs screenshot)
       ├─> extractOSstate() - Capture screenshot/system state (if needed)
       ├─> formatToolOutputMessage() - Format with system context XML
       ├─> Call onToolResult callback (UI update)
       └─> Send tool-result to backend via IPC
           ↓
4. IPC TO MAIN PROCESS
   └─> infrastructure/ipc/bridge.ts
       └─> IpcBridge.invoke(INVOKE_CHANNELS.EXECUTE_TOOL, ...)
           └─> Main process → Python sidecar (JSON-RPC)
               ↓
5. TOOL RESULT
   └─> Python sidecar returns result
       └─> Main process → IPC to renderer
           └─> ToolExecutionService processes result
               └─> UI callback updates chatStore
                   └─> MessageList displays tool output
```

### Voice Mode Flow

```
1. VOICE MODE ENABLED
   └─> features/chat/components/ChatInterface.jsx
       └─> config.voice_mode_enabled === true
           ↓
2. VOICE MODE HOOK
   └─> features/voice/hooks/useVoiceMode.ts
       ├─> Connect to Nova-Voice Gateway WebSocket (ws://localhost:5026)
       ├─> Request microphone access (getUserMedia)
       ├─> Create AudioContext and ScriptProcessorNode
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
           └─> Auto-send message (if text is not empty)
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
       ├─> Create AudioContext and ScriptProcessorNode
       ├─> Capture audio chunks (Float32Array → Int16Array)
       ├─> Send to main process via IPC (SEND_CHANNELS.WAKEWORD_AUDIO_CHUNK)
       └─> Main process forwards to Python wakeword service
           ↓
3. DETECTION EVENT
   └─> Python wakeword service detects wakeword
       └─> Main process → IPC: ON_CHANNELS.WAKEWORD_DETECTED
           └─> useWakewordDetection hook receives event
               └─> onWakewordDetected callback
                   ├─> ApiClient.wakewordDetected()
                   └─> SHOW_CHATBOX (IPC)
```

### Settings Management Flow

```
1. SETTINGS CHANGE
   └─> features/dashboard/components/DashboardContent.jsx
       └─> User changes model/speech settings
           └─> onConfigChange(newConfig)
               ↓
2. CONFIG UPDATE
   └─> app/providers/AppConfigContext.jsx
       ├─> filterFrontendConfig() - Filter to frontend-managed fields
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
   └─> Backend sends audio-chunk event
       └─> IPC: ON_CHANNELS.FROM_BACKEND
           ↓
2. AUDIO PLAYER SERVICE
   └─> infrastructure/audio/PlayerService.ts
       ├─> enqueueAudio() - Add chunk to queue
       ├─> playNext() - Play chunks sequentially
       ├─> base64ToArrayBuffer() - Decode base64 PCM data
       ├─> createAudioBuffer() - Convert Int16Array to Float32Array
       └─> AudioContext.createBufferSource() - Play audio
```

### Bundle Execution Flow

```
1. BUNDLE EVENT
   └─> Backend sends tool-bundle event
       └─> IPC: ON_CHANNELS.FROM_BACKEND
           ↓
2. TOOL EXECUTION SERVICE
   └─> infrastructure/services/ToolExecutionService.ts
       └─> executeToolBundle()
           ├─> Execute tools sequentially (with skipAutoCapture)
           ├─> Extract OS state after each computer-use tool
           ├─> FAIL-FAST: Stop on first error
           ├─> Capture screenshot/system state only after last tool
           ├─> formatBundledToolOutputMessage() - Format combined message
           ├─> Call onBundleResult callback (UI update)
           └─> Send tool-bundle-result to backend
               ↓
3. UI UPDATE
   └─> features/chat/hooks/useToolRunner.ts
       └─> onBundleResult callback
           └─> chatStore.addMessage() - Add bundled tool output message
```

---

## Key Design Principles

1. **Feature-Based Organization**: Code organized by feature (chat, settings, voice) rather than by technical layer

2. **Split Contexts**: AppConfigContext (infrequent changes) and AppStatusContext (frequent changes) separated to minimize re-renders

3. **Optimistic State**: Config loaded from localStorage immediately (zero latency) before backend sync

4. **Hook-Based Logic**: Business logic extracted into custom hooks (useChatStream, useToolRunner, useVoiceMode, etc.)

5. **Zustand Store**: Lightweight state management for chat messages (no Redux overhead)

6. **Type-Safe IPC**: Typed IPC bridge with channel validation (development only, preload.js validates in production)

7. **Pure Services**: Infrastructure services (ToolExecutionService, MessageFormatter, PlayerService) have no React dependencies

8. **Callback Pattern**: Services accept callbacks for UI updates and backend communication (dependency injection)

9. **Transparency Sections**: Collapsible sections for system prompts, tool schemas, and full messages (debugging/transparency)

10. **Computer-Use Tools**: Automatic screenshot/system state capture for mouse, keyboard, scroll, wait, switch_tab tools

11. **Bundle Execution**: Atomic tool bundles executed sequentially with fail-fast behavior

12. **Voice Integration**: Nova-Voice Gateway WebSocket for real-time transcription with utterance end detection

13. **Wakeword Detection**: openWakeWord integration via Python subprocess with audio chunk streaming

14. **Audio Playback**: Queue-based audio player for TTS chunks from backend

15. **Window Management**: Linux hides UI windows during screenshot capture to avoid self-capture; chat box overlay is click-through by default

16. **Memory Storage**: IPC integration with Python sidecar for memory operations

17. **Config Filtering**: Frontend only manages subset of config (model_mode, selected_model_id, voice_mode_enabled, etc.)

18. **Error Boundaries**: React error boundaries prevent full app crashes

19. **Lazy Loading**: DashboardContent lazy-loaded for faster initial render

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
│       │               └── MainLayout
│       │                   ├── Sidebar (section selector)
│       │                   └── Content
│       │                       ├── ChatInterface
│       │                       │   ├── MessageList
│       │                       │   │   ├── Message (user/assistant)
│       │                       │   │   ├── TransparencySection (system prompt, tool schemas, full messages)
│       │                       │   │   └── ThinkingDisplay
│       │                       │   ├── MessageInput
│       │                       │   │   └── VoiceStatus
│       │                       │   └── TokenCountDisplay
│       │                       └── DashboardContent (lazy-loaded sections)
```

---

## IPC Channel Usage

### Send Channels (Renderer → Main)
- `TO_BACKEND` - Send messages to backend WebSocket
- `WAKEWORD_AUDIO_CHUNK` - Send audio chunks for wakeword detection
- `WAKEWORD_ENABLE` - Enable wakeword detection
- `WAKEWORD_DISABLE` - Disable wakeword detection

### Invoke Channels (Renderer → Main, async)
- `EXECUTE_TOOL` - Execute tool via Python sidecar
- `GET_SYSTEM_STATE` - Get system state (active window, mouse, clipboard, etc.)
- `STORE_MEMORY` - Store memory via Python sidecar
- `SEARCH_MEMORY` - Search memory via Python sidecar

### On Channels (Main → Renderer, events)
- `FROM_BACKEND` - Backend WebSocket events (streaming-response, tool-call, tool-bundle, etc.)
- `IPC_STATUS` - IPC connection status
- `LOG` - Log messages from main process
- `WAKEWORD_DETECTED` - Wakeword detection event
- `WAKEWORD_STATUS` - Wakeword service status

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

### Computer-Use Tools
Tools that automatically capture screenshots and system state:
- `mouse_control`
- `keyboard_control`
- `scroll_control`
- `screenshot`
- `wait`
- `switch_tab`
- `run_shell_command` (if `wait` parameter provided)

### Tool Execution Options
- `skipAutoCapture` - Skip automatic screenshot/system state capture
- `correlationId` - Request ID for tracking tool execution

### Bundle Execution
- Atomic bundles executed sequentially
- Fail-fast: Stop on first error
- Screenshot/system state captured only after last tool
- Single combined message sent to backend

---

## Voice Integration

### Voice Mode (Nova-Voice Gateway)
- WebSocket connection to `ws://localhost:5026`
- Real-time transcription with incremental updates
- Utterance end detection (silence) triggers auto-send
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
- `fullUserMessage` - Complete user message with system context XML
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
2. **Lazy Loading**: DashboardContent loaded on demand
3. **Memoization**: Callbacks memoized with `useCallback`
4. **Zustand Selectors**: Components subscribe only to needed store slices
5. **Channel Validation**: Only in development (preload.js validates in production)
6. **Optimistic State**: Config loaded from localStorage immediately
7. **Refs for Stable Values**: Callbacks stored in refs to avoid effect re-runs
