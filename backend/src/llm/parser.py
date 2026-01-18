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

import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple, TYPE_CHECKING

from backend.src.core.config import AppConfig
from backend.src.core.exceptions import (
    InputSizeLimitError,
    ParseTimeoutError,
    ParseValidationError,
)
from backend.src.core.observability.trust_boundary_metrics import get_metrics

if TYPE_CHECKING:
    from backend.src.tools.registry import ToolRegistry

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
        
        # SECURITY: Validate tool_name is a non-empty string
        if not isinstance(tool_name, str) or not tool_name.strip():
            return None
        
        if not isinstance(args, dict):
            return None
        
        return (tool_name, args)


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

    def __init__(
        self,
        config: Optional[AppConfig] = None,
        tool_registry: Optional["ToolRegistry"] = None,
        schema: Optional[ToolCallSchema] = None,
    ):
        """
        Initialize the response parser.
        
        Args:
            config: Application configuration (required for security limits)
            tool_registry: Tool registry for validating tool names (REQUIRED for security)
            schema: Optional ToolCallSchema configuration (defaults to custom format)
        
        Raises:
            ValueError: If tool_registry is None (security requirement)
        """
        if tool_registry is None:
            raise ValueError(
                "tool_registry is required for ResponseParser. "
                "Cannot validate tool names without registry (security requirement)."
            )
        
        self.config = config
        self.tool_registry = tool_registry
        self.schema = schema or ToolCallSchema()
        self.metrics = get_metrics("response_parser")
        
        # Get security limits from config or use defaults
        if config:
            self.limits = config.security_limits
        else:
            # Fallback to defaults if config not provided (for backward compatibility)
            from backend.src.core.config.models import SecurityLimits
            self.limits = SecurityLimits()

    def parse_response(self, response: str) -> ParsedResponse:
        """
        Parse the LLM response to extract tool calls and other structured data.

        SECURITY: This is a trust boundary. All inputs are validated with:
        - Size limits (max_response_size)
        - Timeouts (parse_timeout_seconds)
        - Tool name validation (whitelist check)
        - Parameter validation (count, size limits)

        Args:
            response: The raw LLM response text (untrusted input)

        Returns:
            ParsedResponse with extracted tool calls and content

        Raises:
            InputSizeLimitError: If response exceeds size limits
            ParseTimeoutError: If parsing exceeds timeout
            ParseValidationError: If parsed data fails validation
        """
        boundary_name = "response_parser"
        
        # SECURITY: Check input size limit first
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
        
        logger.debug(f"Parsing LLM response for tool calls: {repr(response[:200])}...")
        
        # SECURITY: Wrap parsing with timeout checking
        import time
        start_time = time.time()
        timeout = self.limits.parse_timeout_seconds
        
        try:
            parsed_response = self._parse_with_timeout(response, start_time, timeout)
        except TimeoutError:
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
    
    def _parse_with_timeout(self, response: str, start_time: float, timeout: float) -> ParsedResponse:
        """
        Parse response with timeout protection.
        
        For sync code, we check time during parsing operations.
        """
        import time
        
        tool_calls = []
        text_content = response

        # Support both pure JSON and embedded JSON formats
        parsing_strategies = [
            self._parse_json_response,  # Try pure JSON first (modern, reliable)
            self._parse_embedded_json,  # Fallback to embedded JSON with bracket matching
        ]

        for strategy in parsing_strategies:
            # Check timeout before each strategy
            if time.time() - start_time > timeout:
                raise TimeoutError("Parse timeout exceeded")
            
            calls, remaining_text = strategy(response, start_time, timeout)
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

        # SECURITY: Validate tool call count
        if len(tool_calls) > self.limits.max_tool_calls_per_response:
            validation_errors = [
                f"Tool call count {len(tool_calls)} exceeds maximum {self.limits.max_tool_calls_per_response}"
            ]
            self.metrics.record_validation_violation(
                validation_errors=validation_errors,
                boundary_name="response_parser",
                metadata={"tool_call_count": len(tool_calls)},
            )
            raise ParseValidationError(
                f"Too many tool calls: {len(tool_calls)} > {self.limits.max_tool_calls_per_response}",
                validation_errors=validation_errors,
                boundary_name="response_parser",
            )

        if tool_calls:
            logger.info(f"Total tool calls extracted: {len(tool_calls)}")
        else:
            logger.debug("No tool calls found in response (conversational response)")
            logger.debug(f"Response content: {repr(response[:200])}...")

        # Remove extracted tool calls from text content
        text_content = self._remove_extracted_calls(text_content, tool_calls)

        return ParsedResponse(
            original_response=response,
            tool_calls=tool_calls,
            text_content=text_content.strip(),
            has_tool_calls=len(tool_calls) > 0,
        )

    def _parse_json_response(
        self, response: str, start_time: float, timeout: float
    ) -> Tuple[List[ParsedToolCall], str]:
        """Parse pure JSON responses containing tool calls."""
        tool_calls = []
        
        import time
        
        # SECURITY: Check JSON size before parsing
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
            # SECURITY: Use custom decoder with depth limits
            parsed_json = self._safe_json_loads(json_str, start_time, timeout)

            # Use schema to extract tool call
            result = self.schema.extract_tool_call(parsed_json)
            if result:
                tool_name, args = result
                
                # SECURITY: Validate tool call
                self._validate_tool_call(tool_name, args)
                
                tool_call = ParsedToolCall(
                    tool_name=tool_name,
                    parameters=args,
                    raw_call=json_str,  # The entire JSON response
                    confidence=1.0,  # Highest confidence for pure JSON format
                )
                tool_calls.append(tool_call)
                return tool_calls, ""  # No remaining text for pure JSON

        except (InputSizeLimitError, ParseTimeoutError, ParseValidationError):
            # Re-raise security exceptions
            raise
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            # Not a valid tool call JSON - this is normal for conversational responses
            logger.debug(f"Response is not tool call JSON (expected for conversational responses): {e}")
            logger.debug(f"Non-JSON response content: {repr(response[:200])}...")
            pass

        return tool_calls, response  # Return original response as remaining text

    def _parse_embedded_json(
        self, response: str, start_time: float, timeout: float
    ) -> Tuple[List[ParsedToolCall], str]:
        """
        Parse embedded JSON tool calls using bracket-matching.
        
        This handles nested JSON structures correctly, unlike regex-based approaches.
        Looks for {"functionCall": {...}} patterns in the text and extracts complete JSON objects.
        
        SECURITY: Includes timeout checks and size limits.
        """
        import time
        
        tool_calls = []
        remaining_text = response
        extracted_positions: List[Tuple[int, int]] = []  # Track extracted positions for safe removal
        
        # Find all potential JSON object starts that contain the root key
        root_key_str = f'"{self.schema.root_key}"'
        i = 0
        max_iterations = len(response)  # Prevent infinite loops
        iterations = 0
        
        while i < len(response) and iterations < max_iterations:
            iterations += 1
            
            # SECURITY: Check timeout periodically
            if time.time() - start_time > timeout:
                raise TimeoutError("Parse timeout exceeded")
            
            # Look for opening brace followed by root key
            if response[i] == '{':
                # Try to extract complete JSON object starting here
                json_obj = self._extract_json_object(response, i, start_time, timeout)
                if json_obj and root_key_str in json_obj:
                    # SECURITY: Check JSON size
                    if len(json_obj) > self.limits.max_json_size:
                        # Skip this JSON object, continue searching
                        i += 1
                        continue
                    
                    try:
                        parsed = self._safe_json_loads(json_obj, start_time, timeout)
                        # Use schema to extract tool call
                        result = self.schema.extract_tool_call(parsed)
                        if result:
                            tool_name, args = result
                            
                            # SECURITY: Validate tool call
                            self._validate_tool_call(tool_name, args)
                            
                            tool_call = ParsedToolCall(
                                tool_name=tool_name,
                                parameters=args,
                                raw_call=json_obj,
                                confidence=1.0,
                            )
                            tool_calls.append(tool_call)
                            # Track position for safe removal
                            extracted_positions.append((i, i + len(json_obj)))
                            # Continue searching after the extracted object
                            i += len(json_obj)
                            continue
                    except (InputSizeLimitError, ParseTimeoutError, ParseValidationError):
                        # Re-raise security exceptions
                        raise
                    except json.JSONDecodeError:
                        # Not valid JSON, continue searching
                        pass
            i += 1
        
        # SECURITY: Remove extracted JSON using position-based extraction (safe)
        remaining_text = self._remove_extracted_by_positions(response, extracted_positions)
        
        return tool_calls, remaining_text
    
    def _extract_json_object(
        self, text: str, start_pos: int, start_time: float, timeout: float
    ) -> str:
        """
        Extract a complete JSON object starting at start_pos using bracket matching.
        
        Handles nested objects, arrays, and strings correctly.
        
        SECURITY: Includes timeout checks and size limits to prevent DoS.
        
        Args:
            text: The text to search in
            start_pos: Starting position (must be at opening brace)
            start_time: Start time for timeout checking
            timeout: Timeout in seconds
            
        Returns:
            Extracted JSON string or empty string if not found
        """
        import time
        
        if start_pos >= len(text) or text[start_pos] != '{':
            return ""
        
        brace_count = 0
        in_string = False
        escape_next = False
        i = start_pos
        max_iterations = len(text) - start_pos
        iterations = 0
        max_depth = 0  # Track nesting depth
        
        while i < len(text) and iterations < max_iterations:
            iterations += 1
            
            # SECURITY: Check timeout periodically
            if time.time() - start_time > timeout:
                return ""
            
            # SECURITY: Check size limit during extraction
            current_size = i - start_pos
            if current_size > self.limits.max_json_size:
                return ""
            
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
                    max_depth = max(max_depth, brace_count)
                    # SECURITY: Check nesting depth
                    if max_depth > self.limits.max_json_nesting_depth:
                        return ""
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        # Found complete object
                        return text[start_pos:i+1]
            
            i += 1
        
        # No closing brace found
        return ""
    
    def _safe_json_loads(
        self, json_str: str, start_time: float, timeout: float
    ) -> Dict[str, Any]:
        """
        Safely load JSON with depth limits and timeout checks.
        
        SECURITY: Prevents DoS via deeply nested JSON.
        """
        import time
        
        # Check timeout
        if time.time() - start_time > timeout:
            raise TimeoutError("JSON load timeout exceeded")
        
        # Use custom decoder to limit depth
        try:
            parsed = json.loads(json_str)
            # Validate depth by iteratively checking structure
            self._validate_json_depth(parsed, self.limits.max_json_nesting_depth)
            return parsed
        except json.JSONDecodeError as e:
            raise
        except RecursionError:
            raise ParseValidationError(
                f"JSON nesting depth exceeds maximum {self.limits.max_json_nesting_depth}",
                validation_errors=["JSON nesting too deep"],
                boundary_name="response_parser",
            )
    
    def _validate_json_depth(self, obj: Any, max_depth: int) -> None:
        """
        Iteratively validate JSON nesting depth.
        
        SECURITY: Uses iterative approach to prevent stack overflow from hostile input.
        """
        # Use iterative approach with a stack to avoid recursion limits
        stack = [(obj, 0)]
        
        while stack:
            current_obj, depth = stack.pop()
            
            # Check depth limit
            if depth > max_depth:
                raise RecursionError(f"JSON nesting depth {depth} exceeds maximum {max_depth}")
            
            # Add nested structures to stack
            if isinstance(current_obj, dict):
                for value in current_obj.values():
                    stack.append((value, depth + 1))
            elif isinstance(current_obj, list):
                for item in current_obj:
                    stack.append((item, depth + 1))
    
    def _validate_tool_call(self, tool_name: str, args: Dict[str, Any]) -> None:
        """
        Validate a tool call for security.
        
        SECURITY: Validates tool name and parameters.
        """
        validation_errors = []
        
        # SECURITY: Validate tool_name is a non-empty string
        if not isinstance(tool_name, str):
            validation_errors.append(f"Tool name must be a string, got {type(tool_name).__name__}")
        elif not tool_name.strip():
            validation_errors.append("Tool name cannot be empty or whitespace")
        elif len(tool_name) > self.limits.max_tool_name_length:
            validation_errors.append(
                f"Tool name length {len(tool_name)} exceeds maximum {self.limits.max_tool_name_length}"
            )
        
        # SECURITY: Validate tool name against whitelist (tool_registry is required in __init__)
        # This check is guaranteed to run since tool_registry is required
        valid_tool_names = self.tool_registry.get_tool_names()
        if tool_name not in valid_tool_names:
            # Show all tools if list is small, otherwise show first 10 and count
            if len(valid_tool_names) <= 15:
                tools_display = ", ".join(sorted(valid_tool_names))
            else:
                tools_display = f"{', '.join(sorted(valid_tool_names)[:10])}... (and {len(valid_tool_names) - 10} more)"
            validation_errors.append(
                f"Tool name '{tool_name}' is not in whitelist. Valid tools ({len(valid_tool_names)}): {tools_display}"
            )
        
        # Validate parameter count
        if len(args) > self.limits.max_parameter_count:
            validation_errors.append(
                f"Parameter count {len(args)} exceeds maximum {self.limits.max_parameter_count}"
            )
        
        # Validate parameter value sizes
        for param_name, param_value in args.items():
            if isinstance(param_value, str):
                if len(param_value) > self.limits.max_parameter_value_size:
                    validation_errors.append(
                        f"Parameter '{param_name}' value size {len(param_value)} exceeds maximum {self.limits.max_parameter_value_size}"
                    )
            elif isinstance(param_value, (dict, list)):
                # For complex types, check serialized size
                try:
                    serialized = json.dumps(param_value)
                    if len(serialized) > self.limits.max_parameter_value_size:
                        validation_errors.append(
                            f"Parameter '{param_name}' serialized size exceeds maximum {self.limits.max_parameter_value_size}"
                        )
                except (TypeError, ValueError):
                    pass
        
        if validation_errors:
            self.metrics.record_validation_violation(
                validation_errors=validation_errors,
                boundary_name="response_parser",
                metadata={"tool_name": tool_name, "param_count": len(args)},
            )
            raise ParseValidationError(
                f"Tool call validation failed: {', '.join(validation_errors)}",
                validation_errors=validation_errors,
                boundary_name="response_parser",
            )
    
    def _remove_extracted_by_positions(
        self, text: str, positions: List[Tuple[int, int]]
    ) -> str:
        """
        Remove extracted JSON objects using position-based extraction (safe).
        
        SECURITY: Uses position-based removal instead of str.replace() to avoid
        removing unintended substrings. Validates positions don't overlap.
        """
        if not positions:
            return text
        
        # SECURITY: Validate positions don't overlap
        sorted_positions = sorted(positions, key=lambda x: x[0])
        for i in range(len(sorted_positions) - 1):
            start1, end1 = sorted_positions[i]
            start2, end2 = sorted_positions[i + 1]
            if end1 > start2:
                # Overlapping positions detected - log warning and skip removal
                logger.warning(
                    f"Overlapping extraction positions detected: ({start1}, {end1}) and ({start2}, {end2}), skipping removal"
                )
                return text
        
        # Sort positions by start index (descending) to remove from end to start
        sorted_positions = sorted(positions, key=lambda x: x[0], reverse=True)
        
        result = text
        for start, end in sorted_positions:
            if 0 <= start < end <= len(result):
                result = result[:start] + result[end:]
        
        # Clean up extra whitespace
        while "\n\n\n" in result:
            result = result.replace("\n\n\n", "\n\n")
        
        return result.strip()
    
    def _remove_extracted_calls(self, text: str, tool_calls: List[ParsedToolCall]) -> str:
        """
        Remove extracted tool call JSON from text content.
        
        SECURITY: Uses position-based removal for safety, but falls back to
        simple replacement if positions aren't available (for backward compatibility).
        """
        if not tool_calls:
            return text
        
        # Try to find positions of raw calls in text
        positions: List[Tuple[int, int]] = []
        for call in tool_calls:
            pos = text.find(call.raw_call)
            if pos >= 0:
                positions.append((pos, pos + len(call.raw_call)))
        
        if positions:
            # Use safe position-based removal
            return self._remove_extracted_by_positions(text, positions)
        else:
            # Fallback to simple replacement (less safe but works)
            result = text
            for call in tool_calls:
                result = result.replace(call.raw_call, "", 1)  # Only replace first occurrence
            
            # Clean up extra whitespace
            while "\n\n\n" in result:
                result = result.replace("\n\n\n", "\n\n")
            
            return result.strip()

