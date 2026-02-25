---
summary: "Staged plan to merge Browser Use runtime into WindieOS browser stack while retiring compatibility aliases and adapter-only behavior."
read_when:
  - When planning removal of OpenClaw compatibility aliases (`open`, `type`, `press`, `switch_tab`, `act`) from browser tool contracts.
  - When moving from adapter-heavy browser routing to direct Browser Use-native execution.
title: "WindieOS Browser Use Hard-Merge Plan (2026-02-25)"
---

# WindieOS Browser Use Hard-Merge Plan (2026-02-25)

## Goals

- Keep all Browser Use capabilities WindieOS depends on:
  - Browser control actions
  - DOM extraction/snapshot/content extraction
  - Tab/session/runtime behavior
- Keep WindieOS as LLM/agent coordinator (Browser Use is a tool runtime, not orchestration owner).
- Remove adapter complexity over time by converging on one canonical browser action contract.

## Non-Goals

- No removal of WindieOS computer-control tools outside browser domain.
- No reduction of Browser Use DOM/content extraction functionality.
- No big-bang rewrite that risks browser regressions.

## Target End State

- One WindieOS browser contract with canonical actions only.
- No OpenClaw legacy aliases at contract boundary.
- Browser execution path:
  - `browser_tool` -> canonical validation -> Browser Use-native handler dispatch
  - No compatibility transforms in hot path
- Vendored Browser Use runtime remains in-repo under WindieOS ownership.

## Canonical vs Legacy (Phase 1 Baseline)

- Canonical actions:
  - `connect`, `status`, `profiles`, `navigate`, `snapshot`, `extract`, `click`, `input`, `send_keys`, `scroll`, `screenshot`, `wait`, `get_tabs`, `switch`, `evaluate`, `close`
  - `done`, `search`, `go_back`, `search_page`, `find_elements`, `find_text`, `close_tab`, `dropdown_options`, `select_dropdown`, `upload_file`, `write_file`, `replace_file`, `read_file`, `read_long_content`
- Legacy compatibility aliases:
  - `open -> navigate(new_tab=true)`
  - `type -> input`
  - `press -> send_keys`
  - `switch_tab -> switch`
  - `act -> direct action invocation`

## Execution Phases

1. Phase 1: Contract freeze + observability
   - Centralize canonical/legacy action contract constants.
   - Keep behavior identical; annotate legacy alias usage.
   - Update remote tool docs/prompts to prefer canonical actions.
   - Add contract tests for alias-deprecation signaling.

2. Phase 2: Schema migration
   - Split public schema into canonical model + legacy compatibility layer.
   - Keep legacy aliases parseable but mark deprecated in descriptions/tests.
   - Add strict-mode option for canonical-only execution in tests/CI.
   - Status: in progress (2026-02-25)
     - backend action types split into canonical vs legacy aliases
     - strict mode env wired: `WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1`

3. Phase 3: Adapter thinning
   - Remove alias transforms from adapter hot path.
   - Route canonical actions directly to Browser Use-native handlers.
   - Keep a thin legacy shim only for controlled fallback.
   - Status: in progress (2026-02-25)
     - canonical actions now dispatch directly through runtime action bridge
     - legacy alias wrappers retained as thin compatibility shim

4. Phase 4: Legacy retirement
   - Disable legacy aliases by default (feature flag first).
   - Remove `act` envelope compatibility path.
   - Delete dead alias code + tests after rollout window.

## Safety Gates

- Keep parity suites green:
  - `tests/sidecar/tools/test_browser_use_tool_parity.py`
  - `tests/sidecar/tools/test_browser_use_adapter.py`
  - `tests/sidecar/tools/test_browser_tool.py`
- Add/maintain contract tests for:
  - payload shape stability
  - compatibility rejection messages
  - legacy alias deprecation signals
- No phase promotion without passing sidecar browser test gate.
