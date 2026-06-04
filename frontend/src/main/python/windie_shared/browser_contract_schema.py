"""Model-facing browser schema generation helpers."""

from __future__ import annotations

import copy
from typing import Any

from windie_shared.browser_contract_catalog import BROWSER_ACTION_CONTRACTS
from windie_shared.browser_contract_models import (
    BROWSER_CANONICAL_ACTIONS,
    BrowserActionArgsBase,
)


def _clean_schema(schema: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(schema, dict):
        return schema

    cleaned: dict[str, Any] = {}

    if "properties" in schema:
        cleaned["properties"] = {
            key: _clean_schema(value) for key, value in schema["properties"].items()
        }

    if "required" in schema:
        cleaned["required"] = schema["required"]

    if "anyOf" in schema:
        any_of = schema["anyOf"]
        non_null_types = [item for item in any_of if item.get("type") != "null"]

        if len(non_null_types) != 1:
            raise ValueError("browser action schemas only support nullable anyOf")
        cleaned.update(_clean_schema(non_null_types[0]))
    elif "type" in schema:
        cleaned["type"] = schema["type"]

    if "items" in schema:
        cleaned["items"] = _clean_schema(schema["items"])

    if "description" in schema:
        cleaned["description"] = schema["description"]

    if "additionalProperties" in schema and isinstance(
        schema["additionalProperties"], bool
    ):
        cleaned["additionalProperties"] = schema["additionalProperties"]

    if "default" in schema and schema["default"] is not None:
        cleaned["default"] = schema["default"]

    for key in [
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "minLength",
        "maxLength",
        "pattern",
        "enum",
    ]:
        if key in schema:
            cleaned[key] = schema[key]

    return cleaned


def _clean_action_schema(model: type[BrowserActionArgsBase]) -> dict[str, Any]:
    cleaned_schema = _clean_schema(model.model_json_schema())
    cleaned_schema.pop("title", None)
    return cleaned_schema


def _schema_without_description(schema: dict[str, Any]) -> dict[str, Any]:
    stripped = copy.deepcopy(schema)
    stripped.pop("description", None)
    return stripped


def _combine_schema_descriptions(*schemas: dict[str, Any]) -> str | None:
    descriptions: list[str] = []
    for schema in schemas:
        description = schema.get("description")
        if isinstance(description, str) and description not in descriptions:
            descriptions.append(description)
    if not descriptions:
        return None
    return " / ".join(descriptions)


def _merge_property_schema(
    existing: dict[str, Any],
    incoming: dict[str, Any],
) -> dict[str, Any]:
    existing_without_description = _schema_without_description(existing)
    incoming_without_description = _schema_without_description(incoming)

    if existing_without_description == incoming_without_description:
        merged = existing_without_description
        description = _combine_schema_descriptions(existing, incoming)
        if description is not None:
            merged["description"] = description
        return merged

    merged_options: list[dict[str, Any]] = []
    for schema in (existing, incoming):
        if isinstance(schema.get("anyOf"), list):
            candidates = [
                candidate
                for candidate in schema["anyOf"]
                if isinstance(candidate, dict)
            ]
        else:
            candidates = [schema]

        for candidate in candidates:
            candidate_without_description = _schema_without_description(candidate)
            if any(
                _schema_without_description(option) == candidate_without_description
                for option in merged_options
            ):
                continue
            merged_options.append(copy.deepcopy(candidate))

    merged: dict[str, Any] = {"anyOf": merged_options}
    description = _combine_schema_descriptions(existing, incoming)
    if description is not None:
        merged["description"] = description
    return merged


def build_browser_tool_parameters_schema() -> dict[str, Any]:
    properties: dict[str, Any] = {
        "action": {
            "type": "string",
            "enum": list(BROWSER_CANONICAL_ACTIONS),
            "description": "Canonical browser action to perform.",
        }
    }
    for contract in BROWSER_ACTION_CONTRACTS:
        action_schema = _clean_action_schema(contract.args_model)
        for property_name, property_schema in action_schema.get(
            "properties", {}
        ).items():
            if property_name == "action" or not isinstance(property_schema, dict):
                continue
            existing = properties.get(property_name)
            if not isinstance(existing, dict):
                properties[property_name] = copy.deepcopy(property_schema)
                continue
            properties[property_name] = _merge_property_schema(
                existing, property_schema
            )

    return {
        "type": "object",
        "description": (
            "Canonical grouped browser action payload. "
            "Provide a top-level explanation and the fields for the selected action only. "
            "Action-specific field requirements are enforced by runtime validation."
        ),
        "properties": properties,
        "required": ["action", "explanation"],
        "additionalProperties": False,
    }


assert tuple(contract.name for contract in BROWSER_ACTION_CONTRACTS) == tuple(
    BROWSER_CANONICAL_ACTIONS
)
