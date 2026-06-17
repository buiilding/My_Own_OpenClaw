"""Covers remote ocr vision providers behavior in the backend test suite."""

from __future__ import annotations

import json

import httpx
import pytest

from backend.src.core.inference.errors import ProviderRequestError
from backend.src.services.ocr.remote_provider import RemoteHttpOcrProvider
from backend.src.services.vision import RemoteHttpVisionProvider


def _build_transport(handler):
    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_remote_ocr_provider_checks_health_and_runs_analysis() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            return httpx.Response(200, json={"status": "ready"})
        assert request.url.path == "/ocr/analyze"
        assert json.loads(request.content.decode("utf-8")) == {
            "image": "image-b64",
            "model": "rapidocr",
        }
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "text": "File",
                        "bbox": {"x": 10, "y": 20, "width": 30, "height": 12},
                    }
                ]
            },
        )

    provider = RemoteHttpOcrProvider(
        service_url="http://ocr.internal",
        model_id="rapidocr",
        http_client=httpx.AsyncClient(
            base_url="http://ocr.internal",
            transport=_build_transport(handler),
        ),
    )

    await provider.initialize()
    results = await provider.perform_ocr("image-b64")

    assert provider.is_ready is True
    assert results == [
        {"text": "File", "bbox": {"x": 10, "y": 20, "width": 30, "height": 12}}
    ]

    await provider.close()


@pytest.mark.asyncio
async def test_remote_ocr_provider_maps_bad_payload_to_provider_error() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            return httpx.Response(200, json={"ready": True})
        return httpx.Response(200, json={"unexpected": True})

    provider = RemoteHttpOcrProvider(
        service_url="http://ocr.internal",
        model_id="rapidocr",
        http_client=httpx.AsyncClient(
            base_url="http://ocr.internal",
            transport=_build_transport(handler),
        ),
    )

    await provider.initialize()
    with pytest.raises(ProviderRequestError, match="without results"):
        await provider.perform_ocr("image-b64")

    await provider.close()


@pytest.mark.asyncio
async def test_remote_ocr_provider_rejects_analysis_after_failed_health() -> None:
    paths: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        if request.url.path == "/health":
            raise httpx.ReadTimeout("health timed out")
        return httpx.Response(200, json={"results": [{"text": "stale"}]})

    provider = RemoteHttpOcrProvider(
        service_url="http://ocr.internal",
        model_id="rapidocr",
        http_client=httpx.AsyncClient(
            base_url="http://ocr.internal",
            transport=_build_transport(handler),
        ),
    )

    assert await provider.health_check() is False
    assert provider.is_ready is False

    with pytest.raises(ProviderRequestError, match="health check timed out"):
        await provider.perform_ocr("image-b64")

    assert paths == ["/health"]

    await provider.close()


@pytest.mark.asyncio
async def test_remote_vision_provider_locates_and_describes() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            return httpx.Response(200, json={"healthy": True})
        if request.url.path == "/vision/locate":
            assert json.loads(request.content.decode("utf-8")) == {
                "image": "image-b64",
                "description": "settings button",
                "model": "vision-model",
            }
            return httpx.Response(200, json={"center": {"x": 40, "y": 50}})
        assert request.url.path == "/vision/describe"
        return httpx.Response(200, json={"answer": "A settings dialog"})

    provider = RemoteHttpVisionProvider(
        service_url="http://vision.internal",
        model_id="vision-model",
        http_client=httpx.AsyncClient(
            base_url="http://vision.internal",
            transport=_build_transport(handler),
        ),
    )

    assert await provider.initialize() is True
    assert await provider.predict_coordinates("image-b64", "settings button") == (
        40,
        50,
    )
    assert await provider.answer_question_about_image("image-b64", "describe") == (
        "A settings dialog"
    )

    await provider.close()


@pytest.mark.asyncio
async def test_remote_vision_provider_marks_unhealthy_health_response() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"detail": "warming up"})

    provider = RemoteHttpVisionProvider(
        service_url="http://vision.internal",
        model_id="vision-model",
        http_client=httpx.AsyncClient(
            base_url="http://vision.internal",
            transport=_build_transport(handler),
        ),
    )

    assert await provider.initialize() is False
    assert provider.is_initialized is False
    assert provider.initialization_error == "warming up"

    await provider.close()
