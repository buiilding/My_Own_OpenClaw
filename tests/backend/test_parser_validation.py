import pytest

from backend.src.core.config.models import AppConfig, SecurityLimits
from backend.src.core.infrastructure.exceptions import ParseValidationError
from backend.src.llm.parser_validation import ToolCallValidator
from backend.src.tools.categorization import ToolDomain


class DummyMetrics:
    def __init__(self):
        self.calls = []

    def record_validation_violation(self, **kwargs):
        self.calls.append(kwargs)


class DummyRegistry:
    def __init__(self, tool_names):
        self._tool_names = tool_names

    def get_tool_names(self):
        return self._tool_names

    def get_tool(self, _name):
        return None


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


def _make_validator(tool_names, interaction_mode="agent"):
    config = AppConfig(
        interaction_mode=interaction_mode,
        security_limits=SecurityLimits(),
    )
    metrics = DummyMetrics()
    validator = ToolCallValidator(
        config=config,
        tool_registry=DummyRegistry(tool_names),
        metrics=metrics,
        limits=config.security_limits,
    )
    return validator, metrics


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
    config_path = tmp_path / "tool_selection.toml"
    config_path.write_text(
        (
            'enabled = true\n'
            'mode = "allowlist"\n'
            'tools = ["mouse_control"]\n'
            "[tool_options.mouse_control]\n"
            'enabled_coordinate_methods = ["manual", "ocr"]\n'
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("WINDIEOS_DEV_TOOL_SELECTION_PATH", str(config_path))

    validator, _metrics = _make_validator(["mouse_control"], interaction_mode="agent")

    with pytest.raises(ParseValidationError, match="find_coordinates_by"):
        validator.validate_tool_call(
            "mouse_control",
            {"action": "click", "find_coordinates_by": "prediction", "description": "submit button"},
        )


def test_validate_tool_call_rejects_implicit_manual_when_manual_disabled(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    config_path = tmp_path / "tool_selection.toml"
    config_path.write_text(
        (
            'enabled = true\n'
            'mode = "allowlist"\n'
            'tools = ["mouse_control"]\n'
            "[tool_options.mouse_control]\n"
            'enabled_coordinate_methods = ["ocr"]\n'
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("WINDIEOS_DEV_TOOL_SELECTION_PATH", str(config_path))

    validator, _metrics = _make_validator(["mouse_control"], interaction_mode="agent")

    with pytest.raises(ParseValidationError, match="find_coordinates_by"):
        validator.validate_tool_call("mouse_control", {"action": "click", "x": 10, "y": 20})


def test_validate_tool_call_accepts_enabled_mouse_ocr_method(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    config_path = tmp_path / "tool_selection.toml"
    config_path.write_text(
        (
            'enabled = true\n'
            'mode = "allowlist"\n'
            'tools = ["mouse_control"]\n'
            "[tool_options.mouse_control]\n"
            'enabled_coordinate_methods = ["ocr"]\n'
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("WINDIEOS_DEV_TOOL_SELECTION_PATH", str(config_path))

    validator, _metrics = _make_validator(["mouse_control"], interaction_mode="agent")
    validator.validate_tool_call(
        "mouse_control",
        {"action": "click", "find_coordinates_by": "ocr", "ocr_text": "Submit"},
    )


def test_validate_tool_call_handles_non_iterable_registry_tool_names():
    config = AppConfig(interaction_mode="agent", security_limits=SecurityLimits())
    metrics = DummyMetrics()
    validator = ToolCallValidator(
        config=config,
        tool_registry=BrokenRegistry(123),
        metrics=metrics,
        limits=config.security_limits,
    )

    with pytest.raises(ParseValidationError, match="not in whitelist"):
        validator.validate_tool_call("read_file", {})


def test_validate_tool_call_handles_string_registry_tool_names():
    config = AppConfig(interaction_mode="agent", security_limits=SecurityLimits())
    metrics = DummyMetrics()
    validator = ToolCallValidator(
        config=config,
        tool_registry=BrokenRegistry("read_file"),
        metrics=metrics,
        limits=config.security_limits,
    )

    with pytest.raises(ParseValidationError, match="Valid tools \\(0\\):"):
        validator.validate_tool_call("read_file", {})


def test_validate_metadata_rejects_whitespace_only_fields_for_computer_tools():
    config = AppConfig(interaction_mode="agent", security_limits=SecurityLimits())
    metrics = DummyMetrics()
    validator = ToolCallValidator(
        config=config,
        tool_registry=ComputerRegistry(["mouse_control"]),
        metrics=metrics,
        limits=config.security_limits,
    )

    with pytest.raises(ParseValidationError, match="missing required metadata field"):
        validator.validate_metadata(
            "mouse_control",
            {
                "description": "   ",
                "explanation": "\n",
                "expectation": "   ",
            },
        )


def test_validate_metadata_accepts_trimmed_nonempty_strings_for_computer_tools():
    config = AppConfig(interaction_mode="agent", security_limits=SecurityLimits())
    metrics = DummyMetrics()
    validator = ToolCallValidator(
        config=config,
        tool_registry=ComputerRegistry(["mouse_control"]),
        metrics=metrics,
        limits=config.security_limits,
    )

    validator.validate_metadata(
        "mouse_control",
        {
            "description": " current screen ",
            "explanation": " click submit ",
            "expectation": " modal opens ",
        },
    )


def test_get_valid_tool_names_deduplicates_registry_values():
    validator, _metrics = _make_validator(["read_file", "read_file", "write_file"])

    assert validator._get_valid_tool_names() == ["read_file", "write_file"]


def test_get_valid_tool_names_returns_sorted_output():
    validator, _metrics = _make_validator({"write_file", "read_file"})

    assert validator._get_valid_tool_names() == ["read_file", "write_file"]


def test_validate_tool_call_uses_compact_json_size_for_nested_params():
    limits = SecurityLimits(max_parameter_value_size=13)
    config = AppConfig(interaction_mode="agent", security_limits=limits)
    metrics = DummyMetrics()
    validator = ToolCallValidator(
        config=config,
        tool_registry=DummyRegistry(["read_file"]),
        metrics=metrics,
        limits=limits,
    )

    # Compact JSON length is 13: {"a":1,"b":2}
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
