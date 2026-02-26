from types import SimpleNamespace

import pytest

from backend.src.agent.tools.preparation.helpers.coordinate_resolution_helper import (
    resolve_coordinates,
)
from backend.src.core.types.enums import CoordinateFindingMethod


class _FakeOcrCoordinator:
    def __init__(self, results):
        self.results = results
        self.calls = []

    async def get_ocr_results(self, session, screenshot_data, screenshot_id):
        self.calls.append((session, screenshot_data, screenshot_id))
        return self.results


class _FakeCoordinateResolver:
    def __init__(self, return_xy):
        self.return_xy = return_xy
        self.calls = []

    async def resolve(self, tool_call, screenshot_data, ocr_results, vision_service):
        self.calls.append((tool_call, screenshot_data, ocr_results, vision_service))
        return self.return_xy


@pytest.mark.asyncio
async def test_resolve_coordinates_ocr_path_uses_ocr_results():
    tool_call = SimpleNamespace(
        parameters={"find_coordinates_by": CoordinateFindingMethod.OCR}
    )
    session = object()
    ocr = _FakeOcrCoordinator(results=[{"text": "Submit"}])
    resolver = _FakeCoordinateResolver(return_xy=(300, 400))

    x, y = await resolve_coordinates(
        tool_call=tool_call,
        session=session,
        screenshot_data="screenshot-b64",
        screenshot_id="shot-1",
        ocr_coordinator=ocr,
        coordinate_resolver=resolver,
        vision_service=None,
        vision_service_provider=lambda _session: "unused",
        context_id="request-1",
    )

    assert (x, y) == (300, 400)
    assert ocr.calls == [(session, "screenshot-b64", "shot-1")]
    assert resolver.calls[0][2] == [{"text": "Submit"}]
    assert resolver.calls[0][3] is None


@pytest.mark.asyncio
async def test_resolve_coordinates_prediction_path_uses_provider_when_service_missing():
    tool_call = SimpleNamespace(
        parameters={"find_coordinates_by": CoordinateFindingMethod.PREDICTION}
    )
    session = object()
    ocr = _FakeOcrCoordinator(results=[{"text": "ignored"}])
    resolver = _FakeCoordinateResolver(return_xy=(10, 20))
    provided_service = object()
    provider_calls = []

    def _provider(arg_session):
        provider_calls.append(arg_session)
        return provided_service

    x, y = await resolve_coordinates(
        tool_call=tool_call,
        session=session,
        screenshot_data="shot-data",
        screenshot_id="shot-2",
        ocr_coordinator=ocr,
        coordinate_resolver=resolver,
        vision_service=None,
        vision_service_provider=_provider,
        context_id="bundle-1",
    )

    assert (x, y) == (10, 20)
    assert ocr.calls == []
    assert provider_calls == [session]
    assert resolver.calls[0][2] is None
    assert resolver.calls[0][3] is provided_service


@pytest.mark.asyncio
async def test_resolve_coordinates_prediction_path_keeps_none_when_provider_unavailable():
    tool_call = SimpleNamespace(
        parameters={"find_coordinates_by": CoordinateFindingMethod.PREDICTION}
    )
    resolver = _FakeCoordinateResolver(return_xy=(1, 2))

    x, y = await resolve_coordinates(
        tool_call=tool_call,
        session=object(),
        screenshot_data="shot",
        screenshot_id="shot-3",
        ocr_coordinator=_FakeOcrCoordinator(results=[]),
        coordinate_resolver=resolver,
        vision_service=None,
        vision_service_provider=lambda _session: None,
        context_id="bundle-2",
    )

    assert (x, y) == (1, 2)
    assert resolver.calls[0][3] is None
