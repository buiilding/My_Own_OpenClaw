from types import SimpleNamespace

import pytest

from backend.src.core.config.models import AppConfig
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
            query="windieos latest",
            count=99,
            domains=[" https://example.com ", "bad domain", "sub.example.org"],
            recency_days=3,
        )
    )

    assert params["q"] == "windieos latest (site:example.com OR site:sub.example.org)"
    assert params["count"] == 10
    assert params["freshness"] == "pw"


@pytest.mark.asyncio
async def test_web_search_tool_returns_normalized_brave_results(monkeypatch):
    tool = WebSearchTool()

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
        WebSearchArgs(query="windieos latest", count=2),
        _build_tool_context(),
    )

    assert result.success is True
    assert result.data == {
        "query": "windieos latest",
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
    assert 'Web search results for "windieos latest":' in result.llm_content


@pytest.mark.asyncio
async def test_web_search_tool_reports_missing_backend_configuration():
    tool = WebSearchTool()

    result = await tool.run(
        WebSearchArgs(query="windieos latest"),
        _build_tool_context(),
    )

    assert result.success is False
    assert result.error == "Brave Search is not configured on the backend."


@pytest.mark.asyncio
async def test_web_search_tool_maps_brave_runtime_failures_to_tool_errors(monkeypatch):
    tool = WebSearchTool()

    monkeypatch.setattr(tool, "_resolve_api_key", lambda ctx: "test-brave-key")

    async def fake_perform_request(*, api_key, params):
        _ = (api_key, params)
        raise RuntimeError("Brave Search rate limit exceeded. Try again shortly.")

    monkeypatch.setattr(tool, "_perform_request", fake_perform_request)

    result = await tool.run(
        WebSearchArgs(query="windieos latest"),
        _build_tool_context(),
    )

    assert result.success is False
    assert result.error == "Brave Search rate limit exceeded. Try again shortly."


@pytest.mark.asyncio
async def test_web_search_tool_routes_to_openai_native_search(monkeypatch):
    tool = WebSearchTool()
    config = AppConfig(
        model_provider="openai",
        selected_model_id="gpt-5@@gpt-5-nonthinking",
    )

    class _DummyLLMClient:
        async def get_completion_response(self, **kwargs):
            assert kwargs["native_web_search_enabled"] is True
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
    result = await tool.run(
        WebSearchArgs(query="windieos latest", count=2),
        _build_tool_context(config=config, session=session),
    )

    assert result.success is True
    assert result.data == {
        "query": "windieos latest",
        "provider": "openai",
        "results": [
            {
                "url": "https://example.com/a",
                "title": "Example A",
                "provider": "openai",
                "rank": 1,
                "query": "windieos latest",
            },
            {
                "url": "https://example.com/b",
                "title": "Example B",
                "provider": "openai",
                "rank": 2,
                "query": "windieos latest",
            },
        ],
    }
    assert result.llm_content == "Native summary from OpenAI"


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
        WebSearchArgs(query="windieos latest", count=1),
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
            "query": "windieos latest",
        }
    ]
    assert 'Web search results for "windieos latest":' in result.llm_content
