---
summary: "Phase 0 decision log for browser_control actions that are not direct Browser Use one-to-one mappings."
read_when:
  - Finalizing Browser Use adapter scope for non-trivial action parity.
  - Reviewing intentional deprecations and compatibility shims.
---

# Browser Use Port Phase 0 Decision Log

Date locked: **February 16, 2026**

This log records Phase 0 decisions for actions that are not direct Browser Use one-to-one mappings.

## Decisions

| ID | Action(s) | Decision | Why | Mitigation / implementation note |
| --- | --- | --- | --- | --- |
| D-001 | `snapshot` | `compat` | WindieOS snapshot output and ref model are contract-critical and differ from Browser Use browser-state text/indexes. | Build adapter translator from `BrowserStateSummary` to WindieOS `snapshot` payload fields (`snapshot`, `ref_count`, pagination, ref aliases). |
| D-002 | `extract` | `compat` | WindieOS exposes mode variants (`focused`, `full_text`, `structured`) and payload metadata that do not fully match Browser Use `ExtractAction`. | Use Browser Use extraction where direct; keep adapter fallback/normalization for mode-specific WindieOS fields. |
| D-003 | `click`, `type` | `compat` | WindieOS consumes refs (`"12"`, `"e1"`) while Browser Use actions are index/coordinate based. | Add stable ref-to-index resolver per tab/snapshot and preserve WindieOS fallback metadata semantics. |
| D-004 | `wait` | `compat` | Browser Use default wait action is time-based; WindieOS also supports load-state waits. | Keep adapter-owned load-state wait path and route seconds waits to Browser Use `WaitEvent`. |
| D-005 | `screenshot` | `compat` | WindieOS returns inline base64 screenshot payloads; Browser Use screenshot tool is observation/file-oriented by default. | Call `BrowserSession.take_screenshot()` directly and normalize into WindieOS schema. |
| D-006 | `console`, `errors`, `requests` | `compat` | Browser Use does not expose WindieOS-equivalent retained logs as first-class tools. | Add adapter collectors/listeners over Browser Use session CDP/watchdog streams and normalize output contracts. |
| D-007 | `trace_start`, `trace_stop` | `deprecate` | WindieOS uses Playwright trace zip semantics that do not have a first-class Browser Use equivalent. | Deprecate with explicit docs/runbook guidance; provide HAR/requests-based troubleshooting alternative. |
| D-008 | `pdf` | `compat` | Browser Use has print/download handling internals but no WindieOS `pdf` action payload contract. | Use adapter wrapper around Browser Use CDP session `printToPDF` path and preserve existing payload fields. |
| D-009 | `dialog` | `compat` | Browser Use auto-handles dialogs via watchdog; WindieOS has explicit arm/wait/recent semantics. | Maintain adapter state for dialog events to emulate WindieOS `dialog` behavior. |
| D-010 | `cookies*`, `storage*` | `compat` | Browser Use has low-level cookie/storage helpers but not full WindieOS action surface. | Implement adapter compatibility methods around session CDP helpers (`_cdp_get_cookies`, `_cdp_set_cookies`, DOMStorage/runtime scripts). |
| D-011 | `set_offline`, `set_headers`, `set_credentials`, `set_media`, `set_device` | `compat` | Browser Use has partial/low-level support; some helpers are not fully implemented as public actions. | Adapter owns CDP-level compatibility calls; if unsupported at runtime, return deterministic WindieOS-style error payloads. |
| D-012 | `set_timezone`, `set_locale` | `compat` | Dynamic runtime mutation is unsupported in current WindieOS and Browser Use context models. | Preserve explicit failure semantics instead of silent no-op. |
| D-013 | `profiles`, `status`, `act` | `compat` | These are WindieOS/OpenClaw compatibility contracts, not Browser Use first-class actions. | Keep adapter-owned compatibility responses and `act.request.kind` dispatch. |

## Exit-Criteria Check (Phase 0)

- Every listed `browser_control` action has a migration status in `docs/plan/BROWSER_USE_PORT_PHASE0_PARITY_LEDGER.md`.
- No unresolved “unknown behavior” actions remain from the Phase 0 inventory.

