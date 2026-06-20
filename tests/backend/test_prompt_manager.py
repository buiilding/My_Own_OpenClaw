"""Covers prompt manager behavior in the backend test suite."""

import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from backend.src.llm.prompts.prompts import PromptManager


@pytest.fixture(autouse=True)
def reset_prompt_manager_state():
    PromptManager._instance = None
    PromptManager._system_prompt_template = None
    yield
    PromptManager._instance = None
    PromptManager._system_prompt_template = None


def test_initialize_loads_and_formats_prompt(tmp_path, monkeypatch):
    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text("running on {os} in {workspace_path}", encoding="utf-8")
    monkeypatch.setattr(
        "backend.src.llm.prompts.prompts.platform.system", lambda: "TestOS"
    )

    manager = PromptManager()
    manager.initialize(prompt_file)

    assert manager.system_prompt == (
        "Provided operating system: TestOS\n"
        "Provided workspace: None\n\n"
        "running on TestOS in None"
    )


def test_initialize_concurrent_calls_read_prompt_once(tmp_path, monkeypatch):
    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text("hello {os}", encoding="utf-8")
    monkeypatch.setattr(
        "backend.src.llm.prompts.prompts.platform.system", lambda: "TestOS"
    )

    call_count = {"value": 0}
    original_read_text = type(prompt_file).read_text

    def counted_read_text(path_obj, *args, **kwargs):
        call_count["value"] += 1
        time.sleep(0.05)
        return original_read_text(path_obj, *args, **kwargs)

    monkeypatch.setattr(type(prompt_file), "read_text", counted_read_text)

    manager = PromptManager()

    def init_once():
        manager.initialize(prompt_file)

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(init_once) for _ in range(2)]
        for future in futures:
            future.result(timeout=5)

    assert call_count["value"] == 1
    assert manager.system_prompt == (
        "Provided operating system: TestOS\n"
        "Provided workspace: None\n\n"
        "hello TestOS"
    )


def test_system_prompt_raises_before_initialization():
    manager = PromptManager()
    with pytest.raises(RuntimeError, match="PromptManager not initialized"):
        _ = manager.system_prompt


def test_initialize_raises_for_missing_file(tmp_path):
    manager = PromptManager()
    with pytest.raises(RuntimeError, match="System prompt file not found"):
        manager.initialize(tmp_path / "missing.txt")


def test_initialize_accepts_string_path(tmp_path, monkeypatch):
    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text("os={os}", encoding="utf-8")
    monkeypatch.setattr(
        "backend.src.llm.prompts.prompts.platform.system", lambda: "Linux"
    )

    manager = PromptManager()
    manager.initialize(str(prompt_file))

    assert manager.system_prompt == (
        "Provided operating system: Linux\n" "Provided workspace: None\n\n" "os=Linux"
    )


def test_initialize_raises_for_non_file_path(tmp_path):
    manager = PromptManager()
    directory_path = tmp_path / "dir-as-prompt"
    directory_path.mkdir()

    with pytest.raises(RuntimeError, match="Cannot read system prompt file"):
        manager.initialize(directory_path)


def test_initialize_raises_for_empty_prompt_file(tmp_path):
    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text("   ", encoding="utf-8")

    manager = PromptManager()
    with pytest.raises(RuntimeError, match="System prompt file is empty"):
        manager.initialize(prompt_file)


def test_initialize_raises_for_permission_error(tmp_path, monkeypatch):
    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text("hello {os}", encoding="utf-8")

    def raise_permission_error(*_args, **_kwargs):
        raise PermissionError("denied")

    monkeypatch.setattr(type(prompt_file), "read_text", raise_permission_error)

    manager = PromptManager()
    with pytest.raises(RuntimeError, match="Permission denied"):
        manager.initialize(prompt_file)


def test_initialize_raises_for_unicode_decode_error(tmp_path, monkeypatch):
    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text("hello {os}", encoding="utf-8")

    def raise_decode_error(*_args, **_kwargs):
        raise UnicodeDecodeError("utf-8", b"\x80", 0, 1, "invalid start byte")

    monkeypatch.setattr(type(prompt_file), "read_text", raise_decode_error)

    manager = PromptManager()
    with pytest.raises(RuntimeError, match="not valid UTF-8"):
        manager.initialize(prompt_file)


def test_initialize_is_noop_after_first_success(tmp_path, monkeypatch):
    first = tmp_path / "first.txt"
    second = tmp_path / "second.txt"
    first.write_text("first {os}", encoding="utf-8")
    second.write_text("second {os}", encoding="utf-8")
    monkeypatch.setattr(
        "backend.src.llm.prompts.prompts.platform.system", lambda: "TestOS"
    )

    manager = PromptManager()
    manager.initialize(first)
    manager.initialize(second)

    assert manager.system_prompt == (
        "Provided operating system: TestOS\n"
        "Provided workspace: None\n\n"
        "first TestOS"
    )


def test_render_system_prompt_uses_default_runtime_context(tmp_path, monkeypatch):
    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text("global {os} {workspace_path}", encoding="utf-8")
    monkeypatch.setattr(
        "backend.src.llm.prompts.prompts.platform.system", lambda: "TestOS"
    )

    manager = PromptManager()
    manager.initialize(prompt_file)

    assert manager.render_system_prompt() == (
        "Provided operating system: TestOS\n"
        "Provided workspace: None\n\n"
        "global TestOS None"
    )


def test_render_system_prompt_accepts_explicit_operating_system(tmp_path, monkeypatch):
    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text("global {os} {workspace_path}", encoding="utf-8")
    monkeypatch.setattr(
        "backend.src.llm.prompts.prompts.platform.system", lambda: "BackendOS"
    )

    manager = PromptManager()
    manager.initialize(prompt_file)

    assert manager.render_system_prompt("macOS") == (
        "Provided operating system: macOS\n"
        "Provided workspace: None\n\n"
        "global macOS None"
    )
    assert (
        manager.render_system_prompt("macOS", "/work/project-alpha")
        == "Provided operating system: macOS\n"
        "Provided workspace: /work/project-alpha\n\n"
        "global macOS /work/project-alpha"
    )
    assert manager.system_prompt == (
        "Provided operating system: BackendOS\n"
        "Provided workspace: None\n\n"
        "global BackendOS None"
    )


def test_render_system_prompt_keeps_method_gated_sections_without_explicit_methods(
    tmp_path,
):
    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text(
        (
            "base\n"
            "<!-- tool_selection:ocr:start -->\n"
            "ocr guidance\n"
            "<!-- tool_selection:ocr:end -->\n"
            "<!-- tool_selection:prediction:start -->\n"
            "prediction guidance\n"
            "<!-- tool_selection:prediction:end -->\n"
        ),
        encoding="utf-8",
    )
    manager = PromptManager()
    manager.initialize(prompt_file)

    rendered = manager.system_prompt
    assert "base" in rendered
    assert "ocr guidance" in rendered
    assert "prediction guidance" in rendered
    assert "tool_selection:" not in rendered


def test_render_system_prompt_uses_effective_coordinate_methods_when_provided(
    tmp_path,
):
    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text(
        (
            "base\n"
            "<!-- tool_selection:ocr:start -->\n"
            "ocr guidance\n"
            "<!-- tool_selection:ocr:end -->\n"
            "<!-- tool_selection:prediction:start -->\n"
            "prediction guidance\n"
            "<!-- tool_selection:prediction:end -->\n"
        ),
        encoding="utf-8",
    )
    manager = PromptManager()
    manager.initialize(prompt_file)

    rendered = manager.render_system_prompt(
        allowed_coordinate_methods=["manual", "ocr"]
    )
    assert "base" in rendered
    assert "ocr guidance" in rendered
    assert "prediction guidance" not in rendered
    assert "tool_selection:" not in rendered


def test_repo_system_prompt_includes_tool_strategy_rules():
    prompt_file = (
        Path(__file__).resolve().parents[2]
        / "backend/src/llm/prompts/system_prompt.txt"
    )
    content = prompt_file.read_text(encoding="utf-8")

    assert "You are Windie, a computer-native AI companion." in content
    assert "You are not just a chatbot and not just a coding agent." in content
    assert "## Core Identity" in content
    assert "## Computer Environment" in content
    assert "## Work Modes" in content
    assert "## Safety And Authority" in content
    assert "Treat coding as one task mode, not the default personality." in content
    assert "Respect applicable `AGENTS.md` instructions" in content
    assert "docs/docs.json" in content
    assert "docs/getting-started/docs_directory.md" in content
    assert "bin\\windie.cmd docs list" in content
    assert "bin/windie.sh docs list" in content
    assert "Provided operating system:" not in content
    assert "Provided workspace:" not in content
    assert (
        "Prefer keyboard shortcuts when they are reliable and the intended window is active."
        in content
    )
    assert (
        "Use the latest available screenshot when judging screen state."
        in content
    )
    assert "## Browser-use tools" not in content
    assert "You can basically do anything." not in content
    assert "Please keep going until the query is completely resolved" not in content


def test_model_facing_system_prompt_includes_browser_scope_rules():
    prompt_file = (
        Path(__file__).resolve().parents[2]
        / "backend/src/llm/prompts/system_prompt.txt"
    )
    content = prompt_file.read_text(encoding="utf-8")

    assert "dedicated chrome browser profile" in content
    assert "For browser tasks:" in content
    assert "Prefer the `browser` tool when the target is a website" in content
    assert "actions can solve it." in content
