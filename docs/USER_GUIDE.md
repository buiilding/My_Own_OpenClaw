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
- Only one is visible at a time. Opening one hides the other.

## Chatbox Behavior

- Opens on app launch.
- **Win + Alt + W** toggles chatbox visibility.
- When shown, input is focusable and ready to type.
- Status indicator shows **Ready / Sending / Thinking**.
- **Config** button opens the dashboard window and hides the chatbox.
- **Mic** button is disabled (voice typing off).
- Closing the dashboard restores the chatbox.

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
- Screen selection (active display). Screenshots use this display.
- Permissions (normal now; system access marked as coming soon).

## Wakeword Behavior

- Wakeword listens when enabled and the chatbox is hidden.
- When chatbox is visible, wakeword is temporarily paused.
- If wakeword triggers while the dashboard is open, the dashboard closes and the chatbox opens.

## Screenshot Capture

- On Linux, the app hides its windows during screenshot capture to avoid self-capture.
- The chatbox briefly disappears and returns after the capture.
- This happens even if you sent the query from the dashboard (once the dashboard is closed, the chatbox is restored and will hide/show around capture).

## Troubleshooting

See `docs/TROUBLESHOOTING.md` for common fixes.
