"""Backend web-search exports."""

from backend.src.tools.web_search.capabilities import (
    has_brave_search_api_key,
    is_web_search_disabled_by_policy,
    resolve_web_search_execution_mode,
    should_enable_openai_native_web_search_main_request,
    should_enable_native_web_search,
    should_expose_backend_web_search_tool,
    supports_gemini_native_web_search,
    supports_openai_native_web_search,
)
from backend.src.tools.web_search.tool import WebSearchTool

__all__ = [
    "WebSearchTool",
    "has_brave_search_api_key",
    "is_web_search_disabled_by_policy",
    "resolve_web_search_execution_mode",
    "should_enable_openai_native_web_search_main_request",
    "should_enable_native_web_search",
    "should_expose_backend_web_search_tool",
    "supports_gemini_native_web_search",
    "supports_openai_native_web_search",
]
