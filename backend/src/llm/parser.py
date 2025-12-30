"""
Response Parser for the Desktop Assistant.

This module parses LLM responses to detect and extract tool calls,
converting them into a structured format for execution.

Uses robust bracket-matching JSON extraction instead of brittle regex patterns.
"""

import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

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


@dataclass
class ToolCallSchema:
    """
    Configuration for tool call JSON format.
    
    Allows parser to support different JSON schemas while defaulting to
    the custom format: {"functionCall": {"name": "...", "args": {...}}}
    """
    root_key: str = "functionCall"
    name_key: str = "name"
    args_key: str = "args"
    
    def extract_tool_call(self, parsed_json: Dict[str, Any]) -> Optional[Tuple[str, Dict[str, Any]]]:
        """
        Extract tool name and args from parsed JSON using configured keys.
        
        Args:
            parsed_json: Parsed JSON dictionary
            
        Returns:
            Tuple of (tool_name, args_dict) or None if not a valid tool call
        """
        if not isinstance(parsed_json, dict):
            return None
        
        # Check for root key (e.g., "functionCall")
        if self.root_key not in parsed_json:
            return None
        
        function_call = parsed_json[self.root_key]
        if not isinstance(function_call, dict):
            return None
        
        # Extract name and args using configured keys
        tool_name = function_call.get(self.name_key)
        args = function_call.get(self.args_key, {})
        
        if tool_name and isinstance(args, dict):
            return (tool_name, args)
        
        return None


class ResponseParser:
    """
    Parses structured responses from LLM outputs.

    Extracts tool calls using robust JSON parsing with bracket-matching
    for embedded JSON cases. No regex patterns - handles nested structures correctly.
    
    Supports configurable JSON schema via ToolCallSchema, defaulting to
    the custom format: {"functionCall": {"name": "...", "args": {...}}}
    """

    def __init__(self, schema: Optional[ToolCallSchema] = None):
        """
        Initialize the response parser.
        
        Args:
            schema: Optional ToolCallSchema configuration (defaults to custom format)
        """
        self.schema = schema or ToolCallSchema()

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
                self._parse_embedded_json,  # Fallback to embedded JSON with bracket matching
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

            # Remove extracted tool calls from text content
            text_content = self._remove_extracted_calls(text_content, tool_calls)

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

            # Use schema to extract tool call
            result = self.schema.extract_tool_call(parsed_json)
            if result:
                tool_name, args = result
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

    def _parse_embedded_json(
        self, response: str
    ) -> Tuple[List[ParsedToolCall], str]:
        """
        Parse embedded JSON tool calls using bracket-matching.
        
        This handles nested JSON structures correctly, unlike regex-based approaches.
        Looks for {"functionCall": {...}} patterns in the text and extracts complete JSON objects.
        """
        tool_calls = []
        remaining_text = response
        
        # Find all potential JSON object starts that contain the root key
        root_key_str = f'"{self.schema.root_key}"'
        i = 0
        while i < len(response):
            # Look for opening brace followed by root key
            if response[i] == '{':
                # Try to extract complete JSON object starting here
                json_obj = self._extract_json_object(response, i)
                if json_obj and root_key_str in json_obj:
                    try:
                        parsed = json.loads(json_obj)
                        # Use schema to extract tool call
                        result = self.schema.extract_tool_call(parsed)
                        if result:
                            tool_name, args = result
                            tool_call = ParsedToolCall(
                                tool_name=tool_name,
                                parameters=args,
                                raw_call=json_obj,
                                confidence=1.0,
                            )
                            tool_calls.append(tool_call)
                            # Remove extracted JSON from remaining text
                            remaining_text = remaining_text.replace(json_obj, "", 1)
                            # Continue searching after the extracted object
                            i += len(json_obj)
                            continue
                    except json.JSONDecodeError:
                        # Not valid JSON, continue searching
                        pass
            i += 1
        
        return tool_calls, remaining_text
    
    def _extract_json_object(self, text: str, start_pos: int) -> str:
        """
        Extract a complete JSON object starting at start_pos using bracket matching.
        
        Handles nested objects, arrays, and strings correctly.
        
        Args:
            text: The text to search in
            start_pos: Starting position (must be at opening brace)
            
        Returns:
            Extracted JSON string or empty string if not found
        """
        if start_pos >= len(text) or text[start_pos] != '{':
            return ""
        
        brace_count = 0
        in_string = False
        escape_next = False
        i = start_pos
        
        while i < len(text):
            char = text[i]
            
            if escape_next:
                escape_next = False
                i += 1
                continue
            
            if char == '\\':
                escape_next = True
                i += 1
                continue
            
            if char == '"' and not escape_next:
                in_string = not in_string
                i += 1
                continue
            
            if not in_string:
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        # Found complete object
                        return text[start_pos:i+1]
            
            i += 1
        
        # No closing brace found
        return ""
    
    def _remove_extracted_calls(self, text: str, tool_calls: List[ParsedToolCall]) -> str:
        """
        Remove extracted tool call JSON from text content.
        
        This is simpler than regex cleanup since we have exact JSON strings to remove.
        """
        result = text
        for call in tool_calls:
            result = result.replace(call.raw_call, "")
        
        # Clean up extra whitespace
        while "\n\n\n" in result:
            result = result.replace("\n\n\n", "\n\n")
        
        return result.strip()

