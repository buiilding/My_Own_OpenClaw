# Frontend Architecture

## Overview

The frontend is built using Electron with React, providing a desktop application with a modern UI. It uses a three-process architecture: Main Process (Node.js), Renderer Process (React), and Python Sidecar (tool execution).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│              Electron Application                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Renderer Process (React)                         │  │
│  │  - React Components                               │  │
│  │  - Context Providers                              │  │
│  │  - Custom Hooks                                  │  │
│  │  - API Client                                    │  │
│  └───────────────────────────────────────────────────┘  │
│                    ↕ IPC (preload.js)                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Main Process (Node.js)                           │  │
│  │  - IPC Bridge (ipc.cjs)                           │  │
│  │  - WebSocket Client                                │  │
│  │  - Wakeword Bridge                                │  │
│  │  - Window Management                               │  │
│  └───────────────────────────────────────────────────┘  │
│                    ↕ WebSocket                            │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Python Backend                                    │  │
│  └───────────────────────────────────────────────────┘  │
│                    ↕ stdin/stdout                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Python Sidecar (runner.py)                        │  │
│  │  - Tool Execution                                   │  │
│  │  - System State Capture                             │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Directory Structure

```
frontend/
├── src/
│   ├── main/              # Main process (Electron)
│   │   ├── index.cjs      # Electron main entry
│   │   ├── ipc.cjs        # IPC bridge
│   │   ├── wakeword_bridge.cjs  # Wakeword service bridge
│   │   ├── local_backend_bridge.cjs  # Local backend bridge
│   │   └── python/        # Python sidecar
│   │       ├── local_backend.py  # Local backend service
│   │       ├── memory_service.py  # Memory service
│   │       ├── core/      # Core utilities
│   │       ├── tools/     # Tool implementations
│   │       └── memory/    # Memory storage
│   ├── preload.js         # Preload script (IPC bridge)
│   ├── renderer/          # Renderer process (React)
│   │   ├── app/           # App-level components
│   │   │   ├── App.jsx    # Root component
│   │   │   ├── main.jsx   # React entry point
│   │   │   └── providers/ # Context providers
│   │   │       ├── AppProvider.jsx  # Main app provider
│   │   │       ├── AppConfigContext.jsx  # Config context
│   │   │       ├── AppStatusContext.jsx   # Status context
│   │   │       └── ChatProvider.jsx  # Chat provider
│   │   ├── components/    # Shared React components
│   │   │   ├── ErrorBoundary.jsx
│   │   │   └── MainLayout.jsx
│   │   ├── features/      # Feature-based modules
│   │   │   ├── chat/      # Chat feature
│   │   │   │   ├── components/  # Chat components
│   │   │   │   ├── hooks/       # Chat hooks
│   │   │   │   └── stores/      # Zustand store
│   │   │   ├── settings/  # Settings feature
│   │   │   │   ├── components/
│   │   │   │   └── hooks/
│   │   │   └── voice/     # Voice feature
│   │   │       ├── components/
│   │   │       └── hooks/
│   │   ├── infrastructure/ # Infrastructure layer
│   │   │   ├── api/       # API client
│   │   │   ├── ipc/       # IPC bridge abstraction
│   │   │   ├── services/  # Business logic services
│   │   │   └── audio/     # Audio services
│   │   ├── utils/         # Utilities
│   │   └── styles/        # CSS styles
│   └── types/             # TypeScript types
├── index.html             # HTML entry point
├── package.json           # Dependencies and scripts
├── vite.config.js         # Vite configuration
└── schema.json            # WebSocket message schema
```

## Process Architecture

### Renderer Process (React)

The renderer process runs in a browser-like environment and contains the React UI.

#### Root Component

**App** (`app/App.jsx`):
- Root component with context providers
- ErrorBoundary wrapper for error handling
- Lazy loading for SettingsPanel (code splitting)
- Context providers: AppProvider, ChatProvider

**AppContent**:
- Content wrapper with access to AppConfigContext
- Renders MainLayout with ChatInterface and SettingsPanel
- Uses split contexts for performance (only re-renders when specific context changes)

#### Shared Components (`components/`)

**ErrorBoundary** (`ErrorBoundary.jsx`):
- React error boundary for catching component errors
- Displays error UI with retry option
- Logs errors for debugging
- Prevents entire app crash on component errors

**MainLayout** (`MainLayout.jsx`):
- Main application layout
- Chat interface and settings panel layout
- Responsive design
- Window management integration

#### Chat Feature Components (`features/chat/components/`)

**ChatInterface** (`ChatInterface.jsx`):
- Main chat interface component
- Integrates MessageList, MessageInput, ThinkingDisplay, TokenCountDisplay, TransparencySection
- Manages chat state via hooks (useChatStream, useChatMessageSender, useToolRunner)
- Handles voice mode integration

**MessageInput** (`MessageInput.jsx`):
- Text input for user messages
- Voice mode integration (transcription)
- Screenshot capture support
- Send button and keyboard shortcuts (Enter to send, Shift+Enter for newline)

**MessageList** (`MessageList.jsx`):
- Displays chat messages
- Scrolls to bottom on new messages
- Message type rendering (user, assistant, tool-call, tool-output, error)
- Screenshot display support

**ThinkingDisplay** (`ThinkingDisplay.jsx`):
- Displays LLM thinking/reasoning tokens (Gemini models)
- Real-time thinking status updates
- Auto-hides when thinking completes

**TokenCountDisplay** (`TokenCountDisplay.jsx`):
- Displays token usage information
- Shows prompt_tokens, completion_tokens, total_tokens
- Updates in real-time during streaming

**TransparencySection** (`TransparencySection.jsx`):
- Displays transparency information (system prompt, tool schemas, full messages)
- Collapsible sections for each transparency type
- System prompt display
- Tool schemas display
- Full user/assistant message display

#### Settings Feature Components (`features/settings/components/`)

**SettingsPanel** (`SettingsPanel.jsx`):
- Settings configuration panel
- Model selection (mode, provider, model)
- Voice mode toggle
- Speech mode toggle
- Fully controlled component (derives all values from config prop)

#### Voice Feature Components (`features/voice/components/`)

**VoiceStatus** (`VoiceStatus.jsx`):
- Displays voice mode status
- Wakeword detection status
- Connection status indicators

#### Component Hierarchy

```
App
├── ErrorBoundary
└── AppProvider (AppConfigProvider + AppStatusProvider)
    └── ChatProvider
        └── MainLayout
            ├── Sidebar
            ├── ChatInterface
            │   ├── MessageList
            │   │   ├── ThinkingDisplay
            │   │   └── TokenCountDisplay
            │   ├── MessageInput
            │   │   └── VoiceStatus
            │   └── TransparencySection
            └── SettingsPanel (lazy loaded)
```

#### Key Components

**App.jsx**
- Root component
- Sets up context providers
- Error boundary wrapper

**ChatInterface.jsx**
- Main chat interface
- Orchestrates message display and input
- Wakeword detection integration

**MessageList.jsx**
- Displays chat messages
- Handles different message types
- Auto-scroll functionality

**MessageInput.jsx**
- Text input with voice support
- Transcription integration
- Auto-send on utterance end

**SettingsPanel.jsx**
- Settings configuration UI
- Model selection
- Voice/speech mode toggles

#### Context Providers

**AppProvider** (`app/providers/AppProvider.jsx`)
- Combines AppConfigProvider and AppStatusProvider
- Maintains backward compatibility with legacy `useAppContext()` hook
- Coordinates between config and status contexts

**AppConfigContext** (`app/providers/AppConfigContext.jsx`)
- Application configuration (infrequently changing)
- Settings management
- Model list management
- Wakeword state
- Optimized to avoid unnecessary re-renders

**AppStatusContext** (`app/providers/AppStatusContext.jsx`)
- Transient application status (frequently changing)
- Settings save status (idle, saving, success, error)
- Separated from config to prevent unnecessary re-renders

**ChatProvider** (`app/providers/ChatProvider.jsx`)
- Thin wrapper that sets up chat hooks
- Initializes `useChatStream()` and `useToolRunner()`
- Provides access to chat store via Zustand

#### Custom Hooks

**Chat Feature Hooks** (`features/chat/hooks/`)

**useChatMessageSender** (`useChatMessageSender.ts`)
- Handles sending user messages with screenshot capture
- Window minimization coordination (2s delay)
- Screenshot capture after window minimize
- Message formatting and transmission via ApiClient
- Config merging and sending to backend

**Key Features**:
- Creates user message immediately for instant UI display
- Minimizes window after 2s delay (ensures chat window not in screenshot)
- Captures screenshot after window minimize
- Updates message with screenshot
- Sends query with screenshot and config to backend

**useChatStream** (`useChatStream.ts`)
- Manages streaming message responses from backend
- Handles LLM thought tokens (accumulates, keeps last 5000 chars)
- Streaming chunk handling (appends to last message or creates new)
- Tool call/output handling
- Message completion states
- Token count updates
- Transparency events (system prompt, user message full, assistant message full, tool schemas)

**Event Handlers**:
- `llm-thought`: Accumulates thinking tokens
- `streaming-response`: Appends chunks to streaming message
- `streaming-complete`: Marks message as complete
- `tool-call`: Creates tool call message
- `tool-output`: Creates tool output message
- `system-prompt`: Attaches to last user message
- `user-message-full`: Updates last user message with full content
- `assistant-message-full`: Updates last assistant message with full content
- `tool-schemas`: Attaches to first user message
- `token-count`: Updates token counts
- `error`: Displays error message

**useToolRunner** (`useToolRunner.ts`)
- Connects UI to ToolExecutionService
- Handles tool execution events from backend
- Manages tool bundling (atomic bundles)
- Updates chat store with tool results
- Handles memory storage requests
- Handles hidden screenshot requests

**Event Handlers**:
- `tool-bundle`: Executes atomic bundle directly
- `tool-call`: Executes individual tool
- `memory-store`: Stores memory via IPC
- `request-screenshot`: Captures hidden screenshot for coordinate calculation

**useTranscription** (`useTranscription.ts`)
- Input field state management
- Transcription text insertion with smart replacement
- Tracks transcription region boundaries
- Handles user typing/pasting within transcription region
- Cursor position management

**Key Features**:
- **Transcription Region Tracking**: Tracks start/end positions of transcription text
- **Smart Replacement**: Replaces existing transcription region when new transcription arrives
- **User Input Handling**: Invalidates transcription if user types within region
- **Paste Handling**: Updates transcription boundaries on paste
- **Cursor Management**: Maintains cursor position after transcription insertion

**Methods**:
- `insertTranscription(text)`: Insert transcription text with smart replacement
- `handleInputChange(event)`: Handle user input (invalidates transcription if within region)
- `handlePaste(event)`: Handle paste events (updates boundaries)

**Settings Feature Hooks** (`features/settings/hooks/`)

**useSettingsManagement** (`useSettingsManagement.ts`)
- Settings loading and saving (legacy, kept for compatibility)
- Model list management
- IPC event handling for `models-listed` events

**Voice Feature Hooks** (`features/voice/hooks/`)

**useVoiceMode** (`useVoiceMode.ts`)
- Voice input mode management
- WebSocket connection to Nova-Voice Gateway (`ws://localhost:5026`)
- Audio capture and transcription
- Automatic reconnection with exponential backoff (max 5 attempts)
- Utterance end detection (silence detection)

**Key Features**:
- **Audio Capture**: 16kHz, mono, echo cancellation, noise suppression
- **Format Conversion**: Float32 to Int16 conversion for transmission
- **Message Formatting**: Audio message formatting for Nova-Voice Gateway
- **Real-time Transcription**: Updates transcription in real-time
- **Utterance End**: Callback triggers auto-send on silence detection
- **Connection Management**: Automatic reconnection with exponential backoff

**Methods**:
- `startVoiceMode()`: Start voice mode and connect to gateway
- `stopVoiceMode()`: Stop voice mode and disconnect
- `sendAudioChunk(chunk)`: Send audio chunk to gateway

**useWakewordDetection** (`useWakewordDetection.ts`)
- Wakeword detection via openWakeWord (Python subprocess)
- Audio capture and processing
- IPC communication with main process
- Cooldown period (2 seconds) to prevent multiple rapid detections
- Chunk size validation (must be power of 2)

**Key Features**:
- **Audio Capture**: 16kHz, mono, echo cancellation, noise suppression, auto gain control
- **Format Conversion**: Float32 to Int16 conversion
- **IPC Communication**: Audio chunk transmission via IPC (`wakeword-audio-chunk`)
- **Detection Threshold**: Default 0.5 (configurable)
- **Service Status**: Monitors wakeword service status
- **Auto-Disable**: Automatically disables on detection (prevents buffered chunks from re-triggering)
- **Cooldown**: 2-second cooldown prevents rapid re-detections

**Methods**:
- `enableWakeword()`: Enable wakeword detection
- `disableWakeword()`: Disable wakeword detection
- `isEnabled()`: Check if wakeword detection is enabled

### Main Process (Node.js)

The main process manages the application lifecycle and IPC communication.

#### Key Modules

**index.cjs**
- Electron main entry point
- Window management (BrowserWindow)
- System tray (Tray with context menu)
- Application lifecycle (quit handling, cleanup)
- Window minimize handler (delayed minimization)

**Key Features**:
- **Hardware Acceleration**: Disabled (prevents GPU crashes)
- **Window Behavior**: Hides to tray on close (doesn't quit)
- **System Tray**: Tray icon with context menu (Show App, Quit)
- **Subprocess Management**: Spawns and manages local backend and wakeword service
- **Cleanup**: Cleans up subprocesses on quit

**ipc.cjs**
- IPC bridge between renderer and main
- WebSocket client to backend (`ws://127.0.0.1:8765/ws`)
- Message routing and transformation
- System state management
- Memory search integration
- User ID generation (from system username or UUID)

**Key Features**:
- **Handshake**: Sends user_id on WebSocket connection
- **User ID Generation**: From system username (sanitized) or UUID fallback
- **Context Building**: Builds complete user message with system state and memories
- **Parallel Operations**: Memory search and system state captured in parallel
- **Context Types**: Initial (first query) vs Sequential (subsequent queries)
- **Auto-Reconnect**: Reconnects on disconnect with 5s interval
- **Message Transformation**: Adds user_id, timestamp, system state, memories

**IPC Handlers**:
- `to-backend`: Forwards messages to backend WebSocket
- `from-backend`: Forwards WebSocket messages to renderer
- `execute-tool`: Executes tool via local backend bridge
- `get-system-state`: Gets system state via local backend bridge
- `store-memory`: Stores memory via local backend bridge
- `search-memory`: Searches memory via local backend bridge
- `minimize-window-delayed`: Minimizes window after 2s delay

**wakeword_bridge.cjs**
- Python wakeword service management (subprocess)
- Audio chunk forwarding (binary protocol)
- Detection result handling
- Service status management
- Buffer clearing on enable/disable

**Key Features**:
- **Binary Protocol**: 4-byte length prefix + audio data over stdin
- **Status Monitoring**: Parses JSON status messages from stderr
- **Model Download**: Handles model download status messages
- **Error Filtering**: Filters harmless graphics driver warnings
- **Process Lifecycle**: Spawns and manages Python subprocess

**local_backend_bridge.cjs**
- Python local backend service management (subprocess)
- JSON-RPC 2.0 protocol over stdin/stdout
- Request/response handling with pending request tracking
- Readiness checking (ping with exponential backoff)
- Python path detection (conda, system python)
- Process lifecycle management

**Key Features**:
- **JSON-RPC Protocol**: Full JSON-RPC 2.0 implementation
- **Readiness Check**: Pings backend until ready (max 10 attempts, exponential backoff)
- **Request Tracking**: Maps request IDs to callbacks
- **Error Handling**: Graceful degradation on process failures
- **Python Path Caching**: Caches Python executable path
- **Method Support**: `execute_tool`, `get_system_state`, `search_memory`, `store_memory`, `ping`, `get_status`

**test_shell.cjs**
- Test script for shell tool functionality
- Tests Google Chrome command execution
- Platform-specific command variations (Windows, macOS, Linux)
- Colored terminal output for test results

#### IPC Channels

**SEND_CHANNELS** (Renderer → Main, one-way):
- `to-backend`: Messages to backend
- `wakeword-audio-chunk`: Audio data (ArrayBuffer)
- `wakeword-enable`: Enable wakeword detection
- `wakeword-disable`: Disable wakeword detection

**INVOKE_CHANNELS** (Renderer → Main, async with response):
- `execute-tool`: Execute tool via Python sidecar
- `get-system-state`: Get current system state
- `store-memory`: Store memory in local store
- `search-memory`: Search local memory
- `minimize-window-delayed`: Minimize window after 2s delay

**ON_CHANNELS** (Main → Renderer, event listeners):
- `from-backend`: Messages from backend
- `ipc-status`: WebSocket connection status
- `log`: Log messages from main process
- `wakeword-detected`: Wakeword detection event
- `wakeword-status`: Wakeword service status

### Python Sidecar

The Python sidecar handles tool execution and system state capture.

#### Key Modules

**local_backend.py**
- Main Python process entry
- JSON-RPC 2.0 protocol handler
- Tool registry initialization
- Local memory store initialization
- Method registration (execute_tool, get_system_state, search_memory, store_memory, ping, get_status)

**Key Features**:
- **JSON-RPC Protocol**: Full JSON-RPC 2.0 implementation (`core/ipc_protocol.py`)
- **Tool Registry**: Centralized tool management with Pydantic validation
- **Memory Store**: Local SQLite + FAISS memory storage
- **Async Operations**: All operations are async
- **Error Handling**: Graceful error responses

**core/ipc_protocol.py**
- JSON-RPC 2.0 protocol implementation
- Request/response handling
- Method registration and routing
- Error code definitions (PARSE_ERROR, INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS, INTERNAL_ERROR)
- Async method support

**core/system_state.py**
- System state capture (cross-platform)
- Active window detection (Windows: win32gui, macOS: AppKit, Linux: xdotool)
- Mouse position (pyautogui)
- Clipboard preview (pyperclip, truncated to 100 chars)
- Screen resolution (pyautogui)
- Open windows list (WindowManager)
- System statistics (psutil: CPU, memory, battery)

**Key Features**:
- **Parallel Operations**: All state components captured in parallel (asyncio.gather)
- **Cross-Platform**: Windows, macOS, Linux support
- **Error Isolation**: Individual component failures don't block others
- **Thread Pool**: Blocking operations run in thread pool

**memory/local_store.py**
- Local memory storage (SQLite + FAISS)
- Separate databases for episodic and semantic memory
- Remote embedding client (calls backend API)
- Vector search with FAISS
- TTL-based cleanup
- Watermark state tracking

**Key Features**:
- **Remote Embeddings**: Uses RemoteEmbeddingClient (calls backend `/api/embeddings`)
- **Separate Indices**: Episodic and semantic memories have separate FAISS indices
- **Vector Mapping**: Maps FAISS vector IDs to memory IDs
- **Async Operations**: All database operations are async (aiosqlite)
- **Error Recovery**: Handles corrupted FAISS indices gracefully

**tools/memory/memory_tool.py**
- Memory management tool (FrontendTool)
- Operations: add, search, stats
- Integrates with LocalMemoryStore
- Pydantic validation for arguments

**wakeword_service.py**
- Wakeword detection service (subprocess)
- openWakeWord model loading (hey_jarvis)
- Audio chunk processing (16-bit PCM)
- Binary protocol over stdin/stdout
- Detection threshold: 0.5
- Model download on first run
- TFLite/ONNX fallback support

## Communication Flow

### User Message Flow

```
1. User types message in MessageInput
   ↓
2. useChatMessageSender hook handles message
   - Creates user message immediately (instant UI display)
   - Sets isSending=true
   ↓
3. Window minimized after 2s delay (if visible/focused)
   ↓
4. Screenshot captured after window minimize
   ↓
5. Message updated with screenshot
   ↓
6. Message sent via ApiClient.sendQuery() → IpcBridge.send('to-backend')
   ↓
7. Main process (ipc.cjs) receives via IPC
   ↓
8. Main process builds complete message:
   - Determines context type (initial vs sequential)
   - Starts memory search (parallel, optional)
   - Starts system state capture (parallel, required)
   - Waits for both (Promise.allSettled)
   - Formats system state XML (initial vs sequential format)
   - Builds complete message with system context and memories
   ↓
9. Main process forwards to backend via WebSocket
   ↓
10. Backend processes and streams response
    ↓
11. Main process receives WebSocket messages
    ↓
12. Main process forwards to renderer via IPC ('from-backend')
    ↓
13. useChatStream hook processes streaming events
    - LLM thoughts: Accumulates in thinkingStatus
    - Streaming chunks: Appends to last message or creates new
    - Tool calls: Creates tool call message
    - Tool outputs: Creates tool output message
    - Completion: Marks message as complete
    ↓
14. Chat store updated with messages
    ↓
15. UI updates via Zustand subscriptions
```

### Tool Execution Flow

#### Individual Tool Execution

```
1. Backend sends tool-call message
   ↓
2. Main process receives via WebSocket
   ↓
3. Main process forwards to renderer via IPC
   ↓
4. useToolRunner hook receives tool-call event
   ↓
5. ToolExecutionService.executeTool() called
   ↓
6. Tool sent to Python sidecar via IPC invoke
   ↓
7. Python sidecar executes tool
   ↓
8. ToolExecutionService.captureSystemStateAndScreenshot() called ONCE (if computer-use tool)
   - 2 second delay for UI to update
   - Parallel system state + screenshot capture
   ↓
9. ToolExecutionService formats result with MessageFormatter
   ↓
10. Result displayed in UI via callback
    ↓
11. Result sent to backend via WebSocket
    ↓
12. Backend processes result and continues
```

### Atomic Tool Bundling Flow

```
1. Backend sends single tool-bundle message with all tools
   ↓
2. useToolRunner receives tool-bundle and calls ToolExecutionService.executeToolBundle() directly
   ↓
3. Tools executed sequentially via Python sidecar (with skipAutoCapture=true, fail-fast on error)
   ↓
4. Step results collected in stepResults array
   ↓
5. ToolExecutionService.captureSystemStateAndScreenshot() called ONCE (if bundle contains computer-use tool)
   - 2 second delay for UI to update
   - Parallel system state + screenshot capture
   ↓
6. Combined formatted message created for UI display
   ↓
7. Single tool-bundle-result message sent to backend
   ↓
8. Bundled result displayed in UI
```

## State Management

### Hybrid State Management

The frontend uses a hybrid approach combining React Context API and Zustand:

**Context API** (for app-level, infrequently changing state):

**AppProvider** (`app/providers/AppProvider.jsx`):
- Main app provider that composes AppConfigContext and AppStatusContext
- Provides unified access to app-level state
- Exports hooks: `useAppConfigContext()`, `useAppStatusContext()`

**AppConfigContext** (`app/providers/AppConfigContext.jsx`):
- Application configuration, models, wakeword state
- Loads from localStorage immediately (optimistic state, zero latency)
- Manages available models list
- Handles config updates and persistence
- Filters config to frontend-managed fields only

**Key Features**:
- **Optimistic State**: Loads from localStorage immediately (zero latency)
- **Config Filtering**: Only manages frontend-managed fields (model_mode, model_provider, selected_model_id, voice_mode_enabled, speech_mode_enabled)
- **Model Management**: Requests and manages available models list
- **Persistence**: Saves config to localStorage on updates
- **Change Detection**: Skips save if no changes detected

**AppStatusContext** (`app/providers/AppStatusContext.jsx`):
- Transient status (save status)
- Settings save status (idle, saving, success, error)
- Auto-resets to idle after 3 seconds
- Separated from config to prevent unnecessary re-renders

**ChatProvider** (`app/providers/ChatProvider.jsx`):
- Chat-specific context provider
- Manages chat-related state
- Provides chat-related utilities

**Zustand Store** (for chat state):
- **chatStore** (`features/chat/stores/chatStore.ts`): Chat messages, sending state, thinking status, token counts
- Pure state management with no business logic
- O(1) access time with shallow equality checks
- Components subscribe directly to store slices

**ChatStore State**:
- `messages`: Array of ChatMessage objects
- `isSending`: Boolean flag for sending state
- `thinkingStatus`: String for LLM thinking tokens
- `tokenCounts`: TokenCounts object (prompt_tokens, completion_tokens, total_tokens)

**ChatMessage Interface**:
- `id`: Unique message identifier
- `text`: Message text content
- `sender`: 'user' | 'assistant'
- `type`: Optional message type ('llm-text' | 'tool-call' | 'tool-output' | 'error')
- `isComplete`: Boolean flag for streaming completion
- `screenshot`: Optional base64-encoded screenshot
- `toolMetadata`: Optional tool execution metadata
- `toolName`: Optional tool name
- `executionTime`: Optional execution time in seconds
- `success`: Optional success flag
- `correlationId`: Optional correlation ID
- `timestamp`: Optional ISO timestamp
- `systemPrompt`: Optional system prompt for transparency
- `toolSchemas`: Optional tool schemas for transparency
- `fullUserMessage`: Optional full user message for transparency
- `fullAssistantMessage`: Optional full assistant message for transparency

**ChatStore Actions**:
- `addMessage(message)`: Add new message
- `updateMessage(id, updates)`: Update existing message (partial updates)
- `setMessages(messages)`: Replace all messages
- `setIsSending(isSending)`: Update sending state
- `setThinkingStatus(status)`: Update thinking status (null to clear)
- `setTokenCounts(counts)`: Update token counts (null to clear)
- `clearMessages()`: Clear all messages (resets to initial message)

**Performance Features**:
- **Shallow Equality**: Zustand uses shallow equality for performance
- **Direct Subscriptions**: Components subscribe directly to store slices
- **O(1) Access**: Direct property access (no context propagation overhead)

### State Flow

```
User Action
  ↓
Component Event Handler
  ↓
Service/Hook (business logic)
  ↓
Store/Context Update
  ↓
Component Re-render (only subscribed components)
  ↓
UI Update
```

### Performance Optimizations

- **Split Contexts**: AppConfigContext and AppStatusContext separated to prevent re-renders
- **Zustand Store**: Direct subscriptions to store slices, no context propagation overhead
- **Lazy Loading**: SettingsPanel loaded lazily to improve initial render time
- **Stable IPC Listeners**: IPC callbacks use refs to maintain stable identity
- **Optimistic State**: Config loaded from localStorage immediately (zero latency)
- **Shallow Equality**: Zustand uses shallow equality for performance

## Infrastructure Layer

### API Client (`infrastructure/api/client.ts`)

Typed API client for backend communication using typed IPC bridge.

**Methods**:
- `sendQuery(text, screenshot, config)`: Send user query with optional screenshot and config
- `listModels()`: Request available models
- `wakewordDetected()`: Notify wakeword detection

**Features**:
- Uses IpcBridge for type-safe IPC communication
- Mirrors backend message schema
- Optional config dictionary for per-query model selection

### Utilities (`renderer/utils/`)

**configFilter.js**:
- `filterFrontendConfig(config)`: Filters config to only frontend-managed fields
- `isFrontendConfigOnly(config)`: Checks if config only contains frontend-managed fields
- **Frontend-Managed Fields**: `model_mode`, `model_provider`, `selected_model_id`, `voice_mode_enabled`, `speech_mode_enabled`

**configStorage.js**:
- `loadConfigFromStorage()`: Load config from localStorage (optimistic state)
- `saveConfigToStorage(config, version)`: Save config to localStorage
- `getConfigVersion()`: Get stored config version timestamp
- `clearConfigStorage()`: Clear stored configuration

**Features**:
- **Optimistic State**: Loads from localStorage immediately (zero latency)
- **Version Tracking**: Tracks config version with timestamps
- **Error Recovery**: Handles corrupted localStorage data gracefully
- **Validation**: Validates config format before saving/loading

### IPC Bridge (`infrastructure/ipc/bridge.ts`)

Type-safe IPC bridge abstraction with channel validation.

**Features**:
- Type-safe channel constants (SEND_CHANNELS, INVOKE_CHANNELS, ON_CHANNELS)
- Runtime validation in development
- Preload.js security validation in production
- O(1) channel lookup using Set data structures

**IpcBridge Object**:
- `send(channel, data)`: Send one-way message (no response)
- `invoke(channel, data)`: Invoke async handler (returns Promise)
- `on(channel, handler)`: Subscribe to messages (returns unsubscribe function)
- `once(channel, handler)`: One-time subscription (auto-unsubscribes after first message)

**Channel Types** (`infrastructure/ipc/channels.ts`):
- **SEND_CHANNELS**: One-way messages (renderer → main)
  - `TO_BACKEND`: Messages to backend
  - `WAKEWORD_AUDIO_CHUNK`: Audio data (ArrayBuffer)
  - `WAKEWORD_ENABLE`: Enable wakeword detection
  - `WAKEWORD_DISABLE`: Disable wakeword detection
- **INVOKE_CHANNELS**: Async invocations (renderer → main, with response)
  - `EXECUTE_TOOL`: Execute tool via Python sidecar
  - `GET_SYSTEM_STATE`: Get current system state
  - `STORE_MEMORY`: Store memory in local store
  - `SEARCH_MEMORY`: Search local memory
  - `MINIMIZE_WINDOW_DELAYED`: Minimize window after 2s delay
- **ON_CHANNELS**: Event listeners (main → renderer)
  - `FROM_BACKEND`: Messages from backend
  - `IPC_STATUS`: WebSocket connection status
  - `LOG`: Log messages from main process
  - `WAKEWORD_DETECTED`: Wakeword detection event
  - `WAKEWORD_STATUS`: Wakeword service status

**Security**:
- Channels whitelisted in preload.js
- Runtime validation in development mode
- Type-safe channel constants prevent typos

### Services (`infrastructure/services/`)

**ToolExecutionService** (`infrastructure/services/ToolExecutionService.ts`):
- Handles tool execution and bundling
- Automatic screenshot capture for computer-use tools:
  - Individual tools: Screenshot captured **once** after tool execution
  - Bundled tools: Screenshot captured **once** after all bundled tools execute
  - Both use `captureSystemStateAndScreenshot()` helper method with 2s delay and parallel capture
- System state capture and formatting
- Callback-based architecture for UI updates
- Pure infrastructure code (no React dependencies)

**Key Methods**:
- `executeTool(toolName, args, callbacks)`: Execute single tool
- `executeToolBundle(tools, bundleId, callbacks)`: Execute atomic bundle (sequential, fail-fast)
- `captureSystemStateAndScreenshot(callbacks)`: Capture system state and screenshot (2s delay, parallel)
- `_executeToolViaIPC(toolName, args, skipAutoCapture)`: Execute tool via IPC invoke

**Features**:
- **Atomic Bundling**: Tools in bundle execute sequentially, fail-fast on error
- **Screenshot Optimization**: Single screenshot capture per bundle (not per tool)
- **Error Handling**: Graceful error handling with callback notifications
- **State Capture**: Parallel system state and screenshot capture for efficiency

**MessageFormatter** (`infrastructure/services/MessageFormatter.ts`):
- Pure functions for formatting tool output messages
- System context XML formatting
- Tool result formatting
- Bundle result formatting
- No side effects, no React dependencies

**Key Functions**:
- `formatSystemContext(systemState)`: Format system state as XML
- `formatToolResult(toolName, result, systemState, screenshot)`: Format single tool result
- `formatBundleResult(bundleId, stepResults, systemState, screenshot)`: Format bundle result
- `formatToolOutputMessage(...)`: Format complete tool output message

**PlayerService** (`infrastructure/audio/PlayerService.ts`):
- TTS audio playback queue
- Sequential playback management
- Audio format conversion
- Callback-based architecture

**Key Methods**:
- `playAudio(audioData, format, callback)`: Queue audio for playback
  - `audioData`: Base64-encoded audio data
  - `format`: Audio format ("wav" or "mp3")
  - `callback`: Optional callback when playback completes
- `stop()`: Stop current playback and clear queue
- `isPlaying()`: Check if audio is currently playing

**Features**:
- **Queue Management**: Sequential playback queue (one audio at a time)
- **Format Support**: Handles base64-encoded audio (WAV, MP3)
- **Playback Control**: Stop and clear queue functionality
- **Audio Element**: Uses HTML5 Audio element for playback
- **Error Handling**: Handles playback errors gracefully

## Security

### IPC Security

- **Context Isolation**: Renderer isolated from Node.js (`contextIsolation: true`)
- **Preload Script**: Secure IPC bridge via `contextBridge.exposeInMainWorld()`
- **Whitelisted Channels**: Only allowed channels exposed in preload.js
- **No Node Integration**: Renderer has no Node.js access (`nodeIntegration: false`)
- **Channel Validation**: Runtime validation in development, preload.js validation in production

### Content Security

- **CSP Headers**: Content Security Policy enforced
- **No Inline Scripts**: All scripts from files
- **HTTPS Only**: All external resources over HTTPS

### Data Security

- **Local Storage**: Config stored in localStorage (frontend-only)
- **No Sensitive Data**: No API keys or sensitive data in frontend
- **User ID Generation**: System username or UUID (never 'default_user')
- **Input Validation**: Pydantic validation in Python sidecar

## Performance

### Optimization Strategies

- **Code Splitting**: Lazy loading of components
- **Memoization**: React.memo for expensive components
- **Virtual Scrolling**: For long message lists (planned)
- **Debouncing**: Input debouncing for search

### Caching

- **Settings Cache**: Cached in context
- **Model List Cache**: Cached after first load
- **Screenshot Cache**: Cached in message objects

## Build System

### Vite Configuration

- **Dev Server**: Hot module replacement
- **Build**: Production bundle optimization
- **React Plugin**: JSX transformation

### Electron Build

- **Electron Builder**: Package for distribution
- **Platform Targets**: Windows, macOS, Linux
- **Auto Updater**: Update mechanism (planned)

## Testing

### Test Structure

```
tests/frontend/
├── App.spec.jsx              # Root App component tests
├── ChatInterface.spec.jsx    # Chat interface tests
├── MainLayout.spec.jsx       # Main layout tests
├── SettingsPanel.spec.jsx    # Settings panel tests
├── ThinkingDisplay.spec.jsx  # Thinking display tests
├── ErrorBoundary.spec.jsx    # Error boundary tests
└── __mocks__/
    └── styleMock.js          # CSS module mock
```

### Testing Tools

- **Jest**: Test runner with jsdom environment
- **React Testing Library**: Component testing utilities
- **jsdom**: DOM environment for browser-like testing
- **Babel**: JavaScript transpilation (via babel.config.cjs)
- **@testing-library/jest-dom**: Custom Jest matchers for DOM

### Test Configuration

**jest.config.cjs**:
- Test environment: jsdom
- Module name mapping for CSS imports
- Transform patterns for JS/JSX files
- Coverage collection

**jest.setup.js**:
- Global test setup
- Custom matchers from @testing-library/jest-dom

### Testing Patterns

- **Component Testing**: Test component rendering and interactions
- **Hook Testing**: Test custom hooks in isolation
- **Integration Testing**: Test component interactions
- **Mocking**: Mock IPC bridge, WebSocket, and external services

## Development Workflow

### Development Mode

1. Start backend: `python -m backend.src.main`
2. Start Vite dev server: `npm run dev`
3. Launch Electron: `npm run electron`

### Production Build

1. Build renderer: `npm run build`
2. Package Electron: `npm run package`

## Extension Points

### Custom Components

1. Create component in `components/` or feature-specific `components/` directory
2. Add to component hierarchy
3. Style with CSS modules
4. Use TypeScript for type safety

### Custom Hooks

1. Create hook in feature-specific `hooks/` directory
2. Export hook function
3. Use in components
4. Follow React hooks rules

### Custom Tools

1. Create tool in `frontend/src/main/python/tools/`
2. Inherit from `FrontendTool` base class
3. Define Pydantic schema for arguments
4. Register in `tools/registry.py` (TOOL_SCHEMAS dict)
5. Tool automatically available via JSON-RPC

### Custom IPC Channels

1. Add channel constant to `infrastructure/ipc/channels.ts`
2. Add to preload.js whitelist
3. Add handler in main process (ipc.cjs or bridge files)
4. Use IpcBridge in renderer

## Python Sidecar Details

### JSON-RPC Protocol

**Protocol**: JSON-RPC 2.0 over stdin/stdout

**Request Format**:
```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "method": "execute_tool",
  "params": {
    "tool_name": "mouse_control",
    "args": { "action": "click", "x": 100, "y": 200 }
  }
}
```

**Response Format**:
```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "result": {
    "success": true,
    "data": { ... }
  }
}
```

**Error Format**:
```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "error": {
    "code": -32603,
    "message": "Internal error",
    "data": { ... }
  }
}
```

### Local Memory Store

**Architecture**:
- Separate SQLite databases for episodic and semantic memory
- Separate FAISS indices for each memory type
- Remote embedding client (calls backend `/api/embeddings`)
- Vector ID mapping (FAISS vector ID ↔ memory ID)

**Operations**:
- `add(content, user_id, metadata)`: Add memory
- `search(query, user_id, filters, limit)`: Search memories
- `get_stats(user_id)`: Get memory statistics
- `close()`: Close database connections

**Features**:
- Async operations (aiosqlite)
- TTL-based cleanup
- Watermark state tracking for semanticization
- Error recovery (handles corrupted FAISS indices)

### Wakeword Service

**Protocol**: Binary protocol over stdin/stdout

**Message Format**:
- 4 bytes: Message length (little-endian)
- N bytes: Audio data (16-bit PCM) or reset signal (length=0)

**Response Format**:
- 4 bytes: Response length (little-endian)
- N bytes: JSON response

**Features**:
- Model download on first run (hey_jarvis)
- TFLite/ONNX fallback support
- Detection threshold: 0.5
- Confidence logging (all scores > 0.05)
- Model reset support (clear internal buffers)
- Binary protocol for efficient audio transmission

#### Tool System

**ToolRegistry** (`tools/registry.py`):
- Centralized tool management
- Pydantic schema validation
- Tool execution routing
- Error handling

**Tool Registration**:
- Tools registered in `_register_tools()` method
- Each tool has corresponding Pydantic schema in `TOOL_SCHEMAS`
- Graceful degradation: Tools that fail to import are logged but don't crash

**Tool Execution Flow**:
1. Request received via JSON-RPC
2. Tool name validated against registry
3. Arguments validated against Pydantic schema
4. Tool function called with validated args
5. Result converted to ToolResult and returned

**Tool Categories**:
- **Computer Tools**: mouse_control, keyboard_control, screenshot, scroll_control
- **Filesystem Tools**: read_file, write_file, list_directory, replace, search_file_content, glob, read_many_files
- **System Tools**: run_shell_command, switch_tab, get_open_windows, get_system_stats, wait
- **Memory Tool**: memory (add, search, stats operations)

**Tool Schemas** (`tools/schemas.py`):
- Pydantic models for all tool arguments
- Type validation and constraints
- Custom validators for action-specific fields
- Examples: MouseControlArgs, KeyboardControlArgs, ScreenshotToolArgs, etc.

**Tool Result** (`tools/result.py`):
- `ToolResult`: Standardized result structure
  - `success`: Boolean
  - `data`: Optional dictionary
  - `error`: Optional error message
  - `to_dict()`: Convert to dictionary for JSON-RPC
  - `success_result(data)`: Factory method for success
  - `error_result(error)`: Factory method for error

#### Remote Embedding Client

**RemoteEmbeddingClient** (`core/remote_embedding_client.py`):
- HTTP client for backend embedding API
- Calls `POST /api/embeddings/` endpoint
- Converts response to numpy array
- Health check support (`GET /api/embeddings/health`)
- Async operations (aiohttp)

**Key Methods**:
- `embed_text(text)`: Generate embedding (returns numpy array)
- `health_check()`: Check service health
- `initialize()`: Initialize HTTP session
- `close()`: Close HTTP session

**Features**:
- 30-second timeout for embedding requests
- 5-second timeout for health checks
- Error handling with detailed error messages
- Default dimension: 384 (common for embedding models)

---

For more detailed information, see:
- [Communication Flow](COMMUNICATION_FLOW.md)
- [API Reference](API_REFERENCE.md)
- [Tool System](TOOL_SYSTEM.md)
