---
summary: "Deep reference for browser_use watchdog runtime: BaseWatchdog handler wiring/duplicate protection/error recovery, plus specialized watchdog contracts for actions, DOM snapshots, downloads, launch lifecycle, security, persistence, demo/recording, and HAR capture."
read_when:
  - When changing event handler registration conventions (`on_*Event`) or introducing/removing watchdogs.
  - When debugging handler duplication, CDP session recovery after handler failures, download race behavior, or DOM/screenshot/event payload coupling.
title: "Browser Watchdog Base and Specialized Watchdogs Runtime Reference"
---

# Browser Watchdog Base and Specialized Watchdogs Runtime Reference

This page documents:

- `frontend/src/main/python/tools/browser/browser_use/browser/watchdog_base.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/watchdogs/*.py`

## BaseWatchdog Runtime Contract

`BaseWatchdog` provides auto-registration and shared safety semantics for all watchdog handlers.

Core mechanics:

- discovers handler methods by `on_<EventClassName>` naming
- maps names to actual event classes by introspecting `browser.events`
- enforces optional `LISTENS_TO` declarations against discovered handlers
- wraps handlers in unique async wrappers named `<WatchdogClass>.<handler>`

Duplicate safety:

- `attach_handler_to_session(...)` throws on duplicate handler-name registration
- `detach_handler_from_session(...)` removes by generated unique wrapper name

Failure safety in wrapper:

- logs parent/grandparent event lineage for traceability
- on handler exception, attempts CDP session recovery through `get_or_create_cdp_session(...)`
- preserves and re-raises original exception after recovery attempt

Cleanup:

- `__del__` cancels private attrs that look like async task/task collections (`*_task`, `*_tasks`)

## Specialized Watchdog Matrix

### `LocalBrowserWatchdog`

Responsibility:

- local browser subprocess launch/kill orchestration for `BrowserLaunchEvent` and kill/stop paths

Important behavior:

- launches browser with profile-computed args and dynamic free CDP port
- fallback retries create temp `user_data_dir` when lock/contention errors occur
- discovers browser executable across OS-specific paths; can invoke `uvx playwright install chrome` fallback
- on stop dispatches `BrowserKillEvent` to avoid premature shutdown order issues

### `SecurityWatchdog`

Responsibility:

- allow/deny URL policy enforcement on navigate, navigation-complete, and new-tab events

Important behavior:

- blocks disallowed navigations before execution by raising
- catches redirect-to-disallowed URLs post-navigation and redirects target to `about:blank`
- supports wildcard/pattern and exact matching, with separate fast-path behavior for set-based domain collections
- optional hard IP-address blocking

### `AboutBlankWatchdog`

Responsibility:

- maintain resilient `about:blank` availability and inject DVD-style idle animation

Important behavior:

- while browser is active, ensures tab closure does not collapse to zero pages
- can create new `about:blank` tab when last tab would be lost
- injects idempotent animation script and emits `AboutBlankDVDScreensaverShownEvent`

### `PermissionsWatchdog`

Responsibility:

- grants configured browser permissions immediately after `BrowserConnectedEvent`

Behavior:

- uses CDP `Browser.grantPermissions`
- logs and continues on failure (non-fatal)

### `PopupsWatchdog`

Responsibility:

- auto-handles JS dialogs (`alert`, `confirm`, `prompt`, `beforeunload`)

Important behavior:

- enables Page domain on target and root CDP clients
- registers dialog handlers once per target
- stores closed popup messages into `browser_session._closed_popup_messages`
- applies multi-approach dismissal logic (detected session first, focused session fallback)

### `ScreenshotWatchdog`

Responsibility:

- fulfills `ScreenshotEvent` using CDP `Page.captureScreenshot`

Behavior:

- validates focused target type; falls back to page target when focus is non-page
- returns base64 PNG data
- always best-effort clears highlights in `finally`

### `DOMWatchdog`

Responsibility:

- handles `BrowserStateRequestEvent` to produce `BrowserStateSummary`

Behavior highlights:

- parallelizes DOM tree build and clean screenshot capture
- short stability wait when pending network requests are detected
- uses `DomService` for enhanced DOM/selector-map generation
- computes page metrics from `Page.getLayoutMetrics`
- caches state in BrowserSession and updates selector-map cache
- can include recent event summary and pending-network request summaries

### `DownloadsWatchdog`

Responsibility:

- monitors download flows via CDP browser/network events and emits normalized download events

Behavior highlights:

- sets Browser download behavior (`allow`, `downloadPath`, `eventsEnabled`)
- tracks direct callback hooks for click-action synchronous wait workflows
- handles `downloadWillBegin` + `downloadProgress` and emits start/progress/complete events
- adds network-response monitoring to detect attachment/PDF content and trigger background download logic
- when `auto_download_pdfs` is enabled, a `BrowserStateRequestEvent` may inspect the currently focused target directly for PDF-viewer URLs without emitting a synthetic `NavigationCompleteEvent`
- supports URL-based PDF viewer detection and auto-download path

### `RecordingWatchdog`

Responsibility:

- drives screencast-based video recording lifecycle

Behavior:

- starts recorder on browser connected when `record_video_dir` is configured
- switches active screencast session on focus changes
- acknowledges screencast frames and writes frames to `VideoRecorderService`
- finalizes recording on browser stop

### `StorageStateWatchdog`

Responsibility:

- load/save cookie/storage snapshots and optional periodic change monitoring

Behavior highlights:

- starts monitor and auto-loads state on browser connect
- periodic cookie-change comparison triggers saves
- atomic save with temp file and backup file replacement
- merges existing/new cookie and origin state by identity keys
- restores cookies and storage scripts on load

### `HarRecordingWatchdog`

Responsibility:

- capture HTTPS network traffic and export HAR 1.2 on stop

Behavior highlights:

- enabled only when `record_har_path` is configured
- listens to request/response/data/lifecycle/frame events
- supports content modes `omit` / `embed` / `attach`
- supports modes `full` / `minimal` filtering and favicon exclusion
- writes sidecar content files in attach mode using hash-based filenames

### `DefaultActionWatchdog`

Responsibility:

- handles high-level action events (click/type/scroll/navigation-history/keys/upload/dropdown)

Behavior highlights:

- wraps click actions with download detection lifecycle and timeout metadata
- blocks unsafe click paths on file-input/select elements; special-cases print flows via `Page.printToPDF`
- supports coordinate click safety checks with optional force bypass
- performs text input with sensitive-data-aware logging and fallback typing paths
- scroll uses bounded per-CDP-step timeouts and ordered fallbacks (`mouseWheel` -> `synthesizeScrollGesture` -> `window.scrollBy`) so one hung CDP input call does not consume the full `ScrollEvent` timeout budget
- provides history navigation (`goBack`, `goForward`, `refresh`) and wait/send-keys actions
- supports upload through `DOM.setFileInputFiles`
- supports dropdown option discovery/selection across native, ARIA, and custom dropdown patterns with structured error memory

## Cross-Watchdog Shared Couplings

Notable runtime couplings:

- `DefaultActionWatchdog` relies on `DownloadsWatchdog` direct callbacks for click-triggered download wait behavior
- `DOMWatchdog` depends on `ScreenshotWatchdog` being registered for clean screenshot capture path
- `BrowserSession` startup ordering determines which handlers are available for subsequent events
- many watchdogs rely on `SessionManager` focus/session validity guarantees via `get_or_create_cdp_session(...)`

## Related Docs

- [Frontend Sidecar Browser Use Browser Docs Hub](../README.md)
- [Browser Session, Session Manager, Event Bus, and CDP Lifecycle Orchestration Reference](../session_manager_event_bus_and_cdp_lifecycle_orchestration_reference.md)
- [Browser Profile Runtime Defaults, Launch Args, Demo Overlay, and Video Recording Reference](../profile_runtime_defaults_launch_args_demo_overlay_and_video_recording_reference.md)
