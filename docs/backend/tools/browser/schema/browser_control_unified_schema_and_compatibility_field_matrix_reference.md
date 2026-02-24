---
summary: "Deep reference for backend BrowserControlArgs schema layering: literal action surface, shared compatibility-field mixins, snapshot scope aliases, and action-family field groups."
read_when:
  - When adding/removing browser actions or changing browser field alias semantics in backend schemas.
  - When debugging why BrowserControlArgs accepts broad compatibility payloads for actions with stricter runtime requirements.
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

Reusable literals define the cross-model action vocabulary and field enums:

- navigation state: `load | domcontentloaded | networkidle | commit`
- snapshot format: `ai | aria`
- mouse button: `left | right | middle`
- scroll direction: `up | down | left | right`
- wait state: `load | domcontentloaded | networkidle`

Action union is split then recombined:

- `BrowserCoreAction`: connect/navigate/snapshot/extract/click/type/press/scroll/screenshot/wait/get_tabs/switch_tab/evaluate/close
- `BrowserOpenClawAction`: status/profiles/open/done/search/go_back/search_page/find_elements/find_text/input/send_keys/switch/close_tab/dropdown_options/select_dropdown/upload_file/write_file/replace_file/read_file/read_long_content/act
- `BrowserAction = BrowserCoreAction | BrowserOpenClawAction`

## Layer 2: Shared Snapshot Scope Aliases (`snapshot_scope_fields.py`)

Annotated reusable fields injected into multiple models:

- `refs`: `role | aria`
- `interactive`: bool
- `compact`: bool
- `depth`: int (`0..20`)
- `selector`: optional CSS scope
- `frame`: optional iframe selector scope

Purpose:

- keep backend browser schema modules aligned on role-snapshot shape
- avoid field-description drift across unified and action-specific schemas

## Layer 3: Shared Compatibility Mixins (`shared_compat_fields.py`)

`BrowserSharedCompatFields` contributes non-core aliases and compatibility payloads reused by:

- `BrowserControlArgs`
- `BrowserOpenClawCompatArgs`

Families include:

- dialog/wait alias pairings (`timeoutMs` + `timeout_ms`, `promptText` + `prompt_text`)
- storage/network/trace fields (`cookies`, `kind`, `values`, `contains`, `filter`, `snapshots`, `screenshots`, `sources`)
- emulation fields (`offline`/`enabled`, headers, geolocation, media/color/timezone/locale/device)
- nested action envelope field (`request`) for `act`

All are optional. Model behavior intentionally tolerates sparse action-specific payloads.

## Layer 4: Unified LLM-Facing Schema (`BrowserControlArgs`)

`BrowserControlArgs` is the backend-exposed schema used by remote tool registration.

Key design characteristics:

- `action: BrowserAction`
- `model_config.extra = "ignore"`
- broad optional field superset spanning connect/snapshot/extract/input/tab/file/emulation/compat aliases
- inherits `BrowserSharedCompatFields`
- reuses snapshot scope alias types from `snapshot_scope_fields.py`

Important semantic boundary:

- this model optimizes compatibility and tolerance at backend parse boundary
- it is not the strictest per-action validator

## Layer 5: Action-Specific Models (`schemas.py`)

`schemas.py` keeps strict per-action validators available even though remote tool uses unified args model.

Examples:

- `BrowserClickArgs`: requires `ref/index` or both coordinates
- `BrowserEvaluateArgs`: requires `script` or `code`
- `BrowserSnapshotArgs`: pagination bounds (`offset`, `limit`), mode/format constraints
- `BrowserExtractArgs`: query length/offset/max bounds and mode literals

These models help retain explicit contract tests and local action-level checks.

## Compatibility Field Matrix (Selected)

Identifier aliases:

- `target_id` + `targetId`
- `target_url` + `targetUrl`
- `input_ref` + `inputRef`
- `color_scheme` + `colorScheme`

Snapshot compatibility:

- canonical: `format`, `offset`, `limit`, `refs`, `interactive`, `compact`, `depth`, `selector`, `frame`
- alias: `snapshotFormat`

Connect/snapshot/extract compatibility mode field:

- `mode` literal spans connect + snapshot + extract compatibility words:
  - `user_chrome`, `managed`, `efficient`, `focused`, `full_text`, `structured`

Action envelope compatibility:

- `act` path payload via `request` object

## OpenClaw Compatibility Model (`BrowserOpenClawCompatArgs`)

Separate model keeps OpenClaw action + field vocabulary available with `extra="ignore"`.

This model is used directly for compatibility-field preservation and tests, while unified `BrowserControlArgs` remains main remote-tool contract.

## Remote Payload Implication

`RemoteBrowserTool.execute_remote(...)` serializes unified args via:

- `args.model_dump(exclude_defaults=True, exclude_none=True)`

Consequences:

- omitted defaults disappear from transport payload
- only explicitly provided values and non-default fields are forwarded to sidecar
- backend transport envelope stays compact, but downstream behavior depends on sidecar defaulting/normalization

## Test-Backed Anchors

`tests/backend/test_browser_remote_tool.py` asserts:

- `RemoteBrowserTool.args_model == BrowserControlArgs`
- unified schema accepts core and compatibility action samples
- action-specific `BrowserSnapshotArgs` still accepts shared snapshot scope fields
- compatibility model remains importable/usable

## Related Pages

- [Backend Browser Schema Docs Hub](README.md)
- [Backend-Sidecar Browser Schema Parity and Validation Boundary Reference](backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)
- [Browser Remote Schema Surface and Compatibility Contract Reference](../browser_remote_schema_surface_and_compatibility_contract_reference.md)
