---
summary: "Deep reference for `test_shell.cjs`: manual shell-tool smoke harness, OS-specific Chrome command selection, background/foreground execution probes, and pass/fail summary semantics."
read_when:
  - When modifying manual shell-tool smoke tests in `frontend/src/main/test_shell.cjs`.
  - When investigating Chrome launch command compatibility differences across Windows/macOS/Linux.
title: "Shell Tool Chrome Command Test Harness Runtime Reference"
---

# Shell Tool Chrome Command Test Harness Runtime Reference

## Canonical Modules

- `frontend/src/main/test_shell.cjs`
- `frontend/src/main/python/tools/system/shell_tool.py`
- `frontend/src/main/python/tools/system/process_tool.py`

## Purpose and Scope

`test_shell.cjs` is a manual Node smoke harness for shell command behavior.

Current state:

- the script still imports legacy module path `./tools/system/shell.cjs`
- that file no longer exists in current frontend tree
- running the harness as-is fails until import is migrated to live sidecar runtime path(s)

It exercises:

- background Chrome launches
- platform-specific Chrome URL commands
- simple foreground command execution
- command-variation probing for Chrome executables

It is not part of automated unit-test suites by default.

## Entry Contract

- run via `node src/main/test_shell.cjs`
- script executes when `require.main === module`
- exports test functions for ad-hoc reuse/imports

## Test Cases

Defined runner list:

1. `testOpenChromeBackground`
2. `testOpenChromeWithUrl`
3. `testForegroundCommand`
4. `testChromeCommandVariations`

Each case calls `runShellCommand(args, false)` and interprets success/error fields in returned result payload.

## Platform Command Matrix

`testOpenChromeWithUrl` command choice by `os.platform()`:

- Windows: `start chrome https://www.google.com`
- macOS: `open -a "Google Chrome" https://www.google.com`
- Linux: `google-chrome https://www.google.com`

`testChromeCommandVariations` then probes multiple fallback command forms per platform and stops after first success.

## Result and Exit Contract

Runner tracks counters:

- `total`
- `passed`
- `failed`

Exit behavior:

- `process.exit(0)` when no failures
- `process.exit(1)` when any test fails

Note: failures can be expected when Chrome is not installed; script logs that explicitly as warning context.

## Output Contract

- ANSI colored logs for phase separators and status markers
- half-second delay between tests (`500ms`) to reduce overlapping process activity

## Drift Hotspots

1. Legacy import path drift: `./tools/system/shell.cjs` has been removed from frontend main.
2. Command strings can rot as platform launcher conventions change.
3. Hardcoded Chrome assumptions produce false negatives on systems with Chromium-only installs.
4. Depending on this script for CI would create host-environment instability (GUI/browser dependency).

## Related Pages

- [Frontend Main Testing Docs Hub](README.md)
- [Frontend Main Testing Data-Seed Docs Hub](data_seed/README.md)
- [Frontend Main Docs Hub](../README.md)
