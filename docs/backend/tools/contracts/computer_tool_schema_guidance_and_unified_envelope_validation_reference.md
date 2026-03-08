---
summary: "Deep contract reference for backend computer tool schemas: mouse/keyboard/scroll conditional validation, unified `computer_use` envelope requirements, parser mapping behavior, and metadata/coordinate-method enforcement boundaries."
read_when:
  - When changing `backend/src/tools/computer/schemas.py` field descriptions, conditional validators, or unified `computer_use` envelope shape.
  - When debugging parser-time rejections for computer tools (`metadata`, `find_coordinates_by`, unified-tool mapping) across parser/remote-tool layers.
title: "Computer Tool Schema Guidance and Unified Envelope Validation Reference"
---

# Computer Tool Schema Guidance and Unified Envelope Validation Reference

## Canonical Modules

- `backend/src/tools/computer/schemas.py`
- `backend/src/tools/computer/unified_schema.py`
- `backend/src/tools/remote_tools/computer.py`
- `backend/src/tools/registry.py`
- `backend/src/llm/parser_types.py`
- `backend/src/llm/parser_validation.py`
- `tests/backend/test_remote_tools.py`
- `tests/backend/test_parser_types.py`
- `tests/backend/test_parser_validation.py`
- `tests/backend/test_response_parser.py`
- `tests/backend/test_computer_use_schema_contract.py`

## Mouse Schema Conditional Contract

`MouseControlArgs` (`extra='forbid'`) enforces coordinate-method-specific requirements:

- `find_coordinates_by='manual'`:
  - requires `x` and `y`
- `find_coordinates_by='ocr'`:
  - requires `ocr_text` or `candidate_id`
- `find_coordinates_by='prediction'`:
  - requires `source_description`

Action-specific requirement:

- `action='drag'` + `drag_to_find_coordinates_by='prediction'`:
  - requires `destination_description`

Schema guidance also encodes execution-policy hints in field descriptions:

- OCR-first targeting for text-labeled UI
- `candidate_id` retry path for OCR ambiguity
- manual targeting warning to ground against latest screenshot and visible cursor location
- explicit UI verification requirement (tool status alone is insufficient success signal)

## Keyboard, Scroll, and Wait Schema Contracts

`KeyboardControlArgs`:

- `action` supports `type|paste|press|hotkey`
- guidance biases toward `type` first, `paste` as recovery override
- submit-only intent guard for `press/hotkey`
- backend schema is guidance-first here: it does not currently enforce action-specific required fields (`text` vs `key` vs `keys`) via validator
  - stricter action-field enforcement is applied in sidecar runtime tool schemas/execution layer

`ScrollControlArgs`:

- `find_coordinates_by='manual'`:
  - requires `x` and `y`
- `find_coordinates_by='ocr'`:
  - requires `ocr_text` or `candidate_id`
- `find_coordinates_by='prediction'`:
  - requires `source_description`
- `action='scroll'` requires `direction`
- `clicks` default remains `5`

Ownership split:

- `mouse_control` no longer exposes a scroll action
- `scroll_control` is the sole scroll schema

`WaitToolArgs`:

- `seconds` required float

`ScreenshotToolArgs`:

- optional `wait` with `extra='ignore'` to tolerate legacy/noise fields

## Unified `computer_use` Envelope Contract

`ComputerUseArgs` (`extra='forbid'`) requires:

- `tool`: one of
  - `mouse_control`
  - `keyboard_control`
  - `screenshot`
  - `scroll_control`
  - `switch_tab`
  - `wait`
- `metadata`: `ComputerUseMetadata` object with required non-empty strings:
  - `description`
  - `explanation`
  - `expectation`
  - schema-level `str_strip_whitespace=True` trims each field before `min_length=1` enforcement, so whitespace-only values are rejected
  - schema-level `extra='forbid'` rejects unknown metadata keys (strict rationale allowlist)
- `arguments`: free-form object revalidated against the selected concrete tool schema

Runtime revalidation path in `RemoteComputerUseTool`:

1. read `args.tool`
2. resolve model from `_COMPUTER_USE_MODEL_BY_TOOL`
3. run `model.model_validate(args.arguments)`
4. emit remote envelope with concrete `tool_name` and validated `args.model_dump()`

This makes unified and direct tool calls converge onto the same concrete schema validators.
It also means metadata whitespace normalization/rejection happens before remote envelope creation, not only in parser-layer metadata checks.

## Parser Mapping and Rejection Rules

`ToolCallSchema.extract_tool_call(...)` behavior:

- maps unified payload (`name='computer_use'`) to concrete tool name from `args.tool`
- forwards `args.arguments` (defaults to `{}` when omitted)
- forwards `args.metadata`
- rejects non-dict `arguments`
- rejects unknown unified subtools
- rejects legacy wrapper shape where metadata/action are arranged outside canonical function-call args

`tests/backend/test_parser_types.py` and `test_response_parser.py` cover:

- direct metadata extraction
- unified mapping success paths
- missing unified `arguments` defaults to `{}`
- unknown-subtool/non-dict-arguments rejection
- missing metadata rejection for computer-use flows
- direct legacy computer subtool parse (`mouse_control`) acceptance when only `computer_use` is registered, with metadata still required

## Parser Validation and Policy Coupling

`ToolCallValidator` applies additional enforcement after parser extraction:

- computer tools require metadata fields with non-whitespace content
- allowed mouse coordinate methods are filtered by policy/dev tool selection
- disabled coordinate methods raise `find_coordinates_by` validation errors
- implicit manual calls (`x/y` without explicit mode) still fail when manual mode is disabled

Unified registration compatibility:

- when only `computer_use` is exposed in tool declarations, validation still accepts legacy concrete computer subtool names by expansion logic

Registry declaration compatibility:

- `ToolRegistry.get_function_declarations_filtered(["computer_use"])` now replaces the generated declaration with canonical schema from `backend/src/tools/computer/unified_schema.py`.
- Canonical declaration includes explicit `arguments.oneOf` sub-schemas (`mouse_control`, `keyboard_control`, `screenshot`, `scroll_control`, `switch_tab`, `wait`) plus conditional `allOf` requirements.
- `metadata` remains required with required nested fields (`description`, `explanation`, `expectation`).
- Compatibility expansion still allows legacy concrete tool-name parsing internally while preserving strict model-facing unified envelope requirements.

## Remote Tool Description Contract

Remote computer tool descriptions are part of schema prompt guidance and intentionally include:

- OCR-first text-target guidance (`type something here` exemplar)
- prediction-mode guidance for non-text targets
- keyboard type-first/paste-recovery strategy
- switch-tab requirement to use exact names from `get_open_windows`

`tests/backend/test_remote_tools.py` locks these description-level contracts.
Additional `ComputerUseMetadata` strictness regressions are locked in:

- `test_computer_use_schema_rejects_whitespace_only_metadata_fields`
- `test_computer_use_schema_rejects_unexpected_metadata_fields`
- `test_computer_use_schema_trims_metadata_fields_before_validation`

## Drift Hotspots

1. Changing `ComputerUseArgs.tool` allowed list without updating `_COMPUTER_USE_MODEL_BY_TOOL` creates runtime mapping holes.
2. Relaxing metadata validation in parser layers can allow empty rationale fields for computer actions.
3. Diverging direct vs unified schema guidance can make model behavior inconsistent across providers.
4. Removing `extra='forbid'` on core computer schemas can silently accept unsupported fields and hide malformed payloads.
5. Adding strict backend keyboard action validators without aligned sidecar/runtime and parser test updates can introduce cross-layer behavior drift.

## Related Docs

- [System Use Unified Wrapper Schema and Explanation Resolution Reference](system_use_unified_wrapper_schema_and_explanation_resolution_reference.md)
- [Remote Tool Domain Payload and Request-ID Semantics Reference](../remote/remote_tool_domain_payload_and_request_id_semantics_reference.md)
- [Tool Policy and Dev Tool Selection Runtime Reference](../policy/tool_policy_and_dev_tool_selection_runtime_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](../tool_preparation_and_coordinate_resolution_reference.md)
