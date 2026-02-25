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
  - none (all compatibility aliases are now retired at the tool boundary)
- Removed legacy aliases:
  - `type -> use input`
  - `open -> use navigate`
  - `switch_tab -> use switch`
  - `press -> use send_keys`
  - `act -> use canonical actions directly`

## Execution Phases

1. Phase 1: Contract freeze + observability
   - Centralize canonical/legacy action contract constants.
   - Keep behavior identical; annotate legacy alias usage.
   - Update remote tool docs/prompts to prefer canonical actions.
   - Add contract tests for alias-deprecation signaling.
   - Status: completed (2026-02-25)

2. Phase 2: Schema migration
   - Split public schema into canonical model + legacy compatibility layer.
   - Keep legacy aliases parseable but mark deprecated in descriptions/tests.
   - Add strict-mode option for canonical-only execution in tests/CI.
   - Status: completed (2026-02-25)
     - backend action types split into canonical vs legacy aliases
     - strict mode env wired: `WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1`

3. Phase 3: Adapter thinning
   - Remove alias transforms from adapter hot path.
   - Route canonical actions directly to Browser Use-native handlers.
   - Keep a thin legacy shim only for controlled fallback.
   - Status: completed (2026-02-25)
     - canonical actions now dispatch directly through runtime action bridge
     - legacy alias wrappers retained as thin compatibility shim
     - legacy `act` envelope narrowed to adapter-internal handling only during Phase 3 (later removed in Phase 4)
     - obsolete direct adapter alias wrappers removed; legacy aliases now exclusively flow through `execute(...)`
     - runtime-provider lookup now calls native factory directly (self-import indirection removed)

4. Phase 4: Legacy retirement
   - Disable legacy aliases by default (feature flag first).
   - Remove `act` envelope compatibility path.
   - Delete dead alias code + tests after rollout window.
   - Status: completed (2026-02-25)
     - legacy aliases now disabled by default in backend + sidecar runtime gates
     - rollout flag updated: `WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS=1` temporarily re-enables legacy aliases without requiring strict mode
     - blocked legacy alias attempts now emit warning logs in sidecar + backend paths for rollout observability
     - warning logs now expose structured alias fields (`legacy_action`, `preferred_action`, `legacy_action_blocked`, `legacy_action_gate`)
     - removed-alias gate labeling is now generic (`legacy_alias_removed`) so additional retired aliases do not require special-case telemetry paths
     - strict/allow gate precedence now resolves through shared helper logic in both backend and sidecar paths
     - legacy alias `act` is now always rejected with canonical-action migration guidance (independent of rollout flags)
     - adapter-level `act` envelope dispatch path removed (direct adapter `execute("act", ...)` now returns migration error + legacy metadata)
     - contract layer now distinguishes active legacy aliases from removed aliases (`act` no longer counted as active legacy for `is_legacy` gating)
     - sidecar schema registry no longer advertises `act` as a valid compatibility action (`validate_browser_args("act", ...)` now rejects)
     - backend OpenClaw compatibility schema now excludes removed aliases (`BrowserOpenClawCompatArgs(action="act")` validation rejects)
     - historical `act` envelope `request` field removed from backend + sidecar OpenClaw compatibility models
     - backend OpenClaw action typing now matches sidecar OpenClaw subset (compatibility aliases like `type`/`press`/`switch_tab` are no longer accepted by `BrowserOpenClawCompatArgs`)
     - OpenClaw compatibility schemas no longer advertise legacy `open`; canonical `navigate` is now the only schema-level navigation action
     - sidecar schema suite now locks backend↔sidecar action-contract parity (canonical/legacy/removed sets, preferred-action map, OpenClaw action subset) to catch drift early
     - legacy alias `open` is now retired at backend + sidecar tool boundaries (moved to removed-alias bucket; callers must use canonical `navigate`)
     - adapter-level `open -> navigate(new_tab=true)` compatibility transform removed; `BrowserRuntimeAdapter.execute("open", ...)` now returns removed-alias migration error
     - legacy alias `switch_tab` is now retired at backend + sidecar tool boundaries (moved to removed-alias bucket; callers must use canonical `switch`)
     - adapter-level `switch_tab -> switch` compatibility transform removed; `BrowserRuntimeAdapter.execute("switch_tab", ...)` now returns removed-alias migration error
     - legacy alias `press` is now retired at backend + sidecar tool boundaries (moved to removed-alias bucket; callers must use canonical `send_keys`)
     - adapter-level `press -> send_keys` compatibility transform removed; `BrowserRuntimeAdapter.execute("press", ...)` now returns removed-alias migration error
     - legacy alias `type` is now retired at backend + sidecar tool boundaries (moved to removed-alias bucket; callers must use canonical `input`)
     - adapter-level `type -> input` compatibility transform removed; `BrowserRuntimeAdapter.execute("type", ...)` now returns removed-alias migration error
     - legacy alias runtime gates (`WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY` / `WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS`) removed from backend + sidecar browser tool boundaries now that no active legacy aliases remain
     - backend browser-control schema no longer keeps a dedicated legacy-only action subtype; action typing is now canonical + removed aliases only
     - backend schema contract constants no longer keep empty legacy action/preferred maps; shared action sets now compose canonical + removed aliases only
     - sidecar contract map no longer keeps an empty legacy-alias dictionary; all compatibility alias guidance now derives from removed-alias map only
     - sidecar adapter no longer keeps dead legacy-dispatch paths; removed aliases fail directly via removed-alias boundary checks
     - sidecar browser tool path no longer uses `phase2` naming (`BROWSER_ROUTED_ACTIONS` / `_run_browser_action`) and now exposes neutral runtime adapter names (`BrowserRuntimeAdapter`, `get_browser_adapter`)
     - compatibility naming aliases (`BrowserUseCompatibilityAdapter`, `get_browser_use_adapter`) are now removed from sidecar browser adapter/tool export surfaces
     - sidecar browser tool now resolves controller import lazily, allowing adapter/parity suites to import `browser_tool` without a Playwright install
     - sidecar browser safety gate now runs green without Playwright in this environment (`test_browser_tool`, `test_browser_use_adapter`, `test_browser_use_tool_parity`, `test_browser_schemas` all passing)
     - vendored Browser Use registry wrapper control flow fixed (`for/else` mis-branch) so runtime actions like `navigate` correctly receive `browser_session` instead of failing with missing-parameter errors

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
