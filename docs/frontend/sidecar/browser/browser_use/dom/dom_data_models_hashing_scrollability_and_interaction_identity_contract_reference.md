---
summary: "Deep reference for browser_use DOM view models: enhanced node/state dataclasses, xpath and stable-hash generation, scrollability reporting, selector-map serialization, and interacted-element persistence identity."
read_when:
  - When changing `dom/views.py` data structures or serialization surfaces.
  - When debugging element-identity drift across turns (hash/xpath/ax-name), or scroll-info rendering differences in LLM DOM text.
title: "DOM Data Models, Hashing, Scrollability, and Interaction Identity Contract Reference"
---

# DOM Data Models, Hashing, Scrollability, and Interaction Identity Contract Reference

This page documents `frontend/src/main/python/tools/browser/browser_use/dom/views.py`.

## Model Layer Overview

`views.py` defines the common data contract shared across capture, serialization, tool interaction, and persistence:

- `NodeType` enum for CDP node-type alignment
- `DOMRect` shared geometry structure
- AX/snapshot dataclasses (`EnhancedAXNode`, `EnhancedAXProperty`, `EnhancedSnapshotNode`)
- merged tree node (`EnhancedDOMTreeNode`)
- serialized state wrapper (`SerializedDOMState`)
- history-facing interacted-element snapshot (`DOMInteractedElement`)

## `EnhancedDOMTreeNode` Contract

`EnhancedDOMTreeNode` merges fields from DOM + AX + snapshot sources and carries runtime metadata used later by tool and serializer code:

- DOM identity: `node_id`, `backend_node_id`, `target_id`, `frame_id`, `session_id`
- tree links: `parent_node`, `children_nodes`, `content_document`, `shadow_roots`
- visual/interaction traits: `snapshot_node`, `is_visible`, `is_scrollable`, `absolute_position`, `has_js_click_listener`
- LLM hint fields: `hidden_elements_info`, `has_hidden_content`
- compound-control metadata: `_compound_children`

## XPath and Parent-Branch Identity

### XPath generation

`xpath` intentionally:

- walks parent chain up to iframe boundaries
- passes through shadow roots (`DOCUMENT_FRAGMENT_NODE`) without path segments
- computes sibling index only when multiple same-tag siblings exist

This avoids false absolute paths across iframe boundaries and keeps selectors compact.

### Hashing semantics

`__hash__` and `compute_stable_hash()` both use branch-path + filtered attribute signals.

- `__hash__` includes static attributes (`STATIC_ATTRIBUTES`) + `ax_name`
- `compute_stable_hash()` first filters dynamic/transient classes (focus/hover/active/loading/open/etc.)

`compute_stable_hash()` is the preferred cross-turn identity when dynamic CSS churn is high.

## Scrollability and Scroll Info Surface

### `is_actually_scrollable`

Extended scrollability detection combines:

- CDP `is_scrollable`
- `scrollRects` vs `clientRects` overflow dimensions
- computed-style overflow gates (`auto|scroll|overlay`)
- conservative tag fallback when style data is absent

### `should_show_scroll_info`

Visibility of scroll hints is reduced to avoid nested noise:

- always true for `iframe`
- true for scrollable `body/html`
- false when a scrollable parent already explains the context

### `scroll_info` and `get_scroll_info_text()`

Exports normalized scroll metrics:

- scroll offsets and remaining content distances
- vertical/horizontal percentages
- pages-above/pages-below estimates
- directional capability flags (`can_scroll_up/down/left/right`)

Iframe branch tries to resolve scroll info from its internal HTML document and outputs concise `X↑ Y↓ Z%` text.

## LLM-Oriented Node Text Helpers

`get_meaningful_text_for_llm()` uses attribute-priority fallback:

1. `value`
2. `aria-label`
3. `title`
4. `placeholder`
5. `alt`
6. direct child text

`llm_representation()` and serializer callers use bounded text (`cap_text_length`) for token control.

## Serialized State Wrapper

`SerializedDOMState` stores:

- `_root` simplified tree
- `selector_map` (`backend_node_id -> EnhancedDOMTreeNode`)

It exposes two renderer paths:

- `llm_representation(...)` via `DOMTreeSerializer`
- `eval_representation(...)` via `DOMEvalSerializer`

Both are decorator-wrapped for observability tracing.

## Interaction Persistence Model

`DOMInteractedElement` captures a compact interaction identity envelope used for replay/matching:

- structural identifiers: `node_id`, `backend_node_id`, `frame_id`, `x_path`
- payload shape: node type/name/value, attributes, bounds
- hash fields: `element_hash`, `stable_hash`
- fallback text identity: `ax_name`

`load_from_enhanced_dom_tree(...)` is the canonical constructor; it computes `stable_hash` from source node state at save time.

## Auxiliary Matching Types

`MatchLevel` enum defines fallback strictness tiers for replay matching:

- `EXACT`
- `STABLE`
- `XPATH`
- `AX_NAME`
- `ATTRIBUTE`

`filter_dynamic_classes(...)` is the class-level primitive that strips transient class tokens before stable hash generation.

## Related Docs

- [DOM Tree Construction, Visibility, Iframe Traversal, and Pagination Detection Contract Reference](dom_tree_construction_visibility_iframe_traversal_and_pagination_detection_contract_reference.md)
- [DOM Serializer, Snapshot, Clickability, and Markdown Pipeline Runtime Reference](dom_serializer_snapshot_clickability_and_markdown_pipeline_runtime_reference.md)
