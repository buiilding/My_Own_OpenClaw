---
summary: "Deep reference for backend BrowserControlArgs schema layering: canonical/legacy/removed action categories, shared compatibility-field mixins, and action-family field groups."
read_when:
  - When adding/removing browser actions or changing browser compatibility alias semantics in backend schemas.
  - When debugging why BrowserControlArgs accepts broad payloads while runtime blocks removed aliases or disabled legacy aliases.
title: "Browser Control Unified Schema and Compatibility Field Matrix Reference"
---

# Browser Control Unified Schema and Compatibility Field Matrix Reference

## Canonical Modules

- `backend/src/tools/browser/schema_types.py`
- `backend/src/tools/browser/snapshot_scope_fields.py`
- `backend/src/tools/browser/shared_compat_fields.py`
- `backend/src/tools/browser/browser_control_args_schema.py`
- `backend/src/tools/browser/openclaw_compat_schema.py`
- `backend/src/tools/browser/schemas.py`

## Layer 1: Literal Type Surface (`schema_types.py`)

Reusable literals define browser vocabulary and field enums:

- navigation state: `load | domcontentloaded | networkidle | commit`
- snapshot format: `ai | aria`
- mouse button: `left | right | middle`
- scroll direction: `up | down | left | right`
- wait state: `load | domcontentloaded | networkidle`

Action categories:

- `BrowserCanonicalAction`: canonical runtime actions
- `BrowserLegacyCompatAction`: currently `type`
- `BrowserRemovedCompatAction`: `open`, `switch_tab`, `press`, `act`
- `BrowserAction`: union of canonical + legacy + removed

Compatibility preference maps:

- `BROWSER_LEGACY_ACTION_PREFERRED`: `type -> input`
- `BROWSER_REMOVED_ACTION_PREFERRED`: removed alias migration targets
- `BROWSER_COMPAT_ACTION_PREFERRED`: merged map used by runtime/tool warnings

`BrowserOpenClawAction` is a separate compatibility subset and excludes removed aliases.

## Layer 2: Shared Snapshot Scope Aliases (`snapshot_scope_fields.py`)

Reusable fields injected into multiple models:

- `refs`: `role | aria`
- `interactive`: bool
- `compact`: bool
- `depth`: int (`0..20`)
- `selector`: optional CSS scope
- `frame`: optional iframe selector scope

## Layer 3: Shared Compatibility Mixins (`shared_compat_fields.py`)

`BrowserSharedCompatFields` contributes non-core aliases reused by:

- `BrowserControlArgs`
- `BrowserOpenClawCompatArgs`

Families include:

- dialog/wait aliases (`timeoutMs` + `timeout_ms`, `promptText` + `prompt_text`)
- storage/network/trace fields (`cookies`, `kind`, `values`, `contains`, `filter`, `snapshots`, `screenshots`, `sources`)
- emulation fields (`offline`/`enabled`, headers, geolocation, media/color/timezone/locale/device)
- file/text mutation compatibility fields (`append`, `trailing_newline`, `old_str`, `new_str`, `path`, `goal`, `source`, `context`, `keys`, `success`, `files_to_display`)
- no-op compatibility placeholders (`profile`, `node`, `target`)

`BrowserScreenshotImageFields` centralizes screenshot image options (`element`, `type`, `quality`) reused by:

- `BrowserControlArgs`
- `BrowserScreenshotArgs`

## Layer 4: Unified Backend Schema (`BrowserControlArgs`)

`BrowserControlArgs` is the backend-exposed browser tool args model.

Key characteristics:

- `action: BrowserAction`
- `model_config.extra = "ignore"`
- broad optional field superset spanning connect/snapshot/extract/input/tab/file/emulation compatibility fields
- includes helper signals:
- `is_legacy` is true only for aliases in `BROWSER_LEGACY_COMPAT_ACTIONS` (currently `type`)
- `preferred_action` returns migration guidance from `BROWSER_COMPAT_ACTION_PREFERRED`

Semantic boundary:

- removed aliases remain parseable for clear migration errors at runtime
- strict execution semantics are enforced by backend remote tool gates and sidecar runtime

## Layer 5: Action-Specific Models (`schemas.py`)

`schemas.py` keeps strict validators available.

Examples:

- `BrowserClickArgs`: requires `ref/index` or both coordinates
- `BrowserEvaluateArgs`: requires `script` or `code`
- `BrowserSnapshotArgs`: validates offset/limit/mode bounds
- `BrowserExtractArgs`: validates query/offset/max bounds

## Compatibility Field Matrix (Selected)

Identifier aliases:

- `target_id` + `targetId`
- `target_url` + `targetUrl`
- `input_ref` + `inputRef`
- `color_scheme` + `colorScheme`

Snapshot compatibility:

- canonical fields: `format`, `offset`, `limit`, `refs`, `interactive`, `compact`, `depth`, `selector`, `frame`
- alias: `snapshotFormat`

Connect/snapshot/extract compatibility mode field:

- `mode` includes compatibility literals for these action families

## OpenClaw Compatibility Model (`BrowserOpenClawCompatArgs`)

Separate compatibility model keeps OpenClaw field/action vocabulary with `extra="ignore"`.

It is used for compatibility modeling/tests while unified `BrowserControlArgs` remains main backend transport contract.

## Remote Payload Implication

`RemoteBrowserTool.execute_remote(...)` serializes args with:

- `args.model_dump(exclude_defaults=True, exclude_none=True)`

Consequences:

- defaults/`None` values are omitted from transport payloads
- sidecar defaults/normalization behavior matters for omitted fields

## Test-Backed Anchors

`tests/backend/test_browser_remote_tool.py` asserts:

- `RemoteBrowserTool.args_model == BrowserControlArgs`
- unified schema accepts canonical + compatibility action samples
- action-specific models remain usable
- compatibility model remains importable/usable

## Related Pages

- [Backend Browser Schema Docs Hub](README.md)
- [Backend-Sidecar Browser Schema Parity and Validation Boundary Reference](backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)
- [Browser Remote Schema Surface and Compatibility Contract Reference](../browser_remote_schema_surface_and_compatibility_contract_reference.md)
