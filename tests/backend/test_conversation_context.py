"""Covers conversation context behavior in the backend test suite."""

from backend.src.agent.llm.conversation_context import ConversationContext
from backend.src.agent.session.state import ConversationHistory
from backend.src.core.config.models import AppConfig
from backend.src.core.observability.trust_boundary_metrics import MetricsService
from backend.src.llm.prompts.prompt_constructor import PromptConstructor


class DummyRegistry:
    def __init__(self, schemas=None):
        self._schemas = schemas or []

    def get_function_declarations(self):
        return self._schemas


def test_get_prompt_rebuilds_static_prompt_layers_after_first_iteration(monkeypatch):
    monkeypatch.setattr(
        "backend.src.tools.tool_policy.load_tool_selection", lambda: None
    )
    constructor = PromptConstructor(
        tool_registry=DummyRegistry(
            [
                {
                    "type": "function",
                    "name": "read_file",
                    "description": "Read a file.",
                    "parameters": {"type": "object", "properties": {}},
                }
            ]
        ),
        config=AppConfig(agent_available_tools=["read_file"]),
        metrics_service=MetricsService(),
        system_prompt="system",
    )
    constructor.repo_instruction_messages = [
        {"role": "user", "content": "# AGENTS.md\n\nrepo rules"}
    ]
    constructor.client_prompt_layers = [
        {
            "id": "runtime",
            "type": "custom",
            "priority": 50,
            "content": "runtime rules",
        }
    ]
    history = ConversationHistory(system_prompt="system")
    history.add_user_message(
        "<user_query>open file</user_query>", user_query_raw="open file"
    )

    context = ConversationContext(prompt_constructor=constructor, history=history)

    first_prompt, first_tools, first_metadata = context.get_prompt(iteration=1)
    history.add_assistant_message("I need a file path.")
    second_prompt, second_tools, second_metadata = context.get_prompt(iteration=2)

    assert [message["role"] for message in first_prompt[:4]] == [
        "system",
        "user",
        "user",
        "user",
    ]
    assert first_prompt[1]["content"] == "# AGENTS.md\n\nrepo rules"
    assert first_prompt[2]["content"].startswith("# Client prompt layer: runtime")
    assert first_tools == [
        {
            "type": "function",
            "name": "read_file",
            "description": "Read a file.",
            "parameters": {"type": "object", "properties": {}},
        }
    ]

    assert second_prompt[0] == {"role": "system", "content": "system"}
    assert second_prompt[1]["content"] == "# AGENTS.md\n\nrepo rules"
    assert second_prompt[2]["content"].startswith("# Client prompt layer: runtime")
    assert second_prompt[-1] == {"role": "assistant", "content": "I need a file path."}
    assert second_tools is first_tools
    assert second_metadata is first_metadata
