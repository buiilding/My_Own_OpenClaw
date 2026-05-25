"""Service helpers for SDK-facing OCR, vision, and debug routes."""

from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Optional

from fastapi import HTTPException
from PIL import Image, ImageDraw

from backend.src.agent.tools.preparation.coordinate_resolution.resolvers import (
    OcrCoordinateResolver,
    VisionCoordinateResolver,
)
from backend.src.api.auth.context import get_current_authenticated_install_identity
from backend.src.api.routes.sdk.models import (
    BoundingBoxModel,
    DebugConfigSnapshot,
    DebugUserMessageFullMetadataModel,
    DebugUserMessageFullModel,
    ImageMetadataModel,
    ImageSourceInput,
    OcrResultModel,
    OverlayArtifactResponse,
    PointModel,
    VisionLocateAllResponse,
    VisionLocateResponse,
    VisionTargetModel,
)
from backend.src.core.config import AppConfig
from backend.src.core.inference.errors import ProviderCapabilityError
from backend.src.core.types.enums import MessageType
from backend.src.llm.prompts.prompt_constructor import PromptConstructor
from backend.src.llm.prompts.prompts import PromptManager
from backend.src.services.artifacts import ArtifactStore
from backend.src.services.ocr.helpers import decode_screenshot_payload
from backend.src.tools.client_manifest import validate_client_tool_manifest
from backend.src.tools.tool_specs import get_tool_spec_name

logger = logging.getLogger(__name__)

_AMBIGUITY_PAYLOAD_RE = re.compile(r"ambiguity_payload_json=(\{.*\})$")
_DEFAULT_BOX_COLOR = "#ff4d4f"
_DEFAULT_POINT_COLOR = "#1677ff"


@dataclass(frozen=True)
class _PreviewStoredQuery:
    user_query_raw: str


@dataclass(frozen=True)
class _PreviewStoredMessage:
    message_type: str


class PromptPreviewHistory:
    """Minimal stored-history adapter for prompt preview introspection."""

    def __init__(
        self,
        messages: list[dict[str, Any]],
        *,
        user_query_raw: Optional[str] = None,
    ) -> None:
        self._history = [message for message in messages if isinstance(message, dict)]
        inferred_query = user_query_raw or self._infer_last_user_query_raw(
            self._history
        )
        self.last_user_query = (
            _PreviewStoredQuery(inferred_query)
            if isinstance(inferred_query, str)
            else None
        )
        self._stored_messages = [
            _PreviewStoredMessage(message_type=MessageType.USER_QUERY)
            for message in self._history
            if self._contains_user_query(message)
        ]

    def get_history(self) -> list[dict[str, Any]]:
        return list(self._history)

    def get_stored_messages(self) -> list[_PreviewStoredMessage]:
        return list(self._stored_messages)

    @staticmethod
    def _contains_user_query(message: dict[str, Any]) -> bool:
        if str(message.get("role") or "").strip() != "user":
            return False
        content = message.get("content")
        return isinstance(content, str) and "<user_query>" in content

    @staticmethod
    def _infer_last_user_query_raw(messages: list[dict[str, Any]]) -> Optional[str]:
        for message in reversed(messages):
            if str(message.get("role") or "").strip() != "user":
                continue
            content = message.get("content")
            if isinstance(content, str):
                match = re.search(r"<user_query>(.*?)</user_query>", content, re.DOTALL)
                if match:
                    return match.group(1).strip()
                return content.strip()
        return None


@dataclass(frozen=True)
class ResolvedImageSource:
    image_bytes: bytes
    image_base64: str
    content_type: str
    artifact_id: Optional[str]
    source_id: str
    width: int
    height: int


def resolve_effective_debug_config(
    *,
    container,
    session_manager,
    user_id: Optional[str] = None,
    model_id: Optional[str] = None,
    model_provider: Optional[str] = None,
    interaction_mode: Optional[str] = None,
):
    """Resolve effective debug config from authorized session/global config plus overrides."""
    identity = get_current_authenticated_install_identity()
    resolved_user_id = identity.user_id if identity is not None else None
    base_config = container.config
    if resolved_user_id and session_manager is not None:
        session = session_manager.get_session(resolved_user_id)
        if session is not None and getattr(session, "cfg", None) is not None:
            base_config = session.cfg

    updates: dict[str, Any] = {}
    if isinstance(model_id, str) and model_id.strip():
        updates["selected_model_id"] = model_id.strip()
    if isinstance(model_provider, str) and model_provider.strip():
        updates["model_provider"] = model_provider.strip()
    if isinstance(interaction_mode, str) and interaction_mode.strip():
        updates["interaction_mode"] = interaction_mode.strip()

    if not updates:
        return base_config
    return base_config.model_copy(update=updates)


def build_debug_config_snapshot(config: Any) -> DebugConfigSnapshot:
    return DebugConfigSnapshot(
        model_mode=str(getattr(config, "model_mode", "")),
        model_provider=str(getattr(config, "model_provider", "")),
        selected_model_id=str(getattr(config, "selected_model_id", "")),
        interaction_mode=str(getattr(config, "interaction_mode", "")),
    )


def _get_model_service(container):
    model_service = getattr(container, "model_service", None)
    if model_service is None:
        raise HTTPException(status_code=503, detail="Model service not available")
    return model_service


def _get_tool_registry(container):
    tool_registry = getattr(container, "tool_registry", None)
    if tool_registry is None:
        raise HTTPException(status_code=503, detail="Tool registry not available")
    return tool_registry


def build_debug_tool_schemas(
    *,
    config: Any,
    container,
    prompt_messages: Optional[list[dict[str, Any]]] = None,
    client_tool_schemas: Optional[list[dict[str, Any]]] = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return the same tool surfaces the live prompt path resolves."""
    constructor = build_prompt_constructor(config=config, container=container)
    constructor.client_tool_schemas = [
        schema for schema in (client_tool_schemas or []) if isinstance(schema, dict)
    ]
    return constructor.get_tool_schema_surfaces(prompt_messages=prompt_messages)


def build_prompt_constructor(*, config: Any, container) -> PromptConstructor:
    PromptManager().initialize()
    return PromptConstructor(
        tool_registry=_get_tool_registry(container),
        config=config,
        metrics_service=container.core.metrics_service(),
    )


def apply_agent_definition_to_config(config: Any, agent_definition: Any) -> Any:
    if agent_definition is None:
        return config
    manifest_result = validate_client_tool_manifest(
        agent_definition.client_tool_manifest()
        if hasattr(agent_definition, "client_tool_manifest")
        else None
    )
    overrides = agent_definition.to_session_config_overrides(
        accepted_client_tool_names=manifest_result.accepted_tool_names
    )
    if not overrides:
        return config
    config_dict = config.model_dump() if hasattr(config, "model_dump") else dict(config)
    config_dict.update(overrides)
    return AppConfig(**config_dict)


def apply_agent_definition_to_constructor(
    constructor: PromptConstructor,
    agent_definition: Any,
) -> None:
    if agent_definition is None:
        return
    system_prompt_override = (
        agent_definition.system_prompt_override()
        if hasattr(agent_definition, "system_prompt_override")
        else None
    )
    if isinstance(system_prompt_override, str) and system_prompt_override.strip():
        constructor.system_prompt = system_prompt_override.strip()
    runtime = getattr(agent_definition, "runtime", None)
    workspace_path = getattr(runtime, "workspace_path", None)
    if isinstance(workspace_path, str) and workspace_path.strip():
        constructor.workspace_path = workspace_path.strip()
    constructor.client_prompt_layers = (
        agent_definition.client_prompt_layers()
        if hasattr(agent_definition, "client_prompt_layers")
        else []
    )
    raw_manifest = (
        agent_definition.client_tool_manifest()
        if hasattr(agent_definition, "client_tool_manifest")
        else None
    )
    if raw_manifest is not None:
        manifest_result = validate_client_tool_manifest(raw_manifest)
        constructor.client_tool_schemas = list(manifest_result.accepted_tool_schemas)


def build_debug_user_message_full(
    preview_history: PromptPreviewHistory,
    prompt_messages: list[dict[str, Any]],
    constructor: PromptConstructor,
) -> Optional[DebugUserMessageFullModel]:
    metadata = constructor._build_user_message_metadata(  # noqa: SLF001
        preview_history,
        prompt_messages,
    )
    if metadata is None:
        return None
    return DebugUserMessageFullModel(
        content=metadata.full_content,
        metadata=DebugUserMessageFullMetadataModel(
            original_query=metadata.original_query,
            context_type=metadata.context_type,
            injected_context=metadata.injected_context,
            active_window=metadata.active_window or "Unknown",
        ),
    )


async def list_debug_models(*, config: Any, container) -> list[dict[str, Any]]:
    _ = config
    model_service = _get_model_service(container)
    models = await model_service.get_all_models()
    if not isinstance(models, list):
        raise HTTPException(
            status_code=502,
            detail="Model service returned an invalid catalog",
        )
    return [model for model in models if isinstance(model, dict)]


def get_debug_tool_capabilities(
    *,
    tool_name: str,
    config: Any,
    container,
) -> tuple[dict[str, Any], Optional[dict[str, Any]], Optional[dict[str, Any]]]:
    tool_registry = _get_tool_registry(container)
    capabilities = tool_registry.get_tool_capabilities(tool_name)
    if capabilities is None:
        raise HTTPException(status_code=404, detail="Tool not found")

    canonical_tool_schemas, provider_tool_schemas = build_debug_tool_schemas(
        config=config,
        container=container,
    )
    canonical_tool_schema = next(
        (
            schema
            for schema in canonical_tool_schemas
            if get_tool_spec_name(schema) == tool_name
        ),
        None,
    )
    provider_tool_schema = next(
        (
            schema
            for schema in provider_tool_schemas
            if get_tool_spec_name(schema) == tool_name
        ),
        None,
    )
    return capabilities, canonical_tool_schema, provider_tool_schema


def build_prompt_preview(
    *,
    config: Any,
    container,
    messages: list[dict[str, Any]],
    user_query_raw: Optional[str],
    include_tools: bool,
    workspace_path: Optional[str],
    agent_definition: Any = None,
) -> dict[str, Any]:
    preview_history = PromptPreviewHistory(messages, user_query_raw=user_query_raw)
    config = apply_agent_definition_to_config(config, agent_definition)
    constructor = build_prompt_constructor(config=config, container=container)
    apply_agent_definition_to_constructor(constructor, agent_definition)
    if isinstance(workspace_path, str) and workspace_path.strip():
        constructor.workspace_path = workspace_path.strip()

    prompt_messages, _, _ = constructor.build_prompt(
        preview_history,
        include_tools=False,
    )
    canonical_tool_schemas, provider_tool_schemas = (
        constructor.get_tool_schema_surfaces(prompt_messages=prompt_messages)
        if include_tools
        else ([], [])
    )

    prompt_token_count: Optional[int] = None
    token_count_error: Optional[str] = None
    try:
        prompt_token_count = constructor.get_prompt_token_count(
            preview_history,
            model_id=str(getattr(config, "selected_model_id", "")),
        )
    except Exception as exc:
        token_count_error = str(exc)

    return {
        "system_prompt": constructor.system_prompt,
        "prompt_messages": prompt_messages,
        "canonical_tool_schemas": canonical_tool_schemas if include_tools else [],
        "provider_tool_schemas": provider_tool_schemas if include_tools else [],
        "user_message_full": build_debug_user_message_full(
            preview_history,
            prompt_messages,
            constructor,
        ),
        "prompt_token_count": prompt_token_count,
        "token_count_error": token_count_error,
    }


def build_query_plan(
    *,
    config: Any,
    container,
    messages: list[dict[str, Any]],
    user_query_raw: Optional[str],
    include_tools: bool,
    workspace_path: Optional[str],
    agent_definition: Any = None,
    conversation_ref: Optional[str] = None,
) -> dict[str, Any]:
    preview = build_prompt_preview(
        config=config,
        container=container,
        messages=messages,
        user_query_raw=user_query_raw,
        include_tools=include_tools,
        workspace_path=workspace_path,
        agent_definition=agent_definition,
    )
    resolved_query = (
        str(user_query_raw).strip()
        if isinstance(user_query_raw, str) and user_query_raw.strip()
        else (
            preview["user_message_full"].metadata.original_query
            if preview.get("user_message_full") is not None
            else ""
        )
    )

    query_payload: dict[str, Any] = {
        "text": resolved_query,
    }
    if isinstance(conversation_ref, str) and conversation_ref.strip():
        query_payload["conversation_ref"] = conversation_ref.strip()
    if isinstance(workspace_path, str) and workspace_path.strip():
        query_payload["workspace_path"] = workspace_path.strip()
    if agent_definition is not None and hasattr(agent_definition, "model_dump"):
        query_payload["agent_definition"] = agent_definition.model_dump(
            mode="json",
            exclude_none=True,
        )

    transparency_events: list[dict[str, Any]] = [
        {
            "type": "system-prompt",
            "payload": {
                "content": preview["system_prompt"],
            },
        }
    ]
    if preview.get("user_message_full") is not None:
        transparency_events.append(
            {
                "type": "user-message-full",
                "payload": preview["user_message_full"].model_dump(),
            }
        )
    if include_tools:
        transparency_events.append(
            {
                "type": "tool-schemas",
                "payload": {
                    "tool_schemas": preview["canonical_tool_schemas"],
                },
            }
        )

    return {
        "query_message": {
            "type": "query",
            "payload": query_payload,
        },
        "transparency_events": transparency_events,
        **preview,
    }


def _artifact_store(container) -> ArtifactStore:
    return ArtifactStore.from_config(container.config)


def _make_source_id(image_bytes: bytes, artifact_id: Optional[str]) -> str:
    if artifact_id:
        return artifact_id
    digest = hashlib.sha1(image_bytes).hexdigest()[:12]
    return f"inline_{digest}"


def resolve_image_source(image: ImageSourceInput, container) -> ResolvedImageSource:
    """Resolve inline or artifact-backed image input into decoded image bytes."""
    artifact_id = image.artifact_id.strip() if image.artifact_id else None
    if artifact_id:
        store = _artifact_store(container)
        path, content_type = store.resolve_path(artifact_id)
        image_bytes = path.read_bytes()
    else:
        image_bytes = decode_screenshot_payload(image.image_base64, logger=logger)
        if image_bytes is None:
            raise HTTPException(status_code=422, detail="Invalid image_base64 payload")
        content_type = "image/png"

    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            width, height = img.size
            format_name = (img.format or "").upper()
            if not content_type.startswith("image/"):
                if format_name in {"JPEG", "JPG"}:
                    content_type = "image/jpeg"
                else:
                    content_type = "image/png"
    except Exception as exc:
        raise HTTPException(
            status_code=422, detail="Image source is not a valid image"
        ) from exc

    return ResolvedImageSource(
        image_bytes=image_bytes,
        image_base64=base64.b64encode(image_bytes).decode("utf-8"),
        content_type=content_type,
        artifact_id=artifact_id,
        source_id=_make_source_id(image_bytes, artifact_id),
        width=width,
        height=height,
    )


def build_image_metadata(source: ResolvedImageSource) -> ImageMetadataModel:
    return ImageMetadataModel(
        source_id=source.source_id,
        artifact_id=source.artifact_id,
        content_type=source.content_type,
        width=source.width,
        height=source.height,
    )


def crop_image_source(
    source: ResolvedImageSource,
    region: BoundingBoxModel,
) -> tuple[ResolvedImageSource, BoundingBoxModel]:
    """Crop source image to a region and return crop-relative metadata."""
    if region.x >= source.width or region.y >= source.height:
        raise HTTPException(
            status_code=422, detail="Requested region is outside image bounds"
        )
    x = region.x
    y = region.y
    width = min(region.width, source.width - x)
    height = min(region.height, source.height - y)
    if width <= 0 or height <= 0:
        raise HTTPException(
            status_code=422, detail="Requested region is outside image bounds"
        )

    with Image.open(io.BytesIO(source.image_bytes)) as img:
        cropped = img.crop((x, y, x + width, y + height))
        buffer = io.BytesIO()
        cropped.save(buffer, format="PNG")
    cropped_bytes = buffer.getvalue()
    return (
        ResolvedImageSource(
            image_bytes=cropped_bytes,
            image_base64=base64.b64encode(cropped_bytes).decode("utf-8"),
            content_type="image/png",
            artifact_id=None,
            source_id=f"{source.source_id}:crop:{x}:{y}:{width}:{height}",
            width=width,
            height=height,
        ),
        BoundingBoxModel(x=0, y=0, width=width, height=height),
    )


async def run_ocr(source: ResolvedImageSource, container) -> list[dict[str, Any]]:
    ocr_service = getattr(
        container, "ocr_router", getattr(container, "ocr_service", None)
    )
    if ocr_service is None or not getattr(ocr_service, "enabled", False):
        raise HTTPException(status_code=503, detail="OCR service not available")

    try:
        ocr_results = await ocr_service.perform_ocr(source.image_base64)
    except ProviderCapabilityError as error:
        raise HTTPException(status_code=503, detail=error.to_payload()) from error
    if ocr_results is None:
        raise HTTPException(
            status_code=503, detail="OCR service did not return results"
        )
    return ocr_results


def _build_ocr_result(
    item: dict[str, Any],
    *,
    index: int,
    source_id: str,
    score: Optional[float] = None,
) -> OcrResultModel:
    bbox = item.get("bbox") or {}
    center = OcrCoordinateResolver._extract_bbox_center(bbox)
    center_model = PointModel(x=center[0], y=center[1]) if center is not None else None
    bbox_model = BoundingBoxModel(
        x=int(bbox["x"]),
        y=int(bbox["y"]),
        width=int(bbox["width"]),
        height=int(bbox["height"]),
    )
    return OcrResultModel(
        id=str(item.get("id", index)),
        text=str(item.get("text", "")),
        confidence=float(item.get("confidence", 0.0)),
        bbox=bbox_model,
        center=center_model,
        candidate_id=OcrCoordinateResolver._build_candidate_id(
            item,
            index=index,
            screenshot_id=source_id,
        ),
        score=score,
    )


def build_ocr_results(
    ocr_results: list[dict[str, Any]],
    *,
    source_id: str,
) -> list[OcrResultModel]:
    normalized: list[OcrResultModel] = []
    for index, item in enumerate(ocr_results):
        try:
            normalized.append(_build_ocr_result(item, index=index, source_id=source_id))
        except Exception:
            logger.debug("Skipping malformed OCR result at index %s: %r", index, item)
    return normalized


def rank_ocr_matches(
    text: str,
    ocr_results: list[dict[str, Any]],
    *,
    source_id: str,
) -> list[OcrResultModel]:
    target = text.lower().strip()
    ranked: list[OcrResultModel] = []
    for index, item in enumerate(ocr_results):
        current_text = str(item.get("text", "")).lower().strip()
        score = SequenceMatcher(None, target, current_text).ratio()
        try:
            ranked.append(
                _build_ocr_result(item, index=index, source_id=source_id, score=score)
            )
        except Exception:
            logger.debug("Skipping malformed OCR match at index %s: %r", index, item)
    ranked.sort(key=lambda match: float(match.score or 0.0), reverse=True)
    return ranked


def raise_ocr_resolution_error(error: Exception) -> None:
    status_code, detail = build_ocr_resolution_error(error)
    raise HTTPException(status_code=status_code, detail=detail)


def build_ocr_resolution_error(error: Exception) -> tuple[int, dict[str, Any]]:
    message = str(error)
    detail: dict[str, Any] = {"message": message}
    payload_match = _AMBIGUITY_PAYLOAD_RE.search(message)
    if payload_match:
        try:
            detail["resolver_payload"] = json.loads(payload_match.group(1))
        except json.JSONDecodeError:
            logger.debug("Failed to decode OCR resolver payload from %r", message)

    if "Multiple OCR instances matched" in message:
        status_code = 409
    elif "Could not find text" in message or "OCR results are empty" in message:
        status_code = 404
    elif "frame changed, re-ground required" in message:
        status_code = 409
    else:
        status_code = 422
    return status_code, detail


async def resolve_vision_service(container):
    vision_service = getattr(
        container,
        "vision_router",
        getattr(container, "vision_service", None),
    )
    if vision_service is None:
        raise HTTPException(status_code=503, detail="Vision service not available")
    if not getattr(vision_service, "is_initialized", False):
        try:
            initialized = await vision_service.initialize()
        except ProviderCapabilityError as error:
            raise HTTPException(status_code=503, detail=error.to_payload()) from error
        if not initialized:
            detail = (
                getattr(vision_service, "initialization_error", None)
                or "Vision service not initialized"
            )
            raise HTTPException(status_code=503, detail=detail)
    return vision_service


async def build_vision_locate_response(
    *,
    source: ResolvedImageSource,
    description: str,
    container,
) -> VisionLocateResponse:
    vision_service = await resolve_vision_service(container)
    try:
        x, y = await VisionCoordinateResolver.resolve(
            description,
            source.image_base64,
            vision_service,
        )
    except ProviderCapabilityError as error:
        raise HTTPException(status_code=503, detail=error.to_payload()) from error
    return VisionLocateResponse(
        image=build_image_metadata(source),
        description=description,
        match=VisionTargetModel(
            description=description,
            center=PointModel(x=x, y=y),
            rank=1,
        ),
    )


async def build_vision_locate_all_response(
    *,
    source: ResolvedImageSource,
    description: str,
    max_results: int,
    container,
) -> VisionLocateAllResponse:
    locate_response = await build_vision_locate_response(
        source=source,
        description=description,
        container=container,
    )
    return VisionLocateAllResponse(
        image=locate_response.image,
        description=description,
        matches=[locate_response.match][:max_results],
    )


async def describe_image_region(
    *,
    source: ResolvedImageSource,
    container,
) -> str:
    vision_service = await resolve_vision_service(container)
    prompt = (
        "Describe this UI image briefly for automation. "
        "Mention visible text, likely control types, and the most actionable element."
    )
    try:
        description = await vision_service.answer_question_about_image(
            source.image_base64,
            prompt,
        )
    except ProviderCapabilityError as error:
        raise HTTPException(status_code=503, detail=error.to_payload()) from error
    if not description:
        raise HTTPException(
            status_code=502,
            detail="Vision provider returned an empty description",
        )
    return description.strip()


def _parse_hex_color(color: Optional[str], fallback: str) -> str:
    if not color:
        return fallback
    candidate = color.strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", candidate):
        return candidate
    return fallback


def _render_ocr_overlay(
    source: ResolvedImageSource,
    rows: list[OcrResultModel],
    *,
    show_labels: bool,
) -> bytes:
    with Image.open(io.BytesIO(source.image_bytes)) as img:
        image = img.convert("RGB")
    draw = ImageDraw.Draw(image)
    for row in rows:
        x = row.bbox.x
        y = row.bbox.y
        w = row.bbox.width
        h = row.bbox.height
        draw.rectangle((x, y, x + w, y + h), outline=_DEFAULT_BOX_COLOR, width=3)
        if row.center is not None:
            cx = row.center.x
            cy = row.center.y
            draw.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=_DEFAULT_BOX_COLOR)
        if show_labels:
            label = row.text
            if row.candidate_id:
                label = f"{label} [{row.candidate_id}]"
            draw.text((x + 4, max(y - 14, 0)), label, fill=_DEFAULT_BOX_COLOR)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _render_vision_overlay(
    source: ResolvedImageSource,
    *,
    points: list[Any],
    regions: list[Any],
    show_labels: bool,
) -> bytes:
    with Image.open(io.BytesIO(source.image_bytes)) as img:
        image = img.convert("RGB")
    draw = ImageDraw.Draw(image)

    for region in regions:
        color = _parse_hex_color(getattr(region, "color", None), _DEFAULT_BOX_COLOR)
        x = int(region.x)
        y = int(region.y)
        width = int(region.width)
        height = int(region.height)
        draw.rectangle((x, y, x + width, y + height), outline=color, width=3)
        if show_labels and getattr(region, "label", None):
            draw.text((x + 4, max(y - 14, 0)), region.label, fill=color)

    for point in points:
        color = _parse_hex_color(getattr(point, "color", None), _DEFAULT_POINT_COLOR)
        x = int(point.x)
        y = int(point.y)
        draw.ellipse((x - 6, y - 6, x + 6, y + 6), fill=color)
        if show_labels and getattr(point, "label", None):
            draw.text((x + 8, max(y - 8, 0)), point.label, fill=color)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def save_overlay_response(
    *,
    request,
    container,
    source: ResolvedImageSource,
    image_bytes: bytes,
    annotation_count: int,
) -> OverlayArtifactResponse:
    store = _artifact_store(container)
    identity = get_current_authenticated_install_identity()
    meta = store.save_bytes(
        image_bytes,
        content_type="image/png",
        owner_user_id=identity.user_id if identity is not None else None,
    )
    base_url = str(request.base_url).rstrip("/")
    return OverlayArtifactResponse(
        image=build_image_metadata(source),
        artifact_id=meta.artifact_id,
        content_type=meta.content_type,
        size_bytes=meta.size_bytes,
        sha256=meta.sha256,
        url=f"{base_url}/api/artifacts/{meta.artifact_id}",
        annotation_count=annotation_count,
    )


def render_ocr_overlay_response(
    *,
    request,
    container,
    source: ResolvedImageSource,
    rows: list[OcrResultModel],
    show_labels: bool,
) -> OverlayArtifactResponse:
    overlay_bytes = _render_ocr_overlay(source, rows, show_labels=show_labels)
    return save_overlay_response(
        request=request,
        container=container,
        source=source,
        image_bytes=overlay_bytes,
        annotation_count=len(rows),
    )


def render_vision_overlay_response(
    *,
    request,
    container,
    source: ResolvedImageSource,
    points: list[Any],
    regions: list[Any],
    show_labels: bool,
) -> OverlayArtifactResponse:
    overlay_bytes = _render_vision_overlay(
        source,
        points=points,
        regions=regions,
        show_labels=show_labels,
    )
    return save_overlay_response(
        request=request,
        container=container,
        source=source,
        image_bytes=overlay_bytes,
        annotation_count=len(points) + len(regions),
    )
