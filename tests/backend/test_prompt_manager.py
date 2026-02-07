import threading
import time

import pytest

from backend.src.llm.prompts.prompts import PromptManager


@pytest.fixture(autouse=True)
def reset_prompt_manager_state():
    PromptManager._instance = None
    PromptManager._system_prompt = None
    yield
    PromptManager._instance = None
    PromptManager._system_prompt = None


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
