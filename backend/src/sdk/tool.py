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

    def get_json_schema(self) -> dict[str, Any]:
        """
        Returns the JSON Schema for the tool's arguments.
        Used by the LLM to understand how to call the tool.
        """
        schema = self.args_model.model_json_schema()
        return {
            "name": self.name,
            "description": self.description,
            "parameters": schema
        }

