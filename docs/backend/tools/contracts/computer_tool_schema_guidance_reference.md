---
summary: "Deep contract reference for backend computer tool schemas: mouse/keyboard/scroll conditional validation, direct schema behavior, parser mapping behavior, shared grounding mixin strictness, and metadata/coordinate-method enforcement boundaries."
read_when:
  - When changing `backend/src/tools/computer/schemas.py` field descriptions, conditional validators, or grounded computer-tool wording.
  - When debugging parser-time rejections for computer tools (`find_coordinates_by`, grounded field requirements, direct-tool mapping) across parser/remote-tool layers.
  - When resolving stale searches for `SourceDescriptionFields`, `DestinationDescriptionFields`, `SourceGroundingArgsMixin`, `DragDestinationGroundingArgsMixin`, or legacy coordinate fields rejected by grounded computer schemas.
title: "Computer Tool Schema Guidance Reference"
---

# Computer Tool Schema Guidance Reference

## Canonical Modules

- `backend/src/tools/computer/schemas.py`
- `backend/src/tools/remote_tools/computer.py`
- `backend/src/tools/registry.py`
- `backend/src/llm/parser_types.py`
- `backend/src/llm/parser_validation.py`
- `tests/backend/test_remote_tools.py`
- `tests/backend/test_parser_types.py`
- `tests/backend/test_parser_validation.py`
- `tests/backend/test_response_parser.py`
- `tests/backend/test_computer_tool_schema_contract.py`

## Direct Tool Contract

The current model-facing desktop surface is direct-tool based (`mouse_control`, `keyboard_control`, `screenshot`, `scroll_control`, `switch_window`, `wait`), not wrapper-envelope based.

For the computer schema sources touched in `backend/src/tools/computer/schemas.py` and `backend/src/tools/remote_tools/computer.py`, the current authoring rule is:

- keep field and tool descriptions stable
- keep descriptions focused on local intent/constraints of that tool
- avoid naming or depending on other tools inside a tool description
- keep cross-tool strategy (verification, sequencing, when to prefer one tool vs another) in the system prompt unless it is intrinsic to one tool's contract

## Mouse Schema Conditional Contract

`MouseControlArgs` (`extra='forbid'`) enforces coordinate-method-specific requirements:

- shared source and drag-destination grounding mixins also use `extra='forbid'`
  so schema composition cannot silently accept legacy coordinate fields
- current shared mixin owners are `SourceGroundingArgsMixin` and
  `DragDestinationGroundingArgsMixin`; stale shorthand searches such as
  `SourceDescriptionFields` or `DestinationDescriptionFields` should route here
- `find_coordinates_by='manual'`:
  - requires `x` and `y`
  - omitted `find_coordinates_by` is treated as the same default manual mode by both runtime validation and exported JSON Schema
- `find_coordinates_by='ocr'`:
  - requires `ocr_text` or `candidate_id`
- `find_coordinates_by='prediction'`:
  - requires `source_description`

Action-specific requirement:

- `action='drag'` + omitted or `drag_to_find_coordinates_by='manual'`:
  - requires `drag_to_x` and `drag_to_y`
- `action='drag'` + `drag_to_find_coordinates_by='ocr'`:
  - requires `drag_to_ocr_text` or `drag_to_candidate_id`
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
- local-runtime execution keeps the same validation as defense in depth if invalid payloads still reach local tools

`ScrollControlArgs`:

- `find_coordinates_by='manual'`:
  - requires `x` and `y`
  - omitted `find_coordinates_by` is treated as the same default manual mode by both runtime validation and exported JSON Schema
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

- optional `wait`
- unknown legacy/noise fields are rejected with `extra='forbid'`
- wording now uses `screen image` / `capture` terminology instead of cross-tool-like `screenshot` guidance in unrelated tool descriptions
## Parser Validation and Policy Coupling

`ToolCallValidator` applies additional enforcement after parser extraction:

- allowed mouse coordinate methods are filtered by policy
- disabled coordinate methods raise `find_coordinates_by` validation errors
- implicit manual calls (`x/y` without explicit mode) still fail when manual mode is disabled

Policy pruning boundary:

- selection may narrow enums/defaults and remove disabled grounded fields
- selection should not rewrite field descriptions
- canonical grounded descriptions must remain valid after pruning

## Remote Tool Description Contract

Remote computer tool descriptions are part of schema prompt guidance and should now follow this rule:

- describe what the tool itself does
- keep wording valid after agent capability policy prunes fields
- avoid cross-tool references in the tool description
- leave broader coordination strategy to the system prompt

Focused backend tests now lock the structural pruning contract plus the stable description contract for grounded fields in:

- `tests/backend/test_tool_policy.py`
- `tests/backend/test_prompt_constructor_utils.py`

## Drift Hotspots

1. Reintroducing tool-selection prose rewrites would create a second schema-authoring layer and reintroduce drift.
2. Adding cross-tool operational advice back into individual tool descriptions makes pruning harder and encourages stale references.
3. Removing `extra='forbid'` on core computer schemas or their shared grounding mixins can silently accept unsupported fields and hide malformed payloads.
4. Adding strict backend keyboard action validators without aligned sidecar/runtime and parser test updates can introduce cross-layer behavior drift.

## Related Docs

- [Remote Tool Domain Payload and Request-ID Semantics Reference](../remote/remote_tool_domain_payload_and_request_id_semantics_reference.md)
- [Tool Policy and Agent Capability Runtime Reference](../policy/tool_policy_and_agent_capability_runtime_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](../tool_preparation_and_coordinate_resolution_reference.md)
