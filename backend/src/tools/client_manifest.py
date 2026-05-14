"""Validation and normalization for client-provided local tool manifests."""

from __future__ import annotations

import copy
import json
import re
from dataclasses import dataclass, field
from typing import Any, Literal

from backend.src.tools.tool_catalog import get_model_visible_tool_names
from backend.src.tools.tool_specs import build_function_tool_spec, is_function_tool_spec

MAX_CLIENT_TOOLS = 64
MAX_TOOL_NAME_LENGTH = 96
MAX_DESCRIPTION_LENGTH = 2_000
MAX_SCHEMA_BYTES = 64_000
MAX_MANIFEST_BYTES = 512_000
MAX_SCHEMA_DEPTH = 12
TOOL_NAME_PATTERN = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]{0,95}$")
ARGUMENT_RESOLUTION_MODES = frozenset({"passthrough", "backend_grounding"})
EXECUTION_TARGETS = frozenset({"sidecar", "backend"})
RESERVED_BACKEND_TOOL_NAMES = frozenset(
    {
        "web_search",
        "grounded_mouse_action",
        "grounded_scroll_action",
    }
)
OVERRIDABLE_CLIENT_BUILTINS = frozenset(get_model_visible_tool_names())
ALLOWED_SCHEMA_KEYS = frozenset(
    {
        "$defs",
        "$ref",
        "additionalProperties",
        "allOf",
        "anyOf",
        "const",
        "default",
        "description",
        "enum",
        "exclusiveMaximum",
        "exclusiveMinimum",
        "format",
        "items",
        "maxItems",
        "maxLength",
        "maximum",
        "minItems",
        "minLength",
        "minimum",
        "oneOf",
        "pattern",
        "properties",
        "required",
        "title",
        "type",
    }
)


@dataclass(frozen=True, slots=True)
class ClientToolManifestEntry:
    """One accepted client-local tool entry."""

    name: str
    description: str
    execution_target: Literal["sidecar", "backend"]
    model_schema: dict[str, Any]
    execution_schema: dict[str, Any]
    argument_resolution: Literal["passthrough", "backend_grounding"]
    optional: bool = False

    @property
    def function_tool_schema(self) -> dict[str, Any]:
        """Return canonical flat model-facing function schema."""
        schema = copy.deepcopy(self.model_schema)
        if is_function_tool_spec(schema):
            schema["name"] = self.name
            if self.description and not schema.get("description"):
                schema["description"] = self.description
            return schema
        return build_function_tool_spec(
            name=self.name,
            description=self.description,
            parameters=schema,
        )

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "execution_target": self.execution_target,
            "model_schema": copy.deepcopy(self.model_schema),
            "execution_schema": copy.deepcopy(self.execution_schema),
            "argument_resolution": self.argument_resolution,
            "optional": self.optional,
        }


@dataclass(frozen=True, slots=True)
class ClientToolManifestValidationResult:
    """Partial-validation result for one client manifest."""

    accepted: list[ClientToolManifestEntry] = field(default_factory=list)
    rejected: list[dict[str, str]] = field(default_factory=list)

    @property
    def accepted_tool_names(self) -> list[str]:
        return [entry.name for entry in self.accepted]

    @property
    def accepted_tool_schemas(self) -> list[dict[str, Any]]:
        return [entry.function_tool_schema for entry in self.accepted]

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "accepted": [entry.to_public_dict() for entry in self.accepted],
            "rejected": list(self.rejected),
        }


def validate_client_tool_manifest(
    raw_manifest: Any,
) -> ClientToolManifestValidationResult:
    """Validate a client manifest without failing the whole handshake."""
    if raw_manifest is None:
        return ClientToolManifestValidationResult()
    if not isinstance(raw_manifest, dict):
        return ClientToolManifestValidationResult(
            rejected=[{"name": "", "reason": "client_tool_manifest must be an object"}]
        )
    try:
        manifest_size = len(json.dumps(raw_manifest, separators=(",", ":")))
    except (TypeError, ValueError):
        return ClientToolManifestValidationResult(
            rejected=[
                {"name": "", "reason": "client_tool_manifest must be JSON serializable"}
            ]
        )
    if manifest_size > MAX_MANIFEST_BYTES:
        return ClientToolManifestValidationResult(
            rejected=[{"name": "", "reason": "client_tool_manifest exceeds size limit"}]
        )

    raw_tools = raw_manifest.get("tools", raw_manifest)
    if not isinstance(raw_tools, list):
        return ClientToolManifestValidationResult(
            rejected=[
                {"name": "", "reason": "client_tool_manifest.tools must be a list"}
            ]
        )
    if len(raw_tools) > MAX_CLIENT_TOOLS:
        return ClientToolManifestValidationResult(
            rejected=[
                {
                    "name": "",
                    "reason": f"client_tool_manifest cannot exceed {MAX_CLIENT_TOOLS} tools",
                }
            ]
        )

    accepted: list[ClientToolManifestEntry] = []
    rejected: list[dict[str, str]] = []
    seen: set[str] = set()
    for index, raw_tool in enumerate(raw_tools):
        entry, error = _validate_tool_entry(raw_tool, index=index, seen=seen)
        if error is not None:
            rejected.append(error)
            continue
        if entry is None:
            continue
        seen.add(entry.name)
        accepted.append(entry)
    return ClientToolManifestValidationResult(accepted=accepted, rejected=rejected)


def _validate_tool_entry(
    raw_tool: Any,
    *,
    index: int,
    seen: set[str],
) -> tuple[ClientToolManifestEntry | None, dict[str, str] | None]:
    if not isinstance(raw_tool, dict):
        return None, {"name": f"#{index}", "reason": "tool entry must be an object"}

    raw_name = raw_tool.get("name")
    name = raw_name.strip() if isinstance(raw_name, str) else ""
    if not name:
        return None, {"name": f"#{index}", "reason": "tool name is required"}
    if len(name) > MAX_TOOL_NAME_LENGTH or not TOOL_NAME_PATTERN.match(name):
        return None, {
            "name": name,
            "reason": "tool name does not match allowed pattern",
        }
    if name in seen:
        return None, {"name": name, "reason": "duplicate tool name"}
    if name in RESERVED_BACKEND_TOOL_NAMES and name not in OVERRIDABLE_CLIENT_BUILTINS:
        return None, {"name": name, "reason": "reserved backend tool name"}

    description = raw_tool.get("description")
    if not isinstance(description, str) or not description.strip():
        return None, {"name": name, "reason": "description is required"}
    description = description.strip()
    if len(description) > MAX_DESCRIPTION_LENGTH:
        return None, {"name": name, "reason": "description exceeds length limit"}

    execution_target = raw_tool.get("execution_target", "sidecar")
    if execution_target not in EXECUTION_TARGETS:
        return None, {"name": name, "reason": "invalid execution_target"}
    if execution_target == "backend" and name not in RESERVED_BACKEND_TOOL_NAMES:
        return None, {
            "name": name,
            "reason": "client manifests cannot add backend tools",
        }

    argument_resolution = raw_tool.get("argument_resolution", "passthrough")
    if argument_resolution not in ARGUMENT_RESOLUTION_MODES:
        return None, {"name": name, "reason": "invalid argument_resolution"}

    model_schema = raw_tool.get(
        "model_schema", raw_tool.get("schema", raw_tool.get("parameters"))
    )
    if not isinstance(model_schema, dict):
        return None, {"name": name, "reason": "schema must be an object"}
    model_error = _validate_json_schema_subset(model_schema)
    if model_error:
        return None, {"name": name, "reason": f"invalid schema: {model_error}"}

    execution_schema = raw_tool.get("execution_schema", model_schema)
    if not isinstance(execution_schema, dict):
        return None, {"name": name, "reason": "execution_schema must be an object"}
    execution_error = _validate_json_schema_subset(execution_schema)
    if execution_error:
        return None, {
            "name": name,
            "reason": f"invalid execution_schema: {execution_error}",
        }

    return (
        ClientToolManifestEntry(
            name=name,
            description=description,
            execution_target=execution_target,
            model_schema=copy.deepcopy(model_schema),
            execution_schema=copy.deepcopy(execution_schema),
            argument_resolution=argument_resolution,
            optional=raw_tool.get("optional") is True,
        ),
        None,
    )


def _validate_json_schema_subset(schema: dict[str, Any]) -> str | None:
    try:
        schema_size = len(json.dumps(schema, separators=(",", ":")))
    except (TypeError, ValueError):
        return "schema must be JSON serializable"
    if schema_size > MAX_SCHEMA_BYTES:
        return "schema exceeds size limit"
    return _walk_schema(schema, depth=0)


def _walk_schema(value: Any, *, depth: int) -> str | None:
    if depth > MAX_SCHEMA_DEPTH:
        return "schema nesting exceeds depth limit"
    if isinstance(value, list):
        for item in value:
            error = _walk_schema(item, depth=depth + 1)
            if error:
                return error
        return None
    if not isinstance(value, dict):
        return None

    for key, child in value.items():
        if key not in ALLOWED_SCHEMA_KEYS:
            return f"unsupported schema key {key!r}"
        if key == "properties":
            if not isinstance(child, dict):
                return "properties must be an object"
            for property_schema in child.values():
                error = _walk_schema(property_schema, depth=depth + 1)
                if error:
                    return error
            continue
        error = _walk_schema(child, depth=depth + 1)
        if error:
            return error
    return None
