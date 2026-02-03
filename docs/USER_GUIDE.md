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

## Chat

- Type a message in the input bar and press **Send**.
- The assistant responds with streamed output.

## Settings

- Open the Settings panel on the right.
- Choose model mode/provider/model ID.
- Toggle Voice Mode and Speech Mode.

Settings are saved locally to `frontend-config.json` and `localStorage`.

## Voice Mode

- Toggle **Voice Mode** to enable audio capture.
- Wakeword detection can activate voice mode automatically.

## Tool Output

- Tool calls and tool outputs are shown in the chat stream.
- Screenshots captured by tools appear inline.

## Troubleshooting

See `docs/TROUBLESHOOTING.md` for common fixes.
