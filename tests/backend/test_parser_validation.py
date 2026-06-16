"""Covers parser validation behavior in the backend test suite."""

import pytest

from backend.src.core.config.models import SecurityLimits
from backend.src.core.infrastructure.error_types import ParseValidationError
from backend.src.llm.parser_validation import ToolCallValidator
from tests.backend.tool_validator_test_utils import DummyRegistry, make_tool_call_validator


class BrokenRegistry(DummyRegistry):
    def __init__(self, tool_names):
        super().__init__(tool_names)

    def get_tool_names(self):
        return self._tool_names


class CountingRegistry(DummyRegistry):
    def __init__(self, tool_names):
        super().__init__(tool_names)
        self.calls = 0

    def get_tool_names(self):
        self.calls += 1
        return self._tool_names


def _make_validator(tool_names, interaction_mode="agent", **config_overrides):
    return _make_validator_for_registry(
        DummyRegistry(tool_names),
        interaction_mode=interaction_mode,
        **config_overrides,
    )


def _make_validator_for_registry(
    tool_registry,
    interaction_mode="agent",
    limits=None,
    **config_overrides,
):
    return make_tool_call_validator(
        tool_registry,
        interaction_mode=interaction_mode,
        limits=limits,
        **config_overrides,
    )


def test_validate_tool_call_rejects_non_dict_args_without_crashing():
    validator, metrics = _make_validator(["read_file"])

    with pytest.raises(ParseValidationError, match="Tool args must be an object/dict"):
        validator.validate_tool_call("read_file", "not-a-dict")

    assert len(metrics.calls) == 1
    assert metrics.calls[0]["metadata"]["tool_name"] == "read_file"
    assert metrics.calls[0]["metadata"]["param_count"] == 10


def test_validate_tool_call_rejects_non_sized_args_without_crashing():
    validator, metrics = _make_validator(["read_file"])

    with pytest.raises(ParseValidationError, match="Tool args must be an object/dict"):
        validator.validate_tool_call("read_file", 42)

    assert len(metrics.calls) == 1
    assert metrics.calls[0]["metadata"]["tool_name"] == "read_file"
    assert metrics.calls[0]["metadata"]["param_count"] is None


def test_validate_tool_call_rejects_unhashable_tool_name_without_crashing():
    validator, metrics = _make_validator(["read_file"])

    with pytest.raises(ParseValidationError, match="Tool name must be a string"):
        validator.validate_tool_call({"bad": "name"}, {})

    assert len(metrics.calls) == 1
    assert metrics.calls[0]["metadata"]["tool_name"] == {"bad": "name"}
    assert metrics.calls[0]["metadata"]["param_count"] == 0


def test_validate_tool_call_filters_non_string_tool_names():
    validator, _metrics = _make_validator(["read_file", None, 123])

    validator.validate_tool_call("read_file", {"file_path": "/tmp/x"})


def test_validate_tool_call_applies_chat_mode_allowlist():
    validator, _metrics = _make_validator(["read_file", "secret_tool"], interaction_mode="chat")

    with pytest.raises(ParseValidationError, match="not in whitelist"):
        validator.validate_tool_call("secret_tool", {})


def test_validate_tool_call_rejects_disabled_mouse_prediction_method(
):
    validator, _metrics = _make_validator(
        ["mouse_control"],
        interaction_mode="agent",
        agent_coordinate_methods=["manual", "ocr"],
    )

    with pytest.raises(ParseValidationError, match="find_coordinates_by"):
        validator.validate_tool_call(
            "mouse_control",
            {"action": "click", "find_coordinates_by": "prediction", "source_description": "submit button"},
        )


def test_validate_tool_call_rejects_implicit_manual_when_manual_disabled(
):
    validator, _metrics = _make_validator(
        ["mouse_control"],
        interaction_mode="agent",
        agent_coordinate_methods=["ocr"],
    )

    with pytest.raises(ParseValidationError, match="find_coordinates_by"):
        validator.validate_tool_call("mouse_control", {"action": "click", "x": 10, "y": 20})


def test_validate_tool_call_accepts_enabled_mouse_ocr_method(
):
    validator, _metrics = _make_validator(
        ["mouse_control"],
        interaction_mode="agent",
        agent_coordinate_methods=["ocr"],
    )
    validator.validate_tool_call(
        "mouse_control",
        {"action": "click", "find_coordinates_by": "ocr", "ocr_text": "Submit"},
    )


def test_validate_tool_call_handles_non_iterable_registry_tool_names():
    validator, _metrics = _make_validator_for_registry(BrokenRegistry(123))

    with pytest.raises(ParseValidationError, match="not in whitelist"):
        validator.validate_tool_call("read_file", {})


def test_validate_tool_call_handles_string_registry_tool_names():
    validator, _metrics = _make_validator_for_registry(BrokenRegistry("read_file"))

    with pytest.raises(ParseValidationError, match=r"Valid tools \(0\):"):
        validator.validate_tool_call("read_file", {})


def test_validate_metadata_accepts_none_for_direct_tools():
    validator, _metrics = _make_validator(["mouse_control"])

    validator.validate_metadata("mouse_control", None)


def test_validate_metadata_accepts_dict_when_present():
    validator, _metrics = _make_validator(["mouse_control"])
    metadata = {"description": "screen"}

    validator.validate_metadata("mouse_control", metadata)

    assert metadata == {"description": "screen"}


def test_validate_metadata_rejects_non_dict_when_present():
    validator, _metrics = _make_validator(["mouse_control"])

    with pytest.raises(ParseValidationError, match="Tool metadata must be an object"):
        validator.validate_metadata("mouse_control", "not-a-dict")


def test_get_valid_tool_names_deduplicates_registry_values():
    validator, _metrics = _make_validator(["read_file", "read_file", "replace"])

    assert validator._get_valid_tool_names() == ["read_file", "replace"]


def test_get_valid_tool_names_returns_sorted_output():
    validator, _metrics = _make_validator({"replace", "read_file"})

    assert validator._get_valid_tool_names() == ["read_file", "replace"]


def test_validate_tool_call_uses_compact_json_size_for_nested_params():
    limits = SecurityLimits(max_parameter_value_size=13)
    validator, _metrics = _make_validator_for_registry(DummyRegistry(["read_file"]), limits=limits)

    validator.validate_tool_call("read_file", {"payload": {"a": 1, "b": 2}})


def test_serialized_param_size_returns_none_for_unserializable_payload():
    size = ToolCallValidator._serialized_param_size({"unsupported": {1, 2, 3}})

    assert size is None


def test_validate_tool_call_whitelist_error_truncates_sorted_tool_display():
    tool_names = [f"tool_{index:02d}" for index in range(20, 0, -1)]
    validator, _metrics = _make_validator(tool_names)

    with pytest.raises(ParseValidationError) as exc:
        validator.validate_tool_call("missing_tool", {})

    message = str(exc.value)
    assert "Valid tools (20): tool_01, tool_02, tool_03, tool_04, tool_05, tool_06, tool_07, tool_08, tool_09, tool_10... (and 10 more)" in message


def test_validate_tool_call_reuses_valid_tool_cache_across_calls():
    registry = CountingRegistry(["read_file"])
    validator, _metrics = _make_validator_for_registry(registry)

    validator.validate_tool_call("read_file", {"file_path": "/tmp/a"})
    validator.validate_tool_call("read_file", {"file_path": "/tmp/b"})

    assert registry.calls == 1


def test_validate_tool_call_reuses_valid_tool_cache_after_policy_construction():
    registry = CountingRegistry(["read_file"])
    validator, _metrics = _make_validator_for_registry(registry)

    validator.validate_tool_call("read_file", {"file_path": "/tmp/a"})
    validator.validate_tool_call("read_file", {"file_path": "/tmp/b"})
    assert registry.calls == 1
