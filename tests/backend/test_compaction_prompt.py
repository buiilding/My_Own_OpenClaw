"""Covers compaction prompt behavior in the backend test suite."""

from backend.src.agent.compaction.prompt import render_messages_for_compaction_prompt
from backend.src.core.messages.structures import StoredMessage
from backend.src.core.types.enums import MessageRole, MessageType


def test_compaction_prompt_uses_structured_fields_and_preserves_xml_markup():
    messages = [
        StoredMessage(
            role=MessageRole.USER,
            content=(
                "<system_context><active_window>Outlook</active_window></system_context>"
                "<user_query>go to outlook and summarize the latest 5 emails</user_query>"
            ),
            message_type=MessageType.USER_QUERY,
            user_query_raw="go to outlook and summarize the latest 5 emails",
        ),
        StoredMessage(
            role=MessageRole.ASSISTANT,
            content="",
            message_type=MessageType.ASSISTANT_RESPONSE,
            tool_calls=[
                {
                    "id": "call_1",
                    "name": "browser",
                    "arguments": {"action": "click", "ref": 42293},
                }
            ],
        ),
        StoredMessage(
            role=MessageRole.TOOL,
            content="browser output: clicked row 42293",
            message_type=MessageType.TOOL_OUTPUT,
            tool_name="browser",
            tool_call_id="call_1",
            compaction_facts={
                "action": "click",
                "ref": 42293,
                "url": "https://outlook.office.com/mail/",
                "status": "preview-only",
            },
        ),
        StoredMessage(
            role=MessageRole.ASSISTANT,
            content="[[CONTEXT COMPACTION SUMMARY]]\nOlder summary",
            message_type=MessageType.CONTEXT_COMPACTION,
        ),
        StoredMessage(
            role=MessageRole.ASSISTANT,
            content=(
                "<system_context><active_window>Terminal</active_window>"
                "<note>preserve tagged context</note></system_context>"
                "done"
            ),
            message_type=MessageType.ASSISTANT_RESPONSE,
        ),
    ]

    rendered = render_messages_for_compaction_prompt(messages, max_chars=6000)

    assert "query: go to outlook and summarize the latest 5 emails" in rendered
    assert "tool_calls: browser(action=click, ref=42293) id=call_1" in rendered
    assert "tool: browser" in rendered
    assert "facts: action=click; ref=42293" in rendered
    assert "summary: Older summary" in rendered
    assert "preserve tagged context" in rendered
    assert "<system_context>" in rendered
    assert "<note>preserve tagged context</note>" in rendered


def test_compaction_prompt_keeps_recent_context_when_history_exceeds_budget():
    messages = [
        StoredMessage(
            role=MessageRole.USER,
            content="<user_query>first objective</user_query>",
            message_type=MessageType.USER_QUERY,
            user_query_raw="first objective",
        )
    ]
    for index in range(12):
        messages.append(
            StoredMessage(
                role=MessageRole.ASSISTANT,
                content=f"filler message {index} " + ("x" * 180),
                message_type=MessageType.ASSISTANT_RESPONSE,
            )
        )
    messages.append(
        StoredMessage(
            role=MessageRole.TOOL,
            content="browser extract mostly returned Outlook chrome instead of email body",
            message_type=MessageType.TOOL_OUTPUT,
            tool_name="browser",
            compaction_facts={
                "action": "read_long_content",
                "status": "failed",
                "reason": "captured UI chrome not email body",
            },
        )
    )

    rendered = render_messages_for_compaction_prompt(messages, max_chars=1800)

    assert "first objective" in rendered
    assert "captured UI chrome not email body" in rendered
    assert "[Most Recent Context]" in rendered
