"""Covers web search tool behavior in the backend test suite."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.src.core.config.models import AppConfig, BraveSearchConfig
from backend.src.core.events.streaming_events import WebSearchProgressEvent
from backend.src.tools.web_search.schemas import WebSearchArgs
from backend.src.tools.web_search.tool import WebSearchTool


def _build_tool_context(*, config: AppConfig | None = None, session: object | None = None) -> SimpleNamespace:
    services = {"config": config or AppConfig()}
    if session is not None:
        services["session"] = session
    return SimpleNamespace(services=services)


def test_web_search_tool_build_request_params_sanitizes_domains_and_bounds_count():
    params = WebSearchTool._build_request_params(
        WebSearchArgs(
            query="project alpha latest",
            count=10,
            domains=[" https://example.com ", "bad domain", "sub.example.org"],
            recency_days=3,
        )
    )

    assert params["q"] == "project alpha latest (site:example.com OR site:sub.example.org)"
    assert params["count"] == 10
    assert params["freshness"] == "pw"


def test_web_search_tool_uses_default_brave_env_when_config_env_is_empty(monkeypatch):
    monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "test-brave-key")
    config = AppConfig(brave_search=BraveSearchConfig(api_key_env=""))

    assert WebSearchTool._resolve_api_key(_build_tool_context(config=config)) == "test-brave-key"


@pytest.mark.asyncio
async def test_web_search_tool_returns_normalized_brave_results(monkeypatch):
    tool = WebSearchTool()
    config = AppConfig(
        model_provider="anthropic",
        selected_model_id="claude-sonnet-4-20250514",
    )

    monkeypatch.setattr(tool, "_resolve_api_key", lambda ctx: "test-brave-key")

    async def fake_perform_request(*, api_key, params):
        _ = (api_key, params)
        return {
            "web": {
                "results": [
                    {
                        "url": "https://example.com/a",
                        "title": "Example A",
                        "description": "Snippet A",
                        "age": "2 hours ago",
                    },
                    {
                        "url": "https://example.com/b",
                        "title": "Example B",
                        "description": "Snippet B",
                        "extra_snippets": ["Extra B1", "Extra B2"],
                    },
                ]
            }
        }

    monkeypatch.setattr(tool, "_perform_request", fake_perform_request)

    result = await tool.run(
        WebSearchArgs(query="project alpha latest", count=2),
        _build_tool_context(config=config),
    )

    assert result.success is True
    assert result.data == {
        "query": "project alpha latest",
        "provider": "brave",
        "results": [
            {
                "rank": 1,
                "url": "https://example.com/a",
                "title": "Example A",
                "snippet": "Snippet A",
                "age": "2 hours ago",
            },
            {
                "rank": 2,
                "url": "https://example.com/b",
                "title": "Example B",
                "snippet": "Snippet B",
                "extra_snippets": ["Extra B1", "Extra B2"],
            },
        ],
    }
    assert 'Web search results for "project alpha latest":' in result.output


@pytest.mark.asyncio
async def test_web_search_tool_reports_missing_backend_configuration(monkeypatch):
    monkeypatch.delenv("BRAVE_SEARCH_API_KEY", raising=False)
    tool = WebSearchTool()
    config = AppConfig(
        model_provider="anthropic",
        selected_model_id="claude-sonnet-4-20250514",
    )

    result = await tool.run(
        WebSearchArgs(query="project alpha latest"),
        _build_tool_context(config=config),
    )

    assert result.success is False
    assert result.error == "Brave Search is not configured on the backend."


@pytest.mark.asyncio
async def test_web_search_tool_blocks_disabled_policy_before_brave_execution(monkeypatch):
    tool = WebSearchTool()
    config = AppConfig(
        model_provider="anthropic",
        selected_model_id="claude-sonnet-4-20250514",
        agent_disabled_capabilities=["web_search"],
    )
    monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "test-brave-key")
    perform_request = AsyncMock()
    monkeypatch.setattr(tool, "_perform_request", perform_request)

    result = await tool.run(
        WebSearchArgs(query="project alpha latest"),
        _build_tool_context(config=config),
    )

    assert result.success is False
    assert result.error == "web_search is disabled by the current tool policy."
    perform_request.assert_not_called()


@pytest.mark.asyncio
async def test_web_search_tool_maps_brave_runtime_failures_to_tool_errors(monkeypatch):
    tool = WebSearchTool()
    config = AppConfig(
        model_provider="anthropic",
        selected_model_id="claude-sonnet-4-20250514",
    )

    monkeypatch.setattr(tool, "_resolve_api_key", lambda ctx: "test-brave-key")

    async def fake_perform_request(*, api_key, params):
        _ = (api_key, params)
        raise RuntimeError("Brave Search rate limit exceeded. Try again shortly.")

    monkeypatch.setattr(tool, "_perform_request", fake_perform_request)

    result = await tool.run(
        WebSearchArgs(query="project alpha latest"),
        _build_tool_context(config=config),
    )

    assert result.success is False
    assert result.error == "Brave Search rate limit exceeded. Try again shortly."


@pytest.mark.asyncio
async def test_web_search_tool_routes_to_openai_native_search(monkeypatch):
    tool = WebSearchTool()
    config = AppConfig(
        model_provider="openai",
        selected_model_id="gpt-5.4@@gpt-5-4-none-thinking",
    )
    emitted_progress = []

    class _DummyLLMClient:
        async def get_completion_stream(self, **kwargs):
            assert kwargs["native_web_search_enabled"] is True
            assert kwargs["request_id"] == "req-openai-web-search-1"
            emitted_progress.append("stream-started")
            yield WebSearchProgressEvent(
                text="Searched example.com",
                request_id="req-openai-web-search-1",
            )

        def get_last_stream_response_payload(self):
            return {
                "content": "Native summary from OpenAI",
                "web_search_sources": [
                    {
                        "url": "https://example.com/a",
                        "title": "Example A",
                        "provider": "openai",
                        "rank": 1,
                    },
                    {
                        "url": "https://example.com/b",
                        "title": "Example B",
                        "provider": "openai",
                        "rank": 2,
                    },
                ],
            }

    session = SimpleNamespace(llm_client=_DummyLLMClient())
    tool_context = _build_tool_context(config=config, session=session)
    tool_context.services["tool_request_id"] = "req-openai-web-search-1"
    tool_context.services["emit_streaming_event"] = emitted_progress.append
    result = await tool.run(
        WebSearchArgs(query="project alpha latest", count=2),
        tool_context,
    )

    assert result.success is True
    assert result.data == {
        "query": "project alpha latest",
        "provider": "openai",
        "results": [
            {
                "url": "https://example.com/a",
                "title": "Example A",
                "provider": "openai",
                "rank": 1,
                "query": "project alpha latest",
            },
            {
                "url": "https://example.com/b",
                "title": "Example B",
                "provider": "openai",
                "rank": 2,
                "query": "project alpha latest",
            },
        ],
    }
    assert result.output == "Native summary from OpenAI"
    assert emitted_progress[0] == "stream-started"
    assert emitted_progress[1].text == "Searched example.com"
    assert emitted_progress[1].request_id == "req-openai-web-search-1"


@pytest.mark.asyncio
async def test_web_search_tool_routes_to_gemini_native_search(monkeypatch):
    tool = WebSearchTool()
    config = AppConfig(
        model_provider="gemini",
        selected_model_id="gemini-3-flash-preview@@gemini-3-flash-thinking",
    )

    class _DummyLLMClient:
        async def get_completion_response(self, **kwargs):
            assert kwargs["native_web_search_enabled"] is True
            return {
                "content": "",
                "web_search_sources": [
                    {
                        "url": "https://example.com/g",
                        "title": "Example G",
                        "provider": "gemini",
                        "rank": 1,
                    }
                ],
            }

    session = SimpleNamespace(llm_client=_DummyLLMClient())
    result = await tool.run(
        WebSearchArgs(query="project alpha latest", count=1),
        _build_tool_context(config=config, session=session),
    )

    assert result.success is True
    assert result.data["provider"] == "gemini"
    assert result.data["results"] == [
        {
            "url": "https://example.com/g",
            "title": "Example G",
            "provider": "gemini",
            "rank": 1,
            "query": "project alpha latest",
        }
    ]
    assert 'Web search results for "project alpha latest":' in result.output


@pytest.mark.asyncio
async def test_web_search_tool_extracts_native_sources_from_content_when_metadata_missing():
    tool = WebSearchTool()
    config = AppConfig(
        model_provider="gemini",
        selected_model_id="gemini-3-flash-preview@@gemini-3-flash-thinking",
    )

    class _DummyLLMClient:
        async def get_completion_response(self, **kwargs):
            assert kwargs["native_web_search_enabled"] is True
            return {
                "content": (
                    "## Sources:\n"
                    "1. [Wikipedia: Rachel Green](https://en.wikipedia.org/wiki/Rachel_Green)\n"
                    "2. [Friends Central](https://friends.example.com/rachel-green)\n"
                ),
                "web_search_sources": [],
            }

    session = SimpleNamespace(llm_client=_DummyLLMClient())
    result = await tool.run(
        WebSearchArgs(query="rachel green", count=2),
        _build_tool_context(config=config, session=session),
    )

    assert result.success is True
    assert result.data == {
        "query": "rachel green",
        "provider": "gemini",
        "results": [
            {
                "url": "https://en.wikipedia.org/wiki/Rachel_Green",
                "title": "Wikipedia: Rachel Green",
                "provider": "gemini",
                "rank": 1,
                "query": "rachel green",
            },
            {
                "url": "https://friends.example.com/rachel-green",
                "title": "Friends Central",
                "provider": "gemini",
                "rank": 2,
                "query": "rachel green",
            },
        ],
    }
    assert "https://en.wikipedia.org/wiki/Rachel_Green" in result.output


@pytest.mark.asyncio
async def test_web_search_tool_prefers_live_session_config_over_stale_context_config(monkeypatch):
    tool = WebSearchTool()
    stale_config = AppConfig(
        model_provider="openai",
        selected_model_id="gpt-5.4@@gpt-5-4-none-thinking",
    )
    live_session_config = AppConfig(
        model_provider="gemini",
        selected_model_id="gemini-3-flash-preview@@gemini-3-flash-thinking",
    )

    class _DummyLLMClient:
        async def get_completion_response(self, **kwargs):
            assert kwargs["model"] == live_session_config.selected_model_id
            assert kwargs["native_web_search_enabled"] is True
            return {
                "content": "",
                "web_search_sources": [
                    {
                        "url": "https://example.com/live",
                        "title": "Live Gemini Result",
                        "provider": "gemini",
                        "rank": 1,
                    }
                ],
            }

    session = SimpleNamespace(llm_client=_DummyLLMClient(), cfg=live_session_config)
    result = await tool.run(
        WebSearchArgs(query="rachel greene", count=1),
        _build_tool_context(config=stale_config, session=session),
    )

    assert result.success is True
    assert result.data == {
        "query": "rachel greene",
        "provider": "gemini",
        "results": [
            {
                "url": "https://example.com/live",
                "title": "Live Gemini Result",
                "provider": "gemini",
                "rank": 1,
                "query": "rachel greene",
            }
        ],
    }
