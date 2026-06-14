"""Covers repo instructions behavior in the backend test suite."""

from backend.src.llm.prompts.repo_instructions import (
    build_agents_md_message,
    resolve_workspace_repo_instruction_messages,
)


def test_build_agents_md_message_ignores_blank_contents(tmp_path):
    assert build_agents_md_message(tmp_path, "  \n  ") is None


def test_resolve_workspace_repo_instruction_messages_walks_to_git_root(tmp_path):
    repo_root = tmp_path / "repo"
    workspace_dir = repo_root / "apps" / "desktop"
    workspace_dir.mkdir(parents=True)
    (repo_root / ".git").mkdir()
    (repo_root / "AGENTS.md").write_text("root instructions", encoding="utf-8")
    (repo_root / "apps" / "AGENTS.md").write_text("apps instructions", encoding="utf-8")

    messages = resolve_workspace_repo_instruction_messages(str(workspace_dir))

    assert [message["role"] for message in messages] == ["user", "user"]
    assert messages[0]["content"] == (
        f"# AGENTS.md instructions for {repo_root}\n\n"
        "<INSTRUCTIONS>\nroot instructions\n</INSTRUCTIONS>"
    )
    assert messages[1]["content"] == (
        f"# AGENTS.md instructions for {repo_root / 'apps'}\n\n"
        "<INSTRUCTIONS>\napps instructions\n</INSTRUCTIONS>"
    )


def test_resolve_workspace_repo_instruction_messages_uses_workspace_only_outside_repo(
    tmp_path,
):
    workspace_dir = tmp_path / "workspace"
    workspace_dir.mkdir()
    (workspace_dir / "AGENTS.md").write_text("workspace instructions", encoding="utf-8")

    messages = resolve_workspace_repo_instruction_messages(str(workspace_dir))

    assert messages == [
        {
            "role": "user",
            "content": (
                f"# AGENTS.md instructions for {workspace_dir}\n\n"
                "<INSTRUCTIONS>\nworkspace instructions\n</INSTRUCTIONS>"
            ),
        }
    ]


def test_resolve_workspace_repo_instruction_messages_normalizes_file_workspace_path(
    tmp_path,
):
    repo_root = tmp_path / "repo"
    workspace_dir = repo_root / "apps"
    workspace_dir.mkdir(parents=True)
    (repo_root / ".git").mkdir()
    (repo_root / "AGENTS.md").write_text("root instructions", encoding="utf-8")
    file_path = workspace_dir / "main.py"
    file_path.write_text("print('hi')\n", encoding="utf-8")

    messages = resolve_workspace_repo_instruction_messages(str(file_path))

    assert messages == [
        {
            "role": "user",
            "content": (
                f"# AGENTS.md instructions for {repo_root}\n\n"
                "<INSTRUCTIONS>\nroot instructions\n</INSTRUCTIONS>"
            ),
        }
    ]
