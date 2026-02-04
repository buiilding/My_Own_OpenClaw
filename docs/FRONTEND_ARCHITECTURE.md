---
summary: "Frontend Architecture"
read_when:
  - When changing renderer or Electron main process.
---

# Frontend Architecture

## Overview

The frontend is built using Electron with React, providing a desktop application with a modern UI. It uses a three-process architecture: Main Process (Node.js), Renderer Process (React), and Python Sidecar (tool execution).

## Future: Multi-User UX & Subscription Readiness (Planned)

To bring this to end users at scale, the frontend needs explicit **account, billing, and usage limit** UX. This section outlines the planned additions.

### 1) Authentication & Account Management
- **Login / Signup** screens (email + OAuth).
- **Session persistence** using secure storage (OS keychain).
- **Device management**: list active sessions, revoke device access.

### 2) Subscription & Billing UI
- **Plan selection** page with feature matrix.
- **Upgrade/downgrade** flow with proration awareness.
- **Billing portal** link (Stripe customer portal).
- **Payment failure** UX with retry and grace period messaging.

### 3) Usage & Limits
- **Usage meter**: show remaining tokens/requests for the billing period.
- **Soft limit warning**: 80–90% usage indicators in the UI.
- **Hard limit blocking**: clear “limit reached” state with upgrade CTA.
- **Per-feature gating**: show locked states for higher-tier features.

### 4) Multi-Device & Sync
- **User profile** and preferences synced across devices.
- **Settings conflict resolution** (last-write-wins + versioning).
- **Conversation sync** for active sessions.

### 5) Safety & Transparency
- **Tool permission prompts** scoped to plan/role.
- **Audit history UI** to show tool calls and actions.
- **Data deletion** flows for compliance (account + data removal).

### 6) Offline & Local-Only Modes
- **Local-only mode** for privacy-first users (no cloud sync).
- **Graceful fallback** when backend is unreachable.

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
│  │  Python Sidecar (local_backend.py)                 │  │
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
- Handles sending user messages
- Screenshot capture coordination
- Message formatting and transmission

**useChatStream** (`useChatStream.ts`)
- Manages streaming message responses from backend
- Handles LLM thought tokens
- Tool call/output handling
- Message completion states
- Token count updates

**useToolRunner** (`useToolRunner.ts`)
- Connects UI to ToolExecutionService
- Handles tool execution events
- Manages tool bundling
- Updates chat store with tool results

**useTranscription** (`useTranscription.ts`)
- Input field state management
- Transcription text insertion
- Smart replacement logic

**Settings Feature Hooks** (`features/settings/hooks/`)

**useSettingsManagement** (`useSettingsManagement.ts`)
- Settings loading and saving
- Model list management
- IPC event handling

**Voice Feature Hooks** (`features/voice/hooks/`)

**useVoiceMode** (`useVoiceMode.ts`)
- Voice input mode management
- WebSocket connection to Nova-Voice Gateway
- Audio capture and transcription

**useWakewordDetection** (`useWakewordDetection.ts`)
- Wakeword detection via openWakeWord
- Audio capture and processing
- IPC communication with main process

### Main Process (Node.js)

The main process manages the application lifecycle and IPC communication.

#### Key Modules

**index.cjs**
- Electron main entry point
- Window management
- Enables content protection on Windows/macOS to reduce self-capture in screenshots
- Chat box overlay window (transparent, always-on-top) with click-through default; settings button opens main window
- System tray
- Application lifecycle

**ipc.cjs**
- IPC bridge between renderer and main
- WebSocket client to backend
- Message routing
- Broadcasts backend events to all renderer windows (main + chat box)
- System state management

**wakeword_bridge.cjs**
- Python wakeword service management
- Audio chunk forwarding
- Detection result handling
- Service status management

#### IPC Channels

**Renderer → Main**:
- `to-backend`: Messages to backend
- `wakeword-audio-chunk`: Audio data
- `wakeword-enable`: Enable wakeword
- `wakeword-disable`: Disable wakeword
- `show-main-window`: Bring the main window to the front
- `set-overlay-ignore-mouse`: Toggle click-through behavior for the chat box overlay

**Main → Renderer**:
- `from-backend`: Messages from backend
- `ipc-status`: Connection status
- `wakeword-detected`: Wakeword detection
- `wakeword-status`: Service status

### Python Sidecar

The Python sidecar handles tool execution and system state capture.

#### Key Modules

**local_backend.py**
- Main Python sidecar entry
- JSON-RPC processing
- Tool execution routing via ToolRegistry

**tools/registry.py**
- Tool dispatcher/registry
- Pydantic arg validation
- Calls tool implementations under `tools/`

**core/system_state.py**
- System state capture
- Active window detection
- Mouse position
- Clipboard preview
- System statistics

## Communication Flow

### User Message Flow

```
1. User types message in MessageInput
   ↓
2. useChatMessageSender hook handles message
   ↓
3. Screenshot captured (always for visual context)
   ↓
4. Message sent via IpcBridge.send('to-backend')
   ↓
5. Main process receives via IPC
   ↓
6. Main process builds complete message with system state and memories
   ↓
7. Main process forwards to backend via WebSocket
   ↓
8. Backend processes and streams response
   ↓
9. Main process receives WebSocket messages
   ↓
10. Main process forwards to renderer via IPC
    ↓
11. useChatStream hook processes streaming events
    ↓
12. Chat store updated with messages
    ↓
13. UI updates via Zustand subscriptions
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
- **AppConfigContext**: Application configuration, models, wakeword state
- **AppStatusContext**: Transient status (save status)
- Split contexts prevent unnecessary re-renders when only status changes

**Note**: AppConfigContext persists settings to localStorage and `frontend-config.json` (Electron userData). Settings are not stored by the backend.

**Zustand Store** (for chat state):
- **chatStore** (`features/chat/stores/chatStore.ts`): Chat messages, sending state, thinking status, token counts
- Pure state management with no business logic
- O(1) access time with shallow equality checks
- Components subscribe directly to store slices

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

## Infrastructure Layer

### API Client (`infrastructure/api/client.ts`)

Typed API client for backend communication.

**Methods**:
- `sendQuery(text, screenshot)`: Send user query
- `updateSettings(config)`: Send frontend-managed config updates
- `listModels()`: Request available models
- `wakewordDetected()`: Notify wakeword detection

**Note**: Settings are frontend-only and persisted locally (no `updateSettings` or `loadSettings` calls).

### IPC Bridge (`infrastructure/ipc/bridge.ts`)

Type-safe IPC bridge abstraction with channel validation.

**Features**:
- Type-safe channel constants (SEND_CHANNELS, INVOKE_CHANNELS, ON_CHANNELS)
- Runtime validation in development
- Preload.js security validation in production
- O(1) channel lookup using Set data structures

**Methods**:
- `IpcBridge.send(channel, data)`: Send one-way message
- `IpcBridge.invoke(channel, data)`: Invoke async handler
- `IpcBridge.on(channel, handler)`: Subscribe to messages
- `IpcBridge.once(channel, handler)`: One-time subscription

### Services (`infrastructure/services/`)

**ToolExecutionService** (`ToolExecutionService.ts`):
- Handles tool execution and bundling
- Automatic screenshot capture for computer-use tools:
  - Individual tools: Screenshot captured **once** after tool execution
  - Bundled tools: Screenshot captured **once** after all bundled tools execute
  - Both use `captureSystemStateAndScreenshot()` helper method with 2s delay and parallel capture
- System state capture and formatting
- Callback-based architecture for UI updates
- Pure infrastructure code (no React dependencies)

**MessageFormatter** (`MessageFormatter.ts`):
- Pure functions for formatting tool output messages
- System context XML formatting
- Tool result formatting
- Bundle result formatting
- No side effects, no React dependencies

**PlayerService** (`infrastructure/audio/PlayerService.ts`):
- TTS audio playback queue
- Sequential playback management
- Audio format conversion
- Callback-based architecture

## Security

### IPC Security

- **Context Isolation**: Renderer isolated from Node.js
- **Preload Script**: Secure IPC bridge
- **Whitelisted Channels**: Only allowed channels exposed
- **No Node Integration**: Renderer has no Node.js access

### Content Security

- **CSP Headers**: Content Security Policy enforced
- **No Inline Scripts**: All scripts from files
- **HTTPS Only**: All external resources over HTTPS

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
├── App.spec.jsx
├── ChatInterface.spec.jsx
├── MainLayout.spec.jsx
└── SettingsPanel.spec.jsx
```

### Testing Tools

- **Jest**: Test runner
- **React Testing Library**: Component testing
- **jsdom**: DOM environment
- **Babel**: JavaScript transpilation

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

1. Create component in `components/`
2. Add to component hierarchy
3. Style with CSS modules

### Custom Hooks

1. Create hook in `hooks/`
2. Export hook function
3. Use in components

### Custom Tools

1. Create tool in `src/main/python/tools/`
2. Register in dispatcher
3. Tool automatically available

---

For more detailed information, see:
- [Communication Flow](COMMUNICATION_FLOW.md)
- [API Reference](API_REFERENCE.md)
- [Tool System](TOOL_SYSTEM.md)
