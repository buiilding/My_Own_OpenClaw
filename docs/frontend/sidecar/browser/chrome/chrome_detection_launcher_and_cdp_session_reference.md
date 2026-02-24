---
summary: "Deep reference for sidecar Chrome executable detection, dedicated-profile CDP launch policy, endpoint availability probes, and ensure-connect state machine semantics."
read_when:
  - When changing browser executable detection paths/order, CDP port env behavior, or dedicated profile directory rules.
  - When debugging browser auto-launch timeout, CDP endpoint availability checks, or cross-platform process launch differences.
title: "Chrome Detection, Launcher, and CDP Session Reference"
---

# Chrome Detection, Launcher, and CDP Session Reference

## Canonical Modules

- `frontend/src/main/python/tools/browser/chrome_detection.py`
- `frontend/src/main/python/tools/browser/chrome_launcher.py`
- `tests/sidecar/tools/test_chrome_detection.py`
- `tests/sidecar/tools/test_chrome_launcher.py`

## Detection Surface (`chrome_detection.py`)

`ChromeExecutable` stores:

- `path`
- `kind` (`chrome`, `brave`, `edge`, `chromium`, `chrome_canary`)

Platform scanners:

- Linux: hardcoded candidates + `which` fallback for missing kinds
- macOS: `/Applications` + user `~/Applications` bundles
- Windows: `ProgramFiles`, `ProgramFiles(x86)`, `LocalAppData` candidates with normalized separators

Selection behavior:

- `find_all_chrome_executables()` dispatches by `platform.system()`
- unsupported OS returns empty list
- `find_chrome_executable(prefer_kind=...)` checks explicit kind first, otherwise priority order:
  - `chrome` > `brave` > `edge` > `chromium` > `chrome_canary`

Version probe:

- `get_chrome_version(exe_path)` runs `--version` with timeout
- returns stripped stdout on success, `None` on failure/timeout/permission error

## Launcher Defaults and Env Overrides (`chrome_launcher.py`)

Constants:

- default port: `9333`
- startup timeout: `10s`
- poll interval: `0.5s`

Port override:

- env: `WINDIE_BROWSER_CDP_PORT`
- empty -> default
- non-positive/non-integer -> warning + default fallback

Derived endpoints:

- `DEFAULT_WINDIE_CDP_URL = http://127.0.0.1:<port>`
- legacy alias `DEFAULT_CDP_URL` points to same URL

## CDP Availability and Process Checks

`is_cdp_available(cdp_url, timeout)`:

- HTTP GET `<cdp_url>/json/version`
- returns `True` only on HTTP `200`
- catches all exceptions and returns `False`

`find_chrome_process()`:

- Windows: `tasklist` CSV parse (`chrome.exe` PID)
- Linux/macOS: `pgrep -f chrome`, returns first PID

`is_chrome_running_with_cdp(port)`:

- raw TCP `connect_ex` probe to `127.0.0.1:<port>`
- quick listener check, not CDP schema validation

## Dedicated Windie Profile Directory

`get_chrome_user_data_dir()` isolates Windie automation state from the user's default browser profile:

- Windows: `%LOCALAPPDATA%/WindieOS/BrowserProfile`
- macOS: `~/Library/Application Support/WindieOS/BrowserProfile`
- Linux: `~/.config/windieos/browser-profile`

## Launch Semantics

`launch_chrome_with_cdp(...)` flow:

1. resolve executable (auto-detect when missing)
2. ensure dedicated profile dir exists
3. launch with args:
   - `--remote-debugging-port=<port>`
   - `--user-data-dir=<windie_profile_dir>`
   - `--profile-directory=Default`
   - optional headless flags (`--headless=new`, `--disable-gpu`)
   - optional caller `extra_args`
4. process launch differences:
   - Windows: `CREATE_NEW_PROCESS_GROUP`
   - non-Windows: `start_new_session=True`
5. poll CDP endpoint until startup timeout
6. timeout path terminates/kills process and raises `ChromeLaunchTimeoutError`

Important behavior:

- no `--no-first-run` policy is injected by launcher
- stdout/stderr are suppressed (`DEVNULL`)

## Ensure-Connect State Machine

`ensure_chrome_with_cdp(...)` cases:

1. CDP already available -> return URL
2. CDP unavailable + `auto_launch=True` -> launch dedicated instance and return URL
3. CDP unavailable + `auto_launch=False` -> raise `ChromeLauncherError`

`restart_if_needed` is accepted only as compatibility parameter and explicitly ignored.

## Process Kill Helper

`kill_existing_chrome(graceful=True)`:

- checks if Chrome exists first
- Windows: `taskkill` (with `/F` only in force mode)
- non-Windows: `pkill` (with `-9` only in force mode)
- waits 2s and rechecks process presence

This helper exists, but dedicated Windie connect path intentionally avoids killing default user browser instances.

## `ChromeLauncher` Wrapper

State fields:

- `cdp_port`, `cdp_url`, `auto_launch`, `headless`
- `process`
- `_launched_by_us`

`launch()`:

- reuses existing CDP endpoint when available
- otherwise launches and marks `_launched_by_us=True`

`shutdown(kill=False)`:

- only terminates process automatically when launcher started it
- optional force kill path delegates to `kill_existing_chrome(graceful=False)`

## Test-Backed Contracts

`tests/sidecar/tools/test_chrome_detection.py` covers:

- per-platform discovery dispatch
- prefer-kind and default priority ordering
- no-result behavior
- version probe success/failure/timeout paths

`tests/sidecar/tools/test_chrome_launcher.py` covers:

- CDP availability probe success/failure
- process detection parsing behavior
- profile directory paths per platform
- launch success includes dedicated profile args
- launch timeout process termination behavior
- ensure-connect branch behavior (`already available`, `auto launch`, `auto_launch disabled`)
- `ChromeLauncher` reuse-vs-launch semantics

## Diagnostics Checklist

If connect/launch fails:

1. verify `WINDIE_BROWSER_CDP_PORT` parses to positive integer
2. verify detected executable path exists and is runnable
3. check dedicated profile directory permissions
4. probe `<cdp_url>/json/version`
5. inspect startup timeout path (`ChromeLaunchTimeoutError`) versus immediate spawn failure (`ChromeLauncherError`)

## Related Pages

- [Frontend Sidecar Browser Chrome Docs Hub](README.md)
- [Browser Controller Lifecycle, Snapshot, and Action Runtime Reference](browser_controller_lifecycle_snapshot_and_action_runtime_reference.md)
- [Enhanced CDP DOM Snapshot Pipeline Runtime Reference](enhanced_cdp_dom_snapshot_pipeline_runtime_reference.md)
