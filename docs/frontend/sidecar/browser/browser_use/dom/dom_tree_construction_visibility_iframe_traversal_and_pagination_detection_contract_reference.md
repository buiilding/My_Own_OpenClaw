---
summary: "Deep reference for browser_use DOM service internals: parallel CDP tree capture, iframe-aware visibility and offset handling, enhanced tree construction, serialized tree timing, and pagination button heuristics."
read_when:
  - When changing `DomService` tree-building or iframe recursion behavior.
  - When debugging CDP snapshot/AX timeout failures, hidden iframe controls, or pagination detection misses.
title: "DOM Tree Construction, Visibility, Iframe Traversal, and Pagination Detection Contract Reference"
---

# DOM Tree Construction, Visibility, Iframe Traversal, and Pagination Detection Contract Reference

This page documents `frontend/src/main/python/tools/browser/browser_use/dom/service.py`.

## High-Level Responsibilities

`DomService` owns the Browser Use DOM extraction path used by tools and actor flows:

- collect DOM + AX + snapshot trees from CDP
- merge those trees into `EnhancedDOMTreeNode` objects
- compute visibility across nested frames and scroll offsets
- produce serialized DOM state for LLM interaction
- expose pagination button hints from the selector map

## Constructor and Runtime Controls

`DomService(...)` accepts behavior gates that directly affect extraction shape:

- `cross_origin_iframes`: enable recursive traversal into frame targets that do not expose `contentDocument`
- `paint_order_filtering`: passed to serializer for overlap pruning
- `max_iframes`: hard cap on snapshot documents processed
- `max_iframe_depth`: recursion guard for cross-origin frame traversal
- `viewport_threshold`: extra visibility slack (px); `None` disables viewport-threshold clipping

## Visibility Contract Across Frames

`is_element_visible_according_to_all_parents(...)` applies visibility in two layers:

- CSS-hidden guard: returns hidden when `display:none`, `visibility:hidden`, or `opacity<=0`
- frame chain intersection: walks parent HTML/frame chain in reverse, translating bounds through iframe offsets and frame scroll rectangles

Important behavior:

- if `viewport_threshold` is `None`, only CSS hidden checks apply
- no snapshot bounds means not visible
- frame visibility uses viewport intersection in frame-local coordinates with threshold slack

## CDP Tree Capture (`_get_all_trees`)

The service gathers four sources in parallel:

- `DOMSnapshot.captureSnapshot` with `REQUIRED_COMPUTED_STYLES`
- `DOM.getDocument(depth=-1, pierce=True)`
- frame-merged `Accessibility.getFullAXTree`
- viewport/device-pixel ratio from `Page.getLayoutMetrics`

Supporting behavior:

- pre-pass JS reads iframe scroll positions for diagnostics
- optional JS event-listener scan uses `getEventListeners` and `DOM.describeNode` to map click-listener nodes by backend ID
- primary wait timeout is 10s; pending tasks retry once with shorter timeout
- any missing required result raises `TimeoutError`
- snapshot document count is capped by `max_iframes`

Returned timing fields include:

- `iframe_scroll_detection_ms`
- `js_listener_detection_ms`
- `cdp_parallel_calls_ms`
- `snapshot_processing_ms`

## Enhanced Tree Construction (`get_dom_tree`)

`get_dom_tree(...)` builds the merged tree with this sequence:

1. fetch `TargetAllTrees`
2. build `backendDOMNodeId -> AXNode` lookup
3. build snapshot lookup via `build_snapshot_lookup`
4. recursively construct `EnhancedDOMTreeNode` graph

Tree construction details:

- DOM attribute arrays are normalized into dict form
- parent pointers, `content_document`, and `shadow_roots` are linked explicitly
- absolute positions are derived from snapshot bounds + frame offsets
- frame/HTML nodes update running frame-scroll coordinate offsets
- `has_js_click_listener` is set from JS listener backend-id set
- visibility is computed post-construction using frame-aware method above

Cross-origin iframe recursion path:

- only runs when `cross_origin_iframes=True`, node is iframe, and no inlined `contentDocument`
- stops at `max_iframe_depth`
- requires visible iframe with at least `50x50` bounds
- lazily calls `browser_session.get_all_frames()` only when needed
- resolves `frameTargetId` and recursively calls `get_dom_tree` on iframe target

After construction, iframe-hidden-content hints are attached via `_count_hidden_elements_in_iframes`.

## Hidden-Content Hinting in Iframes

`_count_hidden_elements_in_iframes(...)` adds LLM-facing hints for iframe scrolling:

- collects interactive elements that are off-viewport by threshold (not CSS-hidden)
- stores up to 10 hints in `hidden_elements_info` with `{tag, text, pages}`
- sets `has_hidden_content=True` when hidden non-interactive content exists but no interactive candidates were found

## Serialized Tree Entry Point

`get_serialized_dom_tree(...)` returns:

- `SerializedDOMState`
- root `EnhancedDOMTreeNode`
- aggregated timing map

It combines timing from:

- CDP/get-tree path
- serializer stages (`create_simplified_tree`, `calculate_paint_order`, `optimize_tree`, `bbox_filtering`, `assign_interactive_indices`)
- overhead fields for untracked runtime portions

## Pagination Detection Contract

`detect_pagination_buttons(selector_map)` inspects clickable selector-map entries and classifies:

- `next`
- `prev`
- `first`
- `last`
- `page_number`

Signals used:

- visible text
- `aria-label`
- `title`
- `class`
- `role`
- disabled indicators via `disabled`, `aria-disabled`, or disabled class naming

Output entries contain:

- `button_type`
- `backend_node_id`
- `text`
- `selector` (xpath)
- `is_disabled`

## Failure and Diagnostics Expectations

Current behavior is fail-closed for missing core tree sources:

- required CDP task timeout/failure throws `TimeoutError`
- task failures are logged per source key
- many debug logs are intentionally verbose for iframe/snapshot correlation and event-listener detection troubleshooting

## Related Docs

- [DOM Data Models, Hashing, Scrollability, and Interaction Identity Contract Reference](dom_data_models_hashing_scrollability_and_interaction_identity_contract_reference.md)
- [DOM Serializer, Snapshot, Clickability, and Markdown Pipeline Runtime Reference](dom_serializer_snapshot_clickability_and_markdown_pipeline_runtime_reference.md)
- [Frontend Sidecar Browser Use Runtime Docs Hub](../README.md)
