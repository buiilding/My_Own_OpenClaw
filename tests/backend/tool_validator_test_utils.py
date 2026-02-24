from backend.src.core.config.models import AppConfig, SecurityLimits
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


def make_tool_call_validator(tool_registry, interaction_mode="agent", limits=None):
    resolved_limits = limits or SecurityLimits()
    config = AppConfig(
        interaction_mode=interaction_mode,
        security_limits=resolved_limits,
    )
    metrics = DummyMetrics()
    validator = ToolCallValidator(
        config=config,
        tool_registry=tool_registry,
        metrics=metrics,
        limits=resolved_limits,
    )
    return validator, metrics
