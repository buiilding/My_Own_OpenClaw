---
summary: "Deep reference for browser_use DOM transformation pipeline: snapshot parsing, interactive-element detection, tree simplification/indexing, paint-order and bbox filters, HTML/eval serializers, and structure-aware markdown extraction/chunking."
read_when:
  - When changing serializer behavior (`dom/serializer/*`) or snapshot-to-node projection logic (`dom/enhanced_snapshot.py`).
  - When debugging missing clickable nodes, shadow-dom interaction indexing gaps, noisy markdown extraction, or chunk continuation bugs.
title: "DOM Serializer, Snapshot, Clickability, and Markdown Pipeline Runtime Reference"
---

# DOM Serializer, Snapshot, Clickability, and Markdown Pipeline Runtime Reference

This page documents:

- `frontend/src/main/python/tools/browser/browser_use/dom/enhanced_snapshot.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/utils.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/serializer/serializer.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/serializer/clickable_elements.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/serializer/paint_order.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/serializer/eval_serializer.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/serializer/html_serializer.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/markdown_extractor.py`

## Snapshot Projection (`enhanced_snapshot.py`)

`build_snapshot_lookup(...)` creates `backend_node_id -> EnhancedSnapshotNode` with precomputed fields.

Key behavior:

- uses a restricted `REQUIRED_COMPUTED_STYLES` set to reduce CDP fragility on heavy pages
- converts snapshot bounds from device pixels into CSS pixels via `device_pixel_ratio`
- pre-builds layout index map for faster node lookup
- attaches optional fields: paint order, client rects, scroll rects, stacking context indices

This lookup is the geometry/style backbone for visibility and interaction checks.

## Interactive Detection (`clickable_elements.py`)

`ClickableElementDetector.is_interactive(...)` uses layered heuristics:

- JS listener signal (`has_js_click_listener`)
- known interactive tags
- accessibility properties/roles (focusable, checked, selected, etc.)
- explicit event attributes and ARIA roles
- wrapper heuristics for `label`/`span` around form controls
- search-indicator class/id/data patterns
- icon-sized element fallback checks

Important special cases:

- `html/body` explicitly skipped
- `iframe/frame` considered interactive only when larger than `100x100`
- disabled/hidden AX properties can short-circuit interactivity

## Core DOM Serialization (`serializer.py`)

`DOMTreeSerializer.serialize_accessible_elements()` pipeline:

1. `_create_simplified_tree`
2. optional paint-order pruning (`PaintOrderRemover`)
3. `_optimize_tree`
4. optional bbox propagation filter
5. `_assign_interactive_indices_and_mark_new_nodes`

### Simplification and inclusion rules

- skips non-content tags (`style/script/head/meta/link/title`) and decorative SVG children
- keeps shadow DOM document fragments explicitly
- supports session-specific and legacy `data-browser-use-exclude*` node suppression
- force-keeps file inputs even when visually hidden (common opacity-based upload widgets)
- injects compound control metadata for specialized input/select/media widgets

### Index assignment and selector map contract

Interactive selector entries are keyed by `backend_node_id`.

Indexing includes:

- visible interactive nodes
- file-input exceptions
- shadow-DOM interactive form controls without snapshot data
- selected scrollable containers (with dropdown-specific rules)

`is_new` markers are computed against previous selector map backend ids.

### Bounding-box propagation filter

Propagation source patterns include anchor/button and selected role wrappers.

Children fully contained by active parent bounds may be excluded unless they match keep-exceptions such as:

- form fields (`input/select/textarea/label`)
- own interactive role/handler signals
- propagating-element pattern matches

## Paint-Order Occlusion Filtering (`paint_order.py`)

`PaintOrderRemover` builds a disjoint rectangle union while iterating paint-order groups from highest to lowest.

Behavior:

- marks nodes `ignored_by_paint_order=True` when already covered
- avoids adding near-transparent rectangles (`transparent` background or low opacity) to the union
- preserves non-overlapped clickable structure while reducing duplicate stacked surfaces

## Serializer Variants

### LLM interaction view (`serializer.py` static `serialize_tree`)

Produces compact interaction-oriented lines with:

- interactive markers by backend node id
- scroll markers (`|scroll element|`)
- shadow host markers (`|SHADOW(open/closed)|`)
- compound control hints encoded as inline attributes

### Eval/judge view (`eval_serializer.py`)

`DOMEvalSerializer` focuses on structure comprehension:

- retains container hierarchy even when non-interactive
- emits concise inline element records
- keeps iframe/shadow traversal explicit
- suppresses decorative SVG internals

## HTML Reconstruction for Extraction (`html_serializer.py`)

`HTMLSerializer` reconstructs HTML from enhanced tree for markdown conversion.

Notable behavior:

- includes shadow roots using template `shadowroot` wrappers
- includes iframe content documents
- strips non-content nodes and hidden-json-like code blocks
- strips base64 image payloads
- optionally strips `href` unless `extract_links=True`
- strips `data-*` attributes to avoid large SPA state blobs
- normalizes table structure into `thead/tbody` when needed

## Markdown Extraction and Chunking (`markdown_extractor.py`)

### `extract_clean_markdown(...)`

Supports two entry paths:

- browser session path via cached `DOMWatchdog` tree
- dom-service path via `get_dom_tree(...)`

Flow:

1. enhanced-tree -> HTML via `HTMLSerializer`
2. HTML -> markdown via `markdownify`
3. lightweight cleanup (`_preprocess_markdown_content`)
4. emit content + stats envelope (`original_html_chars`, `initial_markdown_chars`, `filtered_chars_removed`, etc.)

### Noise filtering

`_preprocess_markdown_content` removes known high-noise JSON patterns and compresses excessive newlines while preserving useful content lines.

### Structure-aware chunking

`chunk_markdown_by_structure(...)` splits content using atomic blocks:

- headers
- code fences
- tables
- list items
- paragraphs
- blanks

Chunk behavior:

- greedy assembly with header-aware split preference
- soft over-limit allowance for single oversized blocks
- optional overlap prefix (lines from prior chunk)
- table-header carry-forward for multi-chunk table continuity
- `start_from_char` chunk selection for continuation extraction

Output uses `MarkdownChunk` with offsets, overlap prefix, and `has_more` flag.

## Utility: CSS Selector Generation (`dom/utils.py`)

`generate_css_selector_for_element(...)` builds safe selectors from tag/id/class plus allowlisted attributes.

Key guards:

- id/class validation and escaping
- allowlisted attributes only
- safe handling for special characters/newlines
- fallback to tag selector on unsafe output

## Related Docs

- [DOM Tree Construction, Visibility, Iframe Traversal, and Pagination Detection Contract Reference](dom_tree_construction_visibility_iframe_traversal_and_pagination_detection_contract_reference.md)
- [DOM Data Models, Hashing, Scrollability, and Interaction Identity Contract Reference](dom_data_models_hashing_scrollability_and_interaction_identity_contract_reference.md)
- [Frontend Sidecar Browser Use Runtime Docs Hub](../README.md)
