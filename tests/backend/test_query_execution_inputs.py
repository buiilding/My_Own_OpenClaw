"""Covers query execution inputs behavior in the backend test suite."""

from backend.src.api.schemas.incoming import QueryMessage
from backend.src.api.services.query_execution_support.query_execution_inputs import (
    resolve_query_execution_inputs,
)


def _build_message(
    *,
    screenshot_ref=None,
    screenshot_refs=None,
    capture_meta=None,
    content="<user_query>\nhello\n</user_query>",
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
            "screenshot_ref": screenshot_ref,
            "screenshot_refs": screenshot_refs,
            "capture_meta": capture_meta,
            "content": content,
            "system_state_internal": system_state_internal,
            "workspace_path": workspace_path,
            "repo_instruction_messages": repo_instruction_messages,
        },
    )


def test_resolve_query_execution_inputs_preserves_artifact_refs_and_payload_fields():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, screenshot_ref, *, owner_user_id=None):
            raise AssertionError(
                f"artifact ref {screenshot_ref} should not be hydrated"
            )

    message = _build_message(
        screenshot_refs=["shot-a", "shot-b"],
        capture_meta={"display": {"width": 1920}},
        content="<user_query>\nhello\n</user_query>",
        system_state_internal={"active_window": "Terminal", "ignored": "nope"},
        workspace_path="/work/project-alpha",
        repo_instruction_messages=[{"role": "user", "content": "Use repo rules"}],
        conversation_ref="conv-2",
    )
    inputs = resolve_query_execution_inputs(
        message,
        artifact_store_cls=_ArtifactStore,
        session_manager_config=object(),
        user_id="user-1",
    )

    assert inputs.image_refs == ["shot-a", "shot-b"]
    assert inputs.capture_meta == {"display": {"width": 1920}}
    assert inputs.message_content == "<user_query>\nhello\n</user_query>"
    assert inputs.conversation_ref == "conv-2"
    assert inputs.workspace_path == "/work/project-alpha"
    assert inputs.repo_instruction_messages == [
        {"role": "user", "content": "Use repo rules"}
    ]
    assert inputs.runtime_system_state == {"active_window": "Terminal"}


def test_resolve_query_execution_inputs_preserves_sdk_prepared_content():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            raise AssertionError(
                "artifact store should not be initialized without screenshots"
            )

    message = _build_message(
        content=(
            "<episodic_memory>\n- remember &lt;/episodic_memory&gt;\n</episodic_memory>\n\n"
            "<user_query>\nhello\n</user_query>"
        )
    )

    inputs = resolve_query_execution_inputs(
        message,
        artifact_store_cls=_ArtifactStore,
        session_manager_config=object(),
    )

    assert inputs.message_content == message.payload.content
