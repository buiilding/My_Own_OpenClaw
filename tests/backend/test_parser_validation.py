import pytest

from backend.src.core.config.models import SecurityLimits
from backend.src.core.infrastructure.exceptions import ParseValidationError
from backend.src.llm.parser_validation import ToolCallValidator
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.tool_selection import ToolSelection
from tests.backend.tool_validator_test_utils import DummyRegistry, make_tool_call_validator


class BrokenRegistry(DummyRegistry):
    def __init__(self, tool_names):
        super().__init__(tool_names)

    def get_tool_names(self):
        return self._tool_names


class DummyTool:
    def __init__(self, category):
        self.category = category


class ComputerRegistry(DummyRegistry):
    def get_tool(self, name):
        if name == "mouse_control":
            return DummyTool(ToolDomain.COMPUTER)
        return None


class CustomComputerRegistry(DummyRegistry):
    def get_tool(self, name):
        if name == "custom_computer_action":
            return DummyTool(ToolDomain.COMPUTER)
        return None


class CountingRegistry(DummyRegistry):
    def __init__(self, tool_names):
        super().__init__(tool_names)
        self.calls = 0

    def get_tool_names(self):
        self.calls += 1
        return self._tool_names


def _configure_mouse_coordinate_methods(monkeypatch: pytest.MonkeyPatch, tmp_path, methods: str) -> None:
    config_path = tmp_path / "tool_selection.toml"
    config_path.write_text(
        (
            "enabled = true\n"
            'mode = "allowlist"\n'
            'tools = ["mouse_control"]\n'
            "[tool_options.mouse_control]\n"
            f"enabled_coordinate_methods = [{methods}]\n"
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("WINDIEOS_DEV_TOOL_SELECTION_PATH", str(config_path))


def _make_validator(tool_names, interaction_mode="agent"):
    return _make_validator_for_registry(
        DummyRegistry(tool_names),
        interaction_mode=interaction_mode,
    )


def _make_validator_for_registry(tool_registry, interaction_mode="agent", limits=None):
    return make_tool_call_validator(
        tool_registry,
        interaction_mode=interaction_mode,
        limits=limits,
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

    # Should not crash on non-string names in registry; valid call still passes.
    validator.validate_tool_call("read_file", {"file_path": "/tmp/x"})


def test_validate_tool_call_applies_chat_mode_allowlist():
    validator, _metrics = _make_validator(["read_file", "secret_tool"], interaction_mode="chat")

    with pytest.raises(ParseValidationError, match="not in whitelist"):
        validator.validate_tool_call("secret_tool", {})


def test_validate_tool_call_rejects_disabled_mouse_prediction_method(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    _configure_mouse_coordinate_methods(monkeypatch, tmp_path, '"manual", "ocr"')

    validator, _metrics = _make_validator(["mouse_control"], interaction_mode="agent")

    with pytest.raises(ParseValidationError, match="find_coordinates_by"):
        validator.validate_tool_call(
            "mouse_control",
            {"action": "click", "find_coordinates_by": "prediction", "source_description": "submit button"},
        )


def test_validate_tool_call_rejects_implicit_manual_when_manual_disabled(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    _configure_mouse_coordinate_methods(monkeypatch, tmp_path, '"ocr"')

    validator, _metrics = _make_validator(["mouse_control"], interaction_mode="agent")

    with pytest.raises(ParseValidationError, match="find_coordinates_by"):
        validator.validate_tool_call("mouse_control", {"action": "click", "x": 10, "y": 20})


def test_validate_tool_call_accepts_enabled_mouse_ocr_method(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    _configure_mouse_coordinate_methods(monkeypatch, tmp_path, '"ocr"')

    validator, _metrics = _make_validator(["mouse_control"], interaction_mode="agent")
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

    with pytest.raises(ParseValidationError, match="Valid tools \\(0\\):"):
        validator.validate_tool_call("read_file", {})


def test_validate_metadata_rejects_whitespace_only_fields_for_computer_tools():
    validator, _metrics = _make_validator_for_registry(ComputerRegistry(["mouse_control"]))

    with pytest.raises(ParseValidationError, match="missing required metadata field"):
        validator.validate_metadata(
            "mouse_control",
            {
                "description": "   ",
                "explanation": "\n",
                "expectation": "   ",
            },
        )


def test_validate_metadata_rejects_missing_metadata_for_legacy_computer_tool():
    validator, _metrics = _make_validator_for_registry(ComputerRegistry(["mouse_control"]))

    with pytest.raises(ParseValidationError, match="missing metadata"):
        validator.validate_metadata("mouse_control", None)


def test_validate_metadata_rejects_missing_metadata_for_unified_computer_use_tool():
    validator, _metrics = _make_validator(["computer_use"])

    with pytest.raises(ParseValidationError, match="missing metadata"):
        validator.validate_metadata("computer_use", None)


@pytest.mark.parametrize("tool_name", ["mouse_control", "computer_use"])
@pytest.mark.parametrize("missing_field", ["description", "explanation", "expectation"])
def test_validate_metadata_rejects_missing_required_fields_for_computer_tools(
    tool_name: str,
    missing_field: str,
):
    validator, _metrics = _make_validator(["computer_use"])
    metadata = {
        "description": "screen",
        "explanation": "click submit",
        "expectation": "dialog opens",
    }
    metadata.pop(missing_field)

    with pytest.raises(
        ParseValidationError,
        match=f"missing required metadata field '{missing_field}'",
    ):
        validator.validate_metadata(tool_name, metadata)


def test_validate_metadata_accepts_trimmed_nonempty_strings_for_computer_tools():
    validator, _metrics = _make_validator_for_registry(ComputerRegistry(["mouse_control"]))
    metadata = {
        "description": " current screen ",
        "explanation": " click submit ",
        "expectation": " modal opens ",
    }

    validator.validate_metadata(
        "mouse_control",
        metadata,
    )

    assert metadata == {
        "description": "current screen",
        "explanation": "click submit",
        "expectation": "modal opens",
    }


def test_validate_metadata_rejects_non_string_required_fields_for_computer_tools():
    validator, _metrics = _make_validator_for_registry(ComputerRegistry(["mouse_control"]))

    with pytest.raises(ParseValidationError, match="missing required metadata field"):
        validator.validate_metadata(
            "mouse_control",
            {
                "description": 123,
                "explanation": {"why": "click"},
                "expectation": ["dialog", "opens"],
            },
        )


def test_validate_metadata_rejects_unexpected_metadata_fields_for_computer_tools():
    validator, _metrics = _make_validator_for_registry(ComputerRegistry(["mouse_control"]))

    with pytest.raises(ParseValidationError, match="unexpected metadata fields"):
        validator.validate_metadata(
            "mouse_control",
            {
                "description": "screen",
                "explanation": "click submit",
                "expectation": "dialog opens",
                "trace_id": "abc-123",
            },
        )


def test_validate_metadata_accepts_and_trims_metadata_for_unified_computer_use_tool():
    validator, _metrics = _make_validator(["computer_use"])
    metadata = {
        "description": " screen ",
        "explanation": " click ",
        "expectation": " opens ",
    }

    validator.validate_metadata("computer_use", metadata)

    assert metadata == {
        "description": "screen",
        "explanation": "click",
        "expectation": "opens",
    }


def test_validate_metadata_accepts_legacy_computer_tool_name_when_unified_tool_is_registered():
    validator, _metrics = _make_validator(["computer_use"])
    metadata = {
        "description": " screen ",
        "explanation": " click ",
        "expectation": " opens ",
    }

    validator.validate_metadata("mouse_control", metadata)

    assert metadata == {
        "description": "screen",
        "explanation": "click",
        "expectation": "opens",
    }


def test_validate_metadata_rejects_missing_metadata_for_legacy_name_when_unified_tool_is_registered():
    validator, _metrics = _make_validator(["computer_use"])

    with pytest.raises(ParseValidationError, match="missing metadata"):
        validator.validate_metadata("mouse_control", None)


def test_validate_metadata_rejects_non_dict_metadata_for_unified_computer_use_tool():
    validator, _metrics = _make_validator(["computer_use"])

    with pytest.raises(ParseValidationError, match="invalid metadata type"):
        validator.validate_metadata("computer_use", "not-a-dict")


def test_validate_metadata_rejects_missing_metadata_for_category_based_computer_tool():
    validator, _metrics = _make_validator_for_registry(
        CustomComputerRegistry(["custom_computer_action"]),
    )

    with pytest.raises(ParseValidationError, match="missing metadata"):
        validator.validate_metadata("custom_computer_action", None)


def test_validate_metadata_accepts_trimmed_metadata_for_category_based_computer_tool():
    validator, _metrics = _make_validator_for_registry(
        CustomComputerRegistry(["custom_computer_action"]),
    )
    metadata = {
        "description": " screen ",
        "explanation": " click ",
        "expectation": " opens ",
    }

    validator.validate_metadata("custom_computer_action", metadata)

    assert metadata == {
        "description": "screen",
        "explanation": "click",
        "expectation": "opens",
    }


def test_validate_metadata_ignores_non_computer_tool_metadata():
    validator, _metrics = _make_validator(["read_file"])
    metadata = {"description": "not required for read_file"}

    validator.validate_metadata("read_file", metadata)

    assert metadata == {"description": "not required for read_file"}


def test_get_valid_tool_names_deduplicates_registry_values():
    validator, _metrics = _make_validator(["read_file", "read_file", "replace"])

    assert validator._get_valid_tool_names() == [
        "get_open_windows",
        "get_system_stats",
        "read_file",
        "replace",
        "run_shell_command",
        "system_use",
    ]


def test_get_valid_tool_names_returns_sorted_output():
    validator, _metrics = _make_validator({"replace", "read_file"})

    assert validator._get_valid_tool_names() == [
        "get_open_windows",
        "get_system_stats",
        "read_file",
        "replace",
        "run_shell_command",
        "system_use",
    ]


def test_validate_tool_call_uses_compact_json_size_for_nested_params():
    limits = SecurityLimits(max_parameter_value_size=13)
    validator, _metrics = _make_validator_for_registry(DummyRegistry(["read_file"]), limits=limits)

    # Compact JSON length is 13: {"a":1,"b":2}
    validator.validate_tool_call("read_file", {"payload": {"a": 1, "b": 2}})


def test_serialized_param_size_returns_none_for_unserializable_payload():
    size = ToolCallValidator._serialized_param_size({"unsupported": {1, 2, 3}})

    assert size is None


def test_validate_tool_call_whitelist_error_truncates_sorted_tool_display():
    tool_names = [f"tool_{index:02d}" for index in range(20, 0, -1)]
    validator, _metrics = _make_validator(tool_names)
    # Keep this unit deterministic regardless of dev tool-selection config.
    validator._dev_tool_selection = None

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


def test_validate_tool_call_invalidates_cache_when_dev_selection_changes():
    registry = CountingRegistry(["read_file"])
    validator, _metrics = _make_validator_for_registry(registry)
    validator._dev_tool_selection = None

    validator.validate_tool_call("read_file", {"file_path": "/tmp/a"})
    assert registry.calls == 1

    validator._dev_tool_selection = ToolSelection(
        enabled=True,
        mode="allowlist",
        tools=frozenset({"read_file"}),
    )
    validator.validate_tool_call("read_file", {"file_path": "/tmp/b"})
    assert registry.calls == 2


def test_validate_tool_call_accepts_legacy_mouse_name_when_unified_computer_use_is_registered():
    validator, _metrics = _make_validator(["computer_use"])

    validator.validate_tool_call(
        "mouse_control",
        {"action": "click", "x": 10, "y": 20},
    )


def test_get_valid_tool_names_expands_unified_computer_use_to_legacy_subtools():
    validator, _metrics = _make_validator(["computer_use", "read_file"])

    names = validator._get_valid_tool_names()

    assert names == [
        "computer_use",
        "get_open_windows",
        "get_system_stats",
        "keyboard_control",
        "mouse_control",
        "read_file",
        "replace",
        "run_shell_command",
        "screenshot",
        "scroll_control",
        "switch_tab",
        "system_use",
        "wait",
    ]


def test_validate_tool_call_accepts_legacy_system_name_when_unified_system_use_is_registered():
    validator, _metrics = _make_validator(["system_use"])

    validator.validate_tool_call(
        "read_file",
        {"file_path": "/tmp/a", "explanation": "inspect file"},
    )
