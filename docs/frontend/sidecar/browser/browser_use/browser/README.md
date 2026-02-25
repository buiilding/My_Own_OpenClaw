---
summary: "Frontend sidecar browser_use browser docs sub-hub for BrowserSession/CDP lifecycle, BrowserProfile runtime defaults, demo/video helpers, and watchdog orchestration contracts."
read_when:
  - When changing `tools/browser/browser_use/browser/*` runtime lifecycle code (`session`, `session_manager`, `profile`, `events`, `views`).
  - When debugging tab-focus recovery, CDP attach/detach races, browser launch arg generation, or watchdog registration/dispatch order.
title: "Frontend Sidecar Browser Use Browser Docs Hub"
---

# Frontend Sidecar Browser Use Browser Docs Hub

## Deep Pages

- [Browser Session, Session Manager, Event Bus, and CDP Lifecycle Orchestration Reference](session_manager_event_bus_and_cdp_lifecycle_orchestration_reference.md)
- [Browser Profile Runtime Defaults, Launch Args, Demo Overlay, and Video Recording Reference](profile_runtime_defaults_launch_args_demo_overlay_and_video_recording_reference.md)
- [Browser Watchdogs Docs Hub](watchdogs/README.md)
- [Browser Watchdog Base and Specialized Watchdogs Runtime Reference](watchdogs/watchdog_base_and_specialized_watchdogs_runtime_reference.md)

## Related Pages

- [Frontend Sidecar Browser Use Runtime Docs Hub](../README.md)
- [Frontend Sidecar Browser Use DOM Docs Hub](../dom/README.md)
- [Frontend Sidecar Browser Use Tools Docs Hub](../tools/README.md)
- [Frontend Sidecar Browser Use LLM Docs Hub](../llm/README.md)
- [Frontend Sidecar Browser Chrome Docs Hub](../../chrome/README.md)

## Code Scope

- `frontend/src/main/python/tools/browser/browser_use/browser/__init__.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/events.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/views.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/profile.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/session_manager.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/session.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/demo_mode.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/video_recorder.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/watchdog_base.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/watchdogs/*`
