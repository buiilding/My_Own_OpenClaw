from backend.src.core.security.policy import ToolExecutionAudit


class _ExplosiveStringObject:
    def __str__(self):
        raise AssertionError("__str__ should not be called during sanitization")


class _LargeObject:
    pass


def _audit(parameters):
    return ToolExecutionAudit(
        tool_name="read_file",
        user_id="user-1",
        session_id="session-1",
        parameters=parameters,
        success=True,
        execution_time=0.1,
    )


def test_audit_excluded_keys_do_not_stringify_values():
    audit = _audit({"image": _ExplosiveStringObject()})

    assert audit.parameters["image"] == "[EXCLUDED: _ExplosiveStringObject, size=unknown]"


def test_audit_summarizes_bytes_and_bytearrays_without_retaining_payloads():
    payload = b"x" * 4096
    mutable_payload = bytearray(b"y" * 2048)

    audit = _audit({"payload": payload, "mutable": mutable_payload})

    assert audit.parameters["payload"] == "[BYTES: bytes, size=4096 bytes]"
    assert audit.parameters["mutable"] == "[BYTES: bytearray, size=2048 bytes]"
    assert audit.parameters["payload"] is not payload
    assert audit.parameters["mutable"] is not mutable_payload


def test_audit_sanitizes_nested_containers_and_arbitrary_objects():
    retained_object = _LargeObject()
    audit = _audit(
        {
            "items": (
                {"safe": "ok", "blob": b"z" * 32},
                retained_object,
            ),
            "large_list": list(range(12)),
        }
    )

    assert audit.parameters["items"][0] == {
        "safe": "ok",
        "blob": "[BYTES: bytes, size=32 bytes]",
    }
    assert audit.parameters["items"][1] == "[OBJECT: _LargeObject]"
    assert audit.parameters["items"][1] is not retained_object
    assert audit.parameters["large_list"][-1] == "... [TRUNCATED: 12 items]"


def test_audit_preserves_primitives_and_truncates_large_strings():
    long_text = "a" * (ToolExecutionAudit.MAX_PARAM_VALUE_SIZE + 1)
    audit = _audit(
        {
            "count": 3,
            "enabled": True,
            "small": "hello",
            "large": long_text,
        }
    )

    assert audit.parameters["count"] == 3
    assert audit.parameters["enabled"] is True
    assert audit.parameters["small"] == "hello"
    assert audit.parameters["large"].startswith("a" * ToolExecutionAudit.MAX_PARAM_VALUE_SIZE)
    assert audit.parameters["large"].endswith(
        f"... [TRUNCATED: {len(long_text)} chars]"
    )
