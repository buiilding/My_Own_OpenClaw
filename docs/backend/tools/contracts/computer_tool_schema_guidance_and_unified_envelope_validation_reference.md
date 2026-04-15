---
summary: "Deep contract reference for backend computer tool schemas: mouse/keyboard/scroll conditional validation, unified `computer_use` envelope requirements, parser mapping behavior, and metadata/coordinate-method enforcement boundaries."
read_when:
  - When changing `backend/src/tools/computer/schemas.py` field descriptions, conditional validators, or grounded computer-tool wording.
  - When debugging parser-time rejections for computer tools (`find_coordinates_by`, grounded field requirements, direct-tool mapping) across parser/remote-tool layers.
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

## Direct Tool Contract

The current model-facing desktop surface is direct-tool based (`mouse_control`, `keyboard_control`, `screenshot`, `scroll_control`, `switch_window`, `wait`), not wrapper-envelope based.

For the computer schema sources touched in `backend/src/tools/computer/schemas.py` and `backend/src/tools/remote_tools/computer.py`, the current authoring rule is:

- keep field and tool descriptions stable
- keep descriptions focused on local intent/constraints of that tool
- avoid naming or depending on other tools inside a tool description
- keep cross-tool strategy (verification, sequencing, when to prefer one tool vs another) in the system prompt unless it is intrinsic to one tool's contract

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

Current field-description guidance is intentionally local and stable:

- `find_coordinates_by`: `Coordinate targeting method.`
- `drag_to_find_coordinates_by`: `Drag destination targeting method.`
- manual `x` / `y` coordinates are described in captured-image pixel space
- OCR and prediction fields describe only their local targeting payloads
- selection/policy layers may remove disabled fields, but they should not rewrite this prose

## Keyboard, Scroll, and Wait Schema Contracts

`KeyboardControlArgs`:

- `action` supports `type|paste|press|hotkey`
- guidance now stays local to keyboard behavior:
  - `type` vs `paste` distinction
  - code-editor indentation override note for `paste`
  - keyboard-driven navigation preference
- backend schema now enforces action-specific required fields via validator
  - `type` / `paste` require non-empty `text`
  - `press` requires `key`
  - `hotkey` requires non-empty `keys`
  - `type` / `paste` reject text longer than `10000` characters
- sidecar runtime keeps the same validation as defense in depth if invalid payloads still reach frontend execution

`ScrollControlArgs`:

- `find_coordinates_by='manual'`:
  - requires `x` and `y`
- `find_coordinates_by='ocr'`:
  - requires `ocr_text` or `candidate_id`
- `find_coordinates_by='prediction'`:
  - requires `source_description`
- `action='scroll'` requires `direction`
- schema/tool descriptions keep scroll-specific guidance local:
  - grounded region comes from fields exposed by the schema
  - `clicks` is follow-up fine tuning, not a required first-pass parameter

Ownership split:

- `mouse_control` no longer exposes a scroll action
- `scroll_control` is the sole scroll schema

`WaitToolArgs`:

- `seconds` required float
- wording now describes pausing before capturing a fresh screen image

`ScreenshotToolArgs`:

- optional `wait` with `extra='ignore'` to tolerate legacy/noise fields
- wording now uses `screen image` / `capture` terminology instead of cross-tool-like `screenshot` guidance in unrelated tool descriptions
## Parser Validation and Policy Coupling

`ToolCallValidator` applies additional enforcement after parser extraction:

- allowed mouse coordinate methods are filtered by policy/dev tool selection
- disabled coordinate methods raise `find_coordinates_by` validation errors
- implicit manual calls (`x/y` without explicit mode) still fail when manual mode is disabled

Policy pruning boundary:

- selection may narrow enums/defaults and remove disabled grounded fields
- selection should not rewrite field descriptions
- canonical grounded descriptions must remain valid after pruning

## Remote Tool Description Contract

Remote computer tool descriptions are part of schema prompt guidance and should now follow this rule:

- describe what the tool itself does
- keep wording valid after dev selection prunes fields
- avoid cross-tool references in the tool description
- leave broader coordination strategy to the system prompt

Focused backend tests now lock the structural pruning contract plus the stable description contract for grounded fields in:

- `tests/backend/test_tool_policy.py`
- `tests/backend/test_prompt_constructor_utils.py`

## Drift Hotspots

1. Reintroducing tool-selection prose rewrites would create a second schema-authoring layer and reintroduce drift.
2. Adding cross-tool operational advice back into individual tool descriptions makes pruning harder and encourages stale references.
3. Removing `extra='forbid'` on core computer schemas can silently accept unsupported fields and hide malformed payloads.
4. Adding strict backend keyboard action validators without aligned sidecar/runtime and parser test updates can introduce cross-layer behavior drift.

## Related Docs

- [Remote Tool Domain Payload and Request-ID Semantics Reference](../remote/remote_tool_domain_payload_and_request_id_semantics_reference.md)
- [Tool Policy and Dev Tool Selection Runtime Reference](../policy/tool_policy_and_dev_tool_selection_runtime_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](../tool_preparation_and_coordinate_resolution_reference.md)
