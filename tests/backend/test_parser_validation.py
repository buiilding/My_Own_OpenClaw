import pytest

from backend.src.core.config.models import AppConfig, SecurityLimits
from backend.src.core.infrastructure.exceptions import ParseValidationError
from backend.src.llm.parser_validation import ToolCallValidator


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


def test_validate_tool_call_filters_non_string_tool_names():
    validator, _metrics = _make_validator(["read_file", None, 123])

    # Should not crash on non-string names in registry; valid call still passes.
    validator.validate_tool_call("read_file", {"file_path": "/tmp/x"})


def test_validate_tool_call_applies_chat_mode_allowlist():
    validator, _metrics = _make_validator(["read_file", "secret_tool"], interaction_mode="chat")

    with pytest.raises(ParseValidationError, match="not in whitelist"):
        validator.validate_tool_call("secret_tool", {})


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
