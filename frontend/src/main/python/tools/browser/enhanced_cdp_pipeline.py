"""
Enhanced CDP/DOM snapshot pipeline (browser-use style).

This module ports browser-use's enhanced snapshot strategy into WindieOS:
- Collect DOMSnapshot + DOM tree + AX tree via CDP
- Parse computed styles/layout and accessibility metadata
- Detect interactivity using merged DOM/AX/snapshot and JS listener hints
- Emit browser-use-like textual DOM snapshot for LLM planning
- Attach stable `data-windie-ref` attributes by backend node id
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Iterable, Optional


logger = logging.getLogger(__name__)

TRUNCATION_SUFFIX = "... (truncated)"
DEFAULT_MAX_NODE_WALK = 50_000

_INITIAL_TASK_TIMEOUT_SECONDS = 10.0
_RETRY_TASK_TIMEOUT_SECONDS = 2.0

# Keep computed styles minimal to reduce CDP snapshot overhead.
REQUIRED_COMPUTED_STYLES = [
    "display",
    "visibility",
    "opacity",
    "overflow",
    "overflow-x",
    "overflow-y",
    "cursor",
    "pointer-events",
    "position",
    "background-color",
]

INTERACTIVE_TAGS = frozenset(
    {
        "a",
        "button",
        "input",
        "textarea",
        "select",
        "option",
        "summary",
        "details",
        "label",
    }
)

INTERACTIVE_ROLES = frozenset(
    {
        "button",
        "link",
        "textbox",
        "searchbox",
        "combobox",
        "checkbox",
        "radio",
        "switch",
        "tab",
        "menuitem",
        "option",
        "slider",
        "spinbutton",
        "treeitem",
        "gridcell",
        "listbox",
    }
)

INTERESTING_ANCESTOR_TAGS = frozenset(
    {"form", "main", "nav", "header", "footer", "section", "article", "aside", "dialog"}
)

SEARCH_HINTS = frozenset(
    {
        "search",
        "magnify",
        "glass",
        "lookup",
        "find",
        "query",
        "searchbox",
    }
)


@dataclass(slots=True)
class DOMRect:
    x: float
    y: float
    width: float
    height: float


@dataclass(slots=True)
class SnapshotNodeInfo:
    is_clickable: bool
    cursor_style: Optional[str]
    bounds: Optional[DOMRect]
    computed_styles: Optional[Dict[str, str]]


@dataclass(slots=True)
class InteractiveNode:
    backend_node_id: int
    tag: str
    role: str
    elem_type: str
    attrs: Dict[str, str]
    label: str
    ancestors: list[str]


@dataclass(slots=True)
class EnhancedAiSnapshotResult:
    text: str
    title: str
    url: str
    ref_count: int


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_computed_styles(strings: list[str], style_indices: list[int]) -> Dict[str, str]:
    styles: Dict[str, str] = {}
    for idx, string_index in enumerate(style_indices):
        if idx >= len(REQUIRED_COMPUTED_STYLES):
            break
        if isinstance(string_index, int) and 0 <= string_index < len(strings):
            styles[REQUIRED_COMPUTED_STYLES[idx]] = strings[string_index]
    return styles


def build_snapshot_lookup(
    snapshot: Dict[str, Any],
    device_pixel_ratio: float,
) -> Dict[int, SnapshotNodeInfo]:
    """
    Build backendNodeId -> snapshot metadata lookup from CDP DOMSnapshot.
    """
    lookup: Dict[int, SnapshotNodeInfo] = {}
    docs = snapshot.get("documents")
    strings = snapshot.get("strings")
    if not isinstance(docs, list) or not isinstance(strings, list):
        return lookup

    dpr = device_pixel_ratio if device_pixel_ratio > 0 else 1.0

    for document in docs:
        if not isinstance(document, dict):
            continue
        nodes = document.get("nodes")
        layout = document.get("layout")
        if not isinstance(nodes, dict) or not isinstance(layout, dict):
            continue

        backend_node_ids = nodes.get("backendNodeId")
        if not isinstance(backend_node_ids, list):
            continue

        rare_clickable = nodes.get("isClickable")
        clickable_indices: set[int] = set()
        if isinstance(rare_clickable, dict):
            raw_indices = rare_clickable.get("index")
            if isinstance(raw_indices, list):
                clickable_indices = {
                    idx for idx in raw_indices if isinstance(idx, int) and idx >= 0
                }

        layout_node_indices = layout.get("nodeIndex") if isinstance(layout.get("nodeIndex"), list) else []
        layout_bounds = layout.get("bounds") if isinstance(layout.get("bounds"), list) else []
        layout_styles = layout.get("styles") if isinstance(layout.get("styles"), list) else []

        layout_index_map: Dict[int, int] = {}
        for layout_idx, node_idx in enumerate(layout_node_indices):
            if isinstance(node_idx, int) and node_idx not in layout_index_map:
                layout_index_map[node_idx] = layout_idx

        for node_idx, backend_node_id in enumerate(backend_node_ids):
            if not isinstance(backend_node_id, int):
                continue

            info = SnapshotNodeInfo(
                is_clickable=node_idx in clickable_indices,
                cursor_style=None,
                bounds=None,
                computed_styles=None,
            )

            mapped_layout_idx = layout_index_map.get(node_idx)
            if mapped_layout_idx is not None:
                if mapped_layout_idx < len(layout_bounds):
                    bounds = layout_bounds[mapped_layout_idx]
                    if isinstance(bounds, list) and len(bounds) >= 4:
                        info.bounds = DOMRect(
                            x=_safe_float(bounds[0]) / dpr,
                            y=_safe_float(bounds[1]) / dpr,
                            width=_safe_float(bounds[2]) / dpr,
                            height=_safe_float(bounds[3]) / dpr,
                        )
                if mapped_layout_idx < len(layout_styles):
                    style_indices = layout_styles[mapped_layout_idx]
                    if isinstance(style_indices, list):
                        styles = _parse_computed_styles(strings, style_indices)
                        if styles:
                            info.computed_styles = styles
                            cursor = styles.get("cursor")
                            if isinstance(cursor, str):
                                cursor = cursor.strip()
                                if cursor:
                                    info.cursor_style = cursor

            lookup[backend_node_id] = info

    return lookup


def build_ax_lookup(ax_tree: Dict[str, Any]) -> Dict[int, Dict[str, str]]:
    lookup: Dict[int, Dict[str, str]] = {}
    nodes = ax_tree.get("nodes")
    if not isinstance(nodes, list):
        return lookup

    for node in nodes:
        if not isinstance(node, dict):
            continue
        backend_node_id = node.get("backendDOMNodeId")
        if not isinstance(backend_node_id, int):
            continue

        role = ""
        role_data = node.get("role")
        if isinstance(role_data, dict):
            role_value = role_data.get("value")
            if isinstance(role_value, str):
                role = role_value.strip().lower()

        name = ""
        name_data = node.get("name")
        if isinstance(name_data, dict):
            name_value = name_data.get("value")
            if isinstance(name_value, str):
                name = name_value.strip()

        lookup[backend_node_id] = {"role": role, "name": name}

    return lookup


def _attrs_from_flat_list(flat_attrs: Any) -> Dict[str, str]:
    if not isinstance(flat_attrs, list):
        return {}
    attrs: Dict[str, str] = {}
    for idx in range(0, len(flat_attrs), 2):
        if idx + 1 >= len(flat_attrs):
            break
        key = flat_attrs[idx]
        val = flat_attrs[idx + 1]
        if isinstance(key, str):
            attrs[key] = str(val) if val is not None else ""
    return attrs


def _first_non_empty(values: Iterable[Optional[str]]) -> str:
    for value in values:
        if not value:
            continue
        text = value.strip()
        if text:
            return text
    return ""


def _build_ancestor_label(tag: str, attrs: Dict[str, str], role: str) -> str:
    if not tag:
        return ""
    node_id = attrs.get("id", "").strip()
    if node_id:
        return f"{tag}#{node_id}"
    if role and role not in ("generic", "none"):
        return f"{tag}[role={role}]"
    class_name = attrs.get("class", "").strip()
    if class_name and tag in ("div", "section"):
        first_class = class_name.split()[0]
        if first_class:
            return f"{tag}.{first_class}"
    return tag


def _is_disabled(attrs: Dict[str, str], snapshot_info: Optional[SnapshotNodeInfo]) -> bool:
    if "disabled" in attrs:
        return True
    if attrs.get("aria-disabled", "").strip().lower() == "true":
        return True
    styles = snapshot_info.computed_styles if snapshot_info else None
    if styles and styles.get("pointer-events", "").strip().lower() == "none":
        return True
    return False


def _is_visible(
    snapshot_info: Optional[SnapshotNodeInfo],
    tag: str,
    attrs: Dict[str, str],
) -> bool:
    styles = snapshot_info.computed_styles if snapshot_info else None
    if styles:
        display = styles.get("display", "").strip().lower()
        visibility = styles.get("visibility", "").strip().lower()
        opacity = styles.get("opacity", "").strip()
        if display == "none" or visibility == "hidden":
            return False
        if opacity == "0":
            return False

    if snapshot_info and snapshot_info.bounds:
        bounds = snapshot_info.bounds
        if bounds.width <= 0 or bounds.height <= 0:
            # File inputs are often hidden but still actionable via click/upload.
            if tag == "input" and attrs.get("type", "").strip().lower() == "file":
                return True
            return False

    # If we don't have snapshot layout info, keep semantic controls visible.
    if not snapshot_info:
        if tag in INTERACTIVE_TAGS:
            return True
        role = attrs.get("role", "").strip().lower()
        return role in INTERACTIVE_ROLES
    return True


def _looks_like_search_control(attrs: Dict[str, str]) -> bool:
    classes = attrs.get("class", "").strip().lower()
    if classes:
        for hint in SEARCH_HINTS:
            if hint in classes:
                return True

    element_id = attrs.get("id", "").strip().lower()
    if element_id:
        for hint in SEARCH_HINTS:
            if hint in element_id:
                return True

    for key, value in attrs.items():
        if not key.startswith("data-"):
            continue
        value_l = value.strip().lower()
        if not value_l:
            continue
        for hint in SEARCH_HINTS:
            if hint in value_l:
                return True
    return False


def _is_interactive(
    tag: str,
    attrs: Dict[str, str],
    snapshot_info: Optional[SnapshotNodeInfo],
    ax_info: Optional[Dict[str, str]],
    has_js_click_listener: bool,
) -> bool:
    if _is_disabled(attrs, snapshot_info):
        return False

    role = attrs.get("role", "").strip().lower()
    ax_role = (ax_info or {}).get("role", "").strip().lower()

    if has_js_click_listener:
        return True
    if tag in INTERACTIVE_TAGS:
        return True
    if role in INTERACTIVE_ROLES or ax_role in INTERACTIVE_ROLES:
        return True
    if attrs.get("contenteditable", "").strip().lower() in ("", "true", "plaintext-only"):
        if "contenteditable" in attrs:
            return True
    tabindex = attrs.get("tabindex", "").strip()
    if tabindex and tabindex != "-1":
        return True
    if any(key in attrs for key in ("onclick", "onmousedown", "onmouseup", "onpointerdown", "onpointerup")):
        return True
    if _looks_like_search_control(attrs):
        return True
    if snapshot_info and (snapshot_info.is_clickable or snapshot_info.cursor_style == "pointer"):
        return True
    return False


def _node_text_preview(node: Dict[str, Any], max_chars: int = 80) -> str:
    children = node.get("children")
    if not isinstance(children, list):
        return ""

    parts: list[str] = []
    total_chars = 0
    for child in children:
        if not isinstance(child, dict):
            continue
        if child.get("nodeType") != 3:
            continue
        value = child.get("nodeValue")
        if not isinstance(value, str):
            continue
        text = value.strip()
        if not text:
            continue
        parts.append(text)
        total_chars += len(text)
        if total_chars >= max_chars:
            break

    joined = " ".join(parts).strip()
    if len(joined) > max_chars:
        return joined[:max_chars]
    return joined


def _build_line(
    *,
    ref: str,
    is_new: bool,
    tag: str,
    role: str,
    elem_type: str,
    attrs: Dict[str, str],
    label: str,
) -> str:
    line_attrs: list[str] = []
    if role:
        line_attrs.append(f"role='{role}'")
    if elem_type:
        line_attrs.append(f"type='{elem_type}'")

    href = attrs.get("href", "").strip()
    if href:
        line_attrs.append(f"href='{href[:200]}'")

    attr_text = f" {' '.join(line_attrs)}" if line_attrs else ""
    prefix = "*[" if is_new else "["
    text = label[:80] if label else ""
    return f"{prefix}{ref}]<{tag}{attr_text}>{text}</{tag}>"


class EnhancedCdpDomPipeline:
    """
    Browser-use style DOM snapshot pipeline powered by CDP.
    """

    def __init__(self, *, max_node_walk: int = DEFAULT_MAX_NODE_WALK) -> None:
        self._max_node_walk = max_node_walk

    async def _get_cdp_session(self, page: Any) -> Any:
        context = getattr(page, "context", None)
        if context is None:
            raise RuntimeError("Page has no browser context for CDP session")
        new_cdp_session = getattr(context, "new_cdp_session", None)
        if not callable(new_cdp_session):
            raise RuntimeError("Browser context has no new_cdp_session")
        return await new_cdp_session(page)

    async def _run_parallel_with_retry(
        self,
        task_factories: Dict[str, Callable[[], Awaitable[Any]]],
        *,
        required: tuple[str, ...],
    ) -> Dict[str, Any]:
        """
        Run CDP tasks in parallel with one retry for timed-out/failed tasks.
        """
        results: Dict[str, Any] = {}
        pending_factories: Dict[str, Callable[[], Awaitable[Any]]] = dict(task_factories)
        timeout = _INITIAL_TASK_TIMEOUT_SECONDS

        for attempt in range(2):
            if not pending_factories:
                break

            tasks: Dict[str, asyncio.Task[Any]] = {
                key: asyncio.create_task(factory())
                for key, factory in pending_factories.items()
            }
            pending_factories = {}

            done, pending = await asyncio.wait(tasks.values(), timeout=timeout)
            timeout = _RETRY_TASK_TIMEOUT_SECONDS

            if pending:
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)

            for key, task in tasks.items():
                if task in pending:
                    pending_factories[key] = task_factories[key]
                    continue
                try:
                    results[key] = task.result()
                except Exception as exc:
                    logger.debug("CDP task '%s' failed on attempt %s: %s", key, attempt + 1, exc)
                    pending_factories[key] = task_factories[key]

        missing = [key for key in required if key not in results]
        if missing:
            raise TimeoutError(f"CDP requests failed or timed out: {', '.join(missing)}")

        return results

    async def _get_device_pixel_ratio(self, cdp: Any) -> float:
        """
        Compute DPR from Page.getLayoutMetrics using CSS-vs-device viewport widths.
        """
        try:
            metrics = await cdp.send("Page.getLayoutMetrics", {})
            visual_viewport = metrics.get("visualViewport", {}) if isinstance(metrics, dict) else {}
            css_visual_viewport = metrics.get("cssVisualViewport", {}) if isinstance(metrics, dict) else {}
            css_layout_viewport = metrics.get("cssLayoutViewport", {}) if isinstance(metrics, dict) else {}

            css_width = _safe_float(
                css_visual_viewport.get("clientWidth", css_layout_viewport.get("clientWidth", 0.0)),
                0.0,
            )
            device_width = _safe_float(
                visual_viewport.get("clientWidth", css_width),
                css_width,
            )
            if css_width > 0:
                ratio = device_width / css_width
                if ratio > 0:
                    return ratio
        except Exception as exc:
            logger.debug("Page.getLayoutMetrics DPR detection failed: %s", exc)

        try:
            dpr_eval = await cdp.send(
                "Runtime.evaluate",
                {
                    "expression": "window.devicePixelRatio || 1",
                    "returnByValue": True,
                },
            )
            result = dpr_eval.get("result") if isinstance(dpr_eval, dict) else None
            value = result.get("value") if isinstance(result, dict) else 1
            dpr = _safe_float(value, 1.0)
            if dpr > 0:
                return dpr
        except Exception:
            pass
        return 1.0

    async def _get_ax_tree(self, cdp: Any) -> Dict[str, Any]:
        try:
            ax_tree = await cdp.send("Accessibility.getFullAXTree", {})
            if isinstance(ax_tree, dict):
                return ax_tree
        except Exception as exc:
            logger.debug("Accessibility.getFullAXTree failed: %s", exc)
        return {"nodes": []}

    async def _release_remote_object(self, cdp: Any, object_id: str) -> None:
        try:
            await cdp.send("Runtime.releaseObject", {"objectId": object_id})
        except Exception:
            pass

    async def _get_js_click_listener_backend_ids(self, cdp: Any) -> set[int]:
        """
        Detect elements with JS click listeners using CDP's command-line API.
        """
        result_object_id: Optional[str] = None
        element_object_ids: list[str] = []
        try:
            eval_result = await cdp.send(
                "Runtime.evaluate",
                {
                    "expression": """
                        (() => {
                            if (typeof getEventListeners !== "function") {
                                return null;
                            }
                            const withListeners = [];
                            const allElements = document.querySelectorAll("*");
                            for (const el of allElements) {
                                try {
                                    const listeners = getEventListeners(el);
                                    if (
                                        listeners.click ||
                                        listeners.mousedown ||
                                        listeners.mouseup ||
                                        listeners.pointerdown ||
                                        listeners.pointerup
                                    ) {
                                        withListeners.push(el);
                                    }
                                } catch (e) {
                                    // Ignore individual element failures.
                                }
                            }
                            return withListeners;
                        })()
                    """,
                    "includeCommandLineAPI": True,
                    "returnByValue": False,
                },
            )
            result_data = eval_result.get("result") if isinstance(eval_result, dict) else None
            if not isinstance(result_data, dict):
                return set()
            result_object_id = result_data.get("objectId")
            if not isinstance(result_object_id, str) or not result_object_id:
                return set()

            props = await cdp.send(
                "Runtime.getProperties",
                {
                    "objectId": result_object_id,
                    "ownProperties": True,
                },
            )
            prop_items = props.get("result") if isinstance(props, dict) else None
            if not isinstance(prop_items, list):
                return set()

            for prop in prop_items:
                if not isinstance(prop, dict):
                    continue
                name = prop.get("name")
                if not isinstance(name, str) or not name.isdigit():
                    continue
                value = prop.get("value")
                if not isinstance(value, dict):
                    continue
                object_id = value.get("objectId")
                if isinstance(object_id, str) and object_id:
                    element_object_ids.append(object_id)

            async def resolve_backend_id(object_id: str) -> Optional[int]:
                try:
                    node_info = await cdp.send("DOM.describeNode", {"objectId": object_id})
                except Exception:
                    return None
                if not isinstance(node_info, dict):
                    return None
                node = node_info.get("node")
                if not isinstance(node, dict):
                    return None
                backend_id = node.get("backendNodeId")
                if isinstance(backend_id, int):
                    return backend_id
                return None

            if not element_object_ids:
                return set()
            backend_ids = await asyncio.gather(
                *(resolve_backend_id(object_id) for object_id in element_object_ids),
                return_exceptions=True,
            )

            found_ids: set[int] = set()
            for item in backend_ids:
                if isinstance(item, int):
                    found_ids.add(item)
            return found_ids
        except Exception as exc:
            logger.debug("JS listener detection failed: %s", exc)
            return set()
        finally:
            if result_object_id:
                await self._release_remote_object(cdp, result_object_id)
            if element_object_ids:
                await asyncio.gather(
                    *(self._release_remote_object(cdp, object_id) for object_id in element_object_ids),
                    return_exceptions=True,
                )

    async def _collect_trees(
        self,
        page: Any,
    ) -> tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any], float, Any, set[int]]:
        cdp = await self._get_cdp_session(page)

        task_factories: Dict[str, Callable[[], Awaitable[Any]]] = {
            "snapshot": lambda: cdp.send(
                "DOMSnapshot.captureSnapshot",
                {
                    "computedStyles": REQUIRED_COMPUTED_STYLES,
                    "includePaintOrder": True,
                    "includeDOMRects": True,
                    "includeBlendedBackgroundColors": False,
                    "includeTextColorOpacities": False,
                },
            ),
            "dom_tree": lambda: cdp.send("DOM.getDocument", {"depth": -1, "pierce": True}),
            "ax_tree": lambda: self._get_ax_tree(cdp),
            "device_pixel_ratio": lambda: self._get_device_pixel_ratio(cdp),
            "js_click_listener_backend_ids": lambda: self._get_js_click_listener_backend_ids(cdp),
        }

        results = await self._run_parallel_with_retry(
            task_factories,
            required=("snapshot", "dom_tree", "device_pixel_ratio"),
        )

        snapshot = results["snapshot"]
        dom_tree = results["dom_tree"]
        ax_tree = results.get("ax_tree") or {"nodes": []}
        device_pixel_ratio = _safe_float(results["device_pixel_ratio"], 1.0)
        if device_pixel_ratio <= 0:
            device_pixel_ratio = 1.0
        js_click_listener_backend_ids = results.get("js_click_listener_backend_ids") or set()
        if not isinstance(js_click_listener_backend_ids, set):
            js_click_listener_backend_ids = set()

        return (
            snapshot,
            dom_tree,
            ax_tree,
            device_pixel_ratio,
            cdp,
            js_click_listener_backend_ids,
        )

    async def _set_ref_attribute_by_backend_node_id(
        self,
        cdp: Any,
        backend_node_id: int,
        ref: str,
    ) -> None:
        resolved = await cdp.send("DOM.resolveNode", {"backendNodeId": backend_node_id})
        if not isinstance(resolved, dict):
            return
        obj = resolved.get("object")
        if not isinstance(obj, dict):
            return
        object_id = obj.get("objectId")
        if not isinstance(object_id, str) or not object_id:
            return

        try:
            await cdp.send(
                "Runtime.callFunctionOn",
                {
                    "objectId": object_id,
                    "functionDeclaration": (
                        "function(ref){ this.setAttribute('data-windie-ref', ref); return true; }"
                    ),
                    "arguments": [{"value": ref}],
                    "silent": True,
                },
            )
        finally:
            await self._release_remote_object(cdp, object_id)

    async def build_ai_snapshot(
        self,
        *,
        page: Any,
        max_chars: int,
        max_elements: int,
        ref_registry: Any,
        build_element_key: Callable[[Dict[str, Any]], str],
    ) -> EnhancedAiSnapshotResult:
        cdp: Any = None
        try:
            (
                snapshot,
                dom_tree,
                ax_tree,
                dpr,
                cdp,
                js_click_listener_backend_ids,
            ) = await self._collect_trees(page)
            snapshot_lookup = build_snapshot_lookup(snapshot, dpr)
            ax_lookup = build_ax_lookup(ax_tree)

            root = dom_tree.get("root") if isinstance(dom_tree, dict) else None
            if not isinstance(root, dict):
                raise RuntimeError("CDP DOM.getDocument returned no root node")

            title = await page.title()
            url = page.url

            interactive_nodes: list[InteractiveNode] = []
            walk_count = 0
            seen_backend_ids: set[int] = set()

            def walk(node: Dict[str, Any], ancestors: list[str]) -> None:
                nonlocal walk_count
                walk_count += 1
                if walk_count > self._max_node_walk:
                    return

                node_type = node.get("nodeType")
                if node_type != 1:
                    children = node.get("children")
                    if isinstance(children, list):
                        for child in children:
                            if isinstance(child, dict):
                                walk(child, ancestors)
                    return

                tag = str(node.get("nodeName") or "").strip().lower()
                backend_node_id = node.get("backendNodeId")
                if not isinstance(backend_node_id, int):
                    backend_node_id = -1

                attrs = _attrs_from_flat_list(node.get("attributes"))
                ax_info = ax_lookup.get(backend_node_id) if backend_node_id > 0 else None
                role = attrs.get("role", "").strip().lower()
                if not role and ax_info:
                    role = ax_info.get("role", "").strip().lower()
                elem_type = attrs.get("type", "").strip().lower()
                snapshot_info = snapshot_lookup.get(backend_node_id) if backend_node_id > 0 else None

                visible = _is_visible(snapshot_info, tag, attrs)
                interactive = _is_interactive(
                    tag=tag,
                    attrs=attrs,
                    snapshot_info=snapshot_info,
                    ax_info=ax_info,
                    has_js_click_listener=backend_node_id in js_click_listener_backend_ids,
                )
                label = _first_non_empty(
                    [
                        attrs.get("aria-label"),
                        attrs.get("title"),
                        attrs.get("name"),
                        attrs.get("placeholder"),
                        attrs.get("alt"),
                        attrs.get("value"),
                        (ax_info or {}).get("name") if ax_info else "",
                        _node_text_preview(node, max_chars=80),
                    ]
                )
                if len(label) > 80:
                    label = label[:80]

                next_ancestors = list(ancestors)
                if tag:
                    if tag in INTERESTING_ANCESTOR_TAGS or attrs.get("id"):
                        next_ancestors.append(_build_ancestor_label(tag, attrs, role))
                    elif len(next_ancestors) < 2 and tag in {"main", "form"}:
                        next_ancestors.append(_build_ancestor_label(tag, attrs, role))

                if interactive and visible and backend_node_id > 0:
                    if backend_node_id not in seen_backend_ids:
                        seen_backend_ids.add(backend_node_id)
                        interactive_nodes.append(
                            InteractiveNode(
                                backend_node_id=backend_node_id,
                                tag=tag or "element",
                                role=role,
                                elem_type=elem_type,
                                attrs=attrs,
                                label=label,
                                ancestors=next_ancestors[:4],
                            )
                        )

                children = node.get("children")
                if isinstance(children, list):
                    for child in children:
                        if isinstance(child, dict):
                            walk(child, next_ancestors)

                shadow_roots = node.get("shadowRoots")
                if isinstance(shadow_roots, list):
                    for shadow in shadow_roots:
                        if isinstance(shadow, dict):
                            walk(shadow, next_ancestors)

                content_document = node.get("contentDocument")
                if isinstance(content_document, dict):
                    walk(content_document, next_ancestors)

            walk(root, [])

            lines: list[str] = []
            emitted_paths: set[tuple[str, ...]] = set()
            seen_refs: set[str] = set()

            for item in interactive_nodes:
                if len(seen_refs) >= max_elements:
                    break

                key_info = {
                    "tag": item.tag,
                    "role": item.role,
                    "type": item.elem_type,
                    "id": item.attrs.get("id", ""),
                    "nameAttr": item.attrs.get("name", ""),
                    "placeholder": item.attrs.get("placeholder", ""),
                    "href": item.attrs.get("href", ""),
                    "label": item.label,
                    "ancestors": item.ancestors,
                }
                key = build_element_key(key_info)
                ref, is_new = ref_registry.assign(key=key, url=url)

                try:
                    await self._set_ref_attribute_by_backend_node_id(cdp, item.backend_node_id, ref)
                except Exception:
                    # Ref attachment is best-effort; snapshot text remains usable.
                    pass

                ancestors = item.ancestors[:4]
                for depth_idx in range(len(ancestors)):
                    path = tuple(ancestors[: depth_idx + 1])
                    if path in emitted_paths:
                        continue
                    emitted_paths.add(path)
                    indent = "\t" * depth_idx
                    lines.append(f"{indent}<{ancestors[depth_idx]}>")

                indent = "\t" * len(ancestors)
                line = _build_line(
                    ref=ref,
                    is_new=is_new,
                    tag=item.tag or "element",
                    role=item.role,
                    elem_type=item.elem_type,
                    attrs=item.attrs,
                    label=item.label,
                )
                lines.append(f"{indent}{line}")
                seen_refs.add(ref)

            ref_registry.finalize_snapshot(seen_refs=seen_refs, url=url)

            snapshot_text = f"Title: {title}\nURL: {url}\n\nDOM tree (browser-use style):\n"
            snapshot_text += "\n".join(lines) if lines else "(none found)"
            if max_chars > 0 and len(snapshot_text) > max_chars:
                snapshot_text = snapshot_text[:max_chars] + f"\n{TRUNCATION_SUFFIX}"

            return EnhancedAiSnapshotResult(
                text=snapshot_text,
                title=title,
                url=url,
                ref_count=len(seen_refs),
            )
        finally:
            if cdp is not None:
                detach = getattr(cdp, "detach", None)
                if callable(detach):
                    try:
                        await detach()
                    except Exception:
                        pass
