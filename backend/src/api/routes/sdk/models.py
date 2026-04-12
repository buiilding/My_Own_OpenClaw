"""Pydantic models for SDK-facing OCR, vision, and debug routes."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ImageSourceInput(BaseModel):
    """Image source accepted by SDK perception routes."""

    model_config = ConfigDict(extra="forbid")

    artifact_id: Optional[str] = Field(
        None,
        description="Existing uploaded artifact ID to use as the image source.",
    )
    image_base64: Optional[str] = Field(
        None,
        description="Inline base64 image payload or data URL.",
    )

    @model_validator(mode="after")
    def validate_source(self) -> "ImageSourceInput":
        provided = int(bool(self.artifact_id)) + int(bool(self.image_base64))
        if provided != 1:
            raise ValueError("Provide exactly one of artifact_id or image_base64")
        return self


class PointModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: int
    y: int


class BoundingBoxModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: int = Field(..., ge=0)
    y: int = Field(..., ge=0)
    width: int = Field(..., gt=0)
    height: int = Field(..., gt=0)


class ImageMetadataModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: str
    artifact_id: Optional[str] = None
    content_type: str
    width: int
    height: int


class OcrResultModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    text: str
    confidence: float
    bbox: BoundingBoxModel
    center: Optional[PointModel] = None
    candidate_id: Optional[str] = None
    score: Optional[float] = None


class OcrRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageSourceInput


class OcrTextQueryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageSourceInput
    text: str = Field(..., min_length=1, max_length=2000)
    threshold: float = Field(0.8, ge=0.0, le=1.0)
    max_results: int = Field(10, ge=1, le=100)


class OcrCandidateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageSourceInput
    candidate_id: str = Field(..., min_length=1, max_length=128)


class OcrOverlayRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageSourceInput
    text: Optional[str] = Field(None, min_length=1, max_length=2000)
    candidate_id: Optional[str] = Field(None, min_length=1, max_length=128)
    threshold: float = Field(0.8, ge=0.0, le=1.0)
    max_results: int = Field(10, ge=1, le=100)
    show_labels: bool = True

    @model_validator(mode="after")
    def validate_filter(self) -> "OcrOverlayRequest":
        if self.text and self.candidate_id:
            raise ValueError("Provide at most one of text or candidate_id")
        return self


class OcrRunResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageMetadataModel
    results: list[OcrResultModel]


class OcrFindTextResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageMetadataModel
    query: str
    threshold: float
    matches: list[OcrResultModel]


class OcrResolveTextResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageMetadataModel
    query: str
    threshold: float
    match: OcrResultModel


class OcrResolveCandidateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageMetadataModel
    candidate_id: str
    match: OcrResultModel


class OcrResolutionErrorModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status_code: int
    detail: Any


class OcrInspectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageSourceInput
    text: Optional[str] = Field(None, min_length=1, max_length=2000)
    threshold: float = Field(0.8, ge=0.0, le=1.0)
    max_results: int = Field(10, ge=1, le=100)
    include_overlay: bool = False
    show_labels: bool = True


class OcrInspectResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageMetadataModel
    query: Optional[str] = None
    threshold: float
    results: list[OcrResultModel]
    ranked_matches: list[OcrResultModel]
    accepted_matches: list[OcrResultModel]
    resolved_match: Optional[OcrResultModel] = None
    resolution_error: Optional[OcrResolutionErrorModel] = None
    overlay: Optional["OverlayArtifactResponse"] = None


class OverlayArtifactResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageMetadataModel
    artifact_id: str
    content_type: str
    size_bytes: int
    sha256: str
    url: str
    annotation_count: int


class VisionLocateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageSourceInput
    description: str = Field(..., min_length=1, max_length=2000)


class VisionLocateAllRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageSourceInput
    description: str = Field(..., min_length=1, max_length=2000)
    max_results: int = Field(5, ge=1, le=25)


class VisionDescribeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageSourceInput
    region: Optional[BoundingBoxModel] = None


class VisionTargetModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str
    center: PointModel
    rank: int = Field(..., ge=1)


class VisionLocateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageMetadataModel
    description: str
    match: VisionTargetModel


class VisionLocateAllResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageMetadataModel
    description: str
    matches: list[VisionTargetModel]


class VisionDescribeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageMetadataModel
    region: Optional[BoundingBoxModel] = None
    description: str


class OverlayPointModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: int
    y: int
    label: Optional[str] = Field(None, max_length=200)
    color: Optional[str] = Field(None, max_length=32)


class OverlayRegionModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: int = Field(..., ge=0)
    y: int = Field(..., ge=0)
    width: int = Field(..., gt=0)
    height: int = Field(..., gt=0)
    label: Optional[str] = Field(None, max_length=200)
    color: Optional[str] = Field(None, max_length=32)


class VisionOverlayPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    points: list[OverlayPointModel] = Field(default_factory=list)
    regions: list[OverlayRegionModel] = Field(default_factory=list)


class VisionOverlayRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: ImageSourceInput
    result: VisionOverlayPayload
    show_labels: bool = True


class DebugConfigSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_mode: str
    model_provider: str
    selected_model_id: str
    interaction_mode: str


class DebugModelsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config: DebugConfigSnapshot
    models: list[dict[str, Any]]


class DebugToolSchemasResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config: DebugConfigSnapshot
    canonical_tool_schemas: list[dict[str, Any]]
    provider_tool_schemas: list[dict[str, Any]]


class DebugToolCapabilitiesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config: DebugConfigSnapshot
    capability: dict[str, Any]
    canonical_tool_schema: Optional[dict[str, Any]] = None
    provider_tool_schema: Optional[dict[str, Any]] = None


class DebugSystemPromptResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config: DebugConfigSnapshot
    system_prompt: str


class PromptPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: Optional[str] = None
    model_id: Optional[str] = Field(None, min_length=1, max_length=256)
    model_provider: Optional[str] = Field(None, min_length=1, max_length=128)
    interaction_mode: Optional[Literal["chat", "agent"]] = None
    include_tools: bool = True
    workspace_path: Optional[str] = Field(None, min_length=1, max_length=4096)
    user_query_raw: Optional[str] = Field(None, max_length=32768)
    messages: list[dict[str, Any]] = Field(default_factory=list)


class DebugUserMessageFullMetadataModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    original_query: str
    context_type: str
    injected_context: str
    active_window: str


class DebugUserMessageFullModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str
    metadata: DebugUserMessageFullMetadataModel


class PromptPreviewResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config: DebugConfigSnapshot
    system_prompt: str
    prompt_messages: list[dict[str, Any]]
    canonical_tool_schemas: list[dict[str, Any]]
    provider_tool_schemas: list[dict[str, Any]]
    user_message_full: Optional[DebugUserMessageFullModel] = None
    prompt_token_count: Optional[int] = None
    token_count_error: Optional[str] = None
