from backend.src.llm.prompts import (
    PromptConstructor,
    PromptManager,
    UserMessageMetadata,
    build_agents_md_message,
    resolve_workspace_repo_instruction_messages,
)


def test_prompt_package_exports_public_helpers():
    assert PromptManager is not None
    assert PromptConstructor is not None
    assert UserMessageMetadata is not None
    assert build_agents_md_message is not None
    assert resolve_workspace_repo_instruction_messages is not None
