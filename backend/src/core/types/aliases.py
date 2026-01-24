"""
Type aliases for common patterns.

This module provides type aliases for frequently used generic types.
"""
from typing import Any, Dict

# Generic dictionary types (use sparingly, prefer TypedDict)
JSONDict = Dict[str, Any]
StringDict = Dict[str, str]
