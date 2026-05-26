import base64
import io
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from PIL import Image
from starlette.requests import Request
from tests.backend.websocket_route_test_utils import (
    install_route_deps_shim,
    restore_route_deps_shim,
)

from backend.src.api.auth.context import (
    AuthenticatedInstallIdentity,
    reset_current_authenticated_install_identity,
    set_current_authenticated_install_identity,
)
from backend.src.core.config.models import AppConfig
from backend.src.core.infrastructure.cache_manager import CacheManager
from backend.src.core.observability.trust_boundary_metrics import MetricsService
from backend.src.llm.prompts.prompt_constructor import PromptConstructor
from backend.src.tools.registry import ToolRegistry

_original_deps = install_route_deps_shim()

try:
    from backend.src.api.routes import sdk as sdk_routes
    from backend.src.api.routes.sdk.models import (
        BoundingBoxModel,
        ImageSourceInput,
        OcrCandidateRequest,
        OcrInspectRequest,
        OcrOverlayRequest,
        OcrRunRequest,
        OcrTextQueryRequest,
        OverlayPointModel,
        OverlayRegionModel,
        PromptPreviewRequest,
        QueryPlanRequest,
        VisionDescribeRequest,
        VisionLocateAllRequest,
        VisionLocateRequest,
        VisionOverlayPayload,
        VisionOverlayRequest,
    )
finally:
    restore_route_deps_shim(_original_deps)


def _png_base64(*, size=(800, 400), color=(255, 255, 255)) -> str:
    image = Image.new("RGB", size, color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def _sdk_request(path: str) -> Request:
    return Request(
        {
            "type": "http",
            "scheme": "http",
            "server": ("testserver", 80),
            "path": path,
            "headers": [],
        }
    )


@pytest.fixture
def authenticated_install_identity():
    identity = AuthenticatedInstallIdentity(
        user_id="user-sdk",
        install_id="install-sdk",
    )
    token = set_current_authenticated_install_identity(identity)
    try:
        yield identity
    finally:
        reset_current_authenticated_install_identity(token)


class _FakeOcrService:
    def __init__(self, results):
        self.enabled = True
        self._results = results
        self.calls = 0

    async def perform_ocr(self, _image_b64: str):
        self.calls += 1
        return list(self._results)


class _FakeVisionService:
    def __init__(self, *, point=(640, 240)):
        self.point = point
        self.is_initialized = True
        self.initialization_error = None
        self.coordinate_calls = 0
        self.question_calls = 0

    async def initialize(self):
        self.is_initialized = True
        return True

    async def predict_coordinates(self, _image_b64: str, _description: str):
        self.coordinate_calls += 1
        return self.point

    async def answer_question_about_image(self, image_b64: str, _prompt: str):
        self.question_calls += 1
        raw = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(raw))
        return f"region size {image.size[0]}x{image.size[1]}"


class _FakeModelService:
    async def get_all_models(self):
        return [
            {
                "id": "gpt-5.4@@gpt-5-4-none-thinking",
                "provider": "openai",
                "display_name": "GPT-5.4",
            }
        ]


class _FakeSessionManager:
    def __init__(self, session=None):
        self._session = session

    def get_session(self, _user_id):
        return self._session


class _RejectingSessionManager:
    def get_session(self, user_id):
        raise AssertionError(f"unexpected session lookup for {user_id}")


def _tool_registry(config: AppConfig) -> ToolRegistry:
    return ToolRegistry(config=config, cache_manager=CacheManager())


def _container(
    tmp_path,
    *,
    ocr_results=None,
    vision_point=(640, 240),
    config=None,
):
    effective_config = config or AppConfig(
        artifact_store_path=str(tmp_path),
        artifact_max_bytes=1024 * 1024,
    )
    ocr_service = _FakeOcrService(ocr_results or [])
    vision_service = _FakeVisionService(point=vision_point)
    return SimpleNamespace(
        config=effective_config,
        core=SimpleNamespace(metrics_service=lambda: MetricsService()),
        ocr_router=ocr_service,
        ocr_service=ocr_service,
        vision_router=vision_service,
        vision_service=vision_service,
        model_service=_FakeModelService(),
        tool_registry=_tool_registry(effective_config),
    )


@pytest.mark.asyncio
async def test_sdk_ocr_run_returns_results_with_centers_and_candidates(
    tmp_path,
    authenticated_install_identity,
) -> None:
    _ = authenticated_install_identity
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Amazon",
                "confidence": 0.99,
                "bbox": {"x": 500, "y": 216, "width": 174, "height": 36},
            }
        ],
    )

    response = await sdk_routes.sdk_ocr_run(
        OcrRunRequest(image=ImageSourceInput(image_base64=_png_base64())),
        container,
    )

    assert response.image.width == 800
    assert response.results[0].center.x == 587
    assert response.results[0].center.y == 234
    assert response.results[0].candidate_id.startswith("ocr_")


@pytest.mark.asyncio
async def test_sdk_ocr_run_requires_authenticated_identity_before_ocr(
    tmp_path,
) -> None:
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Amazon",
                "confidence": 0.99,
                "bbox": {"x": 500, "y": 216, "width": 174, "height": 36},
            }
        ],
    )

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_ocr_run(
            OcrRunRequest(image=ImageSourceInput(image_base64=_png_base64())),
            container,
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authenticated install identity required"
    assert container.ocr_service.calls == 0


@pytest.mark.asyncio
async def test_sdk_ocr_run_accepts_authenticated_artifact_id_sources(
    tmp_path,
    authenticated_install_identity,
) -> None:
    _ = authenticated_install_identity
    artifact_id = "inline-shot.png"
    image = Image.new("RGB", (320, 200), (255, 255, 255))
    image.save(tmp_path / artifact_id, format="PNG")
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Amazon",
                "confidence": 0.95,
                "bbox": {"x": 10, "y": 20, "width": 100, "height": 20},
            }
        ],
    )

    response = await sdk_routes.sdk_ocr_run(
        OcrRunRequest(image=ImageSourceInput(artifact_id=artifact_id)),
        container,
    )

    assert response.image.artifact_id == artifact_id
    assert response.image.width == 320
    assert response.results[0].text == "Search Amazon"


@pytest.mark.asyncio
async def test_sdk_ocr_inspect_returns_observability_bundle(tmp_path) -> None:
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Walmart",
                "confidence": 0.91,
                "bbox": {"x": 100, "y": 20, "width": 150, "height": 24},
            },
            {
                "id": "row-2",
                "text": "Search Amazon",
                "confidence": 0.97,
                "bbox": {"x": 300, "y": 20, "width": 150, "height": 24},
            },
        ],
    )

    response = await sdk_routes.sdk_ocr_inspect(
        _sdk_request("/api/sdk/ocr/inspect"),
        OcrInspectRequest(
            image=ImageSourceInput(image_base64=_png_base64()),
            text="Search Amazon",
            include_overlay=True,
            max_results=2,
        ),
        container,
    )

    assert len(response.results) == 2
    assert [row.text for row in response.ranked_matches] == [
        "Search Amazon",
        "Search Walmart",
    ]
    assert [row.text for row in response.accepted_matches] == ["Search Amazon"]
    assert response.resolved_match is not None
    assert response.resolution_error is None
    assert response.overlay is not None
    assert (tmp_path / response.overlay.artifact_id).is_file()


@pytest.mark.asyncio
async def test_sdk_ocr_find_text_requires_authenticated_identity_before_ocr(
    tmp_path,
) -> None:
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Amazon",
                "confidence": 0.99,
                "bbox": {"x": 300, "y": 20, "width": 150, "height": 24},
            }
        ],
    )

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_ocr_find_text(
            OcrTextQueryRequest(
                image=ImageSourceInput(image_base64=_png_base64()),
                text="Search Amazon",
            ),
            container,
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authenticated install identity required"
    assert container.ocr_service.calls == 0


@pytest.mark.asyncio
async def test_sdk_ocr_find_text_returns_authenticated_thresholded_matches(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Walmart",
                "confidence": 0.91,
                "bbox": {"x": 100, "y": 20, "width": 150, "height": 24},
            },
            {
                "id": "row-2",
                "text": "Search Amazon",
                "confidence": 0.97,
                "bbox": {"x": 300, "y": 20, "width": 150, "height": 24},
            },
        ],
    )

    response = await sdk_routes.sdk_ocr_find_text(
        OcrTextQueryRequest(
            image=ImageSourceInput(image_base64=_png_base64()),
            text="Search Amazon",
            max_results=2,
        ),
        container,
    )

    assert response.query == "Search Amazon"
    assert [row.text for row in response.matches] == ["Search Amazon"]
    assert container.ocr_service.calls == 1


@pytest.mark.asyncio
async def test_sdk_ocr_find_text_candidates_returns_thresholded_ranked_matches(
    tmp_path,
) -> None:
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Walmart",
                "confidence": 0.91,
                "bbox": {"x": 100, "y": 20, "width": 150, "height": 24},
            },
            {
                "id": "row-2",
                "text": "Search Amazon",
                "confidence": 0.97,
                "bbox": {"x": 300, "y": 20, "width": 150, "height": 24},
            },
        ],
    )

    response = await sdk_routes.sdk_ocr_find_text_candidates(
        OcrTextQueryRequest(
            image=ImageSourceInput(image_base64=_png_base64()),
            text="Search Amazon",
            max_results=2,
        ),
        container,
    )

    assert response.threshold == 0.8
    assert [row.text for row in response.matches] == ["Search Amazon"]


@pytest.mark.asyncio
async def test_sdk_ocr_resolve_text_returns_center_match(tmp_path) -> None:
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Amazon",
                "confidence": 0.99,
                "bbox": {"x": 500, "y": 216, "width": 174, "height": 36},
            }
        ],
    )

    response = await sdk_routes.sdk_ocr_resolve_text(
        OcrTextQueryRequest(
            image=ImageSourceInput(image_base64=_png_base64()),
            text="Search Amazon",
        ),
        container,
    )

    assert response.match.center.x == 587
    assert response.match.center.y == 234
    assert response.match.text == "Search Amazon"


@pytest.mark.asyncio
async def test_sdk_ocr_resolve_text_returns_structured_ambiguity_error(
    tmp_path,
) -> None:
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Amazon",
                "confidence": 0.99,
                "bbox": {"x": 500, "y": 216, "width": 174, "height": 36},
            },
            {
                "id": "row-2",
                "text": "Search Amazon",
                "confidence": 0.98,
                "bbox": {"x": 700, "y": 216, "width": 174, "height": 36},
            },
        ],
    )

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_ocr_resolve_text(
            OcrTextQueryRequest(
                image=ImageSourceInput(image_base64=_png_base64()),
                text="Search Amazon",
            ),
            container,
        )

    assert exc_info.value.status_code == 409
    assert "resolver_payload" in exc_info.value.detail


@pytest.mark.asyncio
async def test_sdk_ocr_resolve_text_rejects_unmapped_resolved_point(
    tmp_path,
    monkeypatch,
) -> None:
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Amazon",
                "confidence": 0.99,
                "bbox": {"x": 500, "y": 216, "width": 174, "height": 36},
            },
        ],
    )
    resolver = sdk_routes.sdk_ocr_resolve_text.__globals__["OcrCoordinateResolver"]
    monkeypatch.setattr(resolver, "resolve", staticmethod(lambda *_args, **_kwargs: (1, 2)))

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_ocr_resolve_text(
            OcrTextQueryRequest(
                image=ImageSourceInput(image_base64=_png_base64()),
                text="Search Amazon",
            ),
            container,
        )

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Resolved OCR point did not map back to a candidate"


@pytest.mark.asyncio
async def test_sdk_ocr_inspect_includes_structured_resolution_error(tmp_path) -> None:
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Amazon",
                "confidence": 0.99,
                "bbox": {"x": 500, "y": 216, "width": 174, "height": 36},
            },
            {
                "id": "row-2",
                "text": "Search Amazon",
                "confidence": 0.98,
                "bbox": {"x": 700, "y": 216, "width": 174, "height": 36},
            },
        ],
    )

    response = await sdk_routes.sdk_ocr_inspect(
        _sdk_request("/api/sdk/ocr/inspect"),
        OcrInspectRequest(
            image=ImageSourceInput(image_base64=_png_base64()),
            text="Search Amazon",
        ),
        container,
    )

    assert response.resolved_match is None
    assert response.resolution_error is not None
    assert response.resolution_error.status_code == 409
    assert "resolver_payload" in response.resolution_error.detail


@pytest.mark.asyncio
async def test_sdk_ocr_inspect_propagates_unexpected_resolver_errors(
    tmp_path,
    monkeypatch,
) -> None:
    def raise_unexpected(*_args, **_kwargs):
        raise RuntimeError("resolver crashed")

    resolver = sdk_routes.sdk_ocr_inspect.__globals__["OcrCoordinateResolver"]
    monkeypatch.setattr(
        resolver,
        "resolve",
        staticmethod(raise_unexpected),
    )
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Amazon",
                "confidence": 0.99,
                "bbox": {"x": 500, "y": 216, "width": 174, "height": 36},
            },
        ],
    )

    with pytest.raises(RuntimeError, match="resolver crashed"):
        await sdk_routes.sdk_ocr_inspect(
            _sdk_request("/api/sdk/ocr/inspect"),
            OcrInspectRequest(
                image=ImageSourceInput(image_base64=_png_base64()),
                text="Search Amazon",
            ),
            container,
        )


@pytest.mark.asyncio
async def test_sdk_ocr_resolve_candidate_returns_exact_candidate(
    tmp_path,
    authenticated_install_identity,
) -> None:
    _ = authenticated_install_identity
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Amazon",
                "confidence": 0.99,
                "bbox": {"x": 500, "y": 216, "width": 174, "height": 36},
            }
        ],
    )
    run_response = await sdk_routes.sdk_ocr_run(
        OcrRunRequest(image=ImageSourceInput(image_base64=_png_base64())),
        container,
    )
    candidate_id = run_response.results[0].candidate_id

    resolved = await sdk_routes.sdk_ocr_resolve_candidate(
        OcrCandidateRequest(
            image=ImageSourceInput(image_base64=_png_base64()),
            candidate_id=candidate_id,
        ),
        container,
    )

    assert resolved.match.candidate_id == candidate_id
    assert resolved.match.center.x == 587


@pytest.mark.asyncio
async def test_sdk_ocr_overlay_requires_authenticated_identity_before_ocr(
    tmp_path,
) -> None:
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Amazon",
                "confidence": 0.99,
                "bbox": {"x": 500, "y": 216, "width": 174, "height": 36},
            }
        ],
    )

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_ocr_overlay(
            _sdk_request("/api/sdk/ocr/overlay"),
            OcrOverlayRequest(
                image=ImageSourceInput(image_base64=_png_base64()),
                text="Search Amazon",
            ),
            container,
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authenticated install identity required"
    assert container.ocr_service.calls == 0


@pytest.mark.asyncio
async def test_sdk_ocr_overlay_writes_artifact(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Amazon",
                "confidence": 0.99,
                "bbox": {"x": 500, "y": 216, "width": 174, "height": 36},
            }
        ],
    )

    response = await sdk_routes.sdk_ocr_overlay(
        _sdk_request("/api/sdk/ocr/overlay"),
        OcrOverlayRequest(
            image=ImageSourceInput(image_base64=_png_base64()),
            text="Search Amazon",
        ),
        container,
    )

    assert response.url == f"http://testserver/api/artifacts/{response.artifact_id}"
    assert response.annotation_count == 1
    assert (tmp_path / response.artifact_id).is_file()


@pytest.mark.asyncio
async def test_sdk_ocr_overlay_filters_text_matches_and_forwards_labels(
    tmp_path,
    authenticated_install_identity,
    monkeypatch,
) -> None:
    _ = authenticated_install_identity
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Amazon",
                "confidence": 0.99,
                "bbox": {"x": 500, "y": 216, "width": 174, "height": 36},
            },
            {
                "id": "row-2",
                "text": "Search Archive",
                "confidence": 0.70,
                "bbox": {"x": 700, "y": 216, "width": 174, "height": 36},
            },
        ],
    )
    calls = []

    def fake_render(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(annotation_count=len(kwargs["rows"]))

    monkeypatch.setitem(
        sdk_routes.sdk_ocr_overlay.__globals__,
        "render_ocr_overlay_response",
        fake_render,
    )

    response = await sdk_routes.sdk_ocr_overlay(
        _sdk_request("/api/sdk/ocr/overlay"),
        OcrOverlayRequest(
            image=ImageSourceInput(image_base64=_png_base64()),
            text="Search Amazon",
            threshold=0.8,
            max_results=1,
            show_labels=False,
        ),
        container,
    )

    assert response.annotation_count == 1
    assert [row.text for row in calls[0]["rows"]] == ["Search Amazon"]
    assert calls[0]["show_labels"] is False


@pytest.mark.asyncio
async def test_sdk_ocr_overlay_uses_default_rows_when_no_filter_is_requested(
    tmp_path,
    authenticated_install_identity,
    monkeypatch,
) -> None:
    _ = authenticated_install_identity
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Amazon",
                "confidence": 0.99,
                "bbox": {"x": 500, "y": 216, "width": 174, "height": 36},
            },
            {
                "id": "row-2",
                "text": "Open Settings",
                "confidence": 0.98,
                "bbox": {"x": 700, "y": 216, "width": 174, "height": 36},
            },
        ],
    )
    calls = []

    def fake_render(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(annotation_count=len(kwargs["rows"]))

    monkeypatch.setitem(
        sdk_routes.sdk_ocr_overlay.__globals__,
        "render_ocr_overlay_response",
        fake_render,
    )

    response = await sdk_routes.sdk_ocr_overlay(
        _sdk_request("/api/sdk/ocr/overlay"),
        OcrOverlayRequest(
            image=ImageSourceInput(image_base64=_png_base64()),
            max_results=1,
        ),
        container,
    )

    assert response.annotation_count == 1
    assert [row.text for row in calls[0]["rows"]] == ["Search Amazon"]
    assert calls[0]["show_labels"] is True


@pytest.mark.asyncio
async def test_sdk_ocr_overlay_returns_404_for_unknown_candidate(
    tmp_path,
    authenticated_install_identity,
) -> None:
    _ = authenticated_install_identity
    container = _container(
        tmp_path,
        ocr_results=[
            {
                "id": "row-1",
                "text": "Search Amazon",
                "confidence": 0.99,
                "bbox": {"x": 500, "y": 216, "width": 174, "height": 36},
            },
        ],
    )

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_ocr_overlay(
            _sdk_request("/api/sdk/ocr/overlay"),
            OcrOverlayRequest(
                image=ImageSourceInput(image_base64=_png_base64()),
                candidate_id="missing-candidate",
            ),
            container,
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "OCR candidate not found for overlay"


@pytest.mark.asyncio
async def test_sdk_vision_locate_requires_authenticated_identity_before_vision(
    tmp_path,
) -> None:
    container = _container(tmp_path, vision_point=(612, 241))

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_vision_locate(
            VisionLocateRequest(
                image=ImageSourceInput(image_base64=_png_base64()),
                description="orange search button",
            ),
            container,
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authenticated install identity required"
    assert container.vision_service.coordinate_calls == 0


@pytest.mark.asyncio
async def test_sdk_vision_locate_returns_authenticated_predicted_coordinates(
    tmp_path,
    authenticated_install_identity,
) -> None:
    _ = authenticated_install_identity
    container = _container(tmp_path, vision_point=(612, 241))

    response = await sdk_routes.sdk_vision_locate(
        VisionLocateRequest(
            image=ImageSourceInput(image_base64=_png_base64()),
            description="orange search button",
        ),
        container,
    )

    assert response.match.center.x == 612
    assert response.match.center.y == 241
    assert response.match.rank == 1


@pytest.mark.asyncio
async def test_sdk_vision_locate_all_requires_authenticated_identity_before_vision(
    tmp_path,
) -> None:
    container = _container(tmp_path, vision_point=(612, 241))

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_vision_locate_all(
            VisionLocateAllRequest(
                image=ImageSourceInput(image_base64=_png_base64()),
                description="orange search button",
                max_results=3,
            ),
            container,
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authenticated install identity required"
    assert container.vision_service.coordinate_calls == 0


@pytest.mark.asyncio
async def test_sdk_vision_locate_all_returns_authenticated_best_match_list(
    tmp_path,
    authenticated_install_identity,
) -> None:
    _ = authenticated_install_identity
    container = _container(tmp_path, vision_point=(612, 241))

    response = await sdk_routes.sdk_vision_locate_all(
        VisionLocateAllRequest(
            image=ImageSourceInput(image_base64=_png_base64()),
            description="orange search button",
            max_results=3,
        ),
        container,
    )

    assert len(response.matches) == 1
    assert response.matches[0].center.x == 612


@pytest.mark.asyncio
async def test_sdk_vision_describe_uses_full_image_without_region(tmp_path) -> None:
    container = _container(tmp_path)

    response = await sdk_routes.sdk_vision_describe(
        VisionDescribeRequest(
            image=ImageSourceInput(image_base64=_png_base64(size=(300, 120))),
        ),
        container,
    )

    assert response.region is None
    assert response.image.width == 300
    assert response.image.height == 120
    assert response.description == "region size 300x120"


@pytest.mark.asyncio
async def test_sdk_vision_describe_uses_cropped_region(tmp_path) -> None:
    container = _container(tmp_path)

    response = await sdk_routes.sdk_vision_describe(
        VisionDescribeRequest(
            image=ImageSourceInput(image_base64=_png_base64(size=(300, 120))),
            region=BoundingBoxModel(x=20, y=10, width=80, height=30),
        ),
        container,
    )

    assert response.region == BoundingBoxModel(x=0, y=0, width=80, height=30)
    assert response.image.width == 80
    assert response.image.height == 30
    assert response.description == "region size 80x30"


@pytest.mark.asyncio
async def test_sdk_vision_describe_trims_partial_overflow_region(tmp_path) -> None:
    container = _container(tmp_path)

    response = await sdk_routes.sdk_vision_describe(
        VisionDescribeRequest(
            image=ImageSourceInput(image_base64=_png_base64(size=(100, 80))),
            region=BoundingBoxModel(x=75, y=60, width=50, height=40),
        ),
        container,
    )

    assert response.region == BoundingBoxModel(x=0, y=0, width=25, height=20)
    assert response.image.width == 25
    assert response.image.height == 20
    assert response.description == "region size 25x20"


@pytest.mark.asyncio
async def test_sdk_vision_describe_rejects_region_origin_outside_image(
    tmp_path,
) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_vision_describe(
            VisionDescribeRequest(
                image=ImageSourceInput(image_base64=_png_base64(size=(100, 80))),
                region=BoundingBoxModel(x=100, y=10, width=20, height=20),
            ),
            container,
        )

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "Requested region is outside image bounds"


@pytest.mark.asyncio
async def test_sdk_vision_overlay_requires_authenticated_identity_before_write(
    tmp_path,
) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_vision_overlay(
            _sdk_request("/api/sdk/vision/overlay"),
            VisionOverlayRequest(
                image=ImageSourceInput(image_base64=_png_base64()),
                result=VisionOverlayPayload(
                    points=[OverlayPointModel(x=120, y=90, label="target")],
                    regions=[
                        OverlayRegionModel(
                            x=80, y=40, width=100, height=60, label="region"
                        )
                    ],
                ),
            ),
            container,
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authenticated install identity required"
    assert not any(tmp_path.iterdir())


@pytest.mark.asyncio
async def test_sdk_vision_overlay_writes_authenticated_artifact(
    tmp_path,
    authenticated_install_identity,
) -> None:
    _ = authenticated_install_identity
    container = _container(tmp_path)

    response = await sdk_routes.sdk_vision_overlay(
        _sdk_request("/api/sdk/vision/overlay"),
        VisionOverlayRequest(
            image=ImageSourceInput(image_base64=_png_base64()),
            result=VisionOverlayPayload(
                points=[OverlayPointModel(x=120, y=90, label="target")],
                regions=[
                    OverlayRegionModel(x=80, y=40, width=100, height=60, label="region")
                ],
            ),
        ),
        container,
    )

    assert response.annotation_count == 2
    assert (tmp_path / response.artifact_id).is_file()


@pytest.mark.asyncio
async def test_sdk_debug_models_returns_catalog_and_effective_config(
    tmp_path,
    authenticated_install_identity,
) -> None:
    config = AppConfig(
        artifact_store_path=str(tmp_path),
        artifact_max_bytes=1024 * 1024,
        model_provider="openai",
        selected_model_id="gpt-5.4@@gpt-5-4-none-thinking",
    )
    container = _container(tmp_path, config=config)

    response = await sdk_routes.sdk_debug_models(
        container=container,
        session_manager=_FakeSessionManager(),
        user_id=None,
        model_id=None,
        model_provider=None,
        interaction_mode=None,
    )

    assert response.config.model_provider == "openai"
    assert response.config.selected_model_id == "gpt-5.4@@gpt-5-4-none-thinking"
    assert response.models[0]["id"] == "gpt-5.4@@gpt-5-4-none-thinking"


@pytest.mark.asyncio
async def test_sdk_debug_models_applies_same_user_query_overrides(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(
        tmp_path,
        config=AppConfig(
            artifact_store_path=str(tmp_path),
            artifact_max_bytes=1024 * 1024,
            model_provider="openai",
            selected_model_id="gpt-5.4@@gpt-5-4-none-thinking",
            interaction_mode="agent",
        ),
    )
    session_manager = _FakeSessionManager(
        SimpleNamespace(
            cfg=AppConfig(
                artifact_store_path=str(tmp_path),
                artifact_max_bytes=1024 * 1024,
                model_provider="anthropic",
                selected_model_id="claude-sonnet-4-20250514",
                interaction_mode="chat",
            )
        )
    )

    response = await sdk_routes.sdk_debug_models(
        container=container,
        session_manager=session_manager,
        user_id=authenticated_install_identity.user_id,
        model_id="gpt-5.4@@gpt-5-4-none-thinking",
        model_provider="openai",
        interaction_mode="agent",
    )

    assert response.model_dump().keys() == {"config", "models"}
    assert response.config.model_provider == "openai"
    assert response.config.selected_model_id == "gpt-5.4@@gpt-5-4-none-thinking"
    assert response.config.interaction_mode == "agent"
    assert response.models == [
        {
            "id": "gpt-5.4@@gpt-5-4-none-thinking",
            "provider": "openai",
            "display_name": "GPT-5.4",
        }
    ]


@pytest.mark.asyncio
async def test_sdk_debug_models_requires_authenticated_identity(tmp_path) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_debug_models(
            container=container,
            session_manager=_FakeSessionManager(),
            user_id=None,
            model_id=None,
            model_provider=None,
            interaction_mode=None,
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authenticated install identity required"


@pytest.mark.asyncio
async def test_sdk_debug_models_rejects_other_user_context(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_debug_models(
            container=container,
            session_manager=_FakeSessionManager(),
            user_id="other-user",
            model_id=None,
            model_provider=None,
            interaction_mode=None,
        )

    assert exc_info.value.status_code == 403
    assert (
        exc_info.value.detail
        == "SDK debug models cannot inspect another user's context"
    )


@pytest.mark.asyncio
async def test_sdk_debug_tool_schemas_returns_canonical_and_provider_shapes(
    tmp_path,
    authenticated_install_identity,
) -> None:
    _ = authenticated_install_identity
    config = AppConfig(
        artifact_store_path=str(tmp_path),
        artifact_max_bytes=1024 * 1024,
        model_provider="openai",
        selected_model_id="gpt-5.4@@gpt-5-4-none-thinking",
    )
    container = _container(tmp_path, config=config)

    response = await sdk_routes.sdk_debug_tool_schemas(
        container=container,
        session_manager=_FakeSessionManager(),
        user_id=None,
        model_id=None,
        model_provider=None,
        interaction_mode=None,
    )

    assert any(
        schema.get("name") == "read_file" for schema in response.canonical_tool_schemas
    )
    assert response.provider_tool_schemas
    assert all(
        schema.get("type") == "function" for schema in response.provider_tool_schemas
    )


@pytest.mark.asyncio
async def test_sdk_debug_tool_schemas_requires_authenticated_identity(
    tmp_path,
) -> None:
    config = AppConfig(
        artifact_store_path=str(tmp_path),
        artifact_max_bytes=1024 * 1024,
        model_provider="openai",
        selected_model_id="gpt-5.4@@gpt-5-4-none-thinking",
    )
    container = _container(tmp_path, config=config)

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_debug_tool_schemas(
            container=container,
            session_manager=_RejectingSessionManager(),
            user_id="other-user",
            model_id=None,
            model_provider=None,
            interaction_mode=None,
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authenticated install identity required"


@pytest.mark.asyncio
async def test_sdk_debug_tool_schemas_rejects_other_user_context(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_debug_tool_schemas(
            container=container,
            session_manager=_RejectingSessionManager(),
            user_id="other-user",
            model_id=None,
            model_provider=None,
            interaction_mode=None,
        )

    assert exc_info.value.status_code == 403
    assert (
        exc_info.value.detail
        == "SDK debug tool schemas cannot inspect another user's context"
    )


@pytest.mark.asyncio
async def test_sdk_debug_tool_schemas_uses_prompt_constructor_surface(
    tmp_path,
    monkeypatch,
    authenticated_install_identity,
) -> None:
    _ = authenticated_install_identity

    def fake_get_tool_schema_surfaces(self, *, prompt_messages=None):
        assert prompt_messages is None
        return (
            [{"type": "function", "name": "debug_canonical", "parameters": {}}],
            [{"type": "function", "name": "debug_provider", "parameters": {}}],
        )

    monkeypatch.setattr(
        PromptConstructor,
        "get_tool_schema_surfaces",
        fake_get_tool_schema_surfaces,
    )
    container = _container(tmp_path)

    response = await sdk_routes.sdk_debug_tool_schemas(
        container=container,
        session_manager=_FakeSessionManager(),
        user_id=None,
        model_id=None,
        model_provider=None,
        interaction_mode=None,
    )

    assert response.canonical_tool_schemas[0]["name"] == "debug_canonical"
    assert response.provider_tool_schemas[0]["name"] == "debug_provider"


@pytest.mark.asyncio
async def test_sdk_debug_tool_schemas_applies_query_overrides_to_response_shape(
    tmp_path,
    monkeypatch,
    authenticated_install_identity,
) -> None:
    base_config = AppConfig(
        artifact_store_path=str(tmp_path),
        artifact_max_bytes=1024 * 1024,
        model_provider="anthropic",
        selected_model_id="claude-base",
        interaction_mode="chat",
    )
    session_config = base_config.model_copy(
        update={
            "model_provider": "openai",
            "selected_model_id": "gpt-session",
            "interaction_mode": "chat",
        }
    )
    container = _container(tmp_path, config=base_config)

    def fake_build_debug_tool_schemas(**kwargs):
        config = kwargs["config"]
        assert config.model_provider == "openai"
        assert config.selected_model_id == "gpt-override"
        assert config.interaction_mode == "agent"
        return (
            [{"type": "function", "name": "canonical_only"}],
            [{"type": "function", "function": {"name": "provider_only"}}],
        )

    monkeypatch.setitem(
        sdk_routes.sdk_debug_tool_schemas.__globals__,
        "build_debug_tool_schemas",
        fake_build_debug_tool_schemas,
    )

    response = await sdk_routes.sdk_debug_tool_schemas(
        container=container,
        session_manager=_FakeSessionManager(SimpleNamespace(cfg=session_config)),
        user_id=authenticated_install_identity.user_id,
        model_id="gpt-override",
        model_provider="openai",
        interaction_mode="agent",
    )

    payload = response.model_dump(mode="json")
    assert set(payload) == {
        "config",
        "canonical_tool_schemas",
        "provider_tool_schemas",
    }
    assert payload["config"] == {
        "model_mode": base_config.model_mode,
        "model_provider": "openai",
        "selected_model_id": "gpt-override",
        "interaction_mode": "agent",
    }
    assert payload["canonical_tool_schemas"] == [
        {"type": "function", "name": "canonical_only"}
    ]
    assert payload["provider_tool_schemas"] == [
        {"type": "function", "function": {"name": "provider_only"}}
    ]


@pytest.mark.asyncio
async def test_sdk_debug_tool_capabilities_returns_schema_details(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)

    response = await sdk_routes.sdk_debug_tool_capabilities(
        "read_file",
        container=container,
        session_manager=_FakeSessionManager(),
        user_id=None,
        model_id=None,
        model_provider=None,
        interaction_mode=None,
    )

    assert response.capability["name"] == "read_file"
    assert response.canonical_tool_schema is not None
    assert response.canonical_tool_schema["name"] == "read_file"


@pytest.mark.asyncio
async def test_sdk_debug_tool_capabilities_requires_authenticated_identity(
    tmp_path,
) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_debug_tool_capabilities(
            "read_file",
            container=container,
            session_manager=_FakeSessionManager(),
            user_id=None,
            model_id=None,
            model_provider=None,
            interaction_mode=None,
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authenticated install identity required"


@pytest.mark.asyncio
async def test_sdk_debug_tool_capabilities_rejects_other_user_context(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_debug_tool_capabilities(
            "read_file",
            container=container,
            session_manager=_RejectingSessionManager(),
            user_id="other-user",
            model_id=None,
            model_provider=None,
            interaction_mode=None,
        )

    assert exc_info.value.status_code == 403
    assert (
        exc_info.value.detail
        == "SDK debug tool capabilities cannot inspect another user's context"
    )


@pytest.mark.asyncio
async def test_sdk_debug_system_prompt_returns_prompt_text(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)

    response = await sdk_routes.sdk_debug_system_prompt(
        container=container,
        session_manager=_FakeSessionManager(),
        user_id=authenticated_install_identity.user_id,
        model_id=None,
        model_provider=None,
        interaction_mode=None,
    )

    assert response.system_prompt
    assert response.config.selected_model_id == container.config.selected_model_id


@pytest.mark.asyncio
async def test_sdk_debug_system_prompt_requires_authenticated_identity(
    tmp_path,
) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_debug_system_prompt(
            container=container,
            session_manager=_FakeSessionManager(),
            user_id=None,
            model_id=None,
            model_provider=None,
            interaction_mode=None,
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authenticated install identity required"


@pytest.mark.asyncio
async def test_sdk_debug_system_prompt_rejects_other_user_context(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_debug_system_prompt(
            container=container,
            session_manager=_FakeSessionManager(),
            user_id="other-user",
            model_id=None,
            model_provider=None,
            interaction_mode=None,
        )

    assert exc_info.value.status_code == 403
    assert (
        exc_info.value.detail
        == "SDK debug system prompt cannot inspect another user's context"
    )


@pytest.mark.asyncio
async def test_sdk_debug_prompt_preview_returns_prompt_transparency_payloads(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)

    response = await sdk_routes.sdk_debug_prompt_preview(
        PromptPreviewRequest(
            messages=[
                {
                    "role": "user",
                    "content": (
                        "<system_context><active_window>Terminal</active_window></system_context>\n"
                        "<user_query>open file</user_query>"
                    ),
                }
            ],
            user_query_raw="open file",
            include_tools=True,
        ),
        container=container,
        session_manager=_FakeSessionManager(),
    )

    assert response.system_prompt
    assert response.prompt_messages[0]["role"] == "user"
    assert response.user_message_full is not None
    assert response.user_message_full.metadata.original_query == "open file"
    assert response.user_message_full.metadata.active_window == "Terminal"
    assert any(
        schema.get("name") == "read_file" for schema in response.canonical_tool_schemas
    )
    assert (
        response.prompt_token_count is not None
        or response.token_count_error is not None
    )


@pytest.mark.asyncio
async def test_sdk_debug_prompt_preview_maps_preview_contract_fields(
    tmp_path,
    monkeypatch,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)

    def fake_build_prompt_preview(**kwargs):
        assert kwargs["include_tools"] is False
        assert kwargs["messages"] == [{"role": "user", "content": "hello"}]
        assert kwargs["user_query_raw"] == "hello"
        return {
            "system_prompt": "system text",
            "prompt_messages": [{"role": "user", "content": "hello"}],
            "canonical_tool_schemas": [],
            "provider_tool_schemas": [],
            "user_message_full": {
                "content": "hello",
                "metadata": {
                    "original_query": "hello",
                    "context_type": "raw",
                    "injected_context": "",
                    "active_window": "",
                },
            },
            "prompt_token_count": None,
            "token_count_error": "tokenizer unavailable",
        }

    monkeypatch.setitem(
        sdk_routes.sdk_debug_prompt_preview.__globals__,
        "build_prompt_preview",
        fake_build_prompt_preview,
    )

    response = await sdk_routes.sdk_debug_prompt_preview(
        PromptPreviewRequest(
            messages=[{"role": "user", "content": "hello"}],
            user_query_raw="hello",
            include_tools=False,
        ),
        container=container,
        session_manager=_FakeSessionManager(),
    )

    payload = response.model_dump(mode="json")
    assert set(payload) == {
        "config",
        "system_prompt",
        "prompt_messages",
        "canonical_tool_schemas",
        "provider_tool_schemas",
        "user_message_full",
        "prompt_token_count",
        "token_count_error",
    }
    assert payload["config"].keys() == {
        "model_mode",
        "model_provider",
        "selected_model_id",
        "interaction_mode",
    }
    assert payload["system_prompt"] == "system text"
    assert payload["prompt_messages"] == [{"role": "user", "content": "hello"}]
    assert payload["canonical_tool_schemas"] == []
    assert payload["provider_tool_schemas"] == []
    assert payload["user_message_full"]["metadata"]["original_query"] == "hello"
    assert payload["prompt_token_count"] is None
    assert payload["token_count_error"] == "tokenizer unavailable"


@pytest.mark.asyncio
async def test_sdk_debug_prompt_preview_applies_agent_definition(
    tmp_path,
    monkeypatch,
    authenticated_install_identity,
) -> None:
    monkeypatch.setattr(
        "backend.src.tools.tool_policy.load_tool_selection", lambda: None
    )
    container = _container(tmp_path)

    response = await sdk_routes.sdk_debug_prompt_preview(
        PromptPreviewRequest(
            user_query_raw="summarize",
            include_tools=True,
            agent_definition={
                "id": "custom-agent",
                "system_prompt": {
                    "mode": "replace",
                    "content": "You are a custom agent.",
                },
                "prompt_layers": [
                    {
                        "id": "custom-layer",
                        "type": "custom_instructions",
                        "priority": 50,
                        "content": "Always be direct.",
                    }
                ],
                "tools": {
                    "mode": "client_only",
                    "client_manifest": {
                        "version": 1,
                        "tools": [
                            {
                                "name": "save_note",
                                "description": "Save a note",
                                "execution_target": "sidecar",
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "text": {"type": "string"},
                                    },
                                    "required": ["text"],
                                },
                                "entrypoint": "python/save_note.py:run",
                            }
                        ],
                    },
                },
            },
        ),
        container=container,
        session_manager=_FakeSessionManager(),
    )

    assert response.system_prompt == "You are a custom agent."
    assert any(
        schema.get("name") == "save_note" for schema in response.canonical_tool_schemas
    )
    assert all(
        schema.get("name") != "read_file" for schema in response.canonical_tool_schemas
    )
    assert "Always be direct." in response.prompt_messages[0]["content"]


@pytest.mark.asyncio
async def test_sdk_debug_prompt_preview_requires_authenticated_identity(
    tmp_path,
) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_debug_prompt_preview(
            PromptPreviewRequest(user_query_raw="inspect prompt"),
            container=container,
            session_manager=_FakeSessionManager(),
        )

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_sdk_debug_prompt_preview_rejects_other_user_context(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_debug_prompt_preview(
            PromptPreviewRequest(
                user_query_raw="inspect prompt",
                user_id="other-user",
            ),
            container=container,
            session_manager=_FakeSessionManager(),
        )

    assert exc_info.value.status_code == 403
    assert (
        exc_info.value.detail
        == "SDK debug prompt preview cannot inspect another user's context"
    )


@pytest.mark.asyncio
async def test_sdk_debug_query_plan_returns_query_and_transparency_payloads(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)

    response = await sdk_routes.sdk_debug_query_plan(
        QueryPlanRequest(
            messages=[
                {
                    "role": "user",
                    "content": (
                        "<system_context><active_window>Terminal</active_window></system_context>\n"
                        "<user_query>open file</user_query>"
                    ),
                }
            ],
            user_query_raw="open file",
            conversation_ref="conv-sdk",
            include_tools=True,
        ),
        container=container,
        session_manager=_FakeSessionManager(),
    )

    assert response.query_message["type"] == "query"
    assert response.query_message["payload"]["text"] == "open file"
    assert response.query_message["payload"]["conversation_ref"] == "conv-sdk"
    assert [event["type"] for event in response.transparency_events] == [
        "system-prompt",
        "user-message-full",
        "tool-schemas",
    ]
    assert response.transparency_events[2]["payload"]["tool_schemas"]
    assert response.user_message_full is not None
    assert response.user_message_full.metadata.original_query == "open file"


@pytest.mark.asyncio
async def test_sdk_debug_query_plan_carries_agent_definition(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)
    agent_definition = {
        "id": "tui-agent",
        "system_prompt": {
            "mode": "replace",
            "content": "You are a TUI-defined agent.",
        },
    }

    response = await sdk_routes.sdk_debug_query_plan(
        QueryPlanRequest(
            user_query_raw="status",
            conversation_ref="conv-tui",
            agent_definition=agent_definition,
        ),
        container=container,
        session_manager=_FakeSessionManager(),
    )

    assert response.system_prompt == "You are a TUI-defined agent."
    assert response.query_message["payload"]["agent_definition"]["id"] == "tui-agent"
    assert (
        response.query_message["payload"]["agent_definition"]["system_prompt"][
            "content"
        ]
        == "You are a TUI-defined agent."
    )


@pytest.mark.asyncio
async def test_sdk_debug_query_plan_requires_authenticated_identity(tmp_path) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_debug_query_plan(
            QueryPlanRequest(user_query_raw="status"),
            container=container,
            session_manager=_FakeSessionManager(),
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authenticated install identity required"


@pytest.mark.asyncio
async def test_sdk_debug_query_plan_rejects_other_user_context(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_debug_query_plan(
            QueryPlanRequest(user_query_raw="status", user_id="other-user"),
            container=container,
            session_manager=_FakeSessionManager(),
        )

    assert exc_info.value.status_code == 403
    assert (
        exc_info.value.detail
        == "SDK debug query plan cannot inspect another user's context"
    )


@pytest.mark.asyncio
async def test_sdk_debug_query_plan_rejects_payload_workspace_context(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await sdk_routes.sdk_debug_query_plan(
            QueryPlanRequest(
                user_query_raw="status",
                user_id=authenticated_install_identity.user_id,
                workspace_path="/tmp/other-workspace",
            ),
            container=container,
            session_manager=_FakeSessionManager(),
        )

    assert exc_info.value.status_code == 403
    assert (
        exc_info.value.detail
        == "SDK debug query plan does not accept payload-selected workspace paths"
    )
