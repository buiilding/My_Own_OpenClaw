"""
Tool Manifest Validator for the Desktop Assistant Marketplace.

This module validates tool manifests to ensure they meet security and
structural requirements before tools can be loaded.
"""

import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)

# Allowed categories for tools
ALLOWED_CATEGORIES = {"filesystem", "web", "system", "utility", "api"}

# Allowed permissions
ALLOWED_PERMISSIONS = {
    "filesystem_read",
    "filesystem_write",
    "process_execution",
    "network_access",
    "system_info",
    "gui_access",
}


class ToolManifest(BaseModel):
    """Pydantic model for tool manifest validation."""

    name: str = Field(..., description="Tool name in snake_case")
    version: str = Field(..., description="Semantic version (e.g., 1.0.0)")
    description: str = Field(..., min_length=10, description="Tool description")
    author: str = Field(..., min_length=2, description="Author name")
    category: str = Field(..., description="Tool category")
    tool_class: str = Field(..., description="Tool class name in tool.py")
    permissions: List[str] = Field(
        default_factory=list, description="Required permissions"
    )
    is_destructive: bool = Field(
        default=False, description="Whether tool can modify system"
    )
    input_schema: Optional[Dict[str, Any]] = Field(
        default=None, description="Input parameter schema"
    )
    output_schema: Optional[Dict[str, Any]] = Field(
        default=None, description="Output schema"
    )
    tags: List[str] = Field(default_factory=list, description="Search tags")
    homepage: Optional[str] = Field(default=None, description="Tool homepage URL")
    license: Optional[str] = Field(default=None, description="License type")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate tool name is snake_case."""
        if not re.match(r"^[a-z_][a-z0-9_]*$", v):
            raise ValueError(
                f"Tool name '{v}' must be snake_case (lowercase letters, numbers, underscores, starting with letter/underscore)"
            )
        return v

    @field_validator("version")
    @classmethod
    def validate_version(cls, v: str) -> str:
        """Validate semantic versioning format."""
        if not re.match(r"^\d+\.\d+\.\d+$", v):
            raise ValueError(
                f"Version '{v}' must follow semantic versioning (e.g., 1.0.0)"
            )
        return v

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        """Validate category is in allowed list."""
        if v not in ALLOWED_CATEGORIES:
            raise ValueError(
                f"Category '{v}' not allowed. Must be one of: {', '.join(ALLOWED_CATEGORIES)}"
            )
        return v

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, v: List[str]) -> List[str]:
        """Validate permissions are in allowed set."""
        invalid_perms = [perm for perm in v if perm not in ALLOWED_PERMISSIONS]
        if invalid_perms:
            raise ValueError(
                f"Invalid permissions: {invalid_perms}. Allowed: {', '.join(ALLOWED_PERMISSIONS)}"
            )
        return v


@dataclass
class ValidationResult:
    """Result of manifest validation."""

    is_valid: bool
    errors: List[str]
    manifest: Optional[ToolManifest] = None

    def __str__(self) -> str:
        if self.is_valid:
            return "Validation passed"
        return f"Validation failed: {', '.join(self.errors)}"


class ToolManifestValidator:
    """Validates tool manifests for security and correctness."""

    def __init__(self):
        """Initialize the validator."""
        self.allowed_categories = ALLOWED_CATEGORIES
        self.allowed_permissions = ALLOWED_PERMISSIONS

    def validate_manifest(self, manifest_data: Dict[str, Any]) -> ValidationResult:
        """
        Validate a tool manifest against the schema.

        Args:
            manifest_data: Raw manifest dictionary from JSON

        Returns:
            ValidationResult with validation status and errors
        """
        errors = []

        # Basic structure validation
        if not isinstance(manifest_data, dict):
            return ValidationResult(
                is_valid=False, errors=["Manifest must be a JSON object"], manifest=None
            )

        # Check required fields
        required_fields = ["name", "version", "description", "author", "tool_class"]
        missing_fields = [
            field for field in required_fields if field not in manifest_data
        ]
        if missing_fields:
            return ValidationResult(
                is_valid=False,
                errors=[f"Missing required fields: {', '.join(missing_fields)}"],
                manifest=None,
            )

        # Use Pydantic model for validation
        try:
            manifest = ToolManifest(**manifest_data)
            return ValidationResult(is_valid=True, errors=[], manifest=manifest)
        except Exception as e:
            # Extract validation errors from Pydantic
            if isinstance(e, ValueError):
                errors.append(str(e))
            else:
                errors.append(f"Validation error: {str(e)}")
            return ValidationResult(is_valid=False, errors=errors, manifest=None)

    def validate_name_format(self, name: str) -> bool:
        """Validate tool name format (snake_case)."""
        return bool(re.match(r"^[a-z_][a-z0-9_]*$", name))

    def validate_version_format(self, version: str) -> bool:
        """Validate version format (semantic versioning)."""
        return bool(re.match(r"^\d+\.\d+\.\d+$", version))

    def validate_category(self, category: str) -> bool:
        """Validate category is allowed."""
        return category in self.allowed_categories

    def validate_permissions(self, permissions: List[str]) -> bool:
        """Validate all permissions are allowed."""
        return all(perm in self.allowed_permissions for perm in permissions)
