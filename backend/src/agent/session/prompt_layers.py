"""Client prompt-layer validation and session application helpers."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ClientPromptLayerValidationResult:
    """Accepted/rejected prompt layers after backend trust-boundary validation."""

    accepted: list[dict[str, Any]] = field(default_factory=list)
    rejected: list[dict[str, str]] = field(default_factory=list)

    @property
    def accepted_ids(self) -> list[str]:
        return [layer["id"] for layer in self.accepted]


def validate_client_prompt_layers(
    raw_layers: list[dict[str, Any]] | None,
) -> ClientPromptLayerValidationResult:
    """Normalize and dedupe client prompt layers.

    Identity is `(id, revision)` when revision is supplied, and `(id, "")`
    otherwise. That makes duplicate enable/send cycles idempotent while allowing
    clients to roll a contribution revision intentionally.
    """

    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for index, raw_layer in enumerate(raw_layers or []):
        if not isinstance(raw_layer, dict):
            rejected.append(
                {
                    "name": f"index:{index}",
                    "reason": "prompt layer must be an object",
                }
            )
            continue

        layer_id = _normalize_string(raw_layer.get("id"), max_length=128)
        layer_type = _normalize_string(raw_layer.get("type"), max_length=64)
        content = _normalize_string(raw_layer.get("content"), max_length=200_000)
        if layer_id is None:
            rejected.append(
                {"name": f"index:{index}", "reason": "id is required"}
            )
            continue
        if layer_type is None:
            rejected.append({"name": layer_id, "reason": "type is required"})
            continue
        if content is None:
            rejected.append({"name": layer_id, "reason": "content is required"})
            continue

        priority = _coerce_priority(raw_layer.get("priority"))
        revision = _normalize_string(raw_layer.get("revision"), max_length=128)
        source_path = _normalize_string(raw_layer.get("source_path"), max_length=4096)

        identity = (layer_id, revision or "")
        if identity in seen:
            rejected.append({"name": layer_id, "reason": "duplicate prompt layer"})
            continue
        seen.add(identity)

        layer = {
            "id": layer_id,
            "type": layer_type,
            "priority": priority,
            "content": content,
        }
        if revision is not None:
            layer["revision"] = revision
        if source_path is not None:
            layer["source_path"] = source_path
        accepted.append(layer)

    accepted.sort(
        key=lambda layer: (
            int(layer.get("priority", 100)),
            str(layer.get("id") or ""),
            str(layer.get("revision") or ""),
        )
    )
    return ClientPromptLayerValidationResult(accepted=accepted, rejected=rejected)


def apply_client_prompt_layers_to_session(
    session: Any,
    validation_result: ClientPromptLayerValidationResult,
) -> dict[str, int]:
    """Apply accepted prompt layers to the active session and prompt builder."""

    layers = [dict(layer) for layer in validation_result.accepted]
    runtime = getattr(session, "runtime", None)
    if runtime is not None:
        runtime.client_prompt_layers = layers
    prompt_builder = getattr(session, "prompt_builder", None)
    if prompt_builder is not None:
        setattr(prompt_builder, "client_prompt_layers", list(layers))
    return {
        "runtime_prompt_layer_count": len(
            getattr(runtime, "client_prompt_layers", []) if runtime is not None else []
        ),
        "prompt_builder_prompt_layer_count": len(
            getattr(prompt_builder, "client_prompt_layers", [])
            if prompt_builder is not None
            else []
        ),
    }


def prompt_layer_id_sample(layers: list[dict[str, Any]], limit: int = 8) -> list[str]:
    """Return a small stable sample of accepted prompt-layer ids for traces."""

    sample: list[str] = []
    for layer in layers[:limit]:
        layer_id = layer.get("id")
        if isinstance(layer_id, str) and layer_id:
            sample.append(layer_id)
    return sample


def prompt_layer_rejected_reason_sample(
    rejected: list[dict[str, str]],
    limit: int = 5,
) -> list[dict[str, str]]:
    """Return a bounded rejected-reason sample for trace events."""

    return [
        {
            "name": str(item.get("name") or ""),
            "reason": str(item.get("reason") or ""),
        }
        for item in rejected[:limit]
    ]


def _normalize_string(value: Any, *, max_length: int) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized or len(normalized) > max_length:
        return None
    return normalized


def _coerce_priority(value: Any) -> int:
    try:
        priority = int(value)
    except (TypeError, ValueError):
        return 100
    return max(0, min(1_000, priority))
