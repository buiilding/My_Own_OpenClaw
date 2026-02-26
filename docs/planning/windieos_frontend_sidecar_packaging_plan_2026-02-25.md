---
summary: "Frontend/Sidecar packaging decisions and Q&A log for slim-vs-full distribution strategy."
read_when:
  - When deciding whether to bundle Playwright browsers in desktop installers.
  - When defining first-run browser provisioning behavior for users with/without Chrome.
  - When estimating sidecar download size vs installed disk footprint.
title: "WindieOS Frontend + Sidecar Packaging Plan (2026-02-25)"
---

# WindieOS Frontend + Sidecar Packaging Plan (2026-02-25)

## Scope

This note captures one packaging conversation and preserves:
- user questions
- direct answers
- measured size data
- recommended distribution policy

## Current Packaging Facts

- Desktop packaging target includes:
  - Electron frontend app
  - Python sidecar runtime (`resources/python-runtime`)
- Sidecar runtime dependency file:
  - `frontend/src/main/python/requirements.runtime.txt`
- Runtime dependency count:
  - 15 top-level dependencies
  - 14 cross-platform + `pywin32` (Windows-only)
- Sidecar Python source footprint:
  - 346 files under `frontend/src/main/python`
  - 136 `.py` files
- Browser Use vendored footprint inside sidecar:
  - 73 `.py` files under `frontend/src/main/python/tools/browser/browser_use`

## Measured Size Snapshot (Linux, Python 3.11 runtime build)

- Full sidecar runtime archive (with Playwright browser payload):
  - `frontend/python-runtime.tar.gz` = 497,934,018 bytes (`474.87 MiB`)
- Installed/unpacked sidecar runtime:
  - `frontend/python-runtime` = `1.4G`
- Largest contributors:
  - `python-runtime/ms-playwright` = `621M`
  - `python-runtime/lib/python3.11/site-packages` = `722M`
- Slim sidecar runtime archive (excluding `ms-playwright`):
  - `frontend/python-runtime.no-browsers.tar.gz` = 229,222,419 bytes (`218.60 MiB`)
- Full -> slim archive savings:
  - `256.26 MiB` (~`53.97%`)

## Q&A Log (Conversation Capture)

1. Q: What needs to be packaged?
   A: Frontend app + sidecar runtime. Backend is not bundled in this flow.

2. Q: How many libraries/files are in sidecar packaging?
   A: 15 top-level runtime deps; sidecar source footprint 346 files / 135 Python files.

3. Q: Does user need 1.5GB+ install?
   A: Installed sidecar footprint is ~1.4GB in the measured build. Download archive is smaller.

4. Q: If user already has Playwright/browser assets, does bundled package shrink?
   A: No. Bundled runtime still ships its own browser payload. Existing machine cache only helps if not prebundled.

5. Q: Playwright browser vs Chromium?
   A: Playwright is automation framework. Browser payload is a Playwright-managed/pinned Chromium-family binary package.

6. Q: Will `.exe/.deb/.AppImage` be 1.5GB+ downloads?
   A: No. Installer artifacts are compressed. Installed size can exceed download size significantly.

7. Q: What should we do when users already have browser?
   A: Use slim packaging by default, detect installed browser first, prompt runtime download only when missing.

8. Q: If user has Google Chrome, do they have Chromium?
   A: Usually no separate Chromium app installed, but Chrome itself is typically sufficient for automation fallback.

9. Q: Does WindieOS browser-use path use Chrome or Chromium?
   A: Current connect path is Chrome-first (dedicated Windie browser instance over CDP), with Chromium fallback paths.

10. Q: Connect uses dedicated profile or headless every time?
    A: Dedicated persistent WindieOS profile by default; not headless in the connect path.

11. Q: If Windie browser instance does not exist, do we create/recreate it?
    A: On `connect`, if CDP instance is absent it auto-launches. If profile dir is deleted, it is recreated on next launch.

12. Q: How many Python files are packaged in sidecar?
    A: Current tree count is 136 `.py` files under `frontend/src/main/python`.

13. Q: Of those, how many are from browser-use?
    A: 73 `.py` files are vendored `browser_use` files.

14. Q: Can we simplify sidecar/browser_use and keep WindieOS as LLM coordinator?
    A: Yes. Start with safe pruning that keeps browser-control behavior unchanged:
    - fix syntax/runtime blockers
    - remove stale lazy-import references to non-vendored providers/modules
    - keep Browser Use scoped to browser control; leave WindieOS runtime provider selection as source of LLM settings for extraction-only paths

## Browser Runtime Behavior (Current)

- Connect path:
  - dedicated Windie CDP endpoint
  - auto-launch enabled
  - persistent Windie-owned browser profile directory
- Browser selection:
  - Chrome preferred before Chromium in primary detection order
- Runtime selection:
  - Browser Use native runtime is default (`browser_use_native`)

## Recommended Distribution Policy

1. Keep slim installer as default (do not bundle `ms-playwright` browser payload).
2. Keep browser runtime install as on-demand first-run action when browser is unavailable.
3. Keep browser detection priority: system Chrome first, then Chromium-family fallbacks.
4. Show explicit user prompt before runtime download (size + reason).
5. Retry browser connect automatically after successful install.

## Implementation Notes (Planned)

- Add slim packaging profile as canonical release path.
- Keep full packaging only if required for offline enterprise channels.
- Replace packaged-runtime reliance on `uvx playwright install ...` with bundled-python-safe install path (`python -m playwright install ...`) where needed.

## Cleanup Status (Applied 2026-02-25)

- `browser_use` package cleanup phase 1 completed:
  - fixed `IndentationError` in `tools/utils.py`
  - pruned stale non-vendored exports in `browser_use/__init__.py`
  - pruned stale LLM lazy imports and type stubs in:
    - `browser_use/llm/__init__.py`
    - `browser_use/llm/_type_stubs.py`
- Validation:
  - `py_compile` over vendored `browser_use` passes under Python 3.11
  - targeted sidecar browser tests pass
  - parity test hardening applied: `test_backend_schema_exposes_all_browser_use_actions` now introspects `BrowserAction` type alias instead of regex-parsing source text
