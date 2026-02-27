from backend.src.agent.execution.executor import AgentExecutor


def test_resolve_raw_user_query_prefers_user_query_tag_and_unescapes_xml() -> None:
    final_content = """
<system_context>
  <os_state>
    <active_window>Desktop Assistant</active_window>
  </os_state>
</system_context>

<episodic_memory>
None
</episodic_memory>

<semantic_memory>
None
</semantic_memory>

<user_query>
hi &amp; hello &lt;world&gt;
</user_query>
"""
    resolved = AgentExecutor._resolve_raw_user_query("fallback", final_content)
    assert resolved == "hi & hello <world>"


def test_resolve_raw_user_query_falls_back_when_user_query_tag_missing() -> None:
    final_content = """
<system_context>
  <os_state>
    <active_window>Desktop Assistant</active_window>
  </os_state>
</system_context>
"""
    resolved = AgentExecutor._resolve_raw_user_query("just typed", final_content)
    assert resolved == "just typed"


def test_resolve_raw_user_query_falls_back_when_user_query_tag_empty() -> None:
    final_content = "<user_query>\n   \n</user_query>"
    resolved = AgentExecutor._resolve_raw_user_query("typed text", final_content)
    assert resolved == "typed text"
