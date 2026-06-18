"""Covers development mock-memory seed helper behavior."""

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import dev_seed_mock_memory  # noqa: E402


def test_target_user_ids_prefer_generic_env_aliases(monkeypatch):
    monkeypatch.setenv(dev_seed_mock_memory.ENV_AGENT_MOCK_USER_ID, "agent-mock")
    monkeypatch.setenv(dev_seed_mock_memory.ENV_MOCK_USER_ID, "windie-mock")
    monkeypatch.setenv(dev_seed_mock_memory.ENV_AGENT_USER_ID, "agent-user")
    monkeypatch.setenv(dev_seed_mock_memory.ENV_USER_ID, "windie-user")
    monkeypatch.setenv("USER", "shell-user")
    monkeypatch.delenv("USERNAME", raising=False)
    monkeypatch.delenv("LOGNAME", raising=False)

    assert dev_seed_mock_memory._target_user_ids() == [
        dev_seed_mock_memory.DEFAULT_USER_ID,
        "agent-mock",
        "windie-mock",
        "agent-user",
        "windie-user",
        "shell-user",
    ]


def test_target_user_ids_preserve_windie_env_aliases(monkeypatch):
    monkeypatch.delenv(dev_seed_mock_memory.ENV_AGENT_MOCK_USER_ID, raising=False)
    monkeypatch.delenv(dev_seed_mock_memory.ENV_AGENT_USER_ID, raising=False)
    monkeypatch.setenv(dev_seed_mock_memory.ENV_MOCK_USER_ID, "windie-mock")
    monkeypatch.setenv(dev_seed_mock_memory.ENV_USER_ID, "windie-user")
    monkeypatch.delenv("USER", raising=False)
    monkeypatch.delenv("USERNAME", raising=False)
    monkeypatch.delenv("LOGNAME", raising=False)

    assert dev_seed_mock_memory._target_user_ids() == [
        dev_seed_mock_memory.DEFAULT_USER_ID,
        "windie-mock",
        "windie-user",
    ]


def test_target_user_ids_deduplicate_in_precedence_order(monkeypatch):
    monkeypatch.setenv(dev_seed_mock_memory.ENV_AGENT_MOCK_USER_ID, "same-user")
    monkeypatch.setenv(dev_seed_mock_memory.ENV_MOCK_USER_ID, "same-user")
    monkeypatch.setenv(dev_seed_mock_memory.ENV_AGENT_USER_ID, "same-user")
    monkeypatch.setenv(dev_seed_mock_memory.ENV_USER_ID, "same-user")
    monkeypatch.delenv("USER", raising=False)
    monkeypatch.delenv("USERNAME", raising=False)
    monkeypatch.delenv("LOGNAME", raising=False)

    assert dev_seed_mock_memory._target_user_ids() == [
        dev_seed_mock_memory.DEFAULT_USER_ID,
        "same-user",
    ]
