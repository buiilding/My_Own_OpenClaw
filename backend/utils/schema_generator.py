"""
Automatic JSON Schema Generation for Tools.

This module provides utilities to automatically generate JSON schemas
from Python function signatures and type hints.
"""

import inspect
from typing import Any, Dict, List, Optional, Union, get_origin, get_args
from enum import Enum


class SchemaGenerator:
    """
    Generates JSON schemas from Python type hints and function signatures.
    """

    def __init__(self):
        self.type_mappings = {
            str: {"type": "string"},
            int: {"type": "number"},
            float: {"type": "number"},
            bool: {"type": "boolean"},
            list: {"type": "array"},
            dict: {"type": "object"},
        }

    def generate_schema_from_function(self, func: callable, tool_name: str, description: str) -> Dict[str, Any]:
        """
        Generate a JSON schema from a function's signature and type hints.

        Args:
            func: The function to analyze
            tool_name: Name of the tool
            description: Description of the tool

        Returns:
            JSON schema dictionary
        """
        sig = inspect.signature(func)
        parameters = {}

        for param_name, param in sig.parameters.items():
            # Skip 'self', 'context', and **kwargs parameters
            if param_name in ['self', 'context'] or param.kind == param.VAR_KEYWORD:
                continue

            param_schema = self._generate_parameter_schema(param)
            if param_schema:
                parameters[param_name] = param_schema

        required = [
            name for name, param in sig.parameters.items()
            if param.default == inspect.Parameter.empty
            and name not in ['self', 'context']
            and param.kind != param.VAR_KEYWORD
        ]

        return {
            "name": tool_name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": parameters,
                "required": required
            }
        }

    def _generate_parameter_schema(self, param: inspect.Parameter) -> Optional[Dict[str, Any]]:
        """
        Generate schema for a single parameter.

        Args:
            param: The parameter to analyze

        Returns:
            Parameter schema or None if parameter should be skipped
        """
        if param.annotation == inspect.Parameter.empty:
            # No type hint - assume string
            schema = {"type": "string"}
        else:
            schema = self._type_hint_to_schema(param.annotation)

        # Add description from default value if it's a string
        if param.default != inspect.Parameter.empty and isinstance(param.default, str):
            # If default is a string, it might be a description
            schema["description"] = param.default
        elif not schema.get("description"):
            # Add a generic description
            schema["description"] = f"Parameter {param.name}"

        return schema

    def _type_hint_to_schema(self, type_hint: Any) -> Dict[str, Any]:
        """
        Convert Python type hints to JSON schema.

        Args:
            type_hint: Python type hint

        Returns:
            JSON schema fragment
        """
        # Handle Union types (e.g., Optional, Union)
        origin = get_origin(type_hint)
        args = get_args(type_hint)

        if origin is Union:
            # Handle Optional[T] which is Union[T, None]
            non_none_args = [arg for arg in args if arg is not type(None)]
            if len(non_none_args) == 1:
                # This is Optional[T]
                schema = self._type_hint_to_schema(non_none_args[0])
                schema["description"] = f"{schema.get('description', '')} (optional)".strip()
                return schema
            else:
                # Multiple types - not supported in JSON schema, use string
                return {"type": "string", "description": "Multiple types allowed"}

        # Handle List types
        if origin is list or origin is List:
            item_schema = {"type": "string"}  # Default
            if args:
                item_schema = self._type_hint_to_schema(args[0])
            return {
                "type": "array",
                "items": item_schema,
                "description": "List of items"
            }

        # Handle Dict types
        if origin is dict or origin is Dict:
            return {
                "type": "object",
                "description": "Key-value pairs"
            }

        # Handle basic types
        if type_hint in self.type_mappings:
            return self.type_mappings[type_hint].copy()

        # Handle classes and enums
        if inspect.isclass(type_hint):
            if issubclass(type_hint, Enum):
                return {
                    "type": "string",
                    "enum": [e.value for e in type_hint],
                    "description": f"Enum: {', '.join(e.value for e in type_hint)}"
                }
            else:
                # Custom class - treat as object
                return {"type": "object", "description": f"{type_hint.__name__} object"}

        # Default fallback
        return {"type": "string", "description": "Parameter value"}


def generate_tool_schema(func: callable, tool_name: str, description: str) -> Dict[str, Any]:
    """
    Convenience function to generate a tool schema.

    Args:
        func: The tool's execute_async method
        tool_name: Name of the tool
        description: Description of the tool

    Returns:
        JSON schema for the tool
    """
    generator = SchemaGenerator()
    return generator.generate_schema_from_function(func, tool_name, description)
