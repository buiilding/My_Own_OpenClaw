"""
SDK Tool Base Class.

This module provides the base Tool class that all tools in the system must inherit from.
Tools are defined using Pydantic models for argument validation and async execution.
"""
from typing import Any, Generic, Type, TypeVar, ClassVar
from abc import ABC, abstractmethod
from pydantic import BaseModel

from backend.src.sdk.context import ToolContext

# Type variable for the arguments model
TArgs = TypeVar("TArgs", bound=BaseModel)

class Tool(ABC, Generic[TArgs]):
    """
    Base class for all tools in the system.
    
    Usage:
        class MyToolArgs(BaseModel):
            path: str = Field(..., description="Path to file")

        class MyTool(Tool[MyToolArgs]):
            name = "my_tool"
            description = "Does something"
            args_model = MyToolArgs

            async def run(self, args: MyToolArgs, ctx: ToolContext) -> Any:
                return "result"
    """
    
    # These must be defined by subclasses
    name: ClassVar[str]
    description: ClassVar[str]
    args_model: Type[TArgs]

    @abstractmethod
    async def run(self, args: TArgs, ctx: ToolContext) -> Any:
        """
        The main execution logic of the tool.
        
        Args:
            args: The validated arguments (Pydantic model)
            ctx: The execution context (User, Session, etc.)
            
        Returns:
            The result of the tool execution (must be serializable)
        """
        pass

    def _clean_schema(self, schema: dict[str, Any]) -> dict[str, Any]:
        """
        Clean and optimize Pydantic-generated JSON schema for LLM consumption.
        
        Removes unnecessary fields and simplifies structure:
        - Removes 'title' fields
        - Removes 'additionalProperties' 
        - Simplifies Optional types (anyOf with null) to just optional fields
        - Removes redundant 'type: object' wrapper
        """
        if not isinstance(schema, dict):
            return schema
        
        cleaned = {}
        
        # Handle properties recursively
        if "properties" in schema:
            cleaned["properties"] = {
                key: self._clean_schema(value) 
                for key, value in schema["properties"].items()
            }
        
        # Handle required fields
        if "required" in schema:
            cleaned["required"] = schema["required"]
        
        # Handle type - simplify anyOf for Optional types
        if "anyOf" in schema:
            # Check if it's Optional[T] (Union[T, None])
            any_of = schema["anyOf"]
            non_null_types = [t for t in any_of if t.get("type") != "null"]
            
            if len(non_null_types) == 1:
                # It's Optional[T], use the non-null type
                cleaned.update(self._clean_schema(non_null_types[0]))
            else:
                # Keep anyOf but clean each option
                cleaned["anyOf"] = [self._clean_schema(t) for t in any_of]
        elif "type" in schema:
            cleaned["type"] = schema["type"]
        
        # Handle array items
        if "items" in schema:
            cleaned["items"] = self._clean_schema(schema["items"])
        
        # Keep description if present
        if "description" in schema:
            cleaned["description"] = schema["description"]
        
        # Keep default only if it's not None/null (null defaults are implicit for optional fields)
        if "default" in schema and schema["default"] is not None:
            cleaned["default"] = schema["default"]
        
        # Keep validation constraints (min, max, etc.) but remove title
        for key in ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", 
                    "minLength", "maxLength", "pattern", "enum"]:
            if key in schema:
                cleaned[key] = schema[key]
        
        return cleaned
    
    def get_json_schema(self) -> dict[str, Any]:
        """
        Returns the JSON Schema for the tool's arguments.
        Used by the LLM to understand how to call the tool.
        
        Returns a cleaned, optimized schema format.
        """
        raw_schema = self.args_model.model_json_schema()
        
        # Clean the schema
        cleaned_params = self._clean_schema(raw_schema)
        
        # Remove unnecessary top-level fields
        cleaned_params.pop("title", None)
        cleaned_params.pop("additionalProperties", None)
        
        # If type is "object" and it's the only thing, we can remove it
        # (properties already implies object type)
        if cleaned_params.get("type") == "object" and "properties" in cleaned_params:
            cleaned_params.pop("type", None)
        
        return {
            "name": self.name,
            "description": self.description,
            "parameters": cleaned_params
        }

