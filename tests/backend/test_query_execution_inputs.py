from backend.src.api.schemas import QueryMessage
from backend.src.api.services.query_execution_support.query_execution_inputs import (
    build_query_image_data,
    resolve_query_execution_inputs,
)


def _build_message(
    *,
    screenshot=None,
    screenshot_ref=None,
    screenshot_refs=None,
    capture_meta=None,
    content=None,
    system_state_internal=None,
    workspace_path=None,
    repo_instruction_messages=None,
    conversation_ref="conv-1",
):
    return QueryMessage(
        id="msg-1",
        type="query",
        user_id="user-1",
        payload={
            "text": "hello",
            "conversation_ref": conversation_ref,
            "screenshot": screenshot,
            "screenshot_ref": screenshot_ref,
            "screenshot_refs": screenshot_refs,
            "capture_meta": capture_meta,
            "content": content,
            "system_state_internal": system_state_internal,
            "workspace_path": workspace_path,
            "repo_instruction_messages": repo_instruction_messages,
        },
    )


def test_build_query_image_data_for_none_single_and_multi():
    assert build_query_image_data(None) is None
    assert build_query_image_data([]) is None
    assert build_query_image_data(["only"]) == "only"
    assert build_query_image_data(["a", "b"]) == ["a", "b"]


def test_resolve_query_execution_inputs_resolves_artifacts_and_payload_fields():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, screenshot_ref, *, owner_user_id=None):
            assert owner_user_id == "user-1"
            return f"resolved:{screenshot_ref}"

    message = _build_message(
        screenshot_refs=["shot-a", "shot-b"],
        capture_meta={"display": {"width": 1920}},
        content="hello",
        system_state_internal={"active_window": "Terminal", "ignored": "nope"},
        workspace_path="/work/WindieOS",
        repo_instruction_messages=[{"role": "user", "content": "Use repo rules"}],
        conversation_ref="conv-2",
    )
    inputs = resolve_query_execution_inputs(
        message,
        artifact_store_cls=_ArtifactStore,
        session_manager_config=object(),
        user_id="user-1",
    )

    assert inputs.image_data == ["resolved:shot-a", "resolved:shot-b"]
    assert inputs.capture_meta == {"display": {"width": 1920}}
    assert inputs.message_content == "hello"
    assert inputs.conversation_ref == "conv-2"
    assert inputs.workspace_path == "/work/WindieOS"
    assert inputs.repo_instruction_messages == [
        {"role": "user", "content": "Use repo rules"}
    ]
    assert inputs.runtime_system_state == {"active_window": "Terminal"}


def test_resolve_query_execution_inputs_prefers_inline_screenshot():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            raise AssertionError("artifact store should not be initialized for inline screenshot")

    message = _build_message(screenshot="inline-b64", screenshot_ref="legacy-ref")
    inputs = resolve_query_execution_inputs(
        message,
        artifact_store_cls=_ArtifactStore,
        session_manager_config=object(),
    )

    assert inputs.image_data == "inline-b64"
    assert inputs.repo_instruction_messages is None
    assert inputs.runtime_system_state is None
