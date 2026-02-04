---
summary: "User Guide (Local Build)"
read_when:
  - When updating user-facing behavior or UX.
---

# User Guide (Local Build)

## Getting Started

1. Start the backend: `python -m backend.src.main`
2. Start the frontend UI: `npm run dev`
3. Launch Electron: `npm run electron`

## Two Windows

- **Chatbox**: small overlay at bottom-center. Always-on-top. Click-through when the agent is busy; clickable when idle.
- **Dashboard**: full window. Opens from the chatbox **Config** button.

## Chatbox Behavior

- Opens on app launch.
- **Win + Alt + W** toggles chatbox visibility.
- When shown, input is focusable and ready to type.
- Status indicator shows **Ready / Sending / Thinking**.
- **Config** button opens the dashboard window.
- **Mic** button is disabled (voice typing off).

## Dashboard Layout

Two panels only:
- **Left**: section selector.
- **Right**: content for selected section.

Default section on open: **Chat**.

## Sections

### Chat
- Full conversation UI.
- Type and send messages.
- Shows streaming responses, tool output, and screenshots.
- Mode badge shows **Chat** or **Agent**.
- **Shift + Tab** toggles Chat/Agent mode.

### Episodic Memory
- Placeholder view for conversation summaries.

### Semantic Memory
- Placeholder view for long-term facts and preferences.

### Procedural Memory
- Placeholder view for skills.
- Notes that `SKILLS.md` can enable procedural memory.

### Models
- Toggle **Online** / **Local** model mode.
- Search bar filters models by id.
- Full model list; click to select.
- **API key** input below the model list (stored locally).

### Usage
- Placeholder view for limits and quotas.

### Settings
- Wakeword toggle ("Hey Jarvis").
- Hotkey reminder: **Win + Alt + W**.
- TTS toggle (speech replies).
- Screen selection (active display).
- Permissions (normal now; system access marked as coming soon).

## Wakeword Behavior

- Wakeword listens when enabled and chatbox is hidden.
- When chatbox is visible, wakeword is temporarily paused.

## Troubleshooting

See `docs/TROUBLESHOOTING.md` for common fixes.
