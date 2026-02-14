---
summary: "Browser-Use Parity Plan for WindieOS Browser Control"
read_when:
  - When planning Browser Use capability parity in WindieOS.
  - When deciding wait behavior across browser actions.
  - When splitting low-level browser control from higher-level web task actions.
---

# Browser-Use Plan for WindieOS

## Goal

Capture the current comparison between WindieOS, OpenClaw, and Browser Use, then define a practical implementation plan for Browser Use-aligned capabilities in WindieOS without bloating one tool schema.

Date locked for this plan: **February 14, 2026**.

## Current Behavior Baseline

### OpenClaw

- `navigate` has no exposed `wait_until` parameter in the tool schema.
- Internally, it calls `page.goto(...)` without `waitUntil`, so effective default behavior is Playwright default (`load`).
- `act(kind="wait")` supports `loadState` only when explicitly set (`load`, `domcontentloaded`, `networkidle`).
- `click`, `type`, `scrollIntoView` do not add a post-action load wait.

### WindieOS

- `navigate.wait_until` supports: `load`, `domcontentloaded`, `networkidle`, `commit`.
- Default `navigate.wait_until` is `networkidle`.
- `open_tab` default wait is `domcontentloaded`.
- `wait.state` supports `load`, `domcontentloaded`, `networkidle` with default `networkidle`.
- `click`, `type`, `scroll` return when the action completes; no automatic post-action load wait.

### Browser Use

- `click` has no `wait_until` parameter.
- Internal navigation event (`NavigateToUrlEvent`) has `wait_until`, default `load`.
- Public default tools (`navigate`, `search`) do not expose `wait_until`; they rely on that internal default.

## Wait State Meanings

- `commit`: navigation request committed; earliest signal.
- `domcontentloaded`: DOM parsed, resources may still load.
- `load`: document load event fired; common "human page loaded" baseline.
- `networkidle`: quiet network window; may be slow/flaky on high-activity pages (Amazon, dashboards, polling apps).

## Practical Wait Guidance

- For reliable automation on modern sites:
  1. Navigate with `load` (or `domcontentloaded` for speed-sensitive flows).
  2. Wait for a concrete selector/text that proves readiness.
  3. Snapshot and continue.
- Do not rely on `networkidle` alone for pages with continuous background requests.

## Browser Use Actions Missing in WindieOS (First-Class Names)

- `search`
- `go_back`
- `search_page`
- `find_elements`
- `find_text` (scroll-to-text helper)
- `dropdown_options`
- `select_dropdown`
- `extract`
- `read_long_content`
- `close(tab_id)` semantics (WindieOS `close` closes session, not tab by id)

## Mostly Equivalent Actions (Different Naming)

- Browser Use `input` ~= WindieOS `type`
- Browser Use `switch` ~= WindieOS `switch_tab`/`focus`
- Browser Use `upload_file` ~= WindieOS `upload`
- Browser Use `send_keys` ~= WindieOS `press` (Browser Use has richer shortcut ergonomics)

## Not Browser-Specific (Keep Outside Browser Tool)

Browser Use bundles these in the same toolset, but WindieOS should keep them as file/task primitives, not browser actions:

- `write_file`
- `replace_file`
- `read_file`
- `done`

## Schema Strategy Decision

Do **not** keep adding every Browser Use capability into one giant `browser_control(action=...)` surface.

Preferred split:

1. Keep `browser_control` for low-level browser primitives and debug/state operations.
2. Introduce a higher-level tool layer (for example: `browser_task`) for:
   - `search_page`
   - `find_elements`
   - `find_text`
   - `extract`
   - `read_long_content`
   - workflow-oriented helpers (`go_back`, smarter tab flows).

This reduces tool-call confusion and keeps model selection accuracy stable.

## Backlog Item: `wait_until` on All Actions

Requested direction (not implemented yet): allow `wait_until` on every browser action with a default of `load`.

If implemented, enforce these rules:

1. If target state is already satisfied, return immediately.
2. For non-navigation actions, disallow or ignore `commit`.
3. `networkidle` must be bounded by timeout and documented as potentially long-running.
4. Encourage selector/text waits for deterministic readiness.

## Proposed Phased Rollout

### Phase 1 (High Value, Low Risk)

- Add Browser Use-like discovery helpers:
  - `search_page`
  - `find_elements`
  - `find_text`
- Add `go_back`.
- Add tab-close-by-target/tab-id action without changing existing `close` session behavior.

### Phase 2 (Workflow Helpers)

- Add dropdown helpers:
  - `dropdown_options`
  - `select_dropdown`
- Harmonize naming aliases (`input`, `switch`, `upload_file`, `send_keys`) while preserving current names.

### Phase 3 (Content Intelligence)

- Add `extract` and `read_long_content` as high-level actions/tool, with strict output budgeting and truncation controls.

### Phase 4 (Optional Wait Unification)

- Add cross-action `wait_until` support if needed after telemetry confirms value.

## Acceptance Criteria

1. New Browser Use-style helpers are available without regressing existing OpenClaw-compatible actions.
2. Tool schema remains understandable and model-friendly.
3. Action docs explicitly explain wait semantics and anti-patterns (`networkidle` on noisy sites).
4. Parity tests cover added actions and alias behavior.

