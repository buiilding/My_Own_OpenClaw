"""Backend fulfillment for logical `web_search`."""

from __future__ import annotations

import asyncio
import inspect
import logging
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlsplit

import httpx

from backend.src.core.events.streaming_events import ErrorEvent, WebSearchProgressEvent
from backend.src.core.interfaces.tool import ToolResult
from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.web_search.capabilities import (
    is_web_search_disabled_by_policy,
    resolve_brave_search_api_key,
    resolve_web_search_execution_mode,
)
from backend.src.tools.web_search.schemas import WebSearchArgs
from backend.src.tools.web_search.source_normalization import (
    extract_content_web_search_sources,
)

logger = logging.getLogger(__name__)

_BRAVE_WEB_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
_DEFAULT_TIMEOUT_SECONDS = 12.0
_MAX_RETRIES = 3
_DOMAIN_PATTERN = re.compile(r"^[a-z0-9.-]+\.[a-z]{2,}$")
_MAX_LOG_QUERY_CHARS = 120


def _sanitize_domain(domain: str) -> Optional[str]:
    candidate = domain.strip().lower()
    if candidate.startswith("http://") or candidate.startswith("https://"):
        candidate = urlsplit(candidate).netloc.lower()
    candidate = candidate.strip(".")
    if not candidate or ".." in candidate:
        return None
    if not _DOMAIN_PATTERN.fullmatch(candidate):
        return None
    return candidate


def _build_filtered_query(query: str, domains: Optional[List[str]]) -> str:
    if not domains:
        return query
    filters = " OR ".join(f"site:{domain}" for domain in domains)
    if not filters:
        return query
    return f"{query} ({filters})"


def _map_recency_days_to_freshness(recency_days: Optional[int]) -> Optional[str]:
    if not isinstance(recency_days, int) or recency_days <= 0:
        return None
    if recency_days <= 1:
        return "pd"
    if recency_days <= 7:
        return "pw"
    if recency_days <= 31:
        return "pm"
    return "py"


def _coerce_result_list(payload: Any) -> List[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    web_payload = payload.get("web")
    if isinstance(web_payload, dict) and isinstance(web_payload.get("results"), list):
        return [result for result in web_payload["results"] if isinstance(result, dict)]
    results = payload.get("results")
    if isinstance(results, list):
        return [result for result in results if isinstance(result, dict)]
    return []


def _normalize_result(result: Dict[str, Any], rank: int) -> Optional[Dict[str, Any]]:
    url = result.get("url")
    if not isinstance(url, str) or not url.strip():
        return None
    title = result.get("title")
    description = result.get("description")
    age = result.get("age")
    normalized: Dict[str, Any] = {
        "rank": rank,
        "url": url.strip(),
    }
    if isinstance(title, str) and title.strip():
        normalized["title"] = title.strip()
    if isinstance(description, str) and description.strip():
        normalized["snippet"] = description.strip()
    extra_snippets = result.get("extra_snippets")
    if isinstance(extra_snippets, list):
        snippets = [snippet.strip() for snippet in extra_snippets if isinstance(snippet, str) and snippet.strip()]
        if snippets:
            normalized["extra_snippets"] = snippets
    if isinstance(age, str) and age.strip():
        normalized["age"] = age.strip()
    return normalized


def _build_output(query: str, results: List[Dict[str, Any]]) -> str:
    if not results:
        return f'No web results found for query "{query}".'
    lines = [f'Web search results for "{query}":']
    for index, result in enumerate(results, start=1):
        title = str(result.get("title") or result.get("url") or "").strip()
        url = str(result.get("url") or "").strip()
        snippet = str(result.get("snippet") or "").strip()
        line = f"{index}. {title} - {url}"
        if snippet:
            line = f"{line}\n   {snippet}"
        lines.append(line)
    return "\n".join(lines)


def _sanitize_domains(domains: Optional[List[str]]) -> List[str]:
    normalized_domains: List[str] = []
    for domain in domains or []:
        normalized = _sanitize_domain(domain)
        if normalized:
            normalized_domains.append(normalized)
    return normalized_domains


def _truncate_log_query(query: str) -> str:
    normalized = query.strip()
    if len(normalized) <= _MAX_LOG_QUERY_CHARS:
        return normalized
    return f"{normalized[:_MAX_LOG_QUERY_CHARS]}..."


def _build_native_search_messages(args: WebSearchArgs) -> List[Dict[str, str]]:
    normalized_domains = _sanitize_domains(args.domains)
    instruction_lines = [
        "Use web search to gather current external information for the query below.",
        "Keep the answer concise and factual.",
        f"Return at most {max(1, min(int(args.count), 10))} distinct sources.",
    ]
    if normalized_domains:
        instruction_lines.append(
            "Restrict sources to these domains when possible: "
            + ", ".join(normalized_domains)
            + "."
        )
    if isinstance(args.recency_days, int) and args.recency_days > 0:
        instruction_lines.append(
            f"Prefer sources from roughly the last {args.recency_days} day(s) when available."
        )

    instruction_lines.extend(
        [
            "",
            f"Search query: {args.query}",
            "",
            "Answer normally after searching. Do not invent sources.",
        ]
    )
    return [{"role": "user", "content": "\n".join(instruction_lines)}]


def _normalize_native_search_results(
    *,
    provider_name: str,
    query: str,
    raw_sources: Any,
    count: int,
) -> List[Dict[str, Any]]:
    if not isinstance(raw_sources, list):
        return []

    results: List[Dict[str, Any]] = []
    for source in raw_sources:
        if not isinstance(source, dict):
            continue
        url = source.get("url")
        if not isinstance(url, str) or not url.strip():
            continue
        normalized: Dict[str, Any] = {
            "url": url.strip(),
            "provider": provider_name,
        }
        title = source.get("title")
        if isinstance(title, str) and title.strip():
            normalized["title"] = title.strip()
        rank = source.get("rank")
        if isinstance(rank, int):
            normalized["rank"] = rank
        else:
            normalized["rank"] = len(results) + 1
        source_query = source.get("query")
        if isinstance(source_query, str) and source_query.strip():
            normalized["query"] = source_query.strip()
        else:
            normalized["query"] = query
        results.append(normalized)
        if len(results) >= max(1, min(int(count), 10)):
            break
    return results


class WebSearchTool(Tool[WebSearchArgs]):
    """Backend-owned logical `web_search` fulfilled by native or Brave search."""

    name = "web_search"
    description = "Search the web for recent information and return source URLs with concise snippets."
    args_model = WebSearchArgs
    category = ToolDomain.OTHER
    execution_target = "backend"

    @staticmethod
    def _resolve_session(ctx: ToolContext) -> Any:
        session = ctx.services.get("session")
        return session

    @classmethod
    def _resolve_runtime_config(cls, ctx: ToolContext) -> Any:
        session = cls._resolve_session(ctx)
        session_cfg = getattr(session, "cfg", None)
        if session_cfg is not None:
            return session_cfg
        return ctx.services.get("config")

    @staticmethod
    def _resolve_stream_event_emitter(ctx: ToolContext) -> Any:
        emitter = ctx.services.get("emit_streaming_event")
        return emitter if callable(emitter) else None

    @staticmethod
    def _resolve_request_id(ctx: ToolContext) -> Optional[str]:
        request_id = ctx.services.get("tool_request_id")
        return request_id.strip() if isinstance(request_id, str) and request_id.strip() else None

    @classmethod
    async def _emit_progress_event(
        cls,
        ctx: ToolContext,
        event: WebSearchProgressEvent,
    ) -> None:
        emitter = cls._resolve_stream_event_emitter(ctx)
        if emitter is None:
            return
        emitted = emitter(event)
        if inspect.isawaitable(emitted):
            await emitted

    @classmethod
    def _log_completion(
        cls,
        *,
        ctx: ToolContext,
        provider_name: str,
        query: str,
        results: List[Dict[str, Any]],
    ) -> None:
        session = cls._resolve_session(ctx)
        session_id = getattr(session, "session_id", None)
        logger.info(
            "[Web Search] Completed provider=%s session=%s results=%s query=%r",
            provider_name,
            session_id or "unknown",
            len(results),
            _truncate_log_query(query),
        )

    @classmethod
    async def _run_openai_native_search(
        cls,
        *,
        args: WebSearchArgs,
        ctx: ToolContext,
    ) -> ToolResult:
        session = cls._resolve_session(ctx)
        llm_client = getattr(session, "llm_client", None)
        config = cls._resolve_runtime_config(ctx)
        selected_model_id = getattr(config, "selected_model_id", None)
        if llm_client is None or not isinstance(selected_model_id, str) or not selected_model_id.strip():
            error_msg = "Provider-native web search is unavailable in the current backend session."
            return ToolResult(
                success=False,
                error=error_msg,
                output=f"Error: {error_msg}",
            )

        stream_error_text: Optional[str] = None
        try:
            async for event in llm_client.get_completion_stream(
                model=selected_model_id,
                messages=_build_native_search_messages(args),
                native_web_search_enabled=True,
                max_output_tokens=1200,
                request_id=cls._resolve_request_id(ctx),
            ):
                if isinstance(event, WebSearchProgressEvent):
                    await cls._emit_progress_event(ctx, event)
                    continue
                if isinstance(event, ErrorEvent) and stream_error_text is None:
                    stream_error_text = str(event.content or "").strip() or "OpenAI native web search failed."
        except Exception as exc:
            logger.warning("openai native web search failed: %s", exc)
            error_msg = f"OpenAI native web search failed: {exc}"
            return ToolResult(
                success=False,
                error=error_msg,
                output=f"Error: {error_msg}",
            )

        if stream_error_text:
            error_msg = f"OpenAI native web search failed: {stream_error_text}"
            return ToolResult(
                success=False,
                error=error_msg,
                output=f"Error: {error_msg}",
            )

        response = llm_client.get_last_stream_response_payload()
        if not isinstance(response, dict):
            error_msg = "OpenAI native web search failed: missing final response payload."
            return ToolResult(
                success=False,
                error=error_msg,
                output=f"Error: {error_msg}",
            )

        results = _normalize_native_search_results(
            provider_name="openai",
            query=args.query,
            raw_sources=response.get("web_search_sources"),
            count=args.count,
        )
        content = str(response.get("content") or "").strip()
        if not results and content:
            results = extract_content_web_search_sources(
                content,
                provider="openai",
                query=args.query,
                count=max(1, min(int(args.count), 10)),
            )
        cls._log_completion(
            ctx=ctx,
            provider_name="openai",
            query=args.query,
            results=results,
        )
        output = content or _build_output(args.query, results)
        return ToolResult(
            success=True,
            data={
                "query": args.query,
                "provider": "openai",
                "results": results,
            },
            output=output,
        )

    @classmethod
    async def _run_provider_native_search(
        cls,
        *,
        args: WebSearchArgs,
        ctx: ToolContext,
        provider_name: str,
    ) -> ToolResult:
        if provider_name == "openai":
            return await cls._run_openai_native_search(args=args, ctx=ctx)

        session = cls._resolve_session(ctx)
        llm_client = getattr(session, "llm_client", None)
        config = cls._resolve_runtime_config(ctx)
        selected_model_id = getattr(config, "selected_model_id", None)
        if llm_client is None or not isinstance(selected_model_id, str) or not selected_model_id.strip():
            error_msg = "Provider-native web search is unavailable in the current backend session."
            return ToolResult(
                success=False,
                error=error_msg,
                output=f"Error: {error_msg}",
            )

        try:
            response = await llm_client.get_completion_response(
                model=selected_model_id,
                messages=_build_native_search_messages(args),
                native_web_search_enabled=True,
                max_output_tokens=1200,
            )
        except Exception as exc:
            logger.warning("%s native web search failed: %s", provider_name, exc)
            error_msg = f"{provider_name.capitalize()} native web search failed: {exc}"
            return ToolResult(
                success=False,
                error=error_msg,
                output=f"Error: {error_msg}",
            )

        results = _normalize_native_search_results(
            provider_name=provider_name,
            query=args.query,
            raw_sources=response.get("web_search_sources"),
            count=args.count,
        )
        content = str(response.get("content") or "").strip()
        if not results and content:
            results = extract_content_web_search_sources(
                content,
                provider=provider_name,
                query=args.query,
                count=max(1, min(int(args.count), 10)),
            )
        cls._log_completion(
            ctx=ctx,
            provider_name=provider_name,
            query=args.query,
            results=results,
        )
        output = content or _build_output(args.query, results)
        return ToolResult(
            success=True,
            data={
                "query": args.query,
                "provider": provider_name,
                "results": results,
            },
            output=output,
        )

    @staticmethod
    def _resolve_api_key(ctx: ToolContext) -> Optional[str]:
        config = WebSearchTool._resolve_runtime_config(ctx)
        return resolve_brave_search_api_key(config) if config is not None else None

    @staticmethod
    def _build_request_params(args: WebSearchArgs) -> Dict[str, Any]:
        domains = _sanitize_domains(args.domains)
        filtered_query = _build_filtered_query(args.query, domains)

        params: Dict[str, Any] = {
            "q": filtered_query,
            "count": max(1, min(int(args.count), 10)),
            "country": "us",
            "search_lang": "en",
            "safesearch": "moderate",
            "spellcheck": 1,
            "text_decorations": 0,
        }
        freshness = _map_recency_days_to_freshness(args.recency_days)
        if freshness:
            params["freshness"] = freshness
        return params

    async def _perform_request(
        self,
        *,
        api_key: str,
        params: Dict[str, Any],
    ) -> Dict[str, Any]:
        headers = {
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": api_key,
        }

        last_error: Exception | None = None
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT_SECONDS) as client:
                    response = await client.get(
                        _BRAVE_WEB_SEARCH_URL,
                        headers=headers,
                        params=params,
                    )
                if response.status_code in {401, 403}:
                    raise RuntimeError(
                        "Brave Search authentication failed. Check BRAVE_SEARCH_API_KEY."
                    )
                if response.status_code == 429:
                    raise RuntimeError(
                        "Brave Search rate limit exceeded. Try again shortly."
                    )
                response.raise_for_status()
                return response.json()
            except httpx.TimeoutException as exc:
                last_error = exc
                if attempt >= _MAX_RETRIES:
                    raise RuntimeError("Brave Search timed out.") from exc
            except httpx.HTTPStatusError as exc:
                last_error = exc
                status_code = exc.response.status_code if exc.response is not None else None
                if status_code == 429:
                    if attempt < _MAX_RETRIES:
                        await asyncio.sleep(0.5 * attempt)
                        continue
                    raise RuntimeError(
                        "Brave Search rate limit exceeded. Try again shortly."
                    ) from exc
                raise RuntimeError(
                    f"Brave Search request failed with status {status_code or 'unknown'}."
                ) from exc
            except RuntimeError:
                raise
            except httpx.HTTPError as exc:
                last_error = exc
                if attempt >= _MAX_RETRIES:
                    raise RuntimeError("Brave Search network request failed.") from exc

            await asyncio.sleep(0.5 * attempt)

        raise RuntimeError("Brave Search request failed.") from last_error

    async def run(self, args: WebSearchArgs, ctx: ToolContext) -> ToolResult:
        config = self._resolve_runtime_config(ctx)
        execution_mode = resolve_web_search_execution_mode(config) if config is not None else None

        if execution_mode == "native-openai":
            return await self._run_provider_native_search(
                args=args,
                ctx=ctx,
                provider_name="openai",
            )
        if execution_mode == "native-gemini":
            return await self._run_provider_native_search(
                args=args,
                ctx=ctx,
                provider_name="gemini",
            )
        if config is not None and is_web_search_disabled_by_policy(config):
            return ToolResult(
                success=False,
                error="web_search is disabled by the current tool policy.",
                output="Error: web_search is disabled by the current tool policy.",
            )

        api_key = self._resolve_api_key(ctx)
        if not api_key:
            return ToolResult(
                success=False,
                error="Brave Search is not configured on the backend.",
                output="Error: Brave Search is not configured on the backend.",
            )

        params = self._build_request_params(args)
        try:
            payload = await self._perform_request(api_key=api_key, params=params)
        except RuntimeError as exc:
            logger.warning("Brave web search failed: %s", exc)
            return ToolResult(
                success=False,
                error=str(exc),
                output=f"Error: {exc}",
            )

        results: List[Dict[str, Any]] = []
        for rank, raw_result in enumerate(_coerce_result_list(payload), start=1):
            normalized = _normalize_result(raw_result, rank)
            if normalized is not None:
                results.append(normalized)

        self._log_completion(
            ctx=ctx,
            provider_name="brave",
            query=args.query,
            results=results,
        )
        output = _build_output(args.query, results)
        return ToolResult(
            success=True,
            data={
                "query": args.query,
                "provider": "brave",
                "results": results,
            },
            output=output,
        )
