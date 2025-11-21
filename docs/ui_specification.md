# Desktop Assistant - Complete UI Specification

## Overview

This is a **Desktop Overlay AI Assistant** built with **Electron + React** frontend and **Python WebSocket** backend. The UI features a transparent, always-on-top overlay with an emerald/mint color scheme, glassmorphic design, and animated halo effects.

---

## Architecture Summary

### Technology Stack
- **Frontend Framework**: React 18.2.0 with Vite build tool
- **Desktop Framework**: Electron 27.1.2
- **Styling**: Pure CSS with glassmorphism effects
- **Communication**: WebSocket (ws://127.0.0.1:8765) via IPC bridge
- **State Management**: React hooks (useState, useEffect, useCallback)

### File Structure
```
frontend/
├── index.html                          # Entry HTML
├── package.json                        # Dependencies
├── src/
│   ├── main/
│   │   ├── index.cjs                   # Electron main process
│   │   └── ipc.cjs                     # WebSocket IPC bridge
│   ├── preload.js                      # Electron preload script
│   └── renderer/
│       ├── main.jsx                    # React entry point
│       ├── App.jsx                     # Root component
│       ├── components/
│       │   ├── OverlayLayout.jsx       # Main overlay UI (PRIMARY)
│       │   ├── ChatInterface.jsx       # Alternative chat UI
│       │   ├── MainLayout.jsx          # Alternative layout
│       │   ├── SettingsPanel.jsx       # Settings component
│       │   ├── ThinkingDisplay.jsx     # Status indicator
│       │   └── ErrorBoundary.jsx       # Error handling
│       ├── hooks/
│       │   ├── useMessageHandling.js   # Message orchestration
│       │   ├── useStreamingMessages.js # Streaming responses
│       │   ├── useSettingsManagement.js# Settings handling
│       │   └── useInitialConfig.js     # Initial config
│       └── styles/
│           ├── OverlayLayout.css       # Main overlay styles (PRIMARY)
│           ├── ChatInterface.css       # Chat styles
│           ├── MainLayout.css          # Layout styles
│           ├── SettingsPanel.css       # Settings styles
│           ├── ThinkingDisplay.css     # Status styles
│           └── accessibility.css       # A11y utilities
```

---

## UI Components Breakdown

### 1. **OverlayLayout.jsx** (Primary UI Component)

**Purpose**: The main user interface - a desktop overlay with transparent background, glassmorphic boxes, and animated halo effects.

#### Component Structure

```jsx
<div className="overlay-container">
  {/* Top Input Box - Always visible */}
  <div className="overlay-box">
    {/* Three states: normal, compact, collapsed */}
  </div>

  {/* History Box - Shows when messages exist */}
  <div className="history-box visible">
    <div className="messages-container">
      {/* Message bubbles */}
    </div>
  </div>

  {/* Bottom Input Box - Shows during conversation */}
  <div className="overlay-box conversation-box">
    {/* Input for ongoing conversation */}
  </div>
</div>
```

#### States & Behavior

**Top Input Box States:**
1. **Normal State** (initial):
   - Width: 70% of screen (max 900px)
   - Height: 50px
   - Contains: microphone button (left), send button (right), input field (center)
   - Halo: Animated emerald glow (pulsing)
   - Placeholder: "Hello! How can I help you today?"

2. **Compact State** (after first query):
   - Width: 35% of screen (max 450px)
   - Height: 50px
   - Contains: Only the first query text (centered, disabled input)
   - Halo: OFF (hidden)
   - No buttons visible

3. **Collapsed State** (keyboard shortcut: Cmd+/):
   - Width: 60px
   - Height: 60px
   - Shape: Circular
   - Contains: Only microphone button (centered)
   - Halo: ON (circular, pulsing)
   - Background: Black (#000000)

**History Box:**
- Appears when messages exist
- Width: 70% (max 900px)
- Max height: 200px
- Glassmorphic background with mint tint
- Auto-scrolls to bottom
- Message bubbles:
  - User messages: Right-aligned, dark glass background
  - Assistant messages: Left-aligned, subtle halo glow

**Bottom Input Box (Conversation Box):**
- Appears after first query submitted
- Same size as normal top box (70%, max 900px)
- Contains: microphone button, send button, input field
- Halo: Extended downward (bottom: -30px to -35px)
- Placeholder: "Continue the conversation..."

#### Props
```javascript
{
  messages: Array,        // Array of message objects
  onSendMessage: Function, // Callback for sending messages
  isSending: Boolean      // Loading state
}
```

#### Key Features
- **Halo Animation**: Pulsing emerald glow using ::before and ::after pseudo-elements
- **Voice Mode**: Microphone button toggles red when active
- **Keyboard Shortcuts**:
  - `Cmd+/`: Toggle collapsed mode
  - `Cmd+Shift+M`: Toggle voice mode
  - `Enter`: Send message
- **Drag Support**: Window is draggable via `-webkit-app-region: drag`
- **Non-drag Zones**: Buttons and inputs use `-webkit-app-region: no-drag`

---

### 2. **App.jsx** (Root Component)

**Purpose**: Manages global state and message handling.

#### State Management
```javascript
const [messages, setMessages] = useState([]);
const [isSending, setIsSending] = useState(false);
const [thinkingStatus, setThinkingStatus] = useState(null);
const [config, setConfig] = useState({});
const [availableModels, setAvailableModels] = useState([]);
const [saveStatus, setSaveStatus] = useState(null);
```

#### Message Flow
1. User types message → `handleSendMessage()`
2. Message added to state immediately
3. Sent to backend via IPC: `window.ipc.send('to-backend', { type: 'query', payload: { text } })`
4. Backend responses handled by `useMessageHandling` hook
5. UI updates in real-time

---

### 3. **ChatInterface.jsx** (Alternative UI)

**Purpose**: Traditional chat interface (not currently used in overlay mode).

Features:
- Vertical message list
- Input form at bottom
- Thinking display integration
- Tool call/output rendering with color-coded sections:
  - Tool calls: Green theme
  - Tool outputs: Orange theme
  - Screenshots: Purple theme

---

### 4. **SettingsPanel.jsx**

**Purpose**: Configuration UI for model selection.

Features:
- Model mode toggle (Online/Local)
- Model dropdown (populated from backend)
- Auto-save on change
- Save status feedback (saving/success/error)
- Model validation and reset warnings

---

### 5. **ThinkingDisplay.jsx**

**Purpose**: Shows agent status during processing.

Features:
- Animated spinner
- Status text (italic, gray)
- Fade-in animation
- Auto-hides when response starts

---

## Styling System (OverlayLayout.css)

### Color Palette
```css
:root {
  --accent-primary: #00C896;      /* Emerald */
  --accent-secondary: #2AFFC2;    /* Mint */
  --bg-dark: rgba(12, 14, 13, 0.3);
  --surface-dark: #151A17;
  --text-primary: #E5FFF5;        /* Light mint */
  --text-secondary: #A8D9C8;      /* Muted mint */
}
```

### Glassmorphism Effect
```css
background: linear-gradient(135deg,
  rgba(18, 22, 20, 0.75) 0%,
  rgba(0, 200, 150, 0.08) 30%,  /* Mint tint */
  rgba(12, 14, 13, 0.75) 100%
);
border-radius: 30px;
border: 1px solid rgba(229, 255, 245, 0.15);
box-shadow:
  0 8px 32px rgba(0, 0, 0, 0.15),
  inset 0 1px 0 rgba(229, 255, 245, 0.1),
  inset 0 -1px 0 rgba(0, 0, 0, 0.05);
```

### Halo Animation
```css
/* Primary halo layer */
.overlay-box::before {
  content: '';
  position: absolute;
  top: -8px; left: -8px; right: -8px; bottom: -8px;
  border-radius: 38px;
  background: #2AFFC2;
  opacity: 0.5;
  filter: blur(18px);
  animation: pulse-halo 3s ease-in-out infinite;
}

/* Secondary ambient layer */
.overlay-box::after {
  content: '';
  position: absolute;
  top: -6px; left: -6px; right: -6px; bottom: -6px;
  border-radius: 36px;
  background: #2AFFC2;
  opacity: 0.4;
  filter: blur(25px);
  animation: pulse-halo 4s ease-in-out infinite;
}

@keyframes pulse-halo {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.05); }
}
```

### Halo Control
- **ON**: During `isSending` state
- **OFF**: When idle or in compact mode
- **Hidden**: `.halo-off` class sets `opacity: 0` and `animation: none`

---

## IPC Communication

### Architecture
```
React Renderer ←→ Electron Main ←→ Python Backend
    (UI)         (IPC Bridge)      (WebSocket)
```

### Message Types

#### Frontend → Backend
```javascript
// Query
window.ipc.send('to-backend', {
  type: 'query',
  payload: { text: 'user message' }
});

// Load settings
window.ipc.send('to-backend', {
  type: 'load-settings'
});

// Update settings
window.ipc.send('to-backend', {
  type: 'update-settings',
  payload: { /* config object */ }
});

// List models
window.ipc.send('to-backend', {
  type: 'list-models'
});
```

#### Backend → Frontend
```javascript
// Response types handled in useMessageHandling.js:
{
  type: 'pong',              // Simple response
  type: 'response',          // Complete response
  type: 'llm-thought',       // Agent thinking status
  type: 'streaming-response', // Chunk of streaming text
  type: 'streaming-complete', // Stream finished
  type: 'tool-call',         // Agent calling a tool
  type: 'tool-output',       // Tool execution result
  type: 'settings-loaded',   // Config loaded
  type: 'models-listed',     // Available models
  type: 'settings-updated',  // Config saved
  type: 'error'              // Error occurred
}
```

### WebSocket Connection
- URL: `ws://127.0.0.1:8765`
- Auto-reconnect: 5 second interval
- Handshake on connect: `{ type: 'handshake', user_id: 'default_user' }`

---

## Electron Configuration

### Window Settings
```javascript
{
  width: 900,
  height: 650,
  transparent: true,        // Transparent background
  frame: false,             // No window frame
  alwaysOnTop: true,        // Always visible
  resizable: false,         // Fixed size
  movable: true,            // User can drag
  hasShadow: false,         // Clean overlay
  skipTaskbar: false,       // Show in taskbar
  backgroundColor: '#00000000', // Fully transparent
  fullscreenable: false,
  maximizable: false
}
```

### Global Shortcuts
- `Cmd+/` (or `Ctrl+/`): Toggle collapse mode
- `Cmd+Shift+M` (or `Ctrl+Shift+M`): Toggle voice mode

### Window Position
- Default: Horizontally centered, 10% from top
- Persisted in: `window-state.json` (userData directory)
- Auto-saves on move with 100ms debounce

---

## React Hooks

### useMessageHandling.js
Orchestrates all backend message handling by combining:
- `useStreamingMessages`: Handles LLM responses
- `useSettingsManagement`: Handles config updates

### useStreamingMessages.js
Handlers:
- `handlePongResponse`: Simple responses
- `handleLlmThought`: Thinking status updates
- `handleStreamingResponse`: Append text chunks
- `handleStreamingComplete`: Mark message complete
- `handleToolCall`: Display tool invocation
- `handleToolOutput`: Display tool results

### useSettingsManagement.js
Handlers:
- `handleSettingsLoaded`: Initialize config
- `handleModelsListed`: Populate model dropdown
- `handleSettingsUpdated`: Show success feedback
- `handleSettingsError`: Revert config on error

---

## Message Object Structure

```javascript
// User message
{
  text: String,
  sender: 'user',
  timestamp: Date,
  type: 'user-message'
}

// Assistant message
{
  id: String (UUID),
  text: String,
  sender: 'assistant',
  isComplete: Boolean,
  type: 'llm-text' | 'tool-call' | 'tool-output',
  screenshot: String (base64) // Optional, for tool outputs
}
```

---

## Animation & Performance

### Hardware Acceleration
```css
transform: translateZ(0);
will-change: transform, opacity;
backface-visibility: hidden;
```

### Smooth Scrolling
```css
scrollbar-width: none;
-ms-overflow-style: none;
overflow-y: auto;
```

### Message Animations
```css
@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

## Accessibility

### Screen Reader Support
- `role="status"` on ThinkingDisplay
- `aria-live="polite"` for status updates
- `visually-hidden` class for labels
- Semantic HTML elements

### Keyboard Navigation
- Enter key to send messages
- Tab navigation through inputs
- Disabled state handling

---

## Key Implementation Details

### 1. **First Query Tracking**
```javascript
const [firstQuery, setFirstQuery] = useState(null);
const [activeQuery, setActiveQuery] = useState(null);

// Set ONLY on first message
if (!firstQuery) {
  setFirstQuery(message);
}
```

### 2. **Halo Toggle Logic**
```javascript
useEffect(() => {
  if (isSending) {
    setHaloVisible(true);
  } else {
    setHaloVisible(false);
  }
}, [isSending]);
```

### 3. **Message Streaming**
```javascript
// Append to last message if streaming
if (lastMessage?.sender === 'assistant' && !lastMessage.isComplete) {
  return [
    ...prevMessages.slice(0, -1),
    { ...lastMessage, text: lastMessage.text + chunk }
  ];
}
```

### 4. **Auto-scroll**
```javascript
useEffect(() => {
  if (messagesContainerRef.current) {
    messagesContainerRef.current.scrollTop = 
      messagesContainerRef.current.scrollHeight;
  }
}, [messages]);
```

---

## Dependencies

### Frontend (package.json)
```json
{
  "dependencies": {
    "electron-store": "^11.0.2",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "uuid": "^8.3.2",
    "ws": "^8.18.3"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.3",
    "electron": "^27.1.2",
    "eslint": "^8.45.0",
    "vite": "^4.4.5"
  }
}
```

---

## Running the Application

### Development Mode
```bash
# Terminal 1: Backend
conda activate desktop-assistant-env
export OPENAI_API_KEY="dummy-key"
python -m backend.server

# Terminal 2: Vite Dev Server
cd frontend
npm run dev

# Terminal 3: Electron
cd frontend
npm run electron
```

### Build Commands
```bash
npm run dev      # Start Vite dev server
npm run build    # Build for production
npm run electron # Start Electron app
npm run lint     # Run ESLint
npm test         # Run Jest tests
```

---

## Critical Design Principles

1. **Transparency First**: All backgrounds use `rgba()` with alpha < 1
2. **No Backdrop Filter**: Glassmorphism achieved with gradients only (performance)
3. **Hardware Acceleration**: All animated elements use `transform: translateZ(0)`
4. **Drag Regions**: Carefully managed with `-webkit-app-region`
5. **Z-Index Layering**: Halo (0) → Glass box (1) → Content (2)
6. **Overflow Visible**: Container must have `overflow: visible` for halo
7. **Padding for Halo**: Bottom padding (150px) prevents halo cutoff

---

## Common Pitfalls to Avoid

1. ❌ Don't use `backdrop-filter` (performance issues)
2. ❌ Don't set `overflow: hidden` on container (cuts off halo)
3. ❌ Don't forget `-webkit-app-region: no-drag` on interactive elements
4. ❌ Don't use `position: fixed` inside overlay (breaks transparency)
5. ❌ Don't animate properties other than `transform` and `opacity`
6. ❌ Don't forget to handle `isComplete: false` for streaming messages

---

## Future Enhancements (Mentioned in Docs)

- Voice controls implementation (VoiceControls.jsx is empty)
- AI-generated conversation titles
- Confirmation dialogs (ConfirmationDialog.jsx is empty)
- Tool marketplace integration
- Memory system integration
- Active monitoring features

---

## Testing

### Frontend Tests (Jest)
```bash
cd frontend
npm test
```

Test files should cover:
- Component rendering
- Message handling
- IPC communication
- State management

---

## Summary for AI Agent

To replicate this UI in another version:

1. **Core Component**: Use `OverlayLayout.jsx` as the primary UI
2. **Styling**: Copy `OverlayLayout.css` with all color variables and animations
3. **IPC Setup**: Implement WebSocket bridge in Electron main process
4. **Message Handling**: Use the hook pattern for clean separation
5. **Electron Config**: Transparent, frameless, always-on-top window
6. **State Flow**: User input → IPC → Backend → IPC → UI update
7. **Halo Effect**: Two pseudo-elements with blur and pulse animation
8. **Glassmorphism**: Gradient backgrounds with subtle borders and shadows
9. **Three States**: Normal → Compact (after query) → Collapsed (Cmd+/)
10. **Streaming**: Append chunks to last message until `streaming-complete`

The design is **minimalist, elegant, and performant** with a strong focus on the emerald/mint color scheme and smooth animations.
