"""
Error Formatter for Tool Execution Errors.

Provides LLM-friendly error messages that help the agent understand what went wrong
and how to fix tool calls.
"""
import json
from typing import Any, Dict, List, Optional

from pydantic import ValidationError


class ToolErrorFormatter:
    """Formats tool execution errors into LLM-friendly messages."""

    @staticmethod
    def format_validation_error(
        error: Exception,
        tool_name: str,
        tool_schema: Optional[Dict[str, Any]] = None,
        provided_params: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Format a Pydantic ValidationError into an LLM-friendly message.

        Args:
            error: The validation error exception
            tool_name: Name of the tool that failed validation
            tool_schema: Optional tool schema (from get_function_declarations)
            provided_params: Optional parameters that were provided

        Returns:
            Formatted error message with actionable guidance
        """
        if not isinstance(error, ValidationError):
            return f"Invalid parameters for tool '{tool_name}': {str(error)}"

        errors = error.errors()
        if not errors:
            return f"Invalid parameters for tool '{tool_name}': {str(error)}"

        # Group errors by type
        missing_fields: List[str] = []
        invalid_types: List[Dict[str, Any]] = []
        invalid_enums: List[Dict[str, Any]] = []
        extra_fields: List[str] = []
        other_errors: List[Dict[str, Any]] = []

        for err in errors:
            error_type = err.get("type", "")
            field_path = ".".join(str(loc) for loc in err.get("loc", []))
            error_msg = err.get("msg", "")

            if error_type == "missing":
                missing_fields.append(field_path)
            elif error_type == "value_error.missing":
                missing_fields.append(field_path)
            elif error_type in ("type_error", "type_error.str", "type_error.int", "type_error.float", "type_error.bool", "type_error.list"):
                invalid_types.append({
                    "field": field_path,
                    "expected": ToolErrorFormatter._extract_expected_type(err),
                    "received": err.get("input"),
                    "message": error_msg,
                })
            elif error_type == "literal_error":
                # Extract valid enum values from context
                ctx = err.get("ctx", {})
                expected_values = ctx.get("expected", [])
                invalid_enums.append({
                    "field": field_path,
                    "provided": err.get("input"),
                    "valid_values": expected_values,
                    "message": error_msg,
                })
            elif error_type == "value_error":
                # Check if it's an enum error (value not in allowed values)
                if "not in" in error_msg.lower() or "allowed" in error_msg.lower():
                    invalid_enums.append({
                        "field": field_path,
                        "provided": err.get("input"),
                        "valid_values": ToolErrorFormatter._extract_enum_values(field_path, tool_schema),
                        "message": error_msg,
                    })
                else:
                    other_errors.append({
                        "field": field_path,
                        "message": error_msg,
                    })
            elif error_type == "extra_forbidden":
                extra_fields.append(field_path)
            else:
                other_errors.append({
                    "field": field_path,
                    "type": error_type,
                    "message": error_msg,
                })

        # Build the error message
        parts: List[str] = []
        parts.append(f"Tool '{tool_name}' validation failed:")

        # Missing required fields
        if missing_fields:
            parts.append("\n❌ Missing required fields:")
            for field in missing_fields:
                field_info = ToolErrorFormatter._get_field_info(field, tool_schema)
                parts.append(f"  - {field}{field_info}")

        # Invalid types
        if invalid_types:
            parts.append("\n❌ Type errors:")
            for err_info in invalid_types:
                received_type = type(err_info["received"]).__name__ if err_info["received"] is not None else "None"
                parts.append(
                    f"  - {err_info['field']}: Expected {err_info['expected']}, "
                    f"but received {received_type} ({err_info['received']})"
                )

        # Invalid enum values
        if invalid_enums:
            parts.append("\n❌ Invalid enum values:")
            for err_info in invalid_enums:
                valid_str = ", ".join(f"'{v}'" for v in err_info["valid_values"]) if err_info["valid_values"] else "unknown"
                parts.append(
                    f"  - {err_info['field']}: Provided '{err_info['provided']}', "
                    f"but must be one of: {valid_str}"
                )

        # Extra fields
        if extra_fields:
            parts.append("\n❌ Unknown fields (not in tool schema):")
            for field in extra_fields:
                parts.append(f"  - {field}")

        # Other errors
        if other_errors:
            parts.append("\n❌ Other validation errors:")
            for err_info in other_errors:
                parts.append(f"  - {err_info['field']}: {err_info['message']}")

        # Add tool schema reference
        if tool_schema:
            parts.append(f"\n💡 Tool schema for '{tool_name}':")
            parts.append(json.dumps(tool_schema, indent=2))

        # Add provided parameters for context
        if provided_params:
            parts.append(f"\n📝 Parameters you provided:")
            parts.append(json.dumps(provided_params, indent=2))

        return "\n".join(parts)

    @staticmethod
    def _extract_expected_type(error: Dict[str, Any]) -> str:
        """Extract expected type from error context."""
        ctx = error.get("ctx", {})
        expected_type = ctx.get("expected_type", "")
        if expected_type:
            return expected_type
        # Try to infer from error message
        msg = error.get("msg", "")
        if "str" in msg.lower():
            return "string"
        elif "int" in msg.lower():
            return "integer"
        elif "float" in msg.lower():
            return "number"
        elif "bool" in msg.lower():
            return "boolean"
        elif "list" in msg.lower() or "array" in msg.lower():
            return "array"
        return "unknown type"

    @staticmethod
    def _extract_enum_values(field_path: str, tool_schema: Optional[Dict[str, Any]]) -> List[str]:
        """Extract valid enum values from tool schema."""
        if not tool_schema:
            return []

        # Navigate to the field in the schema
        params = tool_schema.get("parameters", {}).get("properties", {})
        field_name = field_path.split(".")[-1]  # Get the last part of the path

        if field_name in params:
            field_schema = params[field_name]
            enum_values = field_schema.get("enum")
            if enum_values:
                return [str(v) for v in enum_values]

        return []

    @staticmethod
    def _get_field_info(field_path: str, tool_schema: Optional[Dict[str, Any]]) -> str:
        """Get additional information about a field from the schema."""
        if not tool_schema:
            return ""

        params = tool_schema.get("parameters", {}).get("properties", {})
        field_name = field_path.split(".")[-1]

        if field_name in params:
            field_schema = params[field_name]
            desc = field_schema.get("description", "")
            field_type = field_schema.get("type", "")
            enum_values = field_schema.get("enum", [])

            info_parts = []
            if desc:
                info_parts.append(f" ({desc})")
            if enum_values:
                valid_str = ", ".join(f"'{v}'" for v in enum_values)
                info_parts.append(f" - valid values: {valid_str}")
            elif field_type:
                info_parts.append(f" - type: {field_type}")

            return "".join(info_parts)

        return ""

    @staticmethod
    def format_tool_not_found_error(
        tool_name: str,
        available_tools: Optional[List[str]] = None,
    ) -> str:
        """
        Format a tool not found error.

        Args:
            tool_name: Name of the tool that was not found
            available_tools: Optional list of available tool names

        Returns:
            Formatted error message
        """
        parts = [f"Tool '{tool_name}' is not available."]

        if available_tools:
            parts.append(f"\nAvailable tools: {', '.join(sorted(available_tools))}")
            parts.append(f"\n💡 Check your tool schemas to see the correct tool name and parameters.")

        return "\n".join(parts)

    @staticmethod
    def format_generic_error(
        error: Exception,
        tool_name: str,
        context: Optional[str] = None,
    ) -> str:
        """
        Format a generic execution error.

        Args:
            error: The exception that occurred
            tool_name: Name of the tool that failed
            context: Optional additional context

        Returns:
            Formatted error message
        """
        parts = [f"Error executing tool '{tool_name}': {str(error)}"]

        if context:
            parts.append(f"\nContext: {context}")

        return "\n".join(parts)


