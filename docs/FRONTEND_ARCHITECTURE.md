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
│   │   └── python/        # Python sidecar
│   │       ├── runner.py  # Main Python process
│   │       ├── core/      # Core utilities
│   │       └── tools/     # Tool implementations
│   ├── preload.js         # Preload script (IPC bridge)
│   ├── renderer/          # Renderer process (React)
│   │   ├── main.jsx       # React entry point
│   │   ├── App.jsx        # Root component
│   │   ├── components/    # React components
│   │   ├── context/       # Context providers
│   │   ├── hooks/         # Custom hooks
│   │   ├── api/           # API client
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
└── AppProvider
    └── ChatProvider
        └── MainLayout
            ├── Sidebar
            ├── ChatInterface
            │   ├── MessageList
            │   │   └── ThinkingDisplay
            │   └── MessageInput
            │       └── VoiceStatus
            └── SettingsPanel
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

**AppContext** (`context/AppContext.jsx`)
- Global application state
- Settings management
- Model list management
- Wakeword state

**ChatContext** (`context/ChatContext.jsx`)
- Chat-specific state
- Message management
- Streaming state
- Audio playback

#### Custom Hooks

**useStreamingMessages**
- Manages streaming message responses
- Handles LLM thought tokens
- Tool call/output handling

**useVoiceMode**
- Voice input mode management
- WebSocket connection to Nova-Voice Gateway
- Audio capture and transcription

**useWakewordDetection**
- Wakeword detection via openWakeWord
- Audio capture and processing
- IPC communication with main process

**useAudioPlayer**
- TTS audio playback queue
- Sequential playback management
- Audio format conversion

**useTranscription**
- Input field state management
- Transcription text insertion
- Smart replacement logic

### Main Process (Node.js)

The main process manages the application lifecycle and IPC communication.

#### Key Modules

**index.cjs**
- Electron main entry point
- Window management
- System tray
- Application lifecycle

**ipc.cjs**
- IPC bridge between renderer and main
- WebSocket client to backend
- Message routing
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

**Main → Renderer**:
- `from-backend`: Messages from backend
- `ipc-status`: Connection status
- `wakeword-detected`: Wakeword detection
- `wakeword-status`: Service status

### Python Sidecar

The Python sidecar handles tool execution and system state capture.

#### Key Modules

**runner.py**
- Main Python process entry
- Message processing from stdin
- Tool execution routing
- System state requests

**core/dispatcher.py**
- Tool dispatcher
- Tool discovery and loading
- Automatic screenshot capture
- Result formatting

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
2. sendMessage() called in ChatContext
   ↓
3. Screenshot captured (if needed)
   ↓
4. Message sent via window.ipc.send('to-backend')
   ↓
5. Main process receives via IPC
   ↓
6. Main process forwards to backend via WebSocket
   ↓
7. Backend processes and streams response
   ↓
8. Main process receives WebSocket messages
   ↓
9. Main process forwards to renderer via IPC
   ↓
10. Renderer updates UI with streaming response
```

### Tool Execution Flow

```
1. Backend sends tool-call message
   ↓
2. Main process receives via WebSocket
   ↓
3. Main process forwards to renderer via IPC
   ↓
4. Renderer displays tool call in UI
   ↓
5. Main process sends tool request to Python sidecar
   ↓
6. Python sidecar executes tool
   ↓
7. Python sidecar captures screenshot (if needed)
   ↓
8. Python sidecar sends result to main process
   ↓
9. Main process sends result to backend via WebSocket
   ↓
10. Backend processes result and continues
```

## State Management

### Context API

The frontend uses React Context API for state management:

**AppContext**:
- `config`: Application configuration
- `saveStatus`: Settings save status
- `availableModels`: Available LLM models
- `wakewordEnabled`: Wakeword detection state

**ChatContext**:
- `messages`: Chat messages array
- `isSending`: Sending state
- `thinkingStatus`: LLM thinking tokens
- `tokenCounts`: Token usage counts

### State Flow

```
User Action
  ↓
Component Event Handler
  ↓
Context Update
  ↓
Component Re-render
  ↓
UI Update
```

## API Client

### API Client (`api/client.js`)

Typed API client for backend communication.

**Methods**:
- `sendQuery(text, screenshot)`: Send user query
- `updateSettings(settings)`: Update settings
- `listModels()`: Request available models
- `loadSettings()`: Request current settings
- `wakewordDetected()`: Notify wakeword detection

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
