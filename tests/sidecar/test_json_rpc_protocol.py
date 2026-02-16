import sys
from pathlib import Path

import pytest


frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

from core.ipc_protocol import JSONRPCError, JSONRPCProtocol  # noqa: E402


@pytest.mark.asyncio
async def test_handle_request_success_async():
    protocol = JSONRPCProtocol()

    async def handler(value):
        return {"value": value}

    protocol.register_method("echo", handler)

    request = {"jsonrpc": "2.0", "method": "echo", "params": {"value": 3}, "id": "1"}
    response = await protocol.handle_request(request)
    assert response["result"] == {"value": 3}
    assert response["id"] == "1"


@pytest.mark.asyncio
async def test_handle_request_success_sync():
    protocol = JSONRPCProtocol()

    def handler(value):
        return {"value": value * 2}

    protocol.register_method("double", handler)

    request = {"jsonrpc": "2.0", "method": "double", "params": {"value": 3}, "id": "2"}
    response = await protocol.handle_request(request)
    assert response["result"] == {"value": 6}
    assert response["id"] == "2"


@pytest.mark.asyncio
async def test_handle_request_invalid_version():
    protocol = JSONRPCProtocol()
    request = {"jsonrpc": "1.0", "method": "echo", "id": "1"}
    response = await protocol.handle_request(request)
    assert response["error"]["code"] == JSONRPCProtocol.INVALID_REQUEST


@pytest.mark.asyncio
async def test_handle_request_method_not_found():
    protocol = JSONRPCProtocol()
    request = {"jsonrpc": "2.0", "method": "missing", "id": "1"}
    response = await protocol.handle_request(request)
    assert response["error"]["code"] == JSONRPCProtocol.METHOD_NOT_FOUND


@pytest.mark.asyncio
async def test_handle_request_invalid_params_type():
    protocol = JSONRPCProtocol()

    def handler():
        return "ok"

    protocol.register_method("ping", handler)
    request = {"jsonrpc": "2.0", "method": "ping", "params": ["bad"], "id": "1"}
    response = await protocol.handle_request(request)
    assert response["error"]["code"] == JSONRPCProtocol.INVALID_PARAMS


@pytest.mark.asyncio
async def test_handle_request_jsonrpc_error_passthrough():
    protocol = JSONRPCProtocol()

    def handler():
        raise JSONRPCError(JSONRPCProtocol.INVALID_PARAMS, "bad params", data={"field": "x"})

    protocol.register_method("fail", handler)
    request = {"jsonrpc": "2.0", "method": "fail", "id": "1"}
    response = await protocol.handle_request(request)
    assert response["error"]["code"] == JSONRPCProtocol.INVALID_PARAMS
    assert response["error"]["data"] == {"field": "x"}


@pytest.mark.asyncio
async def test_handle_request_internal_error():
    protocol = JSONRPCProtocol()

    def handler():
        raise RuntimeError("boom")

    protocol.register_method("explode", handler)
    request = {"jsonrpc": "2.0", "method": "explode", "id": "1"}
    response = await protocol.handle_request(request)
    assert response["error"]["code"] == JSONRPCProtocol.INTERNAL_ERROR


@pytest.mark.asyncio
async def test_process_line_invalid_json():
    protocol = JSONRPCProtocol()
    response = await protocol.process_line("{bad json")
    assert response["error"]["code"] == JSONRPCProtocol.PARSE_ERROR


@pytest.mark.asyncio
async def test_process_line_empty_returns_none():
    protocol = JSONRPCProtocol()
    assert await protocol.process_line("") is None
