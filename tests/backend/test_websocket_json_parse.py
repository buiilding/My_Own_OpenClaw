import asyncio
import json

import pytest

from backend.src.api.routes.websocket import json_parse as json_parse_module


@pytest.mark.asyncio
async def test_parse_json_payload_small_inline_does_not_call_loop_getter():
    payload = json.dumps({"hello": "world"})

    def fail_loop_getter():
        raise AssertionError("loop_getter should not be called for small payload")

    result = await json_parse_module.parse_json_payload(
        payload,
        offload_threshold_bytes=4096,
        loop_getter=fail_loop_getter,
    )

    assert result == {"hello": "world"}


@pytest.mark.asyncio
async def test_parse_json_payload_offloads_when_size_meets_threshold():
    payload = json.dumps({"k": "v"})
    threshold = len(payload)
    called = {"executor": False}

    class FakeLoop:
        async def run_in_executor(self, executor, fn, data):
            called["executor"] = True
            return fn(data)

    result = await json_parse_module.parse_json_payload(
        payload,
        offload_threshold_bytes=threshold,
        loop_getter=lambda: FakeLoop(),
    )

    assert result == {"k": "v"}
    assert called["executor"] is True


@pytest.mark.asyncio
async def test_parse_json_payload_offload_uses_json_loads_function():
    payload = json.dumps({"x": 1})

    class FakeLoop:
        async def run_in_executor(self, executor, fn, data):
            assert executor is None
            assert fn is json.loads
            assert data == payload
            return {"x": 1}

    result = await json_parse_module.parse_json_payload(
        payload,
        offload_threshold_bytes=1,
        loop_getter=lambda: FakeLoop(),
    )

    assert result == {"x": 1}


@pytest.mark.asyncio
async def test_parse_json_payload_propagates_json_decode_error():
    with pytest.raises(json.JSONDecodeError):
        await json_parse_module.parse_json_payload(
            "{bad-json",
            offload_threshold_bytes=4096,
            loop_getter=asyncio.get_running_loop,
        )


@pytest.mark.asyncio
async def test_parse_json_payload_propagates_loop_getter_failure_on_offload():
    payload = json.dumps({"offload": True})

    def fail_loop_getter():
        raise RuntimeError("loop unavailable")

    with pytest.raises(RuntimeError, match="loop unavailable"):
        await json_parse_module.parse_json_payload(
            payload,
            offload_threshold_bytes=1,
            loop_getter=fail_loop_getter,
        )


@pytest.mark.asyncio
async def test_parse_json_payload_offload_path_propagates_decode_error():
    class FakeLoop:
        async def run_in_executor(self, executor, fn, data):
            return fn(data)

    with pytest.raises(json.JSONDecodeError):
        await json_parse_module.parse_json_payload(
            "{bad-json",
            offload_threshold_bytes=1,
            loop_getter=lambda: FakeLoop(),
        )


@pytest.mark.asyncio
async def test_parse_json_payload_supports_non_object_roots():
    payload = json.dumps(["a", 1, {"b": 2}])
    result = await json_parse_module.parse_json_payload(
        payload,
        offload_threshold_bytes=4096,
        loop_getter=asyncio.get_running_loop,
    )

    assert result == ["a", 1, {"b": 2}]


@pytest.mark.asyncio
async def test_parse_json_object_payload_returns_object_root():
    payload = json.dumps({"root": "object"})
    result = await json_parse_module.parse_json_object_payload(
        payload,
        offload_threshold_bytes=4096,
        loop_getter=asyncio.get_running_loop,
    )

    assert result == {"root": "object"}


@pytest.mark.asyncio
async def test_parse_json_object_payload_rejects_non_object_root():
    payload = json.dumps(["not", "object"])

    with pytest.raises(json_parse_module.JsonRootTypeError) as exc_info:
        await json_parse_module.parse_json_object_payload(
            payload,
            offload_threshold_bytes=4096,
            loop_getter=asyncio.get_running_loop,
        )

    assert exc_info.value.payload_type == "list"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("payload", "expected_payload_type"),
    [
        (json.dumps(None), "NoneType"),
        (json.dumps(123), "int"),
        (json.dumps("hello"), "str"),
    ],
)
async def test_parse_json_object_payload_rejects_scalar_roots_with_payload_type(
    payload: str,
    expected_payload_type: str,
):
    with pytest.raises(json_parse_module.JsonRootTypeError) as exc_info:
        await json_parse_module.parse_json_object_payload(
            payload,
            offload_threshold_bytes=4096,
            loop_getter=asyncio.get_running_loop,
        )

    assert exc_info.value.payload_type == expected_payload_type


def test_default_json_offload_threshold_contract():
    assert json_parse_module.DEFAULT_JSON_PARSE_OFFLOAD_BYTES == 64 * 1024
