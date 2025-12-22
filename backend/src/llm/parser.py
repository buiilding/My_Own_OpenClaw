"""
Response Parser for the Desktop Assistant.

This module parses LLM responses to detect and extract tool calls,
converting them into a structured format for execution.
"""

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)


@dataclass
class ParsedToolCall:
    """Represents a parsed tool call from an LLM response."""

    tool_name: str
    parameters: Dict[str, Any]
    raw_call: str
    confidence: float = 1.0  # 0.0 to 1.0, how confident we are in this parse


@dataclass
class ParsedResponse:
    """Structured data extracted from LLM response."""

    original_response: str
    tool_calls: List[ParsedToolCall]
    text_content: str  # The non-tool-call content
    has_tool_calls: bool = False


class ResponseParser:
    """
    Parses structured responses from LLM outputs.

    Extracts tool calls using Gemini CLI structured format with JSON fallback.
    """

    def __init__(self):
        """Initialize the response parser."""
        self._init_patterns()

    def _init_patterns(self):
        """Initialize regex patterns for tool call detection."""

        # Primary: Structured function call format (Gemini CLI style)
        self.structured_function_call_pattern = re.compile(
            r'"functionCall"\s*:\s*{\s*"name"\s*:\s*"([^"]+)"(?:\s*,\s*"args"\s*:\s*({[^}]*}))?}',
            re.MULTILINE | re.DOTALL,
        )

    def parse_response(self, response: str) -> ParsedResponse:
        """
        Parse the LLM response to extract tool calls and other structured data.

        Args:
            response: The raw LLM response text

        Returns:
            ParsedResponse with extracted tool calls and content
        """
        logger.debug(f"Parsing LLM response for tool calls: {repr(response)}")
        try:
            tool_calls = []
            text_content = response

            # Support both pure JSON and embedded JSON formats
            parsing_strategies = [
                self._parse_json_response,  # Try pure JSON first (modern, reliable)
                self._parse_structured_function_calls,  # Fallback to embedded JSON (legacy)
            ]

            for strategy in parsing_strategies:
                calls, remaining_text = strategy(response)
                if calls:
                    for call in calls:
                        logger.info(
                            f"Parser found tool call: {call.tool_name} with params: {call.parameters}"
                        )
                    logger.info(
                        f"Parser found {len(calls)} tool calls using {strategy.__name__}: {[call.tool_name for call in calls]}"
                    )
                    tool_calls.extend(calls)
                    text_content = remaining_text
                    break

            if tool_calls:
                logger.info(f"Total tool calls extracted: {len(tool_calls)}")
            else:
                logger.debug("No tool calls found in response (conversational response)")
                logger.debug(f"Response content: {repr(response)}")

            # Clean up text content by removing tool call syntax
            text_content = self._clean_text_content(text_content, tool_calls)

            return ParsedResponse(
                original_response=response,
                tool_calls=tool_calls,
                text_content=text_content.strip(),
                has_tool_calls=len(tool_calls) > 0,
            )

        except Exception as e:
            logger.error(f"Error parsing response: {e}", exc_info=True)
            return ParsedResponse(
                original_response=response,
                tool_calls=[],
                text_content=response,
                has_tool_calls=False,
            )

    def _parse_json_response(
        self, response: str
    ) -> Tuple[List[ParsedToolCall], str]:
        """Parse pure JSON responses containing tool calls."""
        tool_calls = []

        try:
            # Try to parse the entire response as JSON
            parsed_json = json.loads(response.strip())

            # Check if it has the expected functionCall structure
            if isinstance(parsed_json, dict) and "functionCall" in parsed_json:
                function_call = parsed_json["functionCall"]

                if isinstance(function_call, dict) and "name" in function_call and "args" in function_call:
                    tool_name = function_call["name"]
                    args = function_call["args"]

                    if isinstance(args, dict):
                        tool_call = ParsedToolCall(
                            tool_name=tool_name,
                            parameters=args,
                            raw_call=response.strip(),  # The entire JSON response
                            confidence=1.0,  # Highest confidence for pure JSON format
                        )
                        tool_calls.append(tool_call)
                        return tool_calls, ""  # No remaining text for pure JSON

        except (json.JSONDecodeError, KeyError, TypeError) as e:
            # Not a valid tool call JSON - this is normal for conversational responses
            logger.debug(f"Response is not tool call JSON (expected for conversational responses): {e}")
            logger.debug(f"Non-JSON response content: {repr(response)}")
            pass

        return tool_calls, response  # Return original response as remaining text

    def _parse_structured_function_calls(
        self, response: str
    ) -> Tuple[List[ParsedToolCall], str]:
        """Parse structured function calls in Gemini CLI format."""
        tool_calls = []
        remaining_text = response

        # Look for structured functionCall objects
        matches = self.structured_function_call_pattern.findall(response)

        for tool_name, args_json in matches:
            try:
                # Parse the JSON args
                args = json.loads(args_json)

                tool_call = ParsedToolCall(
                    tool_name=tool_name,
                    parameters=args,
                    raw_call=f'{{"functionCall": {{"name": "{tool_name}", "args": {args_json}}}}}',
                    confidence=1.0,  # Highest confidence for structured format
                )
                tool_calls.append(tool_call)

                # Remove this call from remaining text
                call_text = f'{{"functionCall": {{"name": "{tool_name}", "args": {args_json}}}}}'
                remaining_text = remaining_text.replace(call_text, "", 1)

            except json.JSONDecodeError as e:
                logger.debug(
                    f"Failed to parse structured function call args for {tool_name}: {e}"
                )
                continue

        return tool_calls, remaining_text

    def _clean_text_content(self, text: str, tool_calls: List[ParsedToolCall]) -> str:
        """Clean up text content by removing tool call artifacts."""
        # Remove common tool call prefixes/suffixes
        text = re.sub(
            r"^\s*(Call|Execute|Use|Run)\s+(the\s+)?\w+\s+(tool|function)",
            "",
            text,
            flags=re.MULTILINE | re.IGNORECASE,
        )
        text = re.sub(
            r"with\s+parameters?\s*[:\-]?\s*$",
            "",
            text,
            flags=re.MULTILINE | re.IGNORECASE,
        )

        # Remove empty lines at the beginning
        text = text.lstrip("\n")

        # Remove tool call JSON from text
        for call in tool_calls:
            text = text.replace(call.raw_call, "")

        # Clean up extra whitespace
        text = re.sub(r"\n\s*\n\s*\n", "\n\n", text)

        return text.strip()

