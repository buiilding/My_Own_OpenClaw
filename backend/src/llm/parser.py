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
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple, TYPE_CHECKING

from backend.src.core.config import AppConfig
from backend.src.core.infrastructure.exceptions import (
    InputSizeLimitError,
    ParseTimeoutError,
    ParseValidationError,
)
from backend.src.core.observability.trust_boundary_metrics import (
    MetricsService,
)

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
    metadata: Optional[Dict[str, Any]] = None  # Metadata for computer-use tools (description, explanation, expectation)


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
    
    def extract_tool_call(self, parsed_json: Dict[str, Any]) -> Optional[Tuple[str, Dict[str, Any], Optional[Dict[str, Any]]]]:
        """
        Extract tool name, args, and metadata from parsed JSON.
        
        Supports two formats:
        1. Computer-use tools: {"metadata": {...}, "action": {"functionCall": {"name": "...", "args": {...}}}}
        2. Standard tools: {"functionCall": {"name": "...", "args": {...}}}
        
        Args:
            parsed_json: Parsed JSON dictionary
            
        Returns:
            Tuple of (tool_name, args_dict, metadata_dict) or None if not a valid tool call
            - metadata_dict is None for standard tools
            - metadata_dict contains description, explanation, expectation for computer-use tools
        """
        if not isinstance(parsed_json, dict):
            return None
        
        # Check for computer-use tool format (metadata + action wrapper)
        # Note: This check is order-independent - handles {"metadata": ..., "action": ...}
        # as well as {"action": ..., "metadata": ...} for robustness
        if "metadata" in parsed_json and "action" in parsed_json:
            # Computer-use tool format
            metadata = parsed_json.get("metadata")
            action = parsed_json.get("action")
            
            # Validate metadata exists and is a dict
            if not isinstance(metadata, dict):
                return None
            
            # Validate action exists and contains functionCall
            if not isinstance(action, dict) or self.root_key not in action:
                return None
            
            function_call = action[self.root_key]
            if not isinstance(function_call, dict):
                return None
            
            # Extract name and args from action.functionCall
            tool_name = function_call.get(self.name_key)
            args = function_call.get(self.args_key, {})
            
            # SECURITY: Validate tool_name is a non-empty string
            if not isinstance(tool_name, str) or not tool_name.strip():
                return None
            
            if not isinstance(args, dict):
                return None
            
            return (tool_name, args, metadata)
        
        # Standard format: direct functionCall
        if self.root_key in parsed_json:
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
            
            return (tool_name, args, None)
        
        return None


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
        # Use injected MetricsService or create a new instance (for backward compatibility)
        if metrics_service is None:
            from backend.src.core.observability.trust_boundary_metrics import MetricsService
            metrics_service = MetricsService()
        self.metrics = metrics_service.get_metrics("response_parser")
        self.limits = config.security_limits
        # Thread pool executor for CPU-bound parsing operations
        # Using a bounded pool to prevent resource exhaustion
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="parser")
    
    def shutdown(self) -> None:
        """
        Shutdown the parser and clean up resources.
        
        Call this when the parser is no longer needed to properly close
        the thread pool executor. This is optional but recommended for
        long-running applications.
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
        
        # SECURITY: Validate input type and None
        if response is None:
            raise ValueError(
                "response cannot be None. Trust boundary requires valid string input.",
            )
        if not isinstance(response, str):
            raise TypeError(
                f"response must be str, got {type(response).__name__}. "
                "Trust boundary requires string input.",
            )
        
        # Empty responses are valid (no tool calls, empty text content)
        # They will pass size checks (0 bytes) and return empty ParsedResponse
        
        # SECURITY: Check input size limit first (fast check, no need for executor)
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
        
        # SECURITY: Offload CPU-bound parsing to thread pool with real timeout
        # asyncio.wait_for provides actual cancellation, unlike cooperative checks
        loop = asyncio.get_running_loop()
        try:
            parsed_response = await asyncio.wait_for(
                loop.run_in_executor(self._executor, self._parse_sync, response),
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
        
        This method contains the original parsing logic, now executed
        in a separate thread to prevent blocking the async event loop.
        
        SECURITY: All security checks are preserved. Timeout checks inside
        this method are kept for defense-in-depth, but the real timeout
        is enforced by asyncio.wait_for in parse_response.
        """
        # Note: Input validation and size checks are done in parse_response
        # before this method is called, but we keep them here for safety
        
        tool_calls = []
        text_content = response

        # Support both pure JSON and embedded JSON formats
        parsing_strategies = [
            self._parse_json_response,  # Try pure JSON first (modern, reliable)
            self._parse_embedded_json,  # Fallback to embedded JSON with bracket matching
        ]

        # Use a dummy start_time for backward compatibility with strategy methods
        # Real timeout is enforced by asyncio.wait_for
        import time
        start_time = time.monotonic()
        timeout = self.limits.parse_timeout_seconds

        for strategy in parsing_strategies:
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
                tool_name, args, metadata = result
                
                # SECURITY: Validate tool call
                self._validate_tool_call(tool_name, args)
                
                # Validate metadata for computer-use tools
                self._validate_metadata(tool_name, metadata)
                
                tool_call = ParsedToolCall(
                    tool_name=tool_name,
                    parameters=args,
                    raw_call=json_str,  # The entire JSON response
                    confidence=1.0,  # Highest confidence for pure JSON format
                    metadata=metadata,
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
        Parse embedded JSON tool calls using iterative scanning decoder.
        
        PERFORMANCE: Uses regex to find opening braces, then leverages
        C-optimized json.JSONDecoder.raw_decode() to extract complete objects.
        
        This approach naturally handles:
        - Chaining: {}{} (parses first, gets end index, resumes)
        - Key reordering: {"action": ..., "metadata": ...} (parses first, validates second)
        - Interleaved text: Text... JSON... Text... JSON
        
        Unlike the previous regex-first approach, this method:
        - Doesn't require "metadata" or "functionCall" to be the first key
        - Handles compact chaining naturally by advancing position after each parse
        - Validates structure after parsing (order-independent)
        
        SECURITY: Includes timeout checks and size limits.
        """
        import time
        
        tool_calls = []
        extracted_positions: List[Tuple[int, int]] = []  # Track extracted positions for safe removal
        decoder = json.JSONDecoder()
        pos = 0
        
        # Scan through the entire response
        while pos < len(response):
            # SECURITY: Check timeout periodically
            if time.monotonic() - start_time > timeout:
                raise ParseTimeoutError(
                    "Parse timeout exceeded",
                    timeout_seconds=timeout,
                    boundary_name="response_parser",
                )
            
            # SECURITY: Check position limit
            if pos > self.limits.max_response_size:
                break
            
            # 1. Scan for the next opening brace '{'
            # CRITICAL: Use relaxed regex (just '{') for true order-independence.
            # We don't check for specific keys like "metadata" or "functionCall" here.
            # This allows parsing {"action": ..., "metadata": ...} regardless of key order.
            # Validation happens AFTER parsing via schema.extract_tool_call().
            match = re.search(r'\{', response[pos:])
            
            if not match:
                break  # No more JSON candidates
            
            # Calculate absolute start position
            start_index = pos + match.start()
            
            # SECURITY: Check size limit for remaining text
            remaining = len(response) - start_index
            if remaining > self.limits.max_json_size:
                # Skip this position and continue searching
                pos = start_index + 1
                continue
            
            # 2. Attempt to decode a full JSON object starting at this brace
            try:
                # Use raw_decode to extract JSON object and get end position
                # This is C-optimized and handles nested structures correctly
                parsed, end_index = decoder.raw_decode(response, idx=start_index)
                
                # Extract the JSON string for size checking
                json_obj = response[start_index:end_index]
                
                # SECURITY: Check JSON size
                if len(json_obj) > self.limits.max_json_size:
                    # Skip this position and continue
                    pos = start_index + 1
                    continue
                
                # 3. Validation: Check if this JSON is actually a tool call
                # This is order-independent (unlike the regex approach)
                result = self.schema.extract_tool_call(parsed)
                
                if result:
                    tool_name, args, metadata = result
                    
                    # SECURITY: Validate tool call
                    self._validate_tool_call(tool_name, args)
                    
                    # Validate metadata for computer-use tools
                    self._validate_metadata(tool_name, metadata)
                    
                    tool_call = ParsedToolCall(
                        tool_name=tool_name,
                        parameters=args,
                        raw_call=json_obj,
                        confidence=1.0,
                        metadata=metadata,
                    )
                    tool_calls.append(tool_call)
                    extracted_positions.append((start_index, end_index))
                    
                    # 4. Success: Advance pointer to the end of this object
                    # This effectively prepares us for the next chained call
                    pos = end_index
                else:
                    # Not a valid tool call, advance past this brace
                    pos = start_index + 1
                    
            except (InputSizeLimitError, ParseTimeoutError, ParseValidationError):
                # Re-raise security exceptions
                raise
            except (json.JSONDecodeError, ValueError, IndexError):
                # 5. Failure: The '{' was not the start of valid JSON
                # (e.g., inside a code block, regular text, or malformed JSON)
                # CRITICAL: Must advance position to prevent infinite loop.
                # If we don't skip this '{', the loop will hang forever on the same position.
                pos = start_index + 1
        
        # SECURITY: Remove extracted JSON using position-based extraction (safe)
        remaining_text = self._remove_extracted_by_positions(response, extracted_positions)
        
        return tool_calls, remaining_text
    
    def _extract_json_object(
        self, text: str, start_pos: int, start_time: float, timeout: float
    ) -> str:
        """
        Extract a complete JSON object starting at start_pos using json.JSONDecoder.
        
        PERFORMANCE: Uses C-optimized json.JSONDecoder.raw_decode() instead of
        slow character-by-character Python loops. This is orders of magnitude faster
        for large JSON objects.
        
        DEPRECATED: This method is kept for backward compatibility but is no longer
        used by _parse_embedded_json which now uses the optimized approach directly.
        
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
        
        # SECURITY: Check size limit
        remaining = len(text) - start_pos
        if remaining > self.limits.max_json_size:
            return ""
        
        # SECURITY: Check timeout
        if time.monotonic() - start_time > timeout:
            return ""
        
        try:
            # Use C-optimized JSON decoder to extract object
            decoder = json.JSONDecoder()
            _, end_pos = decoder.raw_decode(text, idx=start_pos)
            return text[start_pos:end_pos]
        except (json.JSONDecodeError, ValueError, IndexError):
            # Not valid JSON at this position
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
        if time.monotonic() - start_time > timeout:
            raise TimeoutError("JSON load timeout exceeded")
        
        # Use custom decoder to limit depth
        try:
            parsed = json.loads(json_str)
            # Validate depth by iteratively checking structure
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
        allowed_tools = self.config.get_tool_allowlist()
        if allowed_tools is not None:
            valid_tool_names = [name for name in valid_tool_names if name in allowed_tools]
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
    
    def _validate_metadata(self, tool_name: str, metadata: Optional[Dict[str, Any]]) -> None:
        """
        Validate metadata for computer-use tools.
        
        SECURITY: Computer-use tools MUST have metadata with required fields.
        Metadata must be generated first, otherwise tool call is rejected.
        
        Args:
            tool_name: Name of the tool
            metadata: Metadata dict (None for non-computer-use tools)
            
        Raises:
            ParseValidationError: If computer-use tool is missing metadata or required fields
        """
        # Import here to avoid circular import
        from backend.src.tools.categorization import ToolDomain
        
        # Check if this is a computer-use tool
        tool = self.tool_registry.get_tool(tool_name)
        is_computer_use = False
        if tool and hasattr(tool, 'category'):
            is_computer_use = tool.category == ToolDomain.COMPUTER
        
        if not is_computer_use:
            # Non-computer-use tools don't need metadata
            if metadata is not None:
                # Warn but don't reject - metadata is ignored for non-computer tools
                logger.debug(f"Non-computer-use tool '{tool_name}' has metadata (will be ignored)")
            return
        
        # Computer-use tools MUST have metadata
        validation_errors = []
        
        if metadata is None:
            validation_errors.append(
                f"Computer-use tool '{tool_name}' is missing metadata. "
                "Metadata MUST be generated first before the action. "
                "Format: {{\"metadata\": {{\"explanation\": \"...\", \"expectation\": \"...\"}}, \"action\": {{...}}}}"
            )
        elif not isinstance(metadata, dict):
            validation_errors.append(
                f"Computer-use tool '{tool_name}' has invalid metadata type: {type(metadata).__name__}. "
                "Metadata must be a dictionary."
            )
        else:
            # Validate required fields
            if "description" not in metadata or not metadata["description"]:
                validation_errors.append(
                    f"Computer-use tool '{tool_name}' is missing required metadata field 'description'. "
                    "Description describes the most recent screenshot provided to you."
                )
            
            if "explanation" not in metadata or not metadata["explanation"]:
                validation_errors.append(
                    f"Computer-use tool '{tool_name}' is missing required metadata field 'explanation'. "
                    "Explanation describes why this tool is being used."
                )
            
            if "expectation" not in metadata or not metadata["expectation"]:
                validation_errors.append(
                    f"Computer-use tool '{tool_name}' is missing required metadata field 'expectation'. "
                    "Expectation describes what you expect to see after execution."
                )
        
        if validation_errors:
            self.metrics.record_validation_violation(
                validation_errors=validation_errors,
                boundary_name="response_parser",
                metadata={"tool_name": tool_name, "has_metadata": metadata is not None},
            )
            raise ParseValidationError(
                f"Metadata validation failed for computer-use tool '{tool_name}': {', '.join(validation_errors)}",
                validation_errors=validation_errors,
                boundary_name="response_parser",
            )
    
    def _remove_extracted_by_positions(
        self, text: str, positions: List[Tuple[int, int]]
    ) -> str:
        """
        Remove extracted JSON objects using position-based extraction (safe).
        
        PERFORMANCE: Uses O(N) list-based string construction instead of O(N²)
        string concatenation to prevent quadratic memory usage and runtime.
        
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
        
        # Sort positions by start index (ascending) for efficient processing
        sorted_positions = sorted(positions, key=lambda x: x[0])
        
        # OPTIMIZED: Build string using list of parts (O(N) instead of O(N²))
        parts = []
        current_idx = 0
        
        for start, end in sorted_positions:
            # Validate bounds
            if not (0 <= start < end <= len(text)):
                continue
            
            # Add text before this range
            if start > current_idx:
                parts.append(text[current_idx:start])
            
            # Skip the range (don't add it)
            current_idx = end
        
        # Add remaining text after last range
        if current_idx < len(text):
            parts.append(text[current_idx:])
        
        # Join all parts at once (O(N) operation)
        result = "".join(parts)
        
        # Clean up extra whitespace using regex (more efficient than iterative replace)
        result = re.sub(r'\n{3,}', '\n\n', result)
        
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
