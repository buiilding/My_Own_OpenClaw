---
summary: "Computer-use screenshot and desktop-control tool guide for mouse, keyboard, screenshot, scroll, window switching, system state, and platform-specific capture behavior."
read_when:
  - When changing computer-use screenshot behavior, desktop control tools, screenshots, OCR/prediction coordinate grounding, or platform capture behavior.
  - When debugging mouse, keyboard, screenshot, scroll, or window actions.
  - When routing computer use screenshot ownership between backend coordinate preparation and local execution.
title: "Computer Use Screenshot and Control Tools"
---

# Computer Use Screenshot and Control Tools

Computer tools are local-execution tools. The backend owns the model-facing intent and coordinate preparation; the local runtime owns actual mouse, keyboard, screenshot, scroll, and window operations through the local-runtime Python implementation.

## Tool Surface

| Tool | Backend name | Local-runtime Python implementation |
| --- | --- | --- |
| Mouse actions | `mouse_control` | `frontend/src/main/python/tools/computer/mouse_tool.py` |
| Keyboard actions | `keyboard_control` | `frontend/src/main/python/tools/computer/keyboard_tool.py` |
| Screenshots | `screenshot` | `frontend/src/main/python/tools/computer/screenshot_tool.py` |
| Scrolling | `scroll_control` | `frontend/src/main/python/tools/computer/scroll_tool.py` |
| Window switching/listing | `switch_window`, `get_open_windows` | `frontend/src/main/python/tools/system/window_tool.py` |
| System stats | `get_system_stats` | `frontend/src/main/python/tools/system/stats_tool.py` |

## Screenshot and Grounding Rules

This is the canonical computer use screenshot guide.

- Renderer query screenshots and local-runtime tool screenshots are different paths.
- Backend OCR/vision services can prepare coordinates before local execution.
- Linux is the only platform that should hide desktop overlay surfaces for screenshot capture and restore them after capture.
- Windows and macOS should not add capture-time hide/show for the minimal chat pill or response overlay.
- Windows and macOS content protection should only be enabled during SDK
  screenshot-capture leases and disabled immediately after capture.

## Files to Inspect

- Backend coordinate prep: private backend implementation
- Backend grounding contracts: private backend implementation
- OCR/vision services: private backend implementation
- Query screenshot resource resolver: `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts`
- Main overlay capture guards: `frontend/src/main/overlays/*`
- Local-runtime Python computer implementations: `frontend/src/main/python/tools/computer/*`

## Deep Docs

- Backend Tool Preparation + Coordinate Resolution Reference (private backend docs)
- Backend OCR + Vision Coordinate Runtime Overview (private backend docs)
- [Frontend Linux Screenshot Window Hide and Restore Guard Reference](../frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)
- [Local-Runtime Mouse, Keyboard, Scroll, and Screenshot Runtime Reference](../frontend/sidecar/tools/computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md)
