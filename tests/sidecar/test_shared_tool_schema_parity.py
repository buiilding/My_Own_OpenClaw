from __future__ import annotations

from typing import Any

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.registry import ToolRegistry  # noqa: E402
from tools.schemas import (  # noqa: E402
    GetOpenWindowsArgs as SidecarGetOpenWindowsArgs,
    GetSystemStatsArgs as SidecarGetSystemStatsArgs,
    KeyboardControlArgs as SidecarKeyboardControlArgs,
    MouseControlArgs as SidecarMouseControlArgs,
    OpenAppArgs as SidecarOpenAppArgs,
    ProcessShellCommandArgs as SidecarProcessShellCommandArgs,
    ReadFileArgs as SidecarReadFileArgs,
    ReplaceArgs as SidecarReplaceArgs,
    ReplaceOperationArgs as SidecarReplaceOperationArgs,
    ReplacePatchChunkArgs as SidecarReplacePatchChunkArgs,
    RunShellCommandArgs as SidecarRunShellCommandArgs,
    ScreenshotToolArgs as SidecarScreenshotToolArgs,
    ScrollControlArgs as SidecarScrollControlArgs,
    SwitchTabArgs as SidecarSwitchTabArgs,
    WaitToolArgs as SidecarWaitToolArgs,
)

from backend.src.tools.filesystem.schemas import (
    ReadFileArgs as BackendReadFileArgs,
    ReplaceArgs as BackendReplaceArgs,
    ReplaceOperationArgs as BackendReplaceOperationArgs,
    ReplacePatchChunkArgs as BackendReplacePatchChunkArgs,
)
from backend.src.tools.computer.schemas import (
    KeyboardControlArgs as BackendKeyboardControlArgs,
    MouseControlArgs as BackendMouseControlArgs,
    ScreenshotToolArgs as BackendScreenshotToolArgs,
    ScrollControlArgs as BackendScrollControlArgs,
    SwitchTabArgs as BackendSwitchTabArgs,
    WaitToolArgs as BackendWaitToolArgs,
)
from backend.src.tools.system.schemas import (
    GetOpenWindowsArgs as BackendGetOpenWindowsArgs,
    GetSystemStatsArgs as BackendGetSystemStatsArgs,
    OpenAppArgs as BackendOpenAppArgs,
    ProcessShellCommandArgs as BackendProcessShellCommandArgs,
    RunShellCommandArgs as BackendRunShellCommandArgs,
)


INTENTIONAL_EXCEPTIONS = frozenset(
    {
        "browser",
        "computer_use",
        "mouse_control",
        "screenshot",
        "scroll_control",
        "system_use",
    }
)

EXACT_PARITY_TOOLS = {
    "keyboard_control": (
        BackendKeyboardControlArgs,
        SidecarKeyboardControlArgs,
    ),
    "switch_tab": (
        BackendSwitchTabArgs,
        SidecarSwitchTabArgs,
    ),
    "wait": (
        BackendWaitToolArgs,
        SidecarWaitToolArgs,
    ),
    "get_open_windows": (
        BackendGetOpenWindowsArgs,
        SidecarGetOpenWindowsArgs,
    ),
    "get_system_stats": (
        BackendGetSystemStatsArgs,
        SidecarGetSystemStatsArgs,
    ),
    "open_app": (
        BackendOpenAppArgs,
        SidecarOpenAppArgs,
    ),
    "run_shell_command": (
        BackendRunShellCommandArgs,
        SidecarRunShellCommandArgs,
    ),
    "process": (
        BackendProcessShellCommandArgs,
        SidecarProcessShellCommandArgs,
    ),
    "read_file": (
        BackendReadFileArgs,
        SidecarReadFileArgs,
    ),
    "replace": (
        BackendReplaceArgs,
        SidecarReplaceArgs,
    ),
}

EXACT_PARITY_SUPPORT_MODELS = {
    "replace_operation": (
        BackendReplaceOperationArgs,
        SidecarReplaceOperationArgs,
    ),
    "replace_patch_chunk": (
        BackendReplacePatchChunkArgs,
        SidecarReplacePatchChunkArgs,
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

        return {
            key: _resolve_local_refs(value)
            for key, value in node.items()
            if key != "$defs"
        }

    return _normalize_schema_fragment(_resolve_local_refs(raw_schema))


def test_shared_non_browser_schema_parity_coverage_matches_exposed_tool_set():
    exposed_tools = ToolRegistry.get_exposed_tool_names()
    covered_tools = set(EXACT_PARITY_TOOLS.keys()) | INTENTIONAL_EXCEPTIONS
    assert covered_tools == (set(exposed_tools) - {"replace_operation", "replace_patch_chunk"}), (
        "Shared non-browser schema parity coverage drift detected.\n"
        f"Covered tools: {sorted(covered_tools)}\n"
        f"Exposed tools: {sorted(exposed_tools)}"
    )


def test_exact_parity_models_match_backend_contract():
    for tool_name, (backend_model, sidecar_model) in {
        **EXACT_PARITY_TOOLS,
        **EXACT_PARITY_SUPPORT_MODELS,
    }.items():
        assert _normalized_model_schema(sidecar_model) == _normalized_model_schema(backend_model), (
            f"Backend/sidecar schema drift detected for {tool_name}.\n"
            f"Backend: {_normalized_model_schema(backend_model)}\n"
            f"Sidecar: {_normalized_model_schema(sidecar_model)}"
        )


def test_screenshot_schema_keeps_wait_parity_with_sidecar_display_bounds_extension():
    backend_schema = _normalized_model_schema(BackendScreenshotToolArgs)
    sidecar_schema = _normalized_model_schema(SidecarScreenshotToolArgs)

    assert sidecar_schema["properties"]["wait"] == backend_schema["properties"]["wait"]
    assert sidecar_schema["additionalProperties"] is False
    assert set(sidecar_schema["properties"].keys()) == {"display_bounds", "wait"}
    assert set(backend_schema["properties"].keys()) == {"wait"}


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
    assert {"x", "y"} <= sidecar_mouse_properties
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
