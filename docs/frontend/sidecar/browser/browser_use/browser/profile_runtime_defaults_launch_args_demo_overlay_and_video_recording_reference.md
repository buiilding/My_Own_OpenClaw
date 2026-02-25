---
summary: "Deep reference for browser_use BrowserProfile runtime policy: launch-arg synthesis, display/viewport defaults, extension bootstrap/patching, proxy/domain guards, plus demo overlay and video recorder helper behavior."
read_when:
  - When changing `browser/profile.py` config fields, browser launch flags, extension behavior, or user-data-dir handling.
  - When debugging demo-mode panel injection, frame recording failures, or viewport/deterministic-rendering incompatibilities.
title: "Browser Profile Runtime Defaults, Launch Args, Demo Overlay, and Video Recording Reference"
---

# Browser Profile Runtime Defaults, Launch Args, Demo Overlay, and Video Recording Reference

This page documents:

- `frontend/src/main/python/tools/browser/browser_use/browser/profile.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/demo_mode.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/video_recorder.py`

## BrowserProfile Responsibility Split

`BrowserProfile` composes launch/connect/context argument models and adds Browser Use specific runtime policy fields.

Model composition:

- `BrowserConnectArgs`
- `BrowserLaunchArgs`
- `BrowserContextArgs`
- `BrowserNewContextArgs`
- `BrowserLaunchPersistentContextArgs`

Browser-specific policy includes:

- local/cloud browser selection fields (`use_cloud`, `cloud_browser_params`, `cdp_url`, `is_local`)
- domain allow/deny and IP blocking
- extension bootstrap switches
- download/video/HAR feature controls
- viewport/window/headless behavior and iframe traversal controls

## Launch-Arg Synthesis (`get_args`)

`get_args()` builds Chromium CLI args from:

- default arg baseline
- user-provided extra args
- env/runtime mode add-ons (docker/headless/security/deterministic)
- window sizing and positioning
- extension load args
- proxy and user-agent flags

Normalization behavior:

- merges multiple `--disable-features=...` entries into one deduplicated list
- deduplicates duplicate flags via `args_as_dict`/`args_as_list`
- asserts `user_data_dir` is present

## Display and Viewport Defaults

`detect_display_configuration()` sets safe defaults from host environment:

- uses platform screen probes (`AppKit` on macOS, `screeninfo` elsewhere)
- defaults to headful when display exists, headless otherwise
- in headful mode defaults to `no_viewport=True` unless explicit viewport is requested
- in headless mode forces viewport mode
- enforces `headless=True` and `no_viewport=True` cannot both hold

Window helper:

- `get_window_adjustments()` returns platform offsets used for window placement tweaks

## Profile Validation and Runtime Guards

Important validators/model hooks:

- large domain lists (`>=100`) convert to `set` for O(1) lookup (pattern matching no longer supported there)
- deprecated `window_width/window_height` copied into `window_size`
- warns on `storage_state + user_data_dir` conflict
- rewrites default profile dir when non-default channel/executable is used to reduce profile corruption risk
- warns when deterministic rendering is enabled
- warns when proxy bypass is set without proxy server
- resolves highlight conflict by prioritizing `dom_highlight_elements`

`model_post_init`:

- runs display detection
- runs `_copy_profile` to clone profile data into a temp directory for Chrome-like profiles

## Extension Bootstrap and Patch Pipeline

When `enable_default_extensions=True`, profile startup:

1. ensures extension cache directory exists
2. downloads missing CRX files for bundled default extensions
3. extracts CRX payloads
4. applies cookie-extension patch (`_apply_minimal_extension_patch`) to seed `whitelistedDomains`
5. returns `--load-extension=...` arg list

Bundled defaults include ad-block/cookie/URL-cleaning/background-tab behavior extensions.

## Demo Mode Overlay Runtime (`demo_mode.py`)

`DemoMode` injects an in-browser right-side telemetry panel.

Core behavior:

- stores one session-specific JS script template with `SESSION_ID` placeholder replacement
- `ensure_ready()` installs an init script (`_cdp_add_init_script`) and injects into currently open pages
- `send_log(...)` pushes entries by dispatching `CustomEvent('browser-use-log')` in page runtime
- level normalization clamps to known log levels (`info`, `action`, `thought`, `success`, `warning`, `error`)

Injection policy:

- targets HTTP and about pages gathered via `_cdp_get_all_pages(...)`
- avoids hard failure when individual target injection fails

## Video Recording Service (`video_recorder.py`)

`VideoRecorderService` is a frame encoder utility consumed by `RecordingWatchdog`.

Runtime contracts:

- requires optional deps (`imageio`, `numpy`, `Pillow`)
- writes `libx264` MP4 (`yuv420p`) via `imageio`
- pads frames to codec macro-block alignment (`16x16` default)
- resizes incoming screencast frame images to configured viewport before append
- `stop_and_save()` closes writer and finalizes file

Failure behavior:

- start failure disables recorder
- per-frame decode/append failures are logged and skipped

## Related Docs

- [Browser Session, Session Manager, Event Bus, and CDP Lifecycle Orchestration Reference](session_manager_event_bus_and_cdp_lifecycle_orchestration_reference.md)
- [Browser Watchdog Base and Specialized Watchdogs Runtime Reference](watchdogs/watchdog_base_and_specialized_watchdogs_runtime_reference.md)
- [Frontend Sidecar Browser Use Runtime Docs Hub](../README.md)
