---
summary: "Deep reference for browser_use browser runtime orchestration: lazy import boundary, event contracts/timeouts, BrowserSession and SessionManager lifecycle, navigation/focus behavior, and watchdog attachment order."
read_when:
  - When changing `browser/session.py`, `browser/session_manager.py`, `browser/events.py`, or BrowserSession startup/stop logic.
  - When debugging stale `agent_focus_target_id`, detached-target recovery, navigation lifecycle timeouts, or event-handler duplication.
title: "Browser Session, Session Manager, Event Bus, and CDP Lifecycle Orchestration Reference"
---

# Browser Session, Session Manager, Event Bus, and CDP Lifecycle Orchestration Reference

This page documents:

- `frontend/src/main/python/tools/browser/browser_use/browser/__init__.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/events.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/views.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/session_manager.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/session.py`

## Runtime Surface and Import Boundary

`browser_use.browser.__init__` exposes three heavy runtime types via lazy import:

- `BrowserSession`
- `BrowserProfile`
- `ProxySettings`

Contract details:

- module-level `_LAZY_IMPORTS` maps symbol to module path and attribute name
- `__getattr__` imports on first access and memoizes back into module globals
- unknown names raise `AttributeError`
- failed import raises explicit `ImportError` including resolved module path

## Event Model and Timeout Policy

`events.py` defines all high-level action/control/lifecycle events used by BrowserSession and watchdogs.

Timeout policy:

- each event can carry `event_timeout`
- `_get_timeout(env_var, default)` supports per-event env overrides
- invalid/negative env values fall back to defaults

Important invariant:

- `_check_event_names_dont_overlap()` runs at import time
- enforces `*Event` suffix and forbids substring-overlap names to keep grep/rename safety

Major event groups:

- action events: navigate/click/type/scroll/tab/screenshot/dropdown/upload/wait/send-keys
- lifecycle events: browser connected/stopped, tab created/closed, focus changed, navigation started/completed
- persistence/download events: storage-state save/load, download started/progress/completed
- error signaling: `BrowserErrorEvent`

## State Models Used by Action and Snapshot Paths

`views.py` provides the shared data contracts.

Key models:

- `TabInfo`: serializes `target_id`/`parent_target_id` to short ids for external payloads
- `PageInfo`: viewport/page/scroll metrics used for coordinate-aware action context
- `BrowserStateSummary`: DOM state + tabs + screenshot + page/network/pagination/dialog summaries
- `BrowserStateHistory`: past-state summary with lazy screenshot-file load
- `BrowserError`: structured error with optional short-term and long-term memory channels

## BrowserSession Lifecycle

`BrowserSession` is a Pydantic model wrapping browser profile config, event bus, CDP client, session manager, caches, and watchdog instances.

Constructor behavior:

- accepts direct kwargs or a supplied `BrowserProfile`
- auto-normalizes cloud aliases (`profile_id` etc.) into `cloud_browser_params`
- if no `cdp_url` and not cloud, forces local-launch mode

`model_post_init` behavior:

- creates connection lock
- validates no duplicate `on_BrowserStartEvent` registration on current EventBus
- registers core handlers through `BaseWatchdog.attach_handler_to_session`

### `start`, `stop`, `kill`

`start()`:

- dispatches `BrowserStartEvent`
- propagates handler exceptions via `event_result(...)`

`stop()`:

- dispatches `SaveStorageStateEvent`
- dispatches `BrowserStopEvent(force=False)`
- stops EventBus, resets session state, and recreates a fresh EventBus

`kill()`:

- same pre-save flow
- dispatches `BrowserStopEvent(force=True)`
- then resets and recreates EventBus

## BrowserStart and Connect Orchestration

`on_BrowserStartEvent` order:

1. attach watchdogs first (`attach_all_watchdogs`) so launch handlers are already registered
2. resolve browser endpoint:
- cloud path: call cloud client `create_browser`
- local path: dispatch `BrowserLaunchEvent` handled by `LocalBrowserWatchdog`
3. under connection lock, call `connect(cdp_url=...)` if not already connected
4. dispatch `BrowserConnectedEvent`
5. if demo mode enabled, ensure overlay injection via `DemoMode.ensure_ready()`

Failure behavior:

- dispatches `BrowserErrorEvent` with `BrowserStartEventError`
- re-raises to caller

### `connect(...)` internals

- normalizes HTTP CDP URL to websocket URL via `/json/version` when needed
- creates `CDPClient(max_ws_frame_size=200MB)`
- initializes `SessionManager` before top-level `Target.setAutoAttach`
- ensures at least one page target exists
- sets initial focus using `get_or_create_cdp_session(..., focus=True)`
- dispatches `TabCreatedEvent` for initial tabs and initial `AgentFocusChangedEvent`

Fatal setup failures:

- clear SessionManager state
- stop/clear root CDP client
- clear focus
- raise `RuntimeError`

## SessionManager Contracts

`SessionManager` owns the canonical target/session mappings.

Ownership maps:

- `_targets[target_id] -> Target`
- `_sessions[session_id] -> CDPSession`
- `_target_sessions[target_id] -> set[session_id]`
- `_session_to_target[session_id] -> target_id`

Event-driven sync:

- `start_monitoring()` enables target discovery and registers attach/detach/info handlers
- `_handle_target_attached` adds target/session, enables page monitoring, resumes debugger-wait targets
- `_handle_target_detached` removes mappings and triggers focus recovery if focused target vanished

Focus-recovery behavior:

- uses `_recovery_lock` and `_recovery_complete_event` to coordinate concurrent waiters
- first tries switching to latest remaining page target
- if no pages remain, creates emergency `about:blank` target
- dispatches `AgentFocusChangedEvent` after successful recovery

`ensure_valid_focus()` is the central stale-focus guard used by session APIs before focus-dependent operations.

## Navigation and Tab Flow

`on_NavigateToUrlEvent` behavior:

- supports `new_tab` with reuse of existing `about:blank` tab when available
- switches focus to chosen target via `SwitchTabEvent`
- dispatches `NavigationStartedEvent`
- calls `_navigate_and_wait(...)`
- dispatches `NavigationCompleteEvent` and `AgentFocusChangedEvent`

`_navigate_and_wait(...)` readiness strategy:

- sends `Page.navigate`
- observes lifecycle events cached on session (`networkIdle` preferred, `load` fallback)
- dynamic timeout (same-domain quicker timeout)
- on timeout logs diagnostics and continues

Tab operations:

- `on_SwitchTabEvent`: resolves explicit target or newest tab; can create `about:blank` when none exist
- `on_TabClosedEvent`: switches to most recently opened tab when closed tab was focused
- `on_CloseTabEvent`: dispatches `TabClosedEvent` and best-effort closes target via CDP

## Watchdog Attachment Order in BrowserSession

`attach_all_watchdogs()` is idempotent via `_watchdogs_attached` and instantiates in this order:

1. `DownloadsWatchdog`
2. `StorageStateWatchdog` (conditional: `storage_state` or `user_data_dir` configured)
3. `LocalBrowserWatchdog`
4. `SecurityWatchdog`
5. `AboutBlankWatchdog`
6. `PopupsWatchdog`
7. `PermissionsWatchdog`
8. `DefaultActionWatchdog`
9. `ScreenshotWatchdog`
10. `DOMWatchdog`
11. `RecordingWatchdog`
12. `HarRecordingWatchdog` (conditional: `record_har_path`)

This ordering is operationally important because DOM/screenshot/action/download paths depend on earlier handlers being active.

## Snapshot and Selector Cache Contracts

Session-level caches:

- `_cached_browser_state_summary`
- `_cached_selector_map`
- `_original_viewport_size` (for coordinate scaling when resized screenshots are used)

`get_browser_state_summary(...)`:

- can return cached state only when selector map is non-empty and screenshot constraints are satisfied
- otherwise dispatches `BrowserStateRequestEvent` and returns handler result

Cache invalidation triggers:

- `on_AgentFocusChangedEvent` clears DOM/selector/browser-state caches
- explicit `reset()` clears all runtime caches, handlers, and watchdog references

## Related Docs

- [Browser Profile Runtime Defaults, Launch Args, Demo Overlay, and Video Recording Reference](profile_runtime_defaults_launch_args_demo_overlay_and_video_recording_reference.md)
- [Browser Watchdog Base and Specialized Watchdogs Runtime Reference](watchdogs/watchdog_base_and_specialized_watchdogs_runtime_reference.md)
- [Frontend Sidecar Browser Use DOM Docs Hub](../dom/README.md)
