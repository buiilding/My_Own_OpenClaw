"""
Result Transformer.

Pure transformation of tool execution results.
No side effects, no state mutation, no history access.

INVARIANT: This class must remain side-effect free.
- No session access
- No history mutation
- No IO operations
- No event emission
- No global state changes

All methods must be pure functions: same input → same output, no side effects.
Future contributors: if you need state mutation, use HistoryCommitter instead.
"""

import json
import logging
import time
from dataclasses import dataclass, replace
from typing import Any, Dict, Optional

from backend.src.agent.tools.processing.tool_output_projection import (
    raw_tool_output_text,
    truncate_tool_output_for_model,
)
from backend.src.core.interfaces.tool import ToolResult
from backend.src.core.messages.image_payloads import normalize_provider_image_data_url

logger = logging.getLogger(__name__)


def _normalize_screenshot_payload(
    screenshot_data: str,
    *,
    content_type: Optional[Any] = None,
) -> Optional[str]:
    """Return a provider-ready image payload while preserving known MIME type."""
    return normalize_provider_image_data_url(
        screenshot_data,
        content_type=content_type,
    )


@dataclass
class ProcessedToolResult:
    """Processed tool result ready for history commit."""

    tool_name: str
    formatted_message: str
    screenshot_data: Optional[str] = None
    success: bool = True
    error: str = ""
    artifacts: Optional[Dict[str, Any]] = None
    compaction_facts: Optional[Dict[str, Any]] = None


class ResultTransformer:
    """
    Transforms raw tool results into processed, enriched data.

    Responsibility: Pure data transformation only.

    INVARIANT (MUST BE MAINTAINED):
    ===============================
    This class must remain side-effect free:
    - ❌ No session access
    - ❌ No history mutation
    - ❌ No IO operations
    - ❌ No event emission
    - ❌ No global state changes

    All methods are pure functions: same input → same output, no side effects.

    If you need state mutation, use HistoryCommitter instead.
    If you need event emission, use EventPresenter instead.

    Note: This transformer intentionally avoids plugin hooks. OCR and other
    capabilities are wired directly via services.
    """

    def __init__(self) -> None:
        """Initialize the result transformer."""
        pass

    async def transform(
        self,
        tool_name: str,
        tool_result: ToolResult,
        *,
        model_id: Optional[str] = None,
        truncate_model_output: bool = True,
    ) -> ProcessedToolResult:
        """
        Transform raw tool result into processed result.

        Pure function: no side effects, deterministic output.

        Args:
            tool_name: Name of the tool that produced this result
            tool_result: Raw tool execution result

        Returns:
            ProcessedToolResult with enriched and normalized data

        Side Effects: None (pure function contract)
        """
        transform_start = time.perf_counter()
        raw_result = replace(
            tool_result,
            data=(
                dict(tool_result.data)
                if isinstance(tool_result.data, dict)
                else tool_result.data
            ),
        )
        artifacts = dict(raw_result.artifacts or {})

        # Extract screenshot data (helper method to avoid nested checks)
        screenshot_data = self._extract_screenshot_data(raw_result, artifacts)

        # 2. Get bounded raw tool output for model history. Atomic bundle callers
        # can pre-bound each step and skip aggregate truncation here.
        formatted_message = (
            truncate_tool_output_for_model(
                raw_result,
                model_id=model_id,
            )
            if truncate_model_output
            else raw_tool_output_text(raw_result)
        )

        transform_time = time.perf_counter() - transform_start
        logger.info(
            f"[Timing] Result transformation took {transform_time:.3f}s (tool={tool_name})"
        )
        return ProcessedToolResult(
            tool_name=tool_name,
            formatted_message=formatted_message,
            screenshot_data=screenshot_data,
            success=raw_result.success,
            error=raw_result.error or "",
            artifacts=artifacts,
            compaction_facts=self._extract_compaction_facts(
                tool_name=tool_name,
                tool_result=raw_result,
                artifacts=artifacts,
            ),
        )

    def _extract_screenshot_data(
        self,
        tool_result: ToolResult,
        artifacts: Dict[str, Any],
    ) -> Optional[str]:
        """
        Extract screenshot data from tool result.

        Pure function: no side effects, deterministic output.

        Args:
            tool_result: Tool execution result
        Returns:
            Base64 screenshot data or None

        Side Effects: None (pure function contract)
        """
        # Check tool result artifacts
        if "screenshot" in artifacts:
            logger.debug("Found screenshot in tool result artifacts")
            screenshot_data = artifacts["screenshot"]
            if isinstance(screenshot_data, str) and screenshot_data:
                normalized = _normalize_screenshot_payload(
                    screenshot_data,
                    content_type=artifacts.get("screenshot_content_type"),
                )
                if normalized:
                    return normalized
                logger.warning(
                    "Screenshot artifact could not be identified as an image"
                )
                return None
            logger.warning(
                f"Screenshot artifact found but invalid type: {type(screenshot_data)}"
            )
            return None

        # Check tool result data dict (SDK/local-runtime tools often return it here)
        if isinstance(tool_result.data, dict):
            if "screenshot" in tool_result.data:
                screenshot_data = tool_result.data["screenshot"]
                if screenshot_data and isinstance(screenshot_data, str):
                    logger.debug("Found screenshot in tool result data")
                    normalized = _normalize_screenshot_payload(
                        screenshot_data,
                        content_type=tool_result.data.get("screenshot_content_type"),
                    )
                    if normalized:
                        return normalized
                    logger.warning(
                        "Screenshot data could not be identified as an image"
                    )
                    return None
                else:
                    logger.warning(
                        f"Screenshot data found but invalid type: {type(screenshot_data)}"
                    )

        # Debug logging for troubleshooting
        logger.debug(
            f"No screenshot found in tool result. "
            f"Data type: {type(tool_result.data)}, "
            f"Data keys: {list(tool_result.data.keys()) if isinstance(tool_result.data, dict) else 'N/A'}, "
            f"Artifacts: {list(artifacts.keys()) if artifacts else None}"
        )

        return None

    def _extract_compaction_facts(
        self,
        *,
        tool_name: str,
        tool_result: ToolResult,
        artifacts: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Build a bounded structured payload that compaction can render cleanly."""
        explicit_facts = self._sanitize_for_compaction(tool_result.compaction_facts)
        if isinstance(explicit_facts, dict) and explicit_facts:
            explicit_facts.setdefault("tool_name", tool_name)
            explicit_facts.setdefault("success", bool(tool_result.success))
            if tool_result.error:
                explicit_facts.setdefault("error", str(tool_result.error))
            return explicit_facts

        facts: Dict[str, Any] = {
            "tool_name": tool_name,
            "success": bool(tool_result.success),
        }
        if tool_result.error:
            facts["error"] = str(tool_result.error)

        for source_name, source in (
            ("metadata", tool_result.metadata),
            ("data", tool_result.data),
            ("artifacts", artifacts),
        ):
            sanitized = self._sanitize_for_compaction(source)
            if sanitized in (None, "", [], {}):
                continue
            facts[source_name] = sanitized

        return facts if len(facts) > 2 or tool_result.error else None

    def _sanitize_for_compaction(
        self,
        value: Any,
        *,
        depth: int = 0,
    ) -> Any:
        """Recursively bound tool payloads so compaction can preserve facts safely."""
        if depth >= 3:
            return self._summarize_leaf(value)

        if value is None or isinstance(value, (bool, int, float)):
            return value
        if isinstance(value, str):
            return self._truncate_text(value, limit=400)
        if isinstance(value, list):
            items = [
                self._sanitize_for_compaction(item, depth=depth + 1)
                for item in value[:8]
            ]
            return [item for item in items if item not in (None, "", [], {})]
        if isinstance(value, dict):
            sanitized: Dict[str, Any] = {}
            for key, item in value.items():
                normalized_key = str(key)
                if self._skip_compaction_key(normalized_key):
                    continue
                cleaned = self._sanitize_for_compaction(item, depth=depth + 1)
                if cleaned in (None, "", [], {}):
                    continue
                sanitized[normalized_key] = cleaned
                if len(sanitized) >= 12:
                    break
            return sanitized
        return self._summarize_leaf(value)

    @staticmethod
    def _skip_compaction_key(key: str) -> bool:
        normalized = key.strip().lower()
        return normalized in {
            "screenshot",
            "screenshot_data",
            "image",
            "image_data",
            "base64",
            "bytes",
            "raw_html",
            "html",
        }

    def _summarize_leaf(self, value: Any) -> str:
        try:
            serialized = json.dumps(value, ensure_ascii=False, default=str)
        except Exception:
            serialized = str(value)
        return self._truncate_text(serialized, limit=240)

    @staticmethod
    def _truncate_text(text: str, *, limit: int) -> str:
        if len(text) <= limit:
            return text
        return f"{text[: max(0, limit - 3)]}..."
