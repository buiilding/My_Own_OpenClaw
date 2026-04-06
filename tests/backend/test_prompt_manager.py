import threading
import time
from pathlib import Path

import pytest

from backend.src.llm.prompts.prompts import PromptManager, get_system_prompt


@pytest.fixture(autouse=True)
def reset_prompt_manager_state():
    PromptManager._instance = None
    PromptManager._system_prompt_template = None
    yield
    PromptManager._instance = None
    PromptManager._system_prompt_template = None


def test_initialize_loads_and_formats_prompt(tmp_path, monkeypatch):
    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text("running on {os}", encoding="utf-8")
    monkeypatch.setattr("backend.src.llm.prompts.prompts.platform.system", lambda: "TestOS")

    manager = PromptManager()
    manager.initialize(prompt_file)

    assert manager.system_prompt == "running on TestOS"


def test_initialize_concurrent_calls_read_prompt_once(tmp_path, monkeypatch):
    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text("hello {os}", encoding="utf-8")
    monkeypatch.setattr("backend.src.llm.prompts.prompts.platform.system", lambda: "TestOS")

    call_count = {"value": 0}
    original_read_text = type(prompt_file).read_text

    def counted_read_text(path_obj, *args, **kwargs):
        call_count["value"] += 1
        time.sleep(0.05)
        return original_read_text(path_obj, *args, **kwargs)

    monkeypatch.setattr(type(prompt_file), "read_text", counted_read_text)

    manager = PromptManager()
    start_barrier = threading.Barrier(2)

    def init_once():
        start_barrier.wait(timeout=5)
        manager.initialize(prompt_file)

    t1 = threading.Thread(target=init_once)
    t2 = threading.Thread(target=init_once)
    t1.start()
    t2.start()
    t1.join(timeout=5)
    t2.join(timeout=5)

    assert call_count["value"] == 1
    assert manager.system_prompt == "hello TestOS"


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
    monkeypatch.setattr("backend.src.llm.prompts.prompts.platform.system", lambda: "Linux")

    manager = PromptManager()
    manager.initialize(str(prompt_file))

    assert manager.system_prompt == "os=Linux"


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
    monkeypatch.setattr("backend.src.llm.prompts.prompts.platform.system", lambda: "TestOS")

    manager = PromptManager()
    manager.initialize(first)
    manager.initialize(second)

    assert manager.system_prompt == "first TestOS"


def test_get_system_prompt_global_accessor(tmp_path, monkeypatch):
    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text("global {os}", encoding="utf-8")
    monkeypatch.setattr("backend.src.llm.prompts.prompts.platform.system", lambda: "TestOS")

    manager = PromptManager()
    manager.initialize(prompt_file)

    assert get_system_prompt() == "global TestOS"


def test_get_system_prompt_renders_explicit_operating_system(tmp_path, monkeypatch):
    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text("global {os}", encoding="utf-8")
    monkeypatch.setattr("backend.src.llm.prompts.prompts.platform.system", lambda: "BackendOS")

    manager = PromptManager()
    manager.initialize(prompt_file)

    assert get_system_prompt("macOS") == "global macOS"
    assert manager.system_prompt == "global BackendOS"


def test_repo_system_prompt_includes_tool_strategy_rules():
    prompt_file = (
        Path(__file__).resolve().parents[2]
        / "backend/src/llm/prompts/system_prompt.txt"
    )
    content = prompt_file.read_text(encoding="utf-8")

    assert "You are WindieOS, a coding and operating agent running in the WindieOS desktop runtime." in content
    assert "## Personality" in content
    assert "## AGENTS.md scope" in content
    assert "## Workspace instructions" in content
    assert "## Responsiveness" in content
    assert "### Preamble messages" in content
    assert "## Planning" in content
    assert "## Task execution" in content
    assert "## Validating your work" in content
    assert "## Ambition vs. precision" in content
    assert "## Sharing progress updates" in content
    assert "## Presenting results" in content
    assert "## Final answer style" in content
    assert "### Headers" in content
    assert "### Bullets" in content
    assert "### Monospace" in content
    assert "### File references" in content
    assert "## Tool selection" in content
    assert "## State rules" in content
    assert "## Computer-use rules" in content
    assert "## Browser-use rules" in content
    assert "## Coding rules" in content
    assert "## Process rules" in content
    assert "## Failure recovery" in content
    assert "## Response rules" in content
    assert "## Examples" in content
    assert "behave like a strong coding agent first" in content
    assert "default workflow is:" in content
    assert "continue until the coding task is actually resolved" in content
    assert "For coding tasks, prefer targeted tests, builds, or command output over assumption." in content
    assert "Treat coding work as first-class work, not a fallback path behind browser or desktop actions." in content
    assert "The scope of an `AGENTS.md` file is the directory tree rooted at the folder that contains it." in content
    assert "Before making tool calls, briefly state what you are about to do" in content
    assert "Use desktop UI tools only when deterministic filesystem, shell, or browser tools cannot do the job." in content
    assert "Use canonical browser actions only." in content
    assert "Use `process` only with valid session IDs returned by prior tool results." in content
    assert "Prefer keyboard shortcuts over mouse interaction when both are reliable" in content
    assert "Do not treat execution status alone as success" in content
    assert "The emergency stop hotkey is Command/Ctrl+Shift+Escape" in content
    assert "run_in_background=true" in content
    assert "Use `open_app` for detached GUI launches that should keep running" in content
    assert "Do not claim a code change works unless you have some direct evidence" in content
    assert "Use fast focused search commands when inspecting repositories or logs." in content
    assert "prefer `rg` over recursive `grep`" in content
    assert "Seeing a browser window in screenshots or open windows does not mean the `browser` tool can control that browser instance." in content
    assert "If a browser-related request includes an attached image or screenshot that grounds the currently visible browser UI, prefer desktop UI tools first unless the image is clearly content to use inside a web workflow." in content
    assert "`browser.connect` attaches only to the dedicated Windie browser instance/profile and does not attach to arbitrary user Chrome windows or other browser instances." in content
    assert "Before doing anything after `browser.connect`, call `get_tabs` first unless the latest browser tool output already gives a current tab list." in content
    assert '"name":"run_shell_command"' in content
    assert '"name":"open_app"' in content
    assert '"name":"browser"' in content


def test_model_facing_system_prompt_includes_browser_scope_rules():
    prompt_file = Path(__file__).resolve().parents[2] / "model-facing/system_prompt.txt"
    content = prompt_file.read_text(encoding="utf-8")

    assert "Seeing a browser window in screenshots or open windows does not mean the `browser` tool can control that browser instance." in content
    assert "If a browser-related request includes an attached image or screenshot that grounds the currently visible browser UI, prefer `computer_use` first unless the image is clearly content to use inside a website workflow." in content
    assert "Treat an attached image or screenshot of browser UI as visible desktop/browser-window evidence, not as proof that the `browser` tool is already connected to or can control that browser instance." in content
    assert "`browser.connect` only attaches to that dedicated Windie browser instance/profile. It does not attach to arbitrary user Chrome windows or other browser instances." in content
    assert "Treat the current browser context as unknown until `connect` succeeds and the current tabs have been read." in content
