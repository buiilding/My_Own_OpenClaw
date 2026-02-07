"""
Response Parser for the Desktop Assistant.

SECURITY: This module is a TRUST BOUNDARY.
- All inputs are treated as HOSTILE/UNTRUSTED
- Size limits, timeouts, and validation are enforced
- Security violations raise hard errors (no soft fallbacks)
- Failures propagate immediately to prevent silent bypasses
- All violations are tracked via observability hooks for abuse detection

Trust Boundary: LLM Response → ParsedResponse

OBSERVABILITY: All violations are logged with structured metrics:
- Size limit violations (actual_size, max_size, ratio)
- Timeout violations (timeout_seconds, boundary_name)
- Validation violations (validation_errors, error_count)

This module parses LLM responses to detect and extract tool calls,
converting them into a structured format for execution.

Uses robust bracket-matching JSON extraction instead of brittle regex patterns.
"""
import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING, Optional

from backend.src.core.config import AppConfig
from backend.src.core.infrastructure.exceptions import (
    InputSizeLimitError,
    ParseTimeoutError,
    ParseValidationError,
)
from backend.src.core.observability.trust_boundary_metrics import MetricsService
from backend.src.llm.parser_extraction import JsonToolCallExtractor
from backend.src.llm.parser_types import ParsedResponse, ParsedToolCall, ToolCallSchema
from backend.src.llm.parser_validation import ToolCallValidator

if TYPE_CHECKING:
    from backend.src.tools.registry import ToolRegistry

logger = logging.getLogger(__name__)


class ResponseParser:
    """
    Parses structured responses from LLM outputs.

    Extracts tool calls using robust JSON parsing with bracket-matching
    for embedded JSON cases. No regex patterns - handles nested structures correctly.

    Supports configurable JSON schema via ToolCallSchema, defaulting to
    the custom format: {"functionCall": {"name": "...", "args": {...}}}

    SECURITY: This is a trust boundary. All inputs are validated with size limits,
    timeouts, and strict validation. Violations raise hard errors.
    """

    BOUNDARY_NAME = "response_parser"

    def __init__(
        self,
        config: AppConfig,
        tool_registry: "ToolRegistry",
        schema: Optional[ToolCallSchema] = None,
        metrics_service: Optional[MetricsService] = None,
    ):
        """
        Initialize the response parser.

        Args:
            config: Application configuration (REQUIRED for security limits)
            tool_registry: Tool registry for validating tool names (REQUIRED for security)
            schema: Optional ToolCallSchema configuration (defaults to custom format)
            metrics_service: Optional MetricsService for observability (injected via DI)

        Raises:
            ValueError: If config or tool_registry is None (security requirement)
        """
        if config is None:
            raise ValueError(
                "config is required for ResponseParser. "
                "Cannot enforce security limits without configuration (security requirement)."
            )
        if tool_registry is None:
            raise ValueError(
                "tool_registry is required for ResponseParser. "
                "Cannot validate tool names without registry (security requirement)."
            )

        self.config = config
        self.tool_registry = tool_registry
        self.schema = schema or ToolCallSchema()

        if metrics_service is None:
            metrics_service = MetricsService()
        self.metrics = metrics_service.get_metrics(self.BOUNDARY_NAME)
        self.limits = config.security_limits

        self._validator = ToolCallValidator(
            config=self.config,
            tool_registry=self.tool_registry,
            metrics=self.metrics,
            limits=self.limits,
        )
        self._extractor = JsonToolCallExtractor(
            schema=self.schema,
            validator=self._validator,
            metrics=self.metrics,
            limits=self.limits,
        )
        self._parsing_strategies = (
            self._extractor.parse_json_response,
            self._extractor.parse_embedded_json,
        )

        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="parser")

    def _ensure_executor(self) -> ThreadPoolExecutor:
        """Return active parser executor, creating a new one after shutdown if needed."""
        if self._executor is None:
            self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="parser")
        return self._executor

    def shutdown(self) -> None:
        """
        Shutdown the parser and clean up resources.
        """
        if self._executor is not None:
            self._executor.shutdown(wait=True)
            self._executor = None

    async def parse_response(self, response: str) -> ParsedResponse:
        """
        Parse the LLM response to extract tool calls and other structured data.

        SECURITY: This is a trust boundary. All inputs are validated with:
        - Size limits (max_response_size)
        - Timeouts (parse_timeout_seconds)
        - Tool name validation (whitelist check)
        - Parameter validation (count, size limits)

        PERFORMANCE: CPU-bound parsing is offloaded to a thread pool executor
        to prevent blocking the asyncio event loop. Real timeouts are enforced
        using asyncio.wait_for, which can cancel hanging operations.
        """
        boundary_name = self.BOUNDARY_NAME

        if response is None:
            raise ValueError(
                "response cannot be None. Trust boundary requires valid string input.",
            )
        if not isinstance(response, str):
            raise TypeError(
                f"response must be str, got {type(response).__name__}. "
                "Trust boundary requires string input.",
            )

        response_size = len(response)
        if response_size > self.limits.max_response_size:
            self.metrics.record_size_violation(
                actual_size=response_size,
                max_size=self.limits.max_response_size,
                boundary_name=boundary_name,
                metadata={"check": "response_size"},
            )
            raise InputSizeLimitError(
                f"Response size {response_size} exceeds maximum {self.limits.max_response_size}",
                actual_size=response_size,
                max_size=self.limits.max_response_size,
                boundary_name=boundary_name,
            )

        logger.debug("Parsing LLM response for tool calls: %s...", repr(response[:200]))

        loop = asyncio.get_running_loop()
        executor = self._ensure_executor()
        try:
            parsed_response = await asyncio.wait_for(
                loop.run_in_executor(executor, self._parse_sync, response),
                timeout=self.limits.parse_timeout_seconds,
            )
        except asyncio.TimeoutError:
            self.metrics.record_timeout_violation(
                timeout_seconds=self.limits.parse_timeout_seconds,
                boundary_name=boundary_name,
            )
            raise ParseTimeoutError(
                f"Parsing exceeded timeout of {self.limits.parse_timeout_seconds}s",
                timeout_seconds=self.limits.parse_timeout_seconds,
                boundary_name=boundary_name,
            )

        return parsed_response

    def _parse_sync(self, response: str) -> ParsedResponse:
        """
        Internal synchronous parsing logic (runs in thread pool executor).
        """
        tool_calls = []
        text_content = response

        start_time = time.monotonic()
        timeout = self.limits.parse_timeout_seconds

        for strategy in self._parsing_strategies:
            calls, remaining_text = strategy(response, start_time, timeout)
            if calls:
                call_names = [call.tool_name for call in calls]
                for call in calls:
                    logger.info(
                        "Parser found tool call: %s with params: %s",
                        call.tool_name,
                        call.parameters,
                    )
                logger.info(
                    "Parser found %s tool calls using %s: %s",
                    len(calls),
                    strategy.__name__,
                    call_names,
                )
                tool_calls.extend(calls)
                text_content = remaining_text
                break

        if len(tool_calls) > self.limits.max_tool_calls_per_response:
            validation_errors = [
                f"Tool call count {len(tool_calls)} exceeds maximum {self.limits.max_tool_calls_per_response}"
            ]
            self.metrics.record_validation_violation(
                validation_errors=validation_errors,
                boundary_name=self.BOUNDARY_NAME,
                metadata={"tool_call_count": len(tool_calls)},
            )
            raise ParseValidationError(
                f"Too many tool calls: {len(tool_calls)} > {self.limits.max_tool_calls_per_response}",
                validation_errors=validation_errors,
                boundary_name=self.BOUNDARY_NAME,
            )

        if tool_calls:
            logger.info("Total tool calls extracted: %s", len(tool_calls))
        else:
            logger.debug("No tool calls found in response (conversational response)")
            logger.debug("Response content: %s...", repr(response[:200]))

        return ParsedResponse(
            original_response=response,
            tool_calls=tool_calls,
            text_content=text_content.strip(),
            has_tool_calls=len(tool_calls) > 0,
        )


__all__ = ["ResponseParser", "ParsedResponse", "ParsedToolCall", "ToolCallSchema"]
