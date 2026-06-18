"""Covers shared tool schema parity behavior in the sidecar test suite."""

from __future__ import annotations

from typing import Any

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.schemas import (  # noqa: E402
    MouseControlArgs as SidecarMouseControlArgs,
    ScreenshotToolArgs as SidecarScreenshotToolArgs,
    ScrollControlArgs as SidecarScrollControlArgs,
)
from windie_shared.browser_contract import BrowserControlArgs as SidecarBrowserControlArgs  # noqa: E402

from backend.src.tools.computer.schemas import (
    MouseControlArgs as BackendMouseControlArgs,
    ScreenshotToolArgs as BackendScreenshotToolArgs,
    ScrollControlArgs as BackendScrollControlArgs,
)
from backend.src.tools.browser.shared_contract_loader import load_shared_browser_contract

BackendBrowserControlArgs = load_shared_browser_contract().BrowserControlArgs


# Exact parity is only valid for models backed by a shared/generated contract.
# Client-local executable schemas may intentionally differ from backend
# model-facing defaults; manifest tests cover those local tool surfaces.
SHARED_CONTRACT_MODELS = {
    "browser": (
        BackendBrowserControlArgs,
        SidecarBrowserControlArgs,
    ),
}


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


def test_shared_contract_models_match_backend_contract():
    for tool_name, (backend_model, sidecar_model) in SHARED_CONTRACT_MODELS.items():
        assert _normalized_model_schema(sidecar_model) == _normalized_model_schema(backend_model), (
            f"Shared backend/sidecar schema drift detected for {tool_name}.\n"
            f"Backend: {_normalized_model_schema(backend_model)}\n"
            f"Sidecar: {_normalized_model_schema(sidecar_model)}"
        )


def test_screenshot_schema_keeps_wait_parity_with_sidecar_display_bounds_extension():
    backend_schema = _normalized_model_schema(BackendScreenshotToolArgs)
    sidecar_schema = _normalized_model_schema(SidecarScreenshotToolArgs)

    assert sidecar_schema["properties"]["wait"] == backend_schema["properties"]["wait"]
    assert sidecar_schema["properties"]["explanation"] == backend_schema["properties"]["explanation"]
    assert sidecar_schema["additionalProperties"] is False
    assert set(sidecar_schema["properties"].keys()) == {"display_bounds", "explanation", "wait"}
    assert set(backend_schema["properties"].keys()) == {"explanation", "wait"}


def test_mouse_and_scroll_schemas_keep_expected_grounding_abstraction_gap():
    backend_mouse_properties = set(
        _normalized_model_schema(BackendMouseControlArgs)["properties"].keys()
    )
    sidecar_mouse_properties = set(
        _normalized_model_schema(SidecarMouseControlArgs)["properties"].keys()
    )
    assert "find_coordinates_by" in backend_mouse_properties
    assert "ocr_text" in backend_mouse_properties
    assert "source_description" in backend_mouse_properties
    assert "button" in backend_mouse_properties
    assert {"x", "y"} <= sidecar_mouse_properties
    assert "button" in sidecar_mouse_properties
    assert "find_coordinates_by" not in sidecar_mouse_properties

    backend_scroll_properties = set(
        _normalized_model_schema(BackendScrollControlArgs)["properties"].keys()
    )
    sidecar_scroll_properties = set(
        _normalized_model_schema(SidecarScrollControlArgs)["properties"].keys()
    )
    assert "find_coordinates_by" in backend_scroll_properties
    assert "ocr_text" in backend_scroll_properties
    assert "source_description" in backend_scroll_properties
    assert {"x", "y"} <= sidecar_scroll_properties
    assert "find_coordinates_by" not in sidecar_scroll_properties
