"""Covers local-runtime shared tool schema parity behavior."""

from __future__ import annotations

from typing import Any

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.schemas import (  # noqa: E402
    MouseControlArgs as LocalRuntimeMouseControlArgs,
    ScreenshotToolArgs as LocalRuntimeScreenshotToolArgs,
    ScrollControlArgs as LocalRuntimeScrollControlArgs,
)
from tools.manifest import (  # noqa: E402
    build_local_runtime_capability_schema,
    build_local_runtime_executable_schema,
)
from windie_shared.browser_contract import (  # noqa: E402
    BrowserControlArgs as LocalRuntimeBrowserControlArgs,
    build_browser_tool_parameters_schema,
)


def _normalize_schema_fragment(node: Any) -> Any:
    if isinstance(node, list):
        return [_normalize_schema_fragment(item) for item in node]

    if not isinstance(node, dict):
        return node

    normalized: dict[str, Any] = {}
    for key in (
        "type",
        "additionalProperties",
        "required",
        "properties",
        "items",
        "allOf",
        "anyOf",
        "oneOf",
        "default",
        "enum",
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "minLength",
        "maxLength",
    ):
        if key not in node:
            continue

        value = node[key]
        if key == "required" and isinstance(value, list):
            normalized[key] = sorted(value)
            continue
        if key == "properties" and isinstance(value, dict):
            normalized[key] = {
                prop_name: _normalize_schema_fragment(prop_value)
                for prop_name, prop_value in sorted(value.items())
            }
            continue
        if key in {"allOf", "anyOf", "oneOf"} and isinstance(value, list):
            normalized[key] = [_normalize_schema_fragment(item) for item in value]
            continue
        normalized[key] = _normalize_schema_fragment(value)

    return normalized


def _normalized_model_schema(model: type[Any]) -> dict[str, Any]:
    raw_schema = model.model_json_schema()
    defs = raw_schema.get("$defs")

    def _resolve_local_refs(node: Any) -> Any:
        if isinstance(node, list):
            return [_resolve_local_refs(item) for item in node]

        if not isinstance(node, dict):
            return node

        ref = node.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/$defs/") and isinstance(defs, dict):
            key = ref[len("#/$defs/"):]
            target = defs.get(key)
            if isinstance(target, dict):
                merged = dict(_resolve_local_refs(target))
                merged.update(
                    {
                        nested_key: _resolve_local_refs(nested_value)
                        for nested_key, nested_value in node.items()
                        if nested_key != "$ref"
                    }
                )
                return merged

        all_of = node.get("allOf")
        if isinstance(all_of, list) and len(all_of) == 1:
            resolved_base = _resolve_local_refs(all_of[0])
            if isinstance(resolved_base, dict):
                merged = dict(resolved_base)
                merged.update(
                    {
                        key: _resolve_local_refs(value)
                        for key, value in node.items()
                        if key != "allOf"
                    }
                )
                return merged

        return {
            key: _resolve_local_refs(value)
            for key, value in node.items()
            if key != "$defs"
        }

    return _normalize_schema_fragment(_resolve_local_refs(raw_schema))


def test_local_runtime_schema_parity_test_does_not_import_backend_package():
    source = __import__("pathlib").Path(__file__).read_text(encoding="utf-8")
    backend_package = "backend" + ".src"

    assert backend_package not in source


def test_browser_schema_uses_shared_contract_module():
    local_runtime_schema = build_local_runtime_executable_schema("browser")
    shared_schema = build_browser_tool_parameters_schema()

    assert local_runtime_schema == shared_schema
    assert LocalRuntimeBrowserControlArgs.__module__.startswith("windie_shared.")


def test_screenshot_executable_schema_keeps_display_bounds_extension():
    local_runtime_schema = _normalized_model_schema(LocalRuntimeScreenshotToolArgs)
    executable_schema = build_local_runtime_executable_schema("screenshot")
    display_bounds_schema = local_runtime_schema["properties"]["display_bounds"]["anyOf"][0]
    virtual_bounds_schema = display_bounds_schema["properties"][
        "desktop_virtual_bounds"
    ]["anyOf"][0]

    assert local_runtime_schema["additionalProperties"] is False
    assert set(local_runtime_schema["properties"].keys()) == {
        "display_bounds",
        "explanation",
        "wait",
    }
    assert set(executable_schema["properties"].keys()) == {
        "display_bounds",
        "explanation",
        "wait",
    }
    assert executable_schema["additionalProperties"] is False
    assert display_bounds_schema["additionalProperties"] is False
    assert virtual_bounds_schema["additionalProperties"] is False


def test_mouse_and_scroll_manifest_separates_grounding_metadata_from_executable_schema():
    local_runtime_mouse_properties = set(
        _normalized_model_schema(LocalRuntimeMouseControlArgs)["properties"].keys()
    )
    capability_mouse_properties = build_local_runtime_capability_schema("mouse_control")[
        "properties"
    ]
    executable_mouse_properties = build_local_runtime_executable_schema("mouse_control")[
        "properties"
    ]

    assert capability_mouse_properties["find_coordinates_by"]["enum"] == [
        "manual",
        "ocr",
        "prediction",
    ]
    assert "ocr_text" in capability_mouse_properties
    assert "source_description" in capability_mouse_properties
    assert "button" in capability_mouse_properties
    assert {"x", "y"} <= local_runtime_mouse_properties
    assert "button" in local_runtime_mouse_properties
    assert "find_coordinates_by" not in executable_mouse_properties
    assert "find_coordinates_by" not in local_runtime_mouse_properties

    local_runtime_scroll_properties = set(
        _normalized_model_schema(LocalRuntimeScrollControlArgs)["properties"].keys()
    )
    capability_scroll_properties = build_local_runtime_capability_schema("scroll_control")[
        "properties"
    ]
    executable_scroll_properties = build_local_runtime_executable_schema("scroll_control")[
        "properties"
    ]

    assert capability_scroll_properties["find_coordinates_by"]["enum"] == [
        "manual",
        "ocr",
        "prediction",
    ]
    assert "ocr_text" in capability_scroll_properties
    assert "source_description" in capability_scroll_properties
    assert {"x", "y"} <= local_runtime_scroll_properties
    assert "find_coordinates_by" not in executable_scroll_properties
    assert "find_coordinates_by" not in local_runtime_scroll_properties
