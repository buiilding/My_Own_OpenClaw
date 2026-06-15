"""Covers prompt constructor utils behavior in the backend test suite."""

import base64
import io

import pytest
from PIL import Image

from backend.src.core.config.models import AppConfig, SecurityLimits
from backend.src.core.infrastructure.cache_manager import CacheManager
from backend.src.core.infrastructure.error_types import InputSizeLimitError
from backend.src.core.messages.structures import StoredMessage
from backend.src.core.observability.trust_boundary_metrics import MetricsService
from backend.src.core.types.enums import MessageRole, MessageType
from backend.src.llm.prompts.prompt_constructor import PromptConstructor
from backend.src.tools.registry import ToolRegistry
from backend.src.tools.remote import RemoteMouseTool


class DummyRegistry:
    def __init__(self, schemas=None):
        self._schemas = schemas or []

    def get_function_declarations(self):
        return self._schemas


class DummyStoredQuery:
    def __init__(self, user_query_raw):
        self.user_query_raw = user_query_raw


class DummyStoredEntry:
    def __init__(self, message_type):
        self.message_type = message_type


class DummyHistory:
    def __init__(self, history, user_query_raw, message_types):
        self._history = history
        self.last_user_query = (
            DummyStoredQuery(user_query_raw) if user_query_raw is not None else None
        )
        self._stored_entries = [
            DummyStoredEntry(msg_type) for msg_type in message_types
        ]

    def get_history(self):
        return self._history

    def get_stored_messages(self):
        return self._stored_entries


def _make_constructor(
    tool_schemas=None,
    config=None,
    metrics_service=None,
    artifact_store_cls=None,
):
    kwargs = {}
    if artifact_store_cls is not None:
        kwargs["artifact_store_cls"] = artifact_store_cls
    return PromptConstructor(
        tool_registry=DummyRegistry(tool_schemas),
        config=config or AppConfig(),
        metrics_service=metrics_service or MetricsService(),
        system_prompt="system",
        **kwargs,
    )


def _image_base64(width=8, height=8, color=(20, 120, 220), image_format="PNG"):
    image = Image.new("RGB", (width, height), color)
    buffer = io.BytesIO()
    image.save(buffer, format=image_format)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _png_base64(width=8, height=8, color=(20, 120, 220)):
    return _image_base64(width=width, height=height, color=color, image_format="PNG")


def _decoded_image_bytes(data_url: str) -> bytes:
    return base64.b64decode(data_url.split(",", 1)[1])


def test_extract_xml_tag_handles_attributes_with_gt_character():
    constructor = _make_constructor()
    content = (
        '<system_context code="if a > b: c" note="x">' "payload" "</system_context>"
    )

    extracted = constructor._extract_xml_tag(content, "system_context")

    assert extracted == content


def test_extract_xml_tag_content_returns_stripped_inner_text():
    constructor = _make_constructor()
    content = '<active_window title="a > b">\n' "  My App  \n" "</active_window>"

    extracted = constructor._extract_xml_tag_content(content, "active_window")

    assert extracted == "My App"


def test_format_user_message_content_adds_tool_schemas_only_for_first_message():
    tool_schemas = [
        {
            "type": "function",
            "name": "read_file",
            "parameters": {"type": "object"},
        }
    ]
    constructor = _make_constructor(tool_schemas)

    first_content = constructor.format_user_message_content(
        message_content="<user_query>hello</user_query>",
        query="hello",
        is_first_message=True,
    )
    later_content = constructor.format_user_message_content(
        message_content="<user_query>hello</user_query>",
        query="hello",
        is_first_message=False,
    )

    assert first_content == "<user_query>hello</user_query>"
    assert later_content == "<user_query>hello</user_query>"
    assert "<tool_schemas>" not in first_content
    assert "<tool_schemas>" not in later_content


def test_format_user_message_content_respects_allowlist_for_tool_schemas():
    constructor = PromptConstructor(
        tool_registry=DummyRegistry(
            [
                {
                    "type": "function",
                    "name": "read_file",
                    "parameters": {"type": "object"},
                },
                {
                    "type": "function",
                    "name": "secret_tool",
                    "parameters": {"type": "object"},
                },
            ]
        ),
        config=AppConfig(interaction_mode="chat"),
        metrics_service=MetricsService(),
        system_prompt="system",
    )

    provider_prompt = constructor.build_provider_prompt(None, include_tools=True)

    assert [schema["name"] for schema in provider_prompt.tool_schemas] == ["read_file"]


def test_build_provider_prompt_stamps_client_prompt_layer_metadata_summary():
    constructor = _make_constructor()
    constructor.client_prompt_layers = [
        {
            "id": "skill.review",
            "type": "extension_skill",
            "priority": 20,
            "content": "Lead with risks.",
            "revision": "rev-1",
            "source_path": "skills/review/SKILL.md",
        }
    ]

    provider_prompt = constructor.build_provider_prompt(None, include_tools=True)

    prompt_messages = provider_prompt.messages
    metadata = provider_prompt.metadata
    assert "Lead with risks." in prompt_messages[1]["content"]
    assert metadata.client_prompt_layer_summary == {
        "count": 1,
        "ids": ["skill.review"],
        "revisions": ["rev-1"],
    }
    assert metadata.client_prompt_layers == [
        {
            "id": "skill.review",
            "type": "extension_skill",
            "priority": 20,
            "content": "Lead with risks.",
            "revision": "rev-1",
            "source_path": "skills/review/SKILL.md",
        }
    ]


def test_format_user_message_content_filters_mouse_coordinate_methods(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    config_path = tmp_path / "tool_selection.toml"
    config_path.write_text(
        (
            "enabled = true\n"
            'mode = "allowlist"\n'
            'tools = ["mouse_control"]\n'
            "[tool_options.mouse_control]\n"
            'enabled_coordinate_methods = ["manual"]\n'
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("WINDIEOS_DEV_TOOL_SELECTION_PATH", str(config_path))

    constructor = PromptConstructor(
        tool_registry=DummyRegistry([RemoteMouseTool().get_json_schema()]),
        config=AppConfig(interaction_mode="agent"),
        metrics_service=MetricsService(),
        system_prompt="system",
    )

    provider_prompt = constructor.build_provider_prompt(None, include_tools=True)
    mouse_schema = provider_prompt.tool_schemas[0]

    args_props = mouse_schema["parameters"]["properties"]
    method_schema = args_props["find_coordinates_by"]

    assert method_schema["type"] == "string"
    assert method_schema["enum"] == ["manual"]
    assert "x" in args_props
    assert "y" in args_props
    assert "ocr_text" not in args_props
    assert "source_description" not in args_props
    assert "destination_description" not in args_props
    assert "model_name" not in args_props


def test_build_provider_prompt_populates_user_message_metadata_from_history():
    constructor = _make_constructor(
        [
            {
                "type": "function",
                "name": "read_file",
                "parameters": {"type": "object"},
            }
        ]
    )
    history = DummyHistory(
        history=[
            {
                "role": MessageRole.USER.value,
                "content": "<user_query>open file</user_query>",
            }
        ],
        user_query_raw="open file",
        message_types=[MessageType.USER_QUERY],
    )

    provider_prompt = constructor.build_provider_prompt(history, include_tools=True)

    prompt_messages = provider_prompt.messages
    tool_schemas = provider_prompt.tool_schemas
    metadata = provider_prompt.metadata
    assert prompt_messages == [
        {"role": MessageRole.SYSTEM.value, "content": "system"},
        *history.get_history(),
    ]
    assert tool_schemas == [
        {
            "type": "function",
            "name": "read_file",
            "parameters": {"type": "object"},
        }
    ]
    assert metadata.user_message_metadata is not None
    assert metadata.user_message_metadata.original_query == "open file"
    assert metadata.user_message_metadata.context_type == "initial"
    assert metadata.user_message_metadata.active_window == "Unknown"
    assert metadata.user_message_metadata.injected_context == ""


def test_build_provider_prompt_returns_aligned_provider_payload():
    constructor = _make_constructor()
    history = DummyHistory(
        history=[
            {"role": MessageRole.SYSTEM.value, "content": "rehydrated system"},
            {
                "role": MessageRole.USER.value,
                "content": "<user_query>open file</user_query>",
            },
        ],
        user_query_raw="open file",
        message_types=[MessageType.USER_QUERY],
    )

    provider_prompt = constructor.build_provider_prompt(history, include_tools=False)

    assert provider_prompt.messages[0] == {
        "role": MessageRole.SYSTEM.value,
        "content": "rehydrated system",
    }
    assert provider_prompt.messages[1] == {
        "role": MessageRole.USER.value,
        "content": "<user_query>open file</user_query>",
    }
    assert provider_prompt.tool_schemas == []
    assert provider_prompt.metadata.system_prompt == "rehydrated system"


def test_build_provider_prompt_sets_sequential_context_when_multiple_user_queries():
    constructor = _make_constructor()
    history = DummyHistory(
        history=[
            {"role": MessageRole.USER.value, "content": "<user_query>q1</user_query>"},
            {"role": MessageRole.USER.value, "content": "<user_query>q2</user_query>"},
        ],
        user_query_raw="q2",
        message_types=[MessageType.USER_QUERY, MessageType.USER_QUERY],
    )

    provider_prompt = constructor.build_provider_prompt(history, include_tools=False)

    metadata = provider_prompt.metadata
    assert metadata.user_message_metadata is not None
    assert metadata.user_message_metadata.context_type == "sequential"
    assert metadata.user_message_metadata.full_content == "<user_query>q2</user_query>"


def test_build_provider_prompt_returns_empty_history_and_no_user_metadata_without_store():
    constructor = _make_constructor()

    provider_prompt = constructor.build_provider_prompt(None, include_tools=False)

    assert provider_prompt.messages == [
        {"role": MessageRole.SYSTEM.value, "content": "system"}
    ]
    assert provider_prompt.tool_schemas == []
    assert provider_prompt.metadata.user_message_metadata is None


def test_build_provider_prompt_prepends_applicable_agents_md_context(tmp_path):
    repo_root = tmp_path / "repo"
    nested_dir = repo_root / "apps" / "desktop"
    nested_dir.mkdir(parents=True)
    (repo_root / ".git").mkdir()
    (repo_root / "AGENTS.md").write_text("root instructions", encoding="utf-8")
    (repo_root / "apps" / "AGENTS.md").write_text("apps instructions", encoding="utf-8")

    constructor = _make_constructor()
    constructor.workspace_path = str(nested_dir)
    history = DummyHistory(
        history=[
            {
                "role": MessageRole.USER.value,
                "content": "<user_query>open file</user_query>",
            }
        ],
        user_query_raw="open file",
        message_types=[MessageType.USER_QUERY],
    )

    provider_prompt = constructor.build_provider_prompt(
        history,
        include_tools=False,
    )

    prompt_messages = provider_prompt.messages
    assert [message["role"] for message in prompt_messages[:3]] == [
        "system",
        "user",
        "user",
    ]
    assert prompt_messages[1]["content"] == (
        f"# AGENTS.md instructions for {repo_root}\n\n"
        "<INSTRUCTIONS>\nroot instructions\n</INSTRUCTIONS>"
    )
    assert prompt_messages[2]["content"] == (
        f"# AGENTS.md instructions for {repo_root / 'apps'}\n\n"
        "<INSTRUCTIONS>\napps instructions\n</INSTRUCTIONS>"
    )
    assert prompt_messages[3] == history.get_history()[0]


def test_get_prompt_token_count_uses_contextual_agents_messages(monkeypatch, tmp_path):
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".git").mkdir()
    (repo_root / "AGENTS.md").write_text("repo instructions", encoding="utf-8")

    constructor = _make_constructor()
    constructor.workspace_path = str(repo_root)
    history = DummyHistory(
        history=[
            {
                "role": MessageRole.USER.value,
                "content": "<user_query>open file</user_query>",
            }
        ],
        user_query_raw="open file",
        message_types=[MessageType.USER_QUERY],
    )

    captured = {}

    class _FakeTokenService:
        def count_tokens(self, messages, model, *, tools=None):
            captured["messages"] = messages
            captured["model"] = model
            captured["tools"] = tools
            return len(messages) * 10

    monkeypatch.setattr(
        "backend.src.services.token_service.get_token_service",
        lambda: _FakeTokenService(),
    )

    count = constructor.get_prompt_token_count(history, model_id="model-a")

    assert count == 30
    assert captured["model"] == "model-a"
    assert captured["messages"][0] == {
        "role": MessageRole.SYSTEM.value,
        "content": "system",
    }
    assert captured["messages"][1]["content"].startswith(
        "# AGENTS.md instructions for "
    )
    assert captured["messages"][2] == history.get_history()[0]
    assert captured["tools"] == []


def test_get_prompt_token_count_includes_tool_schemas(monkeypatch):
    tool_schemas = [
        {
            "type": "function",
            "name": "read_file",
            "parameters": {"type": "object"},
        }
    ]
    constructor = _make_constructor(tool_schemas)
    history = DummyHistory(
        history=[
            {
                "role": MessageRole.SYSTEM.value,
                "content": "system",
            },
            {
                "role": MessageRole.USER.value,
                "content": "<user_query>open file</user_query>",
            },
        ],
        user_query_raw="open file",
        message_types=[MessageType.USER_QUERY],
    )

    captured = {}

    class _FakeTokenService:
        def count_tokens(self, messages, model, *, tools=None):
            captured["messages"] = messages
            captured["model"] = model
            captured["tools"] = tools
            return len(messages) * 10 + len(tools or []) * 100

    monkeypatch.setattr(
        "backend.src.services.token_service.get_token_service",
        lambda: _FakeTokenService(),
    )

    count = constructor.get_prompt_token_count(history, model_id="model-a")

    assert count == 120
    assert captured["model"] == "model-a"
    assert captured["messages"] == history.get_history()
    assert captured["tools"] == tool_schemas


def test_build_provider_prompt_prefers_injected_repo_instruction_messages_over_workspace_lookup(
    tmp_path,
):
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".git").mkdir()
    (repo_root / "AGENTS.md").write_text(
        "local instructions that remote backend cannot read", encoding="utf-8"
    )

    constructor = _make_constructor()
    constructor.workspace_path = str(repo_root / "missing-on-host")
    constructor.repo_instruction_messages = [
        {
            "role": "user",
            "content": "# AGENTS.md instructions for /Users/peter/project\n\n<INSTRUCTIONS>\ninjected instructions\n</INSTRUCTIONS>",
        }
    ]
    history = DummyHistory(
        history=[
            {
                "role": MessageRole.USER.value,
                "content": "<user_query>open file</user_query>",
            }
        ],
        user_query_raw="open file",
        message_types=[MessageType.USER_QUERY],
    )

    provider_prompt = constructor.build_provider_prompt(
        history,
        include_tools=False,
    )

    prompt_messages = provider_prompt.messages
    assert prompt_messages[0] == {"role": MessageRole.SYSTEM.value, "content": "system"}
    assert prompt_messages[1] == constructor.repo_instruction_messages[0]
    assert prompt_messages[2] == history.get_history()[0]


def test_build_provider_prompt_rejects_oversized_stored_message_content():
    metrics_service = MetricsService()
    constructor = _make_constructor(
        config=AppConfig(
            security_limits=SecurityLimits(
                max_message_history_size=10,
                max_message_content_size=12,
                max_prompt_size=1024,
            )
        ),
        metrics_service=metrics_service,
    )
    history = DummyHistory(
        history=[{"role": MessageRole.USER.value, "content": "x" * 13}],
        user_query_raw="x" * 13,
        message_types=[MessageType.USER_QUERY],
    )

    with pytest.raises(InputSizeLimitError) as exc_info:
        constructor.build_provider_prompt(history, include_tools=False)

    assert exc_info.value.actual_size == 13
    stats = metrics_service.get_all_metrics()["prompt_constructor"]
    assert stats["size_limit_violations"] == 1


def test_build_provider_prompt_projects_artifact_image_refs_without_text_content_overflow():
    calls = []

    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, image_ref, *, owner_user_id=None):
            calls.append((image_ref, owner_user_id))
            return _png_base64()

    constructor = _make_constructor(
        config=AppConfig(
            security_limits=SecurityLimits(
                max_message_history_size=10,
                max_message_content_size=40,
                max_prompt_size=4096,
                max_prompt_image_bytes=16 * 1024,
            )
        ),
        artifact_store_cls=_ArtifactStore,
    )
    message = StoredMessage(
        role=MessageRole.USER,
        content="<user_query>look</user_query>",
        message_type=MessageType.USER_QUERY,
        image_refs=["artifact-1", "artifact-2"],
        image_owner_user_id="user-1",
    )

    provider_prompt = constructor.build_provider_prompt(
        [message],
        include_tools=False,
    )

    content = provider_prompt.messages[-1]["content"]
    assert calls == [("artifact-1", "user-1"), ("artifact-2", "user-1")]
    assert content[0] == {"type": "text", "text": "<user_query>look</user_query>"}
    assert [part["type"] for part in content[1:]] == ["image_url", "image_url"]
    assert all(
        part["image_url"]["url"].startswith("data:image/png;base64,")
        for part in content[1:]
    )


def test_build_provider_prompt_accepts_two_large_original_artifact_refs_after_projection():
    original_images = {
        "artifact-1": _image_base64(width=900, height=900, image_format="BMP"),
        "artifact-2": _image_base64(width=900, height=900, image_format="BMP"),
    }
    assert sum(len(base64.b64decode(image)) for image in original_images.values()) > (
        1024 * 1024
    )

    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, image_ref, *, owner_user_id=None):
            return original_images[image_ref]

    max_image_bytes = 256 * 1024
    constructor = _make_constructor(
        config=AppConfig(
            security_limits=SecurityLimits(
                max_message_history_size=10,
                max_message_content_size=64,
                max_prompt_size=2 * 1024 * 1024,
                max_prompt_image_bytes=max_image_bytes,
                max_prompt_image_dimension=1024,
            )
        ),
        artifact_store_cls=_ArtifactStore,
    )
    message = StoredMessage(
        role=MessageRole.USER,
        content="<user_query>review these</user_query>",
        message_type=MessageType.USER_QUERY,
        image_refs=["artifact-1", "artifact-2"],
    )

    provider_prompt = constructor.build_provider_prompt(
        [message],
        include_tools=False,
    )

    image_parts = provider_prompt.messages[-1]["content"][1:]
    assert len(image_parts) == 2
    assert all(
        part["image_url"]["url"].startswith("data:image/jpeg;base64,")
        for part in image_parts
    )
    assert all(
        len(_decoded_image_bytes(part["image_url"]["url"])) <= max_image_bytes
        for part in image_parts
    )


def test_build_provider_prompt_resizes_artifact_images_to_prompt_image_budget():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, _image_ref, *, owner_user_id=None):
            return _png_base64(width=3000, height=2400)

    max_image_bytes = 120 * 1024
    constructor = _make_constructor(
        config=AppConfig(
            security_limits=SecurityLimits(
                max_message_history_size=10,
                max_message_content_size=100,
                max_prompt_size=2 * 1024 * 1024,
                max_prompt_image_bytes=max_image_bytes,
                max_prompt_image_dimension=1024,
            )
        ),
        artifact_store_cls=_ArtifactStore,
    )
    message = StoredMessage(
        role=MessageRole.USER,
        content="<user_query>look</user_query>",
        message_type=MessageType.USER_QUERY,
        image_refs=["large-artifact"],
    )

    provider_prompt = constructor.build_provider_prompt(
        [message],
        include_tools=False,
    )

    data_url = provider_prompt.messages[-1]["content"][1]["image_url"]["url"]
    image_bytes = _decoded_image_bytes(data_url)
    image = Image.open(io.BytesIO(image_bytes))
    assert len(image_bytes) <= max_image_bytes
    assert max(image.size) <= 1024


def test_build_provider_prompt_rejects_artifact_image_that_cannot_fit_budget():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, _image_ref, *, owner_user_id=None):
            return _png_base64(width=256, height=256)

    constructor = _make_constructor(
        config=AppConfig(
            security_limits=SecurityLimits(
                max_message_history_size=10,
                max_message_content_size=100,
                max_prompt_size=4096,
                max_prompt_image_bytes=10,
            )
        ),
        artifact_store_cls=_ArtifactStore,
    )
    message = StoredMessage(
        role=MessageRole.USER,
        content="<user_query>look</user_query>",
        message_type=MessageType.USER_QUERY,
        image_refs=["too-small-budget"],
    )

    with pytest.raises(InputSizeLimitError) as exc_info:
        constructor.build_provider_prompt([message], include_tools=False)

    assert exc_info.value.metadata["check"] == "prompt_image_size"
    assert exc_info.value.metadata["image_ref"] == "too-small-budget"


def test_build_provider_prompt_rejects_oversized_aggregate_prompt():
    constructor = _make_constructor(
        config=AppConfig(
            security_limits=SecurityLimits(
                max_message_history_size=10,
                max_message_content_size=100,
                max_prompt_size=90,
            )
        )
    )
    history = DummyHistory(
        history=[
            {"role": MessageRole.USER.value, "content": "x" * 40},
            {"role": MessageRole.ASSISTANT.value, "content": "y" * 40},
        ],
        user_query_raw="x" * 40,
        message_types=[MessageType.USER_QUERY],
    )

    with pytest.raises(InputSizeLimitError) as exc_info:
        constructor.build_provider_prompt(history, include_tools=False)

    assert exc_info.value.max_size == 90


def test_build_provider_prompt_rejects_too_many_prompt_messages():
    constructor = _make_constructor(
        config=AppConfig(
            security_limits=SecurityLimits(
                max_message_history_size=1,
                max_message_content_size=100,
                max_prompt_size=1024,
            )
        )
    )
    history = DummyHistory(
        history=[
            {"role": MessageRole.USER.value, "content": "first"},
            {"role": MessageRole.ASSISTANT.value, "content": "second"},
        ],
        user_query_raw="first",
        message_types=[MessageType.USER_QUERY],
    )

    with pytest.raises(InputSizeLimitError) as exc_info:
        constructor.build_provider_prompt(history, include_tools=False)

    assert exc_info.value.actual_size == 3
    assert exc_info.value.max_size == 1


def test_build_provider_prompt_rejects_oversized_agents_md_instruction(tmp_path):
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".git").mkdir()
    (repo_root / "AGENTS.md").write_text("repo instructions " * 20, encoding="utf-8")

    constructor = _make_constructor(
        config=AppConfig(
            security_limits=SecurityLimits(
                max_message_history_size=10,
                max_message_content_size=120,
                max_prompt_size=4096,
            )
        )
    )
    constructor.workspace_path = str(repo_root)

    with pytest.raises(InputSizeLimitError) as exc_info:
        constructor.build_provider_prompt(None, include_tools=False)

    assert exc_info.value.boundary_name == "prompt_constructor"


def test_build_provider_prompt_allowlisting_mouse_control_yields_single_direct_schema():
    registry = ToolRegistry(
        config=AppConfig(tool_allowlist=["mouse_control"]), cache_manager=CacheManager()
    )
    constructor = PromptConstructor(
        tool_registry=registry,
        config=AppConfig(tool_allowlist=["mouse_control"]),
        metrics_service=MetricsService(),
        system_prompt="system",
    )

    provider_prompt = constructor.build_provider_prompt(None, include_tools=True)

    schemas = provider_prompt.tool_schemas
    assert [schema["name"] for schema in schemas] == ["mouse_control"]
    parameters = schemas[0]["parameters"]
    assert parameters["properties"]["action"]["enum"] == [
        "click",
        "double_click",
        "right_click",
        "move",
        "drag",
    ]


def test_build_provider_prompt_real_registry_prunes_live_model_facing_grounding_schema(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    config_path = tmp_path / "tool_selection.toml"
    config_path.write_text(
        (
            "enabled = true\n"
            'mode = "allowlist"\n'
            'tools = ["mouse_control", "scroll_control"]\n'
            "[tool_options.mouse_control]\n"
            'enabled_coordinate_methods = ["manual"]\n'
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("WINDIEOS_DEV_TOOL_SELECTION_PATH", str(config_path))

    config = AppConfig(tool_allowlist=["mouse_control", "scroll_control"])
    registry = ToolRegistry(config=config, cache_manager=CacheManager())
    constructor = PromptConstructor(
        tool_registry=registry,
        config=config,
        metrics_service=MetricsService(),
        system_prompt="system",
    )

    provider_prompt = constructor.build_provider_prompt(None, include_tools=True)

    schemas = provider_prompt.tool_schemas
    assert [schema["name"] for schema in schemas] == ["mouse_control", "scroll_control"]

    mouse_props = schemas[0]["parameters"]["properties"]
    assert mouse_props["find_coordinates_by"]["enum"] == ["manual"]
    assert mouse_props["drag_to_find_coordinates_by"]["enum"] == ["manual"]
    assert (
        mouse_props["find_coordinates_by"]["description"]
        == "Coordinate targeting method."
    )
    assert mouse_props["drag_to_find_coordinates_by"]["description"] == (
        "Drag destination targeting method."
    )
    assert "ocr_text" not in mouse_props
    assert "source_description" not in mouse_props
    assert "drag_to_ocr_text" not in mouse_props
    assert "destination_description" not in mouse_props

    scroll_props = schemas[1]["parameters"]["properties"]
    assert scroll_props["find_coordinates_by"]["enum"] == ["manual"]
    assert "ocr_text" not in scroll_props
    assert "source_description" not in scroll_props


def test_build_provider_prompt_openai_projection_filters_grounded_tools_after_projection(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    config_path = tmp_path / "tool_selection.toml"
    config_path.write_text(
        (
            "enabled = true\n"
            'mode = "allowlist"\n'
            'tools = ["mouse_control", "keyboard_control", "screenshot", "scroll_control", "wait"]\n'
            "[tool_options.mouse_control]\n"
            'enabled_coordinate_methods = ["manual", "ocr"]\n'
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("WINDIEOS_DEV_TOOL_SELECTION_PATH", str(config_path))

    config = AppConfig(
        interaction_mode="agent",
        model_provider="openai",
        tool_allowlist=[
            "mouse_control",
            "keyboard_control",
            "screenshot",
            "scroll_control",
            "wait",
        ],
    )
    registry = ToolRegistry(config=config, cache_manager=CacheManager())
    constructor = PromptConstructor(
        tool_registry=registry,
        config=config,
        metrics_service=MetricsService(),
        system_prompt="system",
    )

    provider_prompt = constructor.build_provider_prompt(None, include_tools=True)

    schema_names = [schema["name"] for schema in provider_prompt.tool_schemas]
    assert schema_names == [
        "mouse_control",
        "keyboard_control",
        "screenshot",
        "scroll_control",
        "wait",
    ]


def test_build_provider_prompt_allowlisting_read_file_yields_single_direct_schema():
    registry = ToolRegistry(
        config=AppConfig(tool_allowlist=["read_file"]), cache_manager=CacheManager()
    )
    constructor = PromptConstructor(
        tool_registry=registry,
        config=AppConfig(tool_allowlist=["read_file"]),
        metrics_service=MetricsService(),
        system_prompt="system",
    )

    provider_prompt = constructor.build_provider_prompt(None, include_tools=True)

    schemas = provider_prompt.tool_schemas
    assert [schema["name"] for schema in schemas] == ["read_file"]
    parameters = schemas[0]["parameters"]
    assert "file_path" in parameters["properties"]


def test_build_provider_prompt_keeps_direct_computer_tools_for_openai_even_with_image_history():
    config = AppConfig(
        model_provider="openai",
        tool_allowlist=[
            "mouse_control",
            "keyboard_control",
            "screenshot",
            "scroll_control",
            "switch_window",
            "wait",
        ],
    )
    registry = ToolRegistry(config=config, cache_manager=CacheManager())
    constructor = PromptConstructor(
        tool_registry=registry,
        config=config,
        metrics_service=MetricsService(),
        system_prompt="system",
    )
    history = DummyHistory(
        history=[
            {
                "role": MessageRole.USER.value,
                "content": [
                    {"type": "text", "text": "compare these screenshots"},
                    {
                        "type": "image_url",
                        "image_url": {"url": "data:image/png;base64,AAA"},
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": "data:image/png;base64,BBB"},
                    },
                ],
            }
        ],
        user_query_raw="compare these screenshots",
        message_types=[MessageType.USER_QUERY],
    )

    provider_prompt = constructor.build_provider_prompt(
        history,
        include_tools=True,
    )

    assert [schema["name"] for schema in provider_prompt.tool_schemas] == [
        "mouse_control",
        "keyboard_control",
        "screenshot",
        "scroll_control",
        "switch_window",
        "wait",
    ]
