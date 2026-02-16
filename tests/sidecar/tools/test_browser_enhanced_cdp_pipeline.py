"""
Tests for enhanced CDP/DOM snapshot pipeline.
"""

from __future__ import annotations

from unittest import mock

import pytest

from tools.browser.enhanced_cdp_pipeline import (
    EnhancedCdpDomPipeline,
    build_ax_lookup,
    build_snapshot_lookup,
)
from tools.browser.ref_registry import RefRegistry


def test_build_snapshot_lookup_parses_bounds_and_styles() -> None:
    snapshot = {
        "strings": [
            "block",
            "visible",
            "1",
            "auto",
            "auto",
            "auto",
            "pointer",
            "auto",
            "static",
            "rgb(0,0,0)",
        ],
        "documents": [
            {
                "nodes": {
                    "backendNodeId": [101, 102],
                    "isClickable": {"index": [1]},
                },
                "layout": {
                    "nodeIndex": [0, 1],
                    "bounds": [
                        [0, 0, 200, 100],
                        [10, 20, 40, 30],
                    ],
                    "styles": [
                        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                    ],
                },
            }
        ],
    }

    lookup = build_snapshot_lookup(snapshot, device_pixel_ratio=2.0)
    assert set(lookup.keys()) == {101, 102}
    assert lookup[101].is_clickable is False
    assert lookup[102].is_clickable is True
    assert lookup[102].bounds is not None
    assert lookup[102].bounds.width == 20
    assert lookup[102].bounds.height == 15
    assert lookup[102].cursor_style == "pointer"


def test_build_ax_lookup_uses_backend_node_ids() -> None:
    ax_tree = {
        "nodes": [
            {
                "backendDOMNodeId": 42,
                "role": {"value": "button"},
                "name": {"value": "Submit"},
            },
            {
                "backendDOMNodeId": 99,
                "role": {"value": "textbox"},
                "name": {"value": "Search"},
            },
        ]
    }

    lookup = build_ax_lookup(ax_tree)
    assert lookup[42]["role"] == "button"
    assert lookup[42]["name"] == "Submit"
    assert lookup[99]["role"] == "textbox"


@pytest.mark.asyncio
async def test_parallel_retry_recovers_failed_task() -> None:
    pipeline = EnhancedCdpDomPipeline()
    attempts = {"dom": 0}

    async def snapshot_task() -> str:
        return "snapshot"

    async def dom_task() -> str:
        attempts["dom"] += 1
        if attempts["dom"] == 1:
            raise RuntimeError("transient failure")
        return "dom"

    results = await pipeline._run_parallel_with_retry(
        {
            "snapshot": snapshot_task,
            "dom_tree": dom_task,
        },
        required=("snapshot", "dom_tree"),
    )

    assert results["snapshot"] == "snapshot"
    assert results["dom_tree"] == "dom"
    assert attempts["dom"] == 2


@pytest.mark.asyncio
async def test_build_ai_snapshot_serializes_refs_and_attaches_attributes() -> None:
    class FakeCdp:
        def __init__(self) -> None:
            self.calls: list[tuple[str, dict]] = []

        async def send(self, command: str, params: dict | None = None):
            payload = params or {}
            self.calls.append((command, payload))
            if command == "DOM.resolveNode":
                return {"object": {"objectId": "obj-4"}}
            return {}

    class FakeContext:
        def __init__(self, cdp: FakeCdp) -> None:
            self._cdp = cdp

        async def new_cdp_session(self, page):  # noqa: ANN001
            return self._cdp

    class FakePage:
        def __init__(self, cdp: FakeCdp) -> None:
            self.url = "https://example.com"
            self.context = FakeContext(cdp)

        async def title(self) -> str:
            return "Example"

    snapshot = {
        "strings": [
            "block",
            "visible",
            "1",
            "auto",
            "auto",
            "auto",
            "pointer",
            "auto",
            "static",
            "rgb(0,0,0)",
        ],
        "documents": [
            {
                "nodes": {
                    "backendNodeId": [1, 2, 3, 4],
                    "isClickable": {"index": [3]},
                },
                "layout": {
                    "nodeIndex": [0, 1, 2, 3],
                    "bounds": [
                        [0, 0, 1200, 800],
                        [0, 0, 1200, 700],
                        [0, 0, 1000, 600],
                        [50, 80, 120, 32],
                    ],
                    "styles": [
                        [0, 1, 2, 3, 4, 5, 7, 7, 8, 9],
                        [0, 1, 2, 3, 4, 5, 7, 7, 8, 9],
                        [0, 1, 2, 3, 4, 5, 7, 7, 8, 9],
                        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                    ],
                },
            }
        ],
    }
    dom_tree = {
        "root": {
            "nodeType": 9,
            "children": [
                {
                    "nodeType": 1,
                    "nodeName": "HTML",
                    "backendNodeId": 1,
                    "attributes": [],
                    "children": [
                        {
                            "nodeType": 1,
                            "nodeName": "BODY",
                            "backendNodeId": 2,
                            "attributes": [],
                            "children": [
                                {
                                    "nodeType": 1,
                                    "nodeName": "MAIN",
                                    "backendNodeId": 3,
                                    "attributes": ["id", "content"],
                                    "children": [
                                        {
                                            "nodeType": 1,
                                            "nodeName": "BUTTON",
                                            "backendNodeId": 4,
                                            "attributes": ["aria-label", "Submit"],
                                            "children": [
                                                {
                                                    "nodeType": 3,
                                                    "nodeValue": "Submit",
                                                }
                                            ],
                                        }
                                    ],
                                }
                            ],
                        }
                    ],
                }
            ],
        }
    }
    ax_tree = {
        "nodes": [
            {
                "backendDOMNodeId": 4,
                "role": {"value": "button"},
                "name": {"value": "Submit"},
            }
        ]
    }

    cdp = FakeCdp()
    page = FakePage(cdp)
    registry = RefRegistry()
    pipeline = EnhancedCdpDomPipeline()
    pipeline._collect_trees = mock.AsyncMock(  # type: ignore[method-assign]
        return_value=(snapshot, dom_tree, ax_tree, 1.0, cdp, set())
    )

    result = await pipeline.build_ai_snapshot(
        page=page,
        max_chars=4000,
        max_elements=20,
        ref_registry=registry,
        build_element_key=lambda info: f"{info['tag']}|{info.get('label','')}",
    )

    assert result.url == "https://example.com"
    assert result.title == "Example"
    assert result.ref_count == 1
    assert "[1]<button role='button'>Submit</button>" in result.text
    assert any(cmd == "DOM.resolveNode" for cmd, _ in cdp.calls)
    assert any(cmd == "Runtime.callFunctionOn" for cmd, _ in cdp.calls)
