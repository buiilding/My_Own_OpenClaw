"""Backend fulfillment for logical `web_search`."""

from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlsplit

import httpx

from backend.src.core.interfaces.tool import ToolResult
from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.web_search.capabilities import resolve_web_search_execution_mode
from backend.src.tools.web_search.schemas import WebSearchArgs

logger = logging.getLogger(__name__)

_BRAVE_WEB_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
_DEFAULT_TIMEOUT_SECONDS = 12.0
_MAX_RETRIES = 3
_DOMAIN_PATTERN = re.compile(r"^[a-z0-9.-]+\.[a-z]{2,}$")


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


def _build_llm_content(query: str, results: List[Dict[str, Any]]) -> str:
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

    @classmethod
    async def _run_provider_native_search(
        cls,
        *,
        args: WebSearchArgs,
        ctx: ToolContext,
        provider_name: str,
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
                llm_content=f"Error: {error_msg}",
                return_display=error_msg,
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
                llm_content=f"Error: {error_msg}",
                return_display=error_msg,
            )

        results = _normalize_native_search_results(
            provider_name=provider_name,
            query=args.query,
            raw_sources=response.get("web_search_sources"),
            count=args.count,
        )
        content = str(response.get("content") or "").strip()
        llm_content = content or _build_llm_content(args.query, results)
        return ToolResult(
            success=True,
            data={
                "query": args.query,
                "provider": provider_name,
                "results": results,
            },
            llm_content=llm_content,
            return_display=llm_content,
        )

    @staticmethod
    def _resolve_api_key(ctx: ToolContext) -> Optional[str]:
        config = WebSearchTool._resolve_runtime_config(ctx)
        env_var = str(getattr(getattr(config, "brave_search", None), "api_key_env", "") or "").strip()
        if not env_var:
            env_var = "BRAVE_SEARCH_API_KEY"
        value = os.getenv(env_var)
        if isinstance(value, str) and value.strip():
            return value.strip()
        return None

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

        api_key = self._resolve_api_key(ctx)
        if not api_key:
            return ToolResult(
                success=False,
                error="Brave Search is not configured on the backend.",
                llm_content="Error: Brave Search is not configured on the backend.",
                return_display="Brave Search is not configured on the backend.",
            )

        params = self._build_request_params(args)
        try:
            payload = await self._perform_request(api_key=api_key, params=params)
        except RuntimeError as exc:
            logger.warning("Brave web search failed: %s", exc)
            return ToolResult(
                success=False,
                error=str(exc),
                llm_content=f"Error: {exc}",
                return_display=str(exc),
            )

        results: List[Dict[str, Any]] = []
        for rank, raw_result in enumerate(_coerce_result_list(payload), start=1):
            normalized = _normalize_result(raw_result, rank)
            if normalized is not None:
                results.append(normalized)

        llm_content = _build_llm_content(args.query, results)
        return ToolResult(
            success=True,
            data={
                "query": args.query,
                "provider": "brave",
                "results": results,
            },
            llm_content=llm_content,
            return_display=llm_content,
        )
