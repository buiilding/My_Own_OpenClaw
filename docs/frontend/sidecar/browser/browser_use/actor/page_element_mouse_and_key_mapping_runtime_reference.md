---
summary: "Deep reference for Browser Use actor runtime internals: Page session/domain lifecycle, element interaction fallbacks, mouse/scroll dispatch behavior, and Windows virtual-key mapping contracts."
read_when:
  - When modifying Browser Use actor classes (`Page`, `Element`, `Mouse`) or CDP event composition semantics.
  - When diagnosing flaky click/fill/scroll behavior, key-combination dispatch, or JS evaluation/arrow-function parsing errors.
title: "Actor Page, Element, Mouse, and Key Mapping Runtime Reference"
---

# Actor Page, Element, Mouse, and Key Mapping Runtime Reference

This page documents:

- `frontend/src/main/python/tools/browser/browser_use/actor/page.py`
- `frontend/src/main/python/tools/browser/browser_use/actor/element.py`
- `frontend/src/main/python/tools/browser/browser_use/actor/mouse.py`
- `frontend/src/main/python/tools/browser/browser_use/actor/utils.py`

## `Page` Runtime Contract

`Page` is the target-level abstraction over CDP with lazy session attach and input/navigation/evaluation helpers.

Session lifecycle:

- `_ensure_session()` attaches with `Target.attachToTarget(flatten=True)` when session is missing
- enables `Page`, `DOM`, `Runtime`, and `Network` domains in parallel for the attached session
- `session_id` and `mouse` properties lazily initialize per-target runtime handles

Navigation and target metadata:

- `reload`, `goto`/`navigate`, `go_back`, `go_forward` wrap CDP page/history commands
- history navigation validates bounds and raises explicit runtime errors when no back/forward entry exists
- `get_target_info`, `get_url`, and `get_title` read from `Target.getTargetInfo`

JavaScript execution:

- `evaluate(...)` requires arrow-function input `(...args) => ...`
- `_fix_javascript_string(...)` applies conservative quote/escape cleanup for Python-string artifacts
- values are normalized to string output (`str` or JSON-stringified dict/list)
- `exceptionDetails` from CDP is raised as runtime failure

Input and viewport control:

- `press(...)` supports single key and combos like `Control+A`
- combo path computes CDP modifier bitmask (`Alt=1`, `Control=2`, `Meta=4`, `Shift=8`)
- key-code resolution is delegated to `get_key_info(...)`
- `set_viewport_size(...)` calls `Emulation.setDeviceMetricsOverride`

DOM/LLM-assisted element selection:

- `get_elements_by_css_selector(...)` resolves `nodeId` to `backendNodeId` and returns typed `Element` objects
- `get_element_by_prompt(...)` builds enhanced DOM tree with `DomService`, serializes interactive elements, then asks LLM for `element_highlight_index`
- invalid/missing index returns `None`; `must_get_element_by_prompt(...)` raises if unresolved

Structured extraction:

- `extract_content(...)` pulls cleaned markdown from current page and invokes LLM with provided Pydantic schema
- call is wrapped in a 120-second timeout guard
- `_extract_clean_markdown(...)` delegates to shared markdown extractor and DOM service

## `Element` Runtime Contract

`Element` is backend-node based and implements resilient interaction strategies.

Identity and lookup:

- `_get_node_id()` maps `backendNodeId -> nodeId` via `DOM.pushNodesByBackendIdsToFrontend`
- `_get_remote_object_id()` resolves a runtime object with `DOM.resolveNode`

Click reliability stack (`click(...)`):

- geometry fallback order:
  - `DOM.getContentQuads`
  - `DOM.getBoxModel` converted into quad shape
  - JS `getBoundingClientRect()` via `Runtime.callFunctionOn`
- if geometry cannot be recovered, falls back to JS `this.click()`
- chooses largest visible quad intersection with viewport before dispatch
- attempts `DOM.scrollIntoViewIfNeeded` before final click dispatch
- dispatch path emits `mouseMoved` -> `mousePressed` -> `mouseReleased`
- on dispatch failure, retries with JS click fallback

Input fill behavior (`fill(...)`):

- attempts scroll-into-view and element coordinate acquisition
- `_focus_element_simple(...)` fallback chain:
  - `DOM.focus`
  - JS `this.focus()`
  - coordinate click focus
- `_clear_text_field(...)` fallback chain:
  - JS value clear + `input`/`change` events
  - triple-click + `Delete`
- types character-by-character with realistic key event ordering:
  - `keyDown` (base key + modifiers)
  - `char` (actual text)
  - `keyUp`
- newline path emits explicit `Enter` down/char/up sequence

Additional element operations:

- pointer operations: `hover`, `drag_to`
- state access: `get_attribute`, `get_bounding_box`, `get_basic_info`
- capture/eval: `screenshot`, `evaluate` (arrow function converted to `function(...) {}` for `callFunctionOn`)
- form controls: `focus`, `check`, `select_option`

Character/key helpers:

- `_get_char_modifiers_and_vk(...)` maps shift-dependent characters and returns modifier bitmask + Windows virtual key
- `_get_key_code_for_char(...)` returns CDP key `code` values (`KeyX`, `DigitY`, punctuation code names)

## `Mouse` Runtime Contract

`Mouse` exposes target/session-scoped CDP pointer operations.

Behavior:

- `click`, `down`, `up`, and `move` emit `Input.dispatchMouseEvent`
- `move(..., steps=1)` currently ignores multi-step interpolation (placeholder for smoothing)

Scroll fallback chain (`scroll(...)`):

1. preferred: `mouseWheel` event at provided coordinates or viewport center
2. fallback: `Input.synthesizeScrollGesture`
3. fallback: JS `window.scrollBy(...)`

Safety:

- `scroll(...)` requires non-null `session_id`; otherwise raises runtime error

## Key Mapping Utility Contract (`utils.py`)

`get_key_info(...)` centralizes key name to `(code, windowsVirtualKeyCode)` mapping.

Key coverage:

- navigation/modifier/function/numpad/lock/media/browser keys
- punctuation aliases (for example `;`, `'`, `/`, `[`)
- alphanumeric dynamic mapping (`KeyA` / `Digit3`)

Fallback:

- unknown keys return `(key, None)` so callers can still dispatch without VK code

Backward compatibility:

- module-level `get_key_info(...)` forwards to `Utils.get_key_info(...)`

## Related Docs

- [Frontend Sidecar Browser Use Actor Docs Hub](README.md)
- [Frontend Sidecar Browser Use Browser Docs Hub](../browser/README.md)
- [Frontend Sidecar Browser Use DOM Docs Hub](../dom/README.md)
- [Frontend Sidecar Browser Use Tools Docs Hub](../tools/README.md)
