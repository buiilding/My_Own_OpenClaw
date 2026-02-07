"""Parser extraction helpers."""
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple

from backend.src.core.infrastructure.exceptions import (
    InputSizeLimitError,
    ParseTimeoutError,
    ParseValidationError,
)
from backend.src.llm.parser_types import ParsedToolCall, ToolCallSchema

logger = logging.getLogger(__name__)


class JsonToolCallExtractor:
    """Extracts tool calls from JSON or embedded JSON with safety checks."""

    def __init__(self, schema: ToolCallSchema, validator, metrics, limits) -> None:
        self.schema = schema
        self.validator = validator
        self.metrics = metrics
        self.limits = limits

    def parse_json_response(
        self, response: str, start_time: float, timeout: float
    ) -> Tuple[List[ParsedToolCall], str]:
        """Parse pure JSON responses containing tool calls."""
        tool_calls: List[ParsedToolCall] = []

        json_str = response.strip()
        if len(json_str) > self.limits.max_json_size:
            self.metrics.record_size_violation(
                actual_size=len(json_str),
                max_size=self.limits.max_json_size,
                boundary_name="response_parser",
                metadata={"check": "json_size"},
            )
            raise InputSizeLimitError(
                f"JSON size {len(json_str)} exceeds maximum {self.limits.max_json_size}",
                actual_size=len(json_str),
                max_size=self.limits.max_json_size,
                boundary_name="response_parser",
            )

        try:
            parsed_json = self._safe_json_loads(json_str, start_time, timeout)

            result = self.schema.extract_tool_call(parsed_json)
            if result:
                tool_name, args, metadata = result
                tool_calls.append(
                    self._build_tool_call(
                        tool_name=tool_name,
                        args=args,
                        metadata=metadata,
                        raw_call=json_str,
                        confidence=1.0,
                    )
                )
                return tool_calls, ""

        except (InputSizeLimitError, ParseTimeoutError, ParseValidationError):
            raise
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.debug(
                "Response is not tool call JSON (expected for conversational responses): %s",
                e,
            )
            logger.debug(
                "Non-JSON response content: %s",
                repr(response[:200]),
            )

        return tool_calls, response

    def parse_embedded_json(
        self, response: str, start_time: float, timeout: float
    ) -> Tuple[List[ParsedToolCall], str]:
        """
        Parse embedded JSON tool calls using iterative scanning decoder.
        """
        tool_calls: List[ParsedToolCall] = []
        extracted_positions: List[Tuple[int, int]] = []
        decoder = json.JSONDecoder()
        pos = 0

        while pos < len(response):
            if time.monotonic() - start_time > timeout:
                raise ParseTimeoutError(
                    "Parse timeout exceeded",
                    timeout_seconds=timeout,
                    boundary_name="response_parser",
                )

            if pos > self.limits.max_response_size:
                break

            start_index = response.find("{", pos)
            if start_index < 0:
                break

            remaining = len(response) - start_index
            if remaining > self.limits.max_json_size:
                pos = start_index + 1
                continue

            try:
                parsed, end_index = decoder.raw_decode(response, idx=start_index)
                json_obj = response[start_index:end_index]

                if len(json_obj) > self.limits.max_json_size:
                    pos = start_index + 1
                    continue

                result = self.schema.extract_tool_call(parsed)

                if result:
                    tool_name, args, metadata = result
                    tool_calls.append(
                        self._build_tool_call(
                            tool_name=tool_name,
                            args=args,
                            metadata=metadata,
                            raw_call=json_obj,
                            confidence=1.0,
                        )
                    )
                    extracted_positions.append((start_index, end_index))
                    pos = end_index
                else:
                    pos = start_index + 1

            except (InputSizeLimitError, ParseTimeoutError, ParseValidationError):
                raise
            except (json.JSONDecodeError, ValueError, IndexError):
                pos = start_index + 1

        remaining_text = self._remove_extracted_by_positions(response, extracted_positions)

        return tool_calls, remaining_text

    def _extract_json_object(
        self, text: str, start_pos: int, start_time: float, timeout: float
    ) -> str:
        """
        Extract a complete JSON object starting at start_pos using json.JSONDecoder.

        DEPRECATED: Kept for backward compatibility.
        """
        if start_pos >= len(text) or text[start_pos] != "{":
            return ""

        remaining = len(text) - start_pos
        if remaining > self.limits.max_json_size:
            return ""

        if time.monotonic() - start_time > timeout:
            return ""

        try:
            decoder = json.JSONDecoder()
            _, end_pos = decoder.raw_decode(text, idx=start_pos)
            return text[start_pos:end_pos]
        except (json.JSONDecodeError, ValueError, IndexError):
            return ""

    def _safe_json_loads(
        self, json_str: str, start_time: float, timeout: float
    ) -> Dict[str, Any]:
        """Safely load JSON with depth limits and timeout checks."""
        if time.monotonic() - start_time > timeout:
            raise ParseTimeoutError(
                "JSON load timeout exceeded",
                timeout_seconds=timeout,
                boundary_name="response_parser",
            )

        try:
            parsed = json.loads(json_str)
            self._validate_json_depth(parsed, self.limits.max_json_nesting_depth)
            return parsed
        except json.JSONDecodeError:
            raise
        except RecursionError:
            raise ParseValidationError(
                f"JSON nesting depth exceeds maximum {self.limits.max_json_nesting_depth}",
                validation_errors=["JSON nesting too deep"],
                boundary_name="response_parser",
            )

    def _build_tool_call(
        self,
        tool_name: str,
        args: Dict[str, Any],
        metadata: Optional[Dict[str, Any]],
        raw_call: str,
        confidence: float,
    ) -> ParsedToolCall:
        self.validator.validate_tool_call(tool_name, args)
        self.validator.validate_metadata(tool_name, metadata)
        return ParsedToolCall(
            tool_name=tool_name,
            parameters=args,
            raw_call=raw_call,
            confidence=confidence,
            metadata=metadata,
        )

    def _validate_json_depth(self, obj: Any, max_depth: int) -> None:
        stack = [(obj, 0)]

        while stack:
            current_obj, depth = stack.pop()

            if depth > max_depth:
                raise RecursionError(
                    f"JSON nesting depth {depth} exceeds maximum {max_depth}"
                )

            if isinstance(current_obj, dict):
                for value in current_obj.values():
                    stack.append((value, depth + 1))
            elif isinstance(current_obj, list):
                for item in current_obj:
                    stack.append((item, depth + 1))

    def _remove_extracted_by_positions(
        self, text: str, positions: List[Tuple[int, int]]
    ) -> str:
        if not positions:
            return text

        sorted_positions = sorted(positions, key=lambda x: x[0])
        for i in range(len(sorted_positions) - 1):
            start1, end1 = sorted_positions[i]
            start2, end2 = sorted_positions[i + 1]
            if end1 > start2:
                logger.warning(
                    "Overlapping extraction positions detected: (%s, %s) and (%s, %s), skipping removal",
                    start1,
                    end1,
                    start2,
                    end2,
                )
                return text

        parts = []
        current_idx = 0

        for start, end in sorted_positions:
            if not (0 <= start < end <= len(text)):
                continue

            if start > current_idx:
                parts.append(text[current_idx:start])

            current_idx = end

        if current_idx < len(text):
            parts.append(text[current_idx:])

        result = "".join(parts)

        return self._normalize_whitespace(result)

    def remove_extracted_calls(
        self, text: str, tool_calls: List[ParsedToolCall]
    ) -> str:
        if not tool_calls:
            return text

        positions: List[Tuple[int, int]] = []
        for call in tool_calls:
            pos = text.find(call.raw_call)
            if pos >= 0:
                positions.append((pos, pos + len(call.raw_call)))

        if positions:
            return self._remove_extracted_by_positions(text, positions)

        result = text
        for call in tool_calls:
            result = result.replace(call.raw_call, "", 1)

        return self._normalize_whitespace(result)

    def _normalize_whitespace(self, text: str) -> str:
        cleaned = re.sub(r"\n{3,}", "\n\n", text)
        return cleaned.strip()
