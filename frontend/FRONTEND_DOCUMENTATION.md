# Frontend Code Documentation

This document provides a comprehensive explanation of every file in the frontend codebase, organized by directory structure.

## Table of Contents

1. [Configuration Files](#configuration-files)
2. [Main Process (Electron)](#main-process-electron)
3. [Preload Script](#preload-script)
4. [Renderer Process (React)](#renderer-process-react)
   - [Entry Point](#entry-point)
   - [API Client](#api-client)
   - [Context Providers](#context-providers)
   - [Components](#components)
   - [Hooks](#hooks)
   - [Styles](#styles)
5. [Type Definitions](#type-definitions)

---

## Configuration Files

### `package.json`
**Purpose**: Defines project metadata, dependencies, and npm scripts.

**Key Dependencies**:
- **React ^18.2.0**: UI framework
- **React-DOM ^18.2.0**: React DOM renderer
- **UUID ^8.3.2**: For generating unique message IDs in main process (backend communication)
- **WebSocket (ws) ^8.18.3**: For backend communication (main process only)

**Key Dev Dependencies**:
- **Electron ^27.1.2**: Desktop application framework
- **Vite ^4.4.5**: Build tool and dev server

**Scripts**:
- `dev`: Starts Vite dev server (http://localhost:5173)
- `build`: Builds production bundle
- `lint`: Runs ESLint
- `preview`: Previews production build
- `electron`: Launches Electron app
- `test`: Runs Jest tests

**Note**: The project uses ES modules (`"type": "module"`) but the main process files use CommonJS (`.cjs` extension). Zustand is listed as a dev dependency (version ^5.0.8) but is not currently used anywhere in the codebase. The UUID package is only used in the main process (`ipc.cjs`) for generating backend message IDs; the renderer process uses `crypto.randomUUID()` for message IDs.

---

### `vite.config.js`
**Purpose**: Vite build configuration.

**Configuration**:
- Uses `@vitejs/plugin-react` for React support
- Minimal configuration - relies on Vite defaults
- Serves the renderer process during development

**Build Output**: Production builds go to `dist/` directory.

---

### `babel.config.cjs`
**Purpose**: Babel transpilation configuration for Jest tests.

**Presets**:
- `@babel/preset-env`: Transpiles modern JavaScript for Node.js
- `@babel/preset-react`: Transforms JSX with automatic runtime

**Usage**: Used by Jest to transform test files and source code during testing.

---

### `jest.config.cjs`
**Purpose**: Jest test runner configuration.

**Key Settings**:
- **rootDir**: Project root (parent directory)
- **testMatch**: Tests in `tests/frontend/**/*.spec.jsx`
- **roots**: Source files from `frontend/src` and tests from `tests/frontend`
- **moduleNameMapper**: Path aliases (`@/` → `frontend/src/`, `@components/` → `frontend/src/renderer/components/`)
- **moduleDirectories**: Resolves modules from `frontend/node_modules` and `node_modules`
- **testEnvironment**: `jsdom` for DOM testing
- **transform**: Uses Babel with `babel.config.cjs`
- **setupFilesAfterEnv**: Loads `jest.setup.js` for test environment setup

**Note**: Configured to run from `frontend/` directory but resolve paths relative to project root. CSS files are mocked via `styleMock.js` located at `tests/frontend/__mocks__/styleMock.js`.

---

### `jest.setup.js`
**Purpose**: Jest test environment setup.

**Setup**:
- Imports `@testing-library/jest-dom` matchers
- Mocks `scrollIntoView` (not implemented in jsdom)

---

### `index.html`
**Purpose**: HTML entry point for the renderer process.

**Structure**:
- Basic HTML5 document
- Root div (`#root`) for React mounting
- Script tag loads `main.jsx` as ES module

**Usage**: Loaded by Electron's BrowserWindow in production, served by Vite in development.

---

### `schema.json`
**Purpose**: JSON Schema defining WebSocket message types for backend communication.

**Message Types Defined**:
- **Incoming**: `ping`, `query`, `load-settings`, `list-models`, `update-settings`
- **Outgoing**: `error`, `streaming-response`, `streaming-complete`, `llm-thought`, `tool-call`, `tool-output`

**Usage**: Used to generate TypeScript types (`schema.ts`) via `json-schema-to-typescript`.

---

## Main Process (Electron)

The main process runs in Node.js and manages the application lifecycle, window management, and IPC communication.

### `src/main/index.cjs`
**Purpose**: Electron main process entry point - manages application lifecycle and window creation.

**Key Responsibilities**:
1. **Window Management**: Creates and manages the main BrowserWindow (1000x700px)
2. **System Tray**: Creates tray icon with context menu (Show App, Quit)
3. **Window Behavior**: 
   - Hides to tray on close (doesn't quit)
   - Shows window on tray double-click
   - Prevents quitting when all windows closed
4. **Hardware Acceleration**: Disabled to prevent GPU crashes
5. **Initialization**: 
- Calls `initializeIpc(mainWindow)` to set up WebSocket bridge
- Calls `initializeWakewordBridge(mainWindow)` to start Python wakeword service

**Window Configuration**:
- Uses `preload.js` for secure IPC bridge (path: `../preload.js`)
- `contextIsolation: true` for security
- `nodeIntegration: false` for security
- Loads from `http://localhost:5173` in dev (when `NODE_ENV !== 'production'`), `dist/index.html` in production
- Window size: 1000x700px (increased width to accommodate sidebar)

---

### `src/main/ipc.cjs`
**Purpose**: IPC bridge between Electron main process, renderer process, and Python backend.

**Key Responsibilities**:
1. **WebSocket Connection**: Connects to Python backend at `ws://127.0.0.1:8765/ws`
2. **Message Routing**: 
   - Receives messages from renderer via `to-backend` IPC channel
   - Forwards to Python backend via WebSocket
   - Receives messages from backend and forwards to renderer via `from-backend` IPC channel
3. **Connection Management**:
   - Auto-reconnects on disconnect (5 second interval)
   - Sends handshake message on connect: `{ type: 'handshake', user_id: 'default_user' }`
   - Tracks connection status and notifies renderer via `ipc-status` channel
4. **Message Format**: Adds `id` (UUID v4 generated via `uuid` package), `type`, `payload`, and `timestamp` (ISO string) to messages before sending to backend
5. **Logging**: Selective logging - only logs important events (errors, queries, wakeword detections). Debug logging is available but commented out.

**IPC Channels**:
- `to-backend`: Renderer → Main → Backend (messages with type, payload)
- `from-backend`: Backend → Main → Renderer (parsed JSON messages)
- `ipc-status`: Connection status updates (`{ isConnected: boolean }`)

**Error Handling**: Logs errors, handles WebSocket errors gracefully, continues reconnection attempts.

---

### `src/main/wakeword_bridge.cjs`
**Purpose**: Manages Python wakeword detection service subprocess and audio processing.

**Key Responsibilities**:
1. **Python Process Management**:
   - Spawns Python subprocess running `wakeword_service.py`
   - Detects Python executable (checks conda environment first, then py/python3)
   - Handles process lifecycle (start, stop, error handling)
   - Starts service automatically when bridge is initialized
2. **Audio Processing**:
   - Receives audio chunks from renderer via `wakeword-audio-chunk` IPC
   - Converts base64/buffer/ArrayBuffer to Buffer format
   - Forwards to Python process via stdin (binary protocol: 4-byte length + data)
   - Receives detection results via stdout (binary protocol: 4-byte length + JSON)
   - Parses JSON detection results and forwards to renderer
   - Logs chunk counts for debugging (first chunk and every 50th chunk)
3. **Status Management**:
   - Tracks Python service readiness (via stderr JSON messages with `status: "ready"`)
   - Handles enable/disable wakeword detection via IPC
   - Clears result buffers when disabled to prevent false detections
   - Sends reset signal (4-byte length = 0) to Python process when disabling
   - Sends status updates to renderer via `wakeword-status` IPC
4. **Buffer Management**:
   - Maintains `resultBuffer` for parsing binary detection results
   - Clears buffer on disable via `clearResultBuffer()` to prevent processing buffered detections
   - Ignores detection results when `isWakewordEnabled` is false
   - Clears buffer after sending detection to prevent duplicate/buffered detections
5. **Error Handling**:
   - Detects Python not found (Windows error code 9009, ENOENT)
   - Handles process crashes and restarts
   - Provides user-friendly error messages
   - Handles stderr buffering for JSON status messages (splits by newlines, processes complete JSON lines)
   - Logs Python service errors and confidence scores to console

**IPC Channels**:
- `wakeword-audio-chunk`: Renderer → Main → Python (audio data)
- `wakeword-detected`: Python → Main → Renderer (detection results)
- `wakeword-status`: Main → Renderer (service status)
- `wakeword-enable`: Renderer → Main (enable detection)
- `wakeword-disable`: Renderer → Main (disable detection)

**Binary Protocol**:
- Audio chunks: `[4-byte length (little-endian)][audio data]`
- Detection results: `[4-byte length (little-endian)][JSON string]`
- Reset signal: `[4-byte length = 0]`

---

### `src/main/wakeword_service.py`
**Purpose**: Python subprocess that performs wakeword detection using openWakeWord library.

**Key Responsibilities**:
1. **Model Initialization**: 
   - Loads "hey_jarvis" wakeword model using openWakeWord with `inference_framework="tflite"`
   - Sends ready status to stderr (JSON) when model loads successfully
   - Sends error status to stderr if model initialization fails
2. **Audio Processing**:
   - Reads audio chunks from stdin (binary protocol: 4-byte length + PCM data)
   - Converts bytes to numpy int16 array (16-bit PCM) using `np.frombuffer()`
   - Runs predictions through openWakeWord model via `owwModel.predict()`
   - Detects wakeword when confidence >= 0.5 (detection_threshold)
   - Handles reset signal (length 0) by calling `owwModel.reset()` to clear internal state
   - Logs chunk counts for debugging (first chunk and every 50th chunk)
3. **Output**:
   - Sends ready status to stderr (JSON) on model initialization and main loop start
   - Sends detection results to stdout (binary protocol: 4-byte length + JSON)
   - Logs confidence scores to stderr for debugging (scores > 0.05)
   - Logs detections with confidence percentage when threshold exceeded
4. **Error Handling**: 
   - Catches exceptions and sends error status to stderr (JSON format)
   - Handles KeyboardInterrupt gracefully
   - Exits with code 0 on normal termination

**Dependencies**: Requires `openwakeword` and `numpy` Python packages.

**Protocol**:
- Input: Binary audio chunks via stdin (4-byte length + PCM data)
  - Special reset signal: 4-byte length = 0 (clears model state)
- Output: Detection results via stdout (4-byte length + JSON)
- Status: JSON messages via stderr

---

## Preload Script

### `src/preload.js`
**Purpose**: Secure bridge between Electron main process and renderer process.

**Security Model**:
- Uses `contextBridge` to expose safe APIs to renderer
- Prevents direct access to Node.js APIs
- Whitelists specific IPC channels

**Exposed API** (`window.ipc`):
- `send(channel, data)`: Send messages to main process
  - Valid channels: `to-backend`, `wakeword-audio-chunk`, `wakeword-enable`, `wakeword-disable`
- `on(channel, func)`: Listen for messages from main process
  - Valid channels: `from-backend`, `ipc-status`, `log`, `wakeword-detected`, `wakeword-status`
  - Returns cleanup function
- `once(channel, func)`: One-time listener

**Usage**: Renderer process uses `window.ipc` to communicate with main process securely. The `on` method returns a cleanup function that removes the listener.

---

## Renderer Process (React)

The renderer process runs in the browser context and contains the React UI application.

### Entry Point

#### `src/renderer/main.jsx`
**Purpose**: React application entry point.

**Functionality**:
- Creates React root and mounts `<App />` component
- Wraps in `React.StrictMode` for development checks
- Mounts to `#root` element in `index.html`

---

#### `src/renderer/App.jsx`
**Purpose**: Root React component - sets up context providers and layout.

**Component Hierarchy**:
```
<ErrorBoundary>
  <AppProvider>
    <ChatProvider>
      <MainLayout>
        <ChatInterface />
        <SettingsPanel />
      </MainLayout>
    </ChatProvider>
  </AppProvider>
</ErrorBoundary>
```

**Key Responsibilities**:
1. **Error Boundary**: Catches React errors and displays fallback UI
2. **Context Providers**: Provides app-wide state via `AppProvider` and `ChatProvider`
3. **Layout**: Uses `MainLayout` to structure sidebar, main content, and settings panel

**Component Structure**:
- `AppContent`: Inner component that has access to `AppContext`
- `App`: Outer component that sets up providers

---

### API Client

#### `src/renderer/api/client.js`
**Purpose**: Typed API client for backend communication.

**Methods**:
- `sendQuery(text)`: Sends user query to backend (type: `'query'`, payload: `{ text }`)
- `updateSettings(settings)`: Updates application settings (type: `'update-settings'`, payload: settings object)
- `listModels()`: Requests available LLM models (type: `'list-models'`, no payload)
- `loadSettings()`: Requests current settings (type: `'load-settings'`, no payload)
- `wakewordDetected()`: Notifies backend of wakeword detection (type: `'wakeword-detected'`, payload: `{}`)

**Implementation**: Uses `window.ipc.send('to-backend', ...)` to send messages through IPC bridge.

**Message Format**: All messages follow schema defined in `schema.json`.

---

### Context Providers

#### `src/renderer/context/AppContext.jsx`
**Purpose**: Global application state management for settings and configuration.

**State Managed**:
- `config`: Current application configuration (model settings, voice mode, etc.) - initially `null`
- `saveStatus`: Status of settings save operation (`idle`, `saving`, `success`, `error`) - defaults to `'idle'`
- `availableModels`: List of available LLM models (`{ local: [], online: [] }`) - defaults to empty arrays
- `wakewordEnabled`: Whether wakeword detection is enabled - defaults to `true`

**Key Functions**:
- `updateConfig(newConfig)`: Updates config with optimistic UI updates and error handling
- Uses `useSettingsManagement` hook for settings logic

**Backend Events Handled**:
- `settings-loaded`: Initial config load (handled by `handleSettingsLoaded`)
- `models-listed`: Available models received (handled by `handleModelsListed`)
- `settings-updated`: Settings saved successfully (handled by `handleSettingsUpdated`)
- `error`: Settings save errors (handled by `handleSettingsError` if message includes "Failed to update settings")

**Optimistic Updates**: Updates UI immediately, reverts on error with 10-second timeout fallback. Uses `configBeforeSave` ref to store previous config for rollback.

---

#### `src/renderer/context/ChatContext.jsx`
**Purpose**: Chat-specific state management for messages and streaming.

**State Managed**:
- `messages`: Array of chat messages (message IDs generated using `crypto.randomUUID()`)
- `isSending`: Whether a message is being sent/streamed
- `thinkingStatus`: Accumulated LLM thinking tokens (for Gemini models)

**Key Functions**:
- `sendMessage(text)`: Sends user message and updates state
- Uses `useStreamingMessages` hook for message handling
- Uses `useAudioPlayer` hook for TTS audio playback

**Backend Events Handled**:
- `pong`, `response`: Simple responses
- `llm-thought`: Thinking tokens (accumulated)
- `streaming-response`: Streaming text chunks (appended to last message)
- `streaming-complete`: Marks streaming as complete
- `tool-call`: Tool execution requests
- `tool-output`: Tool execution results (with optional screenshots)
- `wakeword-activated`: Wakeword activation logging
- `wakeword-greeting`: Greeting message after wakeword
- `audio-chunk`: TTS audio chunks (enqueued for playback)
- `error`: Error messages

**Initial Message**: Starts with greeting: "Hello! How can I help you today?" (hardcoded in ChatContext initialization, ID generated using `crypto.randomUUID()`)

---

### Components

#### `src/renderer/components/ChatInterface.jsx`
**Purpose**: Main chat interface component - orchestrates chat interaction.

**Key Responsibilities**:
1. **Message Display**: Renders `MessageList` with messages and thinking status
2. **Input Handling**: Renders `MessageInput` for text/voice input
3. **Wakeword Detection**: Uses `useWakewordDetection` hook
   - Only enabled when `wakewordEnabled` is true AND `voiceModeEnabled` is false
   - Automatically disables wakeword detection when voice mode is active
4. **Voice Mode**: Enables voice mode when wakeword detected and notifies backend

**Props**: None (uses context)

**Wakeword Integration**: 
- Uses `useWakewordDetection` hook with condition: `wakewordEnabled && !voiceModeEnabled`
- When wakeword detected, calls `handleWakewordDetected` callback which:
  - Enables voice mode (via `updateConfig` with `voice_mode_enabled: true`)
  - Notifies backend via `ApiClient.wakewordDetected()`

---

#### `src/renderer/components/MainLayout.jsx`
**Purpose**: Main structural layout component.

**Layout Structure**:
- **Sidebar** (200px): Navigation menu (currently just "Chat")
- **Main Content** (flex): Chat interface
- **Settings Sidebar** (300px): Settings panel

**CSS Grid**: Uses CSS Grid with 3 columns: `200px 1fr 300px`

**Props**:
- `chat`: React node for chat component
- `settings`: React node for settings component

---

#### `src/renderer/components/SettingsPanel.jsx`
**Purpose**: Settings configuration panel.

**Settings Managed**:
1. **Model Mode**: Toggle between "Online (Cloud)" and "Local"
2. **Model Selection**: Dropdown of available models (filtered by mode)
   - Displays models as "model-id (provider)"
   - Tracks both `selectedModelId` and `selectedProvider` state
   - Resets selection when switching modes
3. **Voice Mode**: Toggle for voice input mode
4. **Speech Mode (TTS)**: Toggle for text-to-speech output

**Key Features**:
- **Auto-save**: Settings save automatically on change (only when values actually change, checks specific fields: `model_mode`, `selected_model_id`, `model_provider`, `voice_mode_enabled`, `speech_mode_enabled`)
- **Model Validation**: Validates selected model exists in available models, resets if not available (waits for `availableModels` to load before validating)
- **Provider Management**: Automatically updates provider when model is selected
- **Save Status Feedback**: `SaveStatusFeedback` component is defined but not currently rendered in the UI (save status is tracked via `saveStatus` prop and used to disable inputs during save via `isSaving` state)
- **Loading States**: Disables inputs while saving (`isSaving` state)
- **Model Reset Warning**: Shows warning message if selected model becomes unavailable (auto-clears after 5 seconds, styled with yellow background)

**State Management**:
- Local state for form inputs (`modelMode`, `selectedModelId`, `selectedProvider`, `voiceModeEnabled`, `speechModeEnabled`)
- Syncs with `config` prop from `AppContext` via `useEffect` (only updates local state if config has the value, uses `undefined` check for voice/speech modes)
- Calls `onConfigChange` when settings change (only if values actually changed, checks specific fields)
- Waits for `availableModels` to load before validating/resetting models (checks if both arrays are empty)
- Uses `modelResetWarning` state to display temporary warnings when model is reset
- Resets model selection when switching modes (`modelMode` changes)

**Error Handling**: Shows warning if selected model becomes unavailable, auto-resets to first available model.

---

#### `src/renderer/components/ErrorBoundary.jsx`
**Purpose**: React error boundary component - catches JavaScript errors in child components.

**Functionality**:
- Catches errors during rendering, lifecycle methods, and constructors
- Displays fallback UI with error details
- Logs errors to console

**Error Display**: Shows error message and stack trace in red box with padding. Uses `<details>` element for collapsible error information.

**Usage**: Wraps entire app in `App.jsx` to prevent white screen of death.

---

#### `src/renderer/components/ThinkingDisplay.jsx`
**Purpose**: Displays LLM thinking/reasoning tokens (for Gemini models).

**Features**:
- **Collapsible**: Can expand/collapse to view full thinking content
- **Auto-detection**: Detects if content is thinking tokens vs simple status
- **Spinner**: Shows loading spinner while thinking
- **Truncation**: Keeps last 5000 characters (managed by `useStreamingMessages`)

**Display Logic**:
- Simple status (< 50 chars, no newlines, doesn't contain "thinking"): Shows as single line with "Thinking..." label
- Thinking tokens (length > 50 OR contains newlines OR contains "thinking"): Shows collapsible section with full content, labeled "🧠 Model Reasoning" with expand/collapse toggle

**Accessibility**: Uses `role="status"` and `aria-live="polite"` for screen readers.

---

#### `src/renderer/components/ConfirmationDialog.jsx`
**Purpose**: Currently empty file - placeholder for future confirmation dialogs.

**Status**: Not implemented yet (file exists but contains no code).

---

#### `src/renderer/components/VoiceControls.jsx`
**Purpose**: Currently empty file - placeholder for voice control UI.

**Status**: Not implemented yet (file exists but contains no code; voice controls handled by hooks).

---

#### `src/renderer/components/chat/MessageInput.jsx`
**Purpose**: Text input component with voice transcription support.

**Key Features**:
1. **Text Input**: Standard text input with send button
2. **Voice Mode Integration**: Uses `useVoiceMode` hook for voice input
3. **Transcription**: Uses `useTranscription` hook to manage transcription text
4. **Auto-send**: Sends message when utterance ends (silence detected)
5. **Voice Status**: Shows `VoiceStatus` component for recording status

**Hooks Used**:
- `useTranscription`: Manages input value and transcription updates
- `useVoiceMode`: Handles voice recording and WebSocket connection

**Placeholder**: Changes based on voice mode: "Type your message or speak..." vs "Type your message..."

**Form Submission**: Prevents default, validates input, calls `onSendMessage`.

---

#### `src/renderer/components/chat/MessageList.jsx`
**Purpose**: Displays list of chat messages.

**Key Features**:
1. **Message Rendering**: Renders different message types:
   - **Normal messages**: User (blue) and assistant (gray) bubbles
   - **Tool calls**: Green-themed container with tool name and parameters
   - **Tool outputs**: Orange-themed container with output and optional screenshot
   - **Errors**: Red-themed error container
2. **Auto-scroll**: Scrolls to bottom when new messages arrive
3. **Streaming Indicator**: Shows streaming messages with reduced opacity
4. **Thinking Display**: Shows `ThinkingDisplay` component at bottom

**Message Types**:
- `llm-text`: Normal LLM response (streaming or complete, marked with `isComplete: false` during streaming)
- `tool-call`: Tool execution request (displays raw_call or formatted JSON)
- `tool-output`: Tool execution result (with optional screenshot, shows error if present)
- `error`: Error message (displays in red-themed error container)

**Screenshot Display**: Renders base64 screenshots from tool outputs as images with max dimensions (maxWidth: 100%, maxHeight: 400px) and border styling.

---

#### `src/renderer/components/chat/VoiceStatus.jsx`
**Purpose**: Status indicator for voice mode.

**Display States**:
1. **Error**: Red error message if voice mode fails
2. **Recording**: Blue indicator showing "Voice mode active - Listening..." or "Connecting..."
3. **Hidden**: No indicator when not recording

**Visual Design**: Uses colored borders and backgrounds for clear status indication.

---

### Hooks

#### `src/renderer/hooks/useAudioPlayer.js`
**Purpose**: Manages audio playback queue for TTS (text-to-speech) audio chunks.

**Key Features**:
1. **Audio Queue**: Maintains queue of audio chunks
2. **Sequential Playback**: Plays chunks one at a time, automatically advancing
3. **Audio Context**: Lazy initialization (requires user interaction)
4. **Format Conversion**: Converts base64 PCM data to AudioBuffer
5. **Sample Rate**: Supports configurable sample rate (default 16000 Hz)

**Methods**:
- `enqueueAudio(chunk)`: Adds audio chunk to queue (`{ audio: base64, sample_rate: number }`)
- `stopPlayback()`: Clears queue and stops playback
- `isAudioPlaying`: State indicating if audio is currently playing

**Audio Processing**:
- Converts base64 → ArrayBuffer → Int16Array → Float32Array
- Creates AudioBuffer using the `sample_rate` from the chunk payload (not a fixed default)
- Uses Web Audio API for playback

**Cleanup**: Closes AudioContext on unmount.

---

#### `src/renderer/hooks/useSettingsManagement.js`
**Purpose**: Custom hook for managing settings loading and updating logic.

**Key Functions**:
- `handleSettingsLoaded(data)`: Processes loaded settings, requests models
- `handleModelsListed(data)`: Updates available models state
- `handleSettingsUpdated()`: Handles successful save (clears timeout, shows success)
- `handleSettingsError(data)`: Handles save errors (reverts config, shows error)

**Usage**: Used by `AppContext` to handle settings-related backend events.

**Error Handling**: Reverts to previous config on error, manages timeout for save operations.

---

#### `src/renderer/hooks/useStreamingMessages.js`
**Purpose**: Manages streaming message responses from backend.

**Key Functions**:
- `handlePongResponse(data)`: Handles simple responses
- `handleLlmThought(data)`: Accumulates thinking tokens (keeps last 5000 chars)
- `handleStreamingResponse(data)`: Appends streaming chunks to last message
- `handleStreamingComplete()`: Marks streaming as complete
- `handleToolCall(data)`: Adds tool call message
- `handleToolOutput(data)`: Adds tool output message (with screenshot)
- `handleError(data)`: Adds error message

**Streaming Logic**:
- Creates new message on first chunk
- Appends to last message if it's a streaming LLM text message
- Marks message as `isComplete: false` during streaming
- Sets `isComplete: true` on completion

**Thinking Tokens**: Accumulates thinking tokens separately, doesn't clear on completion.

---

#### `src/renderer/hooks/useTranscription.js`
**Purpose**: Manages input field state and voice transcription text insertion.

**Key Features**:
1. **Transcription Region Tracking**: Tracks which part of input is transcription
2. **Smart Replacement**: Replaces transcription region when new transcription arrives
3. **Cursor Management**: Handles cursor position when user types/pastes
4. **Boundary Updates**: Updates transcription boundaries when user edits

**Methods**:
- `inputValue`: Current input value
- `setInputValue`: Update input value
- `updateTranscription(text)`: Insert/update transcription text
- `resetTranscription()`: Clear transcription region
- `handleInputChange(e)`: Handle text input changes
- `handlePaste(e)`: Handle paste events

**Transcription Logic**:
- If transcription region exists: replaces it (tracks boundaries via `transcriptionStartRef` and `transcriptionEndRef`)
- If no transcription region: appends at end
- Invalidates region if user edits within it (sets `hasTranscriptionRef.current = false`)
- Handles cursor position updates when user types before/after/within transcription region

---

#### `src/renderer/hooks/useVoiceMode.js`
**Purpose**: Manages voice input mode - connects to Nova-Voice Gateway WebSocket.

**Key Features**:
1. **WebSocket Connection**: Connects to Nova-Voice Gateway (`ws://localhost:5026`)
2. **Audio Capture**: Captures microphone audio using Web Audio API
3. **Audio Processing**: Converts Float32Array to Int16Array (16-bit PCM)
4. **Transcription**: Receives real-time transcription from Gateway
5. **Utterance Detection**: Detects silence/utterance end for auto-send
6. **Reconnection**: Auto-reconnects on disconnect (exponential backoff: `RECONNECT_DELAY_BASE * 2^attempt`, max 5 attempts). Stops reconnecting after max attempts reached and sets error state.

**Audio Format**:
- Sample rate: 16000 Hz
- Channels: Mono (1 channel)
- Format: Int16 PCM
- Buffer size: 4096 samples (for ScriptProcessorNode)
- Message format: `[4-byte metadata length (Uint32Array)][JSON metadata (UTF-8)][Int16Array audio data]`

**WebSocket Messages**:
- **Outgoing**: `set_langs` (sets source/target language: en/en), `start_over` (resets Gateway session after utterance end)
- **Incoming**: `status` (connection status with client_id), `realtime` (transcription result with `text` or `translation`, `is_final`), `utterance_end` (silence detected, triggers auto-send)

**State**:
- `isConnected`: WebSocket connection status (state)
- `isRecording`: Audio capture status (state, synced with `isRecordingRef.current`)
- `error`: Error message if any (state)
- `clientId`: Gateway client ID (state, from `status` message)

**Return Value**: Returns object with `{ isConnected, isRecording, error, clientId }`

**Cleanup**: Stops audio capture and closes WebSocket on disable/unmount.

---

#### `src/renderer/hooks/useWakewordDetection.js`
**Purpose**: Manages wakeword detection using openWakeWord via Electron main process.

**Key Features**:
1. **Audio Capture**: Captures microphone audio (16000 Hz, mono)
2. **Audio Processing**: Converts Float32Array to Int16Array (16-bit PCM)
3. **IPC Communication**: Sends audio chunks to main process via `wakeword-audio-chunk`
4. **Detection Handling**: Receives detection events from main process
5. **Cooldown**: Prevents multiple rapid detections (2 second cooldown)
6. **Service Management**: Enables/disables detection, handles service status

**Configuration**:
- `sampleRate`: 16000 Hz (default)
- `chunkSize`: 1024 samples (default, auto-corrected to nearest valid size from: 256, 512, 1024, 1280, 2048, 4096, 8192, 16384)
- `threshold`: 0.5 confidence (default)

**IPC Channels**:
- `wakeword-audio-chunk`: Sends audio chunks to main process
- `wakeword-detected`: Receives detection events
- `wakeword-status`: Receives service status
- `wakeword-enable`: Enables detection
- `wakeword-disable`: Disables detection (clears buffers)

**Detection Logic**:
- Checks confidence >= threshold
- Enforces cooldown period (2 seconds between detections)
- Immediately sends `wakeword-disable` signal on successful detection to clear buffers and prevent buffered chunks from triggering false positives
- Resets cooldown when disabled/re-enabled (sets `lastDetectionRef.current = Date.now()`)
- Uses refs to avoid re-running effects when callback changes (`onWakewordDetectedRef`)

**State**:
- `isReady`: Python service ready status (from `wakeword-status` IPC)
- `error`: Error message if any (from service status or audio capture failures)
- `isCapturing`: Audio capture status (from `isCapturingRef.current`)

**Return Value**: Returns object with `{ isReady, error, isCapturing }` where `isCapturing` is read from `isCapturingRef.current` (not state)

**Cleanup**: Stops audio capture on disable/unmount.

---

### Styles

#### `src/renderer/styles/accessibility.css`
**Purpose**: Accessibility utility classes.

**Classes**:
- `.visually-hidden`: Hides element visually but keeps accessible to screen readers

**Usage**: Applied to labels and other elements that should be accessible but not visible.

---

#### `src/renderer/styles/ChatInterface.css`
**Purpose**: Styles for chat interface components.

**Key Styles**:
1. **Chat Container**: Flex column layout, full height
2. **Message List**: Scrollable message area with gap between messages
3. **Message Bubbles**:
   - User messages: Blue background, right-aligned
   - Assistant messages: Gray background, left-aligned
   - Streaming messages: Reduced opacity
4. **Tool Messages**:
   - Tool calls: Green-themed container
   - Tool outputs: Orange-themed container with screenshots
5. **Input Form**: Flex layout with input and send button
6. **Input Field**: Rounded border, focus states
7. **Send Button**: Blue button with hover states

**Color Scheme**:
- User messages: `#007aff` (iOS blue)
- Assistant messages: `#e5e5ea` (light gray)
- Tool calls: Green theme (`#4CAF50`)
- Tool outputs: Orange theme (`#ff9500`)

---

#### `src/renderer/styles/MainLayout.css`
**Purpose**: Styles for main application layout.

**Layout**:
- CSS Grid: `200px 1fr 300px` (sidebar | main | settings)
- Full viewport height

**Sidebar**:
- White background
- Border on right
- Navigation list styling

**Main Content**:
- Flex column
- Scrollable

**Settings Sidebar**:
- White background
- Border on left
- Scrollable

**Color Scheme**: Light gray background (`#f0f2f5`), white panels.

---

#### `src/renderer/styles/SettingsPanel.css`
**Purpose**: Styles for settings panel form.

**Form Elements**:
- Form groups with spacing
- Labels with font weight
- Inputs and selects with focus states
- Radio button toggle for model mode
- Toggle switches for voice/speech mode

**Toggle Switch**:
- Custom styled checkbox
- Blue when checked, gray when unchecked
- Smooth transition animation
- Disabled state styling

**Save Status**:
- Color-coded status messages (blue/green/red)
- Font weight for visibility

**Model Selection**:
- Dropdown with full width
- "No models" message styling

**Color Scheme**: Uses Tailwind-inspired colors (blue-500, green-500, red-500).

---

#### `src/renderer/styles/ThinkingDisplay.css`
**Purpose**: Styles for thinking/reasoning display component.

**Key Styles**:
1. **Container**: Gray background, rounded border, fade-in animation
2. **Header**: Clickable header with spinner and label
3. **Content**: Collapsible content area (max-height transition)
4. **Text**: Monospace font, pre-wrap for formatting
5. **Spinner**: Rotating border animation

**Animations**:
- `fadeIn`: Fades in on mount
- `spin`: Rotates spinner
- `max-height`: Smooth expand/collapse

**Accessibility**: Respects `prefers-reduced-motion` media query.

**Color Scheme**: Gray theme (`#f3f4f6` background, `#374151` text).

---

## Type Definitions

### `src/types/schema.ts`
**Purpose**: TypeScript type definitions generated from `schema.json`.

**Generation**: Auto-generated by `json-schema-to-typescript` - **DO NOT MODIFY MANUALLY**.

**Types Defined**:
- `ClientSchema`: Root schema type
- `Incoming`: Union of incoming message types
- `PingMessage`, `QueryMessage`, `LoadSettingsMessage`, etc.: Individual message types
- `ErrorResponse`, `StreamingResponse`, `ToolCallMessage`, etc.: Response types

**Usage**: Provides type safety for backend communication (though currently not enforced in JavaScript code).

**Note**: File is marked with `/* eslint-disable */` to prevent linting errors on generated code.

---

## Architecture Overview

### Communication Flow

```
Renderer Process (React)
    ↓ (IPC via preload.js)
Main Process (Electron)
    ↓ (WebSocket)
Python Backend (ws://127.0.0.1:8765/ws)
```

### Wakeword Detection Flow

```
Renderer (useWakewordDetection)
    ↓ (IPC: wakeword-audio-chunk)
Main Process (wakeword_bridge.cjs)
    ↓ (stdin: binary protocol)
Python Service (wakeword_service.py)
    ↓ (stdout: binary protocol)
Main Process
    ↓ (IPC: wakeword-detected)
Renderer
```

### Voice Mode Flow

```
Renderer (useVoiceMode)
    ↓ (WebSocket: ws://localhost:5026)
Nova-Voice Gateway
    ↓ (WebSocket: realtime messages)
Renderer (transcription updates)
```

### State Management

- **AppContext**: Global app state (settings, models, wakeword)
- **ChatContext**: Chat-specific state (messages, streaming, audio)
- **Hooks**: Encapsulate complex logic (streaming, voice, wakeword, audio)

### Component Hierarchy

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

---

## Key Design Patterns

1. **Context API**: Global state management without Redux
2. **Custom Hooks**: Encapsulate complex logic (streaming, voice, wakeword)
3. **IPC Bridge**: Secure communication between renderer and main process
4. **Binary Protocols**: Efficient audio data transmission
5. **Optimistic Updates**: Immediate UI updates with error rollback
6. **Error Boundaries**: Graceful error handling
7. **Accessibility**: ARIA labels, keyboard navigation, screen reader support

---

## Development Notes

### Running in Development

1. Start backend: `python -m src.main` (runs WebSocket server)
2. Start frontend dev server: `npm run dev` (Vite dev server)
3. Launch Electron: `npm run electron` (loads from localhost:5173)

### Building for Production

1. Build renderer: `npm run build` (creates `dist/` folder)
2. Launch Electron: `npm run electron` (loads from `dist/index.html`)

### Testing

- Tests in `tests/frontend/` directory
- Run with `npm test`
- Uses Jest with jsdom environment
- CSS files are mocked

---

## Dependencies Summary

### Runtime Dependencies
- **React**: UI framework
- **React-DOM**: React DOM renderer
- **UUID**: Unique ID generation
- **WebSocket (ws)**: Backend communication (main process only)

### Development Dependencies
- **Vite**: Build tool and dev server
- **@vitejs/plugin-react**: React plugin for Vite
- **Electron**: Desktop framework
- **Babel**: JavaScript transpilation (`@babel/preset-env`, `@babel/preset-react`)
- **Jest**: Testing framework
- **jest-environment-jsdom**: DOM environment for Jest
- **@testing-library/react**: React testing utilities
- **@testing-library/jest-dom**: DOM matchers for Jest
- **ESLint**: Code linting
- **eslint-plugin-react**: React ESLint rules
- **eslint-plugin-react-hooks**: React hooks ESLint rules
- **eslint-plugin-react-refresh**: React refresh ESLint rules
- **json-schema-to-typescript**: Type generation
- **zustand**: State management library (listed but not currently used)

---

## File Count Summary

- **Configuration**: 7 files
- **Main Process**: 4 files (3 JS, 1 Python)
- **Preload**: 1 file
- **Renderer Entry**: 2 files
- **API Client**: 1 file
- **Context**: 2 files
- **Components**: 10 files (8 JSX with content, 2 empty)
- **Hooks**: 6 files
- **Styles**: 5 files
- **Types**: 1 file

**Total**: 39 files

---

## Future Improvements

1. **TypeScript Migration**: Convert JavaScript files to TypeScript for type safety
2. **State Management**: Zustand is already listed as a dependency but not used - consider implementing if state becomes more complex
3. **Error Handling**: More granular error boundaries
4. **Testing**: Increase test coverage
5. **Accessibility**: Enhanced keyboard navigation and screen reader support
6. **Performance**: Code splitting, lazy loading
7. **Documentation**: JSDoc comments for all functions
8. **Wakeword Service**: Consider adding support for multiple wakeword models

