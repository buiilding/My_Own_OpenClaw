---
summary: "User Guide (Local Build)"
read_when:
  - When updating user-facing behavior or UX.
---

# User Guide (Local Build)

## Getting Started

1. Start the backend: `<windie> start backend`
2. Start the desktop dev loop: `<windie> start dev`

## First-Run Onboarding

- After required permission onboarding is complete, WindieOS shows a short two-step onboarding slideshow.
- Slide 1 confirms access requirements for OS-level actions (screen state + control capabilities).
- Slide 2 shows the current dedicated global loop-stop keybind from Settings.
- Default global stop shortcut by platform:
  - Windows: **Ctrl + Alt + .**
  - Linux: **Ctrl + Shift + Esc**
  - macOS: **Command + Shift + Esc**
- The slideshow is shown once and then persisted locally.

## Two Windows

- **Chatbox**: small overlay at bottom-center. Always-on-top. Click-through when the agent is busy; clickable when idle.
- **Dashboard**: full window. Opens from the chatbox **Config** button.
- Only one is visible at a time. Opening one hides the other.

## Chatbox Behavior

- Opens on app launch.
- **Win + Alt + W** toggles chatbox visibility.
- When shown, input is focusable and ready to type.
- Status indicator shows **Ready / Sending / Thinking**.
- The **camera** button is an auto-screenshot toggle for chatbox sends. Blue means enabled, white means disabled, and the default is enabled.
- **Config** button opens the dashboard window and hides the chatbox.
- **Mic** button is disabled (voice typing off).
- Closing the dashboard restores the chatbox.
- Sending a message from the dashboard closes it and returns to the chatbox.
- While waiting for a reply, the typing indicator and response overlay continue to work even when transitioning from dashboard back to chatbox.
- Once the chatbox response overlay starts receiving content for a turn, it stays visible for that turn and accumulates streamed assistant text plus tool `explanation` lines in order so you can scroll the full mini-transcript after the loop completes.

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
- Right-click any screenshot shown in the chat thread to open a small context menu with **Copy image**.
- Mode badge shows **Chat** or **Agent**.
- The header shows a browser control button to the left of the workspace chip. It waits for the local runtime to finish starting, shows **Starting local runtime...** until ready, reports **Browser unavailable** if startup fails, then connects the dedicated Windie browser, shows the current controlled tab as **Browser Tab**, and opens a tab carousel plus disconnect action.
- Changing tabs from that header carousel only changes WindieOS's internal controlled tab. It does not bring that tab to the foreground in the visible browser window.
- The tab carousel updates live as tabs open/close, and moving left or right should update in place without flashing the header control.
- The header shows the active workspace. Click it to change the default folder WindieOS uses for file reads, shell commands, and repo-aware work.
- **New Chat** starts a fresh conversation immediately (new conversation id) and clears the visible timeline.
- **Stop** cancels the active response/tool run and returns the UI to ready state.
- Focused-window stop shortcut: **Esc**.
- Global stop shortcut is configurable in **Settings > General**.
- Default global stop shortcut by platform:
  - Windows: **Ctrl + Alt + .**
  - Linux: **Ctrl + Shift + Esc**
  - macOS: **Command + Shift + Esc**
- If the selected global shortcut is unavailable on the current machine, WindieOS falls back to the next supported binding and saves that resolved shortcut locally.
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
- Global stop shortcut selector (platform-safe options, stored locally, applied immediately).
- If Windows or another app blocks the selected global stop shortcut, Settings shows either the active fallback binding or a registration-failure warning.
- **Workspace** section shows the current active workspace and includes a **Change workspace** button that reopens the folder picker.
- **Onboarding** section includes an **Open onboarding** button that sends you back through the first-run onboarding flow.
- **Browser** section includes **Open Windie Browser**, which reopens the dedicated browser/profile WindieOS uses for web tasks and sign-in state.
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
- This happens even if you sent the query from the dashboard (the dashboard closes, the chatbox is restored, and the chatbox hides/shows around capture).
- The chatbox return does not steal focus, so ongoing computer-control actions continue in the target app.
- The same dashboard-to-chat-pill handoff now applies to capture-only computer actions (`switch_window`, `wait`, screenshot-style browser actions) so post-action screenshots do not show the dashboard.

## Troubleshooting

See `docs/getting-started/troubleshooting.md` for common fixes.
