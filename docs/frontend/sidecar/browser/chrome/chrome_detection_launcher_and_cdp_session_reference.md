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
- `find_chrome_executable()` uses one fixed priority order:
  - `chrome` > `brave` > `edge` > `chromium` > `chrome_canary`

## Launcher Defaults and Env Overrides (`chrome_launcher.py`)

Constants:

- default port: `9333`
- startup timeout: `10s`
- poll interval: `0.5s`

Port override:

- env: `AGENT_BROWSER_CDP_PORT` (`WINDIE_BROWSER_CDP_PORT` in WindieOS launches)
- empty -> default
- non-positive/non-integer -> warning + default fallback

Derived endpoints:

- `DEFAULT_DEDICATED_CDP_URL = http://127.0.0.1:<port>`

## CDP Availability and Process Checks

`is_cdp_available(cdp_url, timeout)`:

- HTTP GET `<cdp_url>/json/version`
- returns `True` only on HTTP `200`
- catches all exceptions and returns `False`

Dedicated-browser process matching is scoped to the dedicated profile directory and
the configured CDP port; the launcher no longer exposes broad Chrome process
discovery or generic listener checks.

## Dedicated Profile Directory

`get_chrome_user_data_dir()` isolates browser automation state from the user's
default browser profile. Standalone launches use generic desktop-runtime paths:

- Windows: `%LOCALAPPDATA%/desktop-runtime/BrowserProfile`
- macOS: `~/Library/Application Support/desktop-runtime/BrowserProfile`
- Linux: `~/.config/desktop-runtime/BrowserProfile`

Host-skinned desktop launches may inject a product-specific user-data root. The
current WindieOS skin injects `windieos`, so the existing
`windieos/BrowserProfile` dedicated profile remains the active desktop path for
that product configuration.

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

The launcher does not accept restart/kill flags; the desktop browser adapter
connects to or starts its own dedicated browser instance and never kills the
user's default Chrome.

## Process Kill Helper

`kill_existing_chrome(graceful=True)`:

- checks if Chrome exists first
- Windows: `taskkill` (with `/F` only in force mode)
- non-Windows: `pkill` (with `-9` only in force mode)
- waits 2s and rechecks process presence

This helper exists, but the dedicated desktop connect path intentionally avoids
killing default user browser instances.

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
- default priority ordering
- no-result behavior

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

1. verify `AGENT_BROWSER_CDP_PORT` (`WINDIE_BROWSER_CDP_PORT` in WindieOS launches)
   parses to positive integer
2. verify detected executable path exists and is runnable
3. check dedicated profile directory permissions
4. probe `<cdp_url>/json/version`
5. inspect startup timeout path (`ChromeLaunchTimeoutError`) versus immediate spawn failure (`ChromeLauncherError`)

## Related Pages

- [Local-Runtime Browser Chrome Docs Hub](README.md)
- [Browser Runtime Deterministic Extraction Contract Reference](../browser_runtime_deterministic_extraction_contract_reference.md)
- [Browser Automation Stack](../../browser_automation_stack.md)
