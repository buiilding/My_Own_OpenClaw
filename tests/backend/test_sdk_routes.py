import base64
import io
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from PIL import Image
from starlette.requests import Request

from backend.src.core.config.models import AppConfig
from tests.backend.websocket_route_test_utils import (
    install_route_deps_shim,
    restore_route_deps_shim,
)

_original_deps = install_route_deps_shim()

try:
    from backend.src.api.routes import sdk as sdk_routes
    from backend.src.api.routes.sdk.models import (
        BoundingBoxModel,
        ImageSourceInput,
        OcrCandidateRequest,
        OcrOverlayRequest,
        OcrRunRequest,
        OcrTextQueryRequest,
        OverlayPointModel,
        OverlayRegionModel,
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


class _FakeOcrService:
    def __init__(self, results):
        self.enabled = True
        self._results = results

    async def perform_ocr(self, _image_b64: str):
        return list(self._results)


class _FakeVisionModel:
    def __init__(self, *, point=(640, 240)):
        self.point = point

    async def predict_click_coordinates(self, _image_b64: str, _description: str):
        return self.point

    async def answer_question_about_image(self, image_b64: str, _prompt: str):
        raw = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(raw))
        return f"region size {image.size[0]}x{image.size[1]}"


class _FakeVisionService:
    def __init__(self, model):
        self.model = model
        self.is_initialized = True
        self.initialization_error = None

    async def initialize(self):
        self.is_initialized = True
        return True


def _container(
    tmp_path,
    *,
    ocr_results=None,
    vision_model=None,
):
    return SimpleNamespace(
        config=AppConfig(
            artifact_store_path=str(tmp_path),
            artifact_max_bytes=1024 * 1024,
        ),
        ocr_service=_FakeOcrService(ocr_results or []),
        vision_service=_FakeVisionService(vision_model or _FakeVisionModel()),
    )


@pytest.mark.asyncio
async def test_sdk_ocr_run_returns_results_with_centers_and_candidates(tmp_path) -> None:
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
async def test_sdk_ocr_run_accepts_artifact_id_sources(tmp_path) -> None:
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
async def test_sdk_ocr_find_text_candidates_returns_ranked_matches(tmp_path) -> None:
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

    assert [row.text for row in response.matches] == ["Search Amazon", "Search Walmart"]
    assert response.matches[0].score >= response.matches[1].score


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
async def test_sdk_ocr_resolve_text_returns_structured_ambiguity_error(tmp_path) -> None:
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
async def test_sdk_ocr_resolve_candidate_returns_exact_candidate(tmp_path) -> None:
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
async def test_sdk_ocr_overlay_writes_artifact(tmp_path) -> None:
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
async def test_sdk_vision_locate_returns_predicted_coordinates(tmp_path) -> None:
    container = _container(tmp_path, vision_model=_FakeVisionModel(point=(612, 241)))

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
async def test_sdk_vision_locate_all_returns_best_match_list(tmp_path) -> None:
    container = _container(tmp_path, vision_model=_FakeVisionModel(point=(612, 241)))

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
async def test_sdk_vision_describe_uses_cropped_region(tmp_path) -> None:
    container = _container(tmp_path, vision_model=_FakeVisionModel())

    response = await sdk_routes.sdk_vision_describe(
        VisionDescribeRequest(
            image=ImageSourceInput(image_base64=_png_base64(size=(300, 120))),
            region=BoundingBoxModel(x=20, y=10, width=80, height=30),
        ),
        container,
    )

    assert response.region == BoundingBoxModel(x=20, y=10, width=80, height=30)
    assert response.image.width == 80
    assert response.image.height == 30
    assert response.description == "region size 80x30"


@pytest.mark.asyncio
async def test_sdk_vision_overlay_writes_artifact(tmp_path) -> None:
    container = _container(tmp_path)

    response = await sdk_routes.sdk_vision_overlay(
        _sdk_request("/api/sdk/vision/overlay"),
        VisionOverlayRequest(
            image=ImageSourceInput(image_base64=_png_base64()),
            result=VisionOverlayPayload(
                points=[OverlayPointModel(x=120, y=90, label="target")],
                regions=[OverlayRegionModel(x=80, y=40, width=100, height=60, label="region")],
            ),
        ),
        container,
    )

    assert response.annotation_count == 2
    assert (tmp_path / response.artifact_id).is_file()
