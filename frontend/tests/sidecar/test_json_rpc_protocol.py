"""Covers local-runtime JSON-RPC protocol behavior."""

from pathlib import Path

import pytest

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import core.ipc_protocol as ipc_protocol_module  # noqa: E402
from core.ipc_protocol import JSONRPCError, JSONRPCProtocol  # noqa: E402


LOCAL_RUNTIME_CORE_TEST_LABEL_PATHS = [
    "test_env_flags.py",
    "test_feature_pack_installer.py",
    "test_file_utils.py",
    "test_executors.py",
    "test_json_rpc_protocol.py",
    "test_stdout_json.py",
    "test_sidecar_daemon.py",
    "test_thread_pool.py",
    "test_unicode_sanitizer.py",
]


def test_local_runtime_core_tests_use_boundary_docstrings():
    test_dir = Path(__file__).parent
    retired_suite_label = "behavior in the " + "sidecar test suite"
    expected_headers = {
        "test_env_flags.py": '"""Covers local-runtime environment flag behavior."""',
        "test_feature_pack_installer.py": '"""Covers local-runtime feature pack installer behavior."""',
        "test_file_utils.py": '"""Covers local-runtime filesystem utility behavior."""',
        "test_executors.py": '"""Covers local-runtime executor behavior."""',
        "test_json_rpc_protocol.py": '"""Covers local-runtime JSON-RPC protocol behavior."""',
        "test_stdout_json.py": '"""Covers local-runtime stdout JSON framing behavior."""',
        "test_sidecar_daemon.py": '"""Covers local-runtime daemon lifecycle behavior."""',
        "test_thread_pool.py": '"""Covers local-runtime thread pool behavior."""',
        "test_unicode_sanitizer.py": '"""Covers local-runtime Unicode sanitizer behavior."""',
    }

    for name in LOCAL_RUNTIME_CORE_TEST_LABEL_PATHS:
        source = (test_dir / name).read_text(encoding="utf-8")
        assert source.splitlines()[0] == expected_headers[name]
        assert retired_suite_label not in source


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
async def test_handle_request_notification_returns_none_and_executes_handler():
    protocol = JSONRPCProtocol()
    calls = []

    async def handler(value):
        calls.append(value)
        return {"value": value}

    protocol.register_method("echo", handler)

    response = await protocol.handle_request(
        {"jsonrpc": "2.0", "method": "echo", "params": {"value": 7}}
    )

    assert response is None
    assert calls == [7]


@pytest.mark.asyncio
async def test_handle_request_notification_suppresses_error_response():
    protocol = JSONRPCProtocol()

    def handler():
        return "ok"

    protocol.register_method("ping", handler)

    response = await protocol.handle_request(
        {"jsonrpc": "2.0", "method": "ping", "params": ["bad"]}
    )

    assert response is None


@pytest.mark.asyncio
async def test_process_line_notification_returns_none():
    protocol = JSONRPCProtocol()

    async def handler():
        return {"status": "ok"}

    protocol.register_method("ping", handler)

    response = await protocol.process_line('{"jsonrpc":"2.0","method":"ping"}')

    assert response is None


@pytest.mark.asyncio
async def test_handle_request_invalid_version():
    protocol = JSONRPCProtocol()
    request = {"jsonrpc": "1.0", "method": "echo", "id": "1"}
    response = await protocol.handle_request(request)
    assert response["error"]["code"] == JSONRPCProtocol.INVALID_REQUEST


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "invalid_id",
    [
        {"bad": "id"},
        ["bad", "id"],
        True,
    ],
)
async def test_handle_request_invalid_id_type_returns_invalid_request(invalid_id):
    protocol = JSONRPCProtocol()
    calls = []

    def handler():
        calls.append("called")
        return "ok"

    protocol.register_method("ping", handler)
    response = await protocol.handle_request(
        {"jsonrpc": "2.0", "method": "ping", "id": invalid_id}
    )

    assert response["error"]["code"] == JSONRPCProtocol.INVALID_REQUEST
    assert response["error"]["message"] == "Invalid request: id must be string, number, or null"
    assert response.get("id") is None
    assert calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "raw_line",
    [
        '{"jsonrpc":"2.0","method":"ping","id":NaN}',
        '{"jsonrpc":"2.0","method":"ping","id":Infinity}',
        '{"jsonrpc":"2.0","method":"ping","id":-Infinity}',
    ],
)
async def test_process_line_rejects_non_finite_numeric_id(raw_line):
    protocol = JSONRPCProtocol()
    calls = []

    def handler():
        calls.append("called")
        return "ok"

    protocol.register_method("ping", handler)

    response = await protocol.process_line(raw_line)

    assert response["error"]["code"] == JSONRPCProtocol.INVALID_REQUEST
    assert response["error"]["message"] == "Invalid request: id must be string, number, or null"
    assert response.get("id") is None
    assert calls == []


@pytest.mark.asyncio
async def test_handle_request_method_not_found():
    protocol = JSONRPCProtocol()
    request = {"jsonrpc": "2.0", "method": "missing", "id": "1"}
    response = await protocol.handle_request(request)
    assert response["error"]["code"] == JSONRPCProtocol.METHOD_NOT_FOUND


@pytest.mark.asyncio
async def test_handle_request_non_string_method_is_invalid_request():
    protocol = JSONRPCProtocol()
    request = {"jsonrpc": "2.0", "method": 123, "id": "1"}
    response = await protocol.handle_request(request)
    assert response["error"]["code"] == JSONRPCProtocol.INVALID_REQUEST
    assert response["error"]["message"] == "Method name must be a string"


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
async def test_handle_request_missing_required_param_returns_invalid_params():
    protocol = JSONRPCProtocol()

    def handler(required_value):
        return {"value": required_value}

    protocol.register_method("needs_param", handler)
    request = {"jsonrpc": "2.0", "method": "needs_param", "params": {}, "id": "1"}

    response = await protocol.handle_request(request)

    assert response["error"]["code"] == JSONRPCProtocol.INVALID_PARAMS
    assert "missing a required argument" in response["error"]["message"]


@pytest.mark.asyncio
async def test_handle_request_unexpected_param_returns_invalid_params():
    protocol = JSONRPCProtocol()

    def handler():
        return {"ok": True}

    protocol.register_method("no_params", handler)
    request = {
        "jsonrpc": "2.0",
        "method": "no_params",
        "params": {"unexpected": True},
        "id": "1",
    }

    response = await protocol.handle_request(request)

    assert response["error"]["code"] == JSONRPCProtocol.INVALID_PARAMS
    assert "unexpected keyword argument" in response["error"]["message"]


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


@pytest.mark.asyncio
async def test_handle_request_rejects_non_object_payload():
    protocol = JSONRPCProtocol()

    response = await protocol.handle_request(["bad"])

    assert response["error"]["code"] == JSONRPCProtocol.INVALID_REQUEST
    assert response["error"]["message"] == "Invalid request: payload must be a JSON object"


@pytest.mark.asyncio
async def test_process_line_non_object_json_returns_invalid_request():
    protocol = JSONRPCProtocol()

    response = await protocol.process_line('["bad"]')

    assert response["error"]["code"] == JSONRPCProtocol.INVALID_REQUEST
    assert response["error"]["message"] == "Invalid request: payload must be a JSON object"


def test_create_request_omits_optional_fields_when_not_provided():
    protocol = JSONRPCProtocol()

    request = protocol.create_request("ping")

    assert request == {"jsonrpc": "2.0", "method": "ping"}


def test_create_request_keeps_zero_request_id():
    protocol = JSONRPCProtocol()

    request = protocol.create_request("ping", request_id=0)

    assert request == {"jsonrpc": "2.0", "method": "ping", "id": 0}


def test_create_request_keeps_empty_string_request_id():
    protocol = JSONRPCProtocol()

    request = protocol.create_request("ping", request_id="")

    assert request == {"jsonrpc": "2.0", "method": "ping", "id": ""}


def test_create_response_prefers_error_payload_over_result():
    protocol = JSONRPCProtocol()

    response = protocol.create_response(
        "req-1",
        result={"ok": True},
        error={"code": JSONRPCProtocol.INVALID_PARAMS, "message": "bad"},
    )

    assert response == {
        "jsonrpc": "2.0",
        "id": "req-1",
        "error": {"code": JSONRPCProtocol.INVALID_PARAMS, "message": "bad"},
    }


def test_create_error_response_omits_data_when_none():
    protocol = JSONRPCProtocol()

    response = protocol.create_error_response(
        "req-1",
        JSONRPCProtocol.METHOD_NOT_FOUND,
        "missing",
        data=None,
    )

    assert response == {
        "jsonrpc": "2.0",
        "id": "req-1",
        "error": {
            "code": JSONRPCProtocol.METHOD_NOT_FOUND,
            "message": "missing",
        },
    }


@pytest.mark.asyncio
async def test_handle_request_missing_method_name():
    protocol = JSONRPCProtocol()
    response = await protocol.handle_request({"jsonrpc": "2.0", "id": "req-1"})

    assert response["error"]["code"] == JSONRPCProtocol.INVALID_REQUEST
    assert "Method name is required" in response["error"]["message"]


@pytest.mark.asyncio
async def test_handle_request_non_callable_registered_handler_returns_literal():
    protocol = JSONRPCProtocol()
    protocol.register_method("constant", 42)  # non-callable handler value

    response = await protocol.handle_request(
        {"jsonrpc": "2.0", "method": "constant", "id": "req-2"}
    )

    assert response["result"] == 42
    assert response["id"] == "req-2"


@pytest.mark.asyncio
async def test_process_line_returns_internal_error_when_handle_raises(monkeypatch):
    protocol = JSONRPCProtocol()

    async def boom(_request):
        raise RuntimeError("explode")

    monkeypatch.setattr(protocol, "handle_request", boom)

    response = await protocol.process_line('{"jsonrpc":"2.0","method":"ping"}')

    assert response["error"]["code"] == JSONRPCProtocol.INTERNAL_ERROR
    assert "Internal error:" in response["error"]["message"]


def test_send_response_swallows_write_exceptions(monkeypatch):
    protocol = JSONRPCProtocol()
    monkeypatch.setattr(
        ipc_protocol_module,
        "write_json_line",
        lambda _payload: (_ for _ in ()).throw(RuntimeError("stdout failure")),
    )

    protocol.send_response({"jsonrpc": "2.0", "result": {"ok": True}})
