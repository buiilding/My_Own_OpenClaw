"""Covers development mock-memory seed helper behavior."""

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import dev_seed_mock_memory  # noqa: E402


def test_target_user_ids_prefer_generic_env_aliases(monkeypatch):
    monkeypatch.setenv(dev_seed_mock_memory.ENV_AGENT_MOCK_USER_ID, "agent-mock")
    monkeypatch.setenv(dev_seed_mock_memory.ENV_WINDIE_MOCK_USER_ID, "legacy-mock")
    monkeypatch.setenv(dev_seed_mock_memory.ENV_AGENT_USER_ID, "agent-user")
    monkeypatch.setenv(dev_seed_mock_memory.ENV_WINDIE_USER_ID, "legacy-user")
    monkeypatch.setenv("USER", "shell-user")
    monkeypatch.delenv("USERNAME", raising=False)
    monkeypatch.delenv("LOGNAME", raising=False)

    assert dev_seed_mock_memory._target_user_ids() == [
        dev_seed_mock_memory.DEFAULT_USER_ID,
        "agent-mock",
        "legacy-mock",
        "agent-user",
        "legacy-user",
        "shell-user",
    ]


def test_target_user_ids_preserve_windie_env_aliases(monkeypatch):
    monkeypatch.delenv(dev_seed_mock_memory.ENV_AGENT_MOCK_USER_ID, raising=False)
    monkeypatch.delenv(dev_seed_mock_memory.ENV_AGENT_USER_ID, raising=False)
    monkeypatch.setenv(dev_seed_mock_memory.ENV_WINDIE_MOCK_USER_ID, "legacy-mock")
    monkeypatch.setenv(dev_seed_mock_memory.ENV_WINDIE_USER_ID, "legacy-user")
    monkeypatch.delenv("USER", raising=False)
    monkeypatch.delenv("USERNAME", raising=False)
    monkeypatch.delenv("LOGNAME", raising=False)

    assert dev_seed_mock_memory._target_user_ids() == [
        dev_seed_mock_memory.DEFAULT_USER_ID,
        "legacy-mock",
        "legacy-user",
    ]


def test_target_user_ids_deduplicate_in_precedence_order(monkeypatch):
    monkeypatch.setenv(dev_seed_mock_memory.ENV_AGENT_MOCK_USER_ID, "same-user")
    monkeypatch.setenv(dev_seed_mock_memory.ENV_WINDIE_MOCK_USER_ID, "same-user")
    monkeypatch.setenv(dev_seed_mock_memory.ENV_AGENT_USER_ID, "same-user")
    monkeypatch.setenv(dev_seed_mock_memory.ENV_WINDIE_USER_ID, "same-user")
    monkeypatch.delenv("USER", raising=False)
    monkeypatch.delenv("USERNAME", raising=False)
    monkeypatch.delenv("LOGNAME", raising=False)

    assert dev_seed_mock_memory._target_user_ids() == [
        dev_seed_mock_memory.DEFAULT_USER_ID,
        "same-user",
    ]


def test_mock_conversations_use_generic_demo_model_metadata():
    provider_values = {
        conversation["model_provider"]
        for conversation in dev_seed_mock_memory.MOCK_CONVERSATIONS
    }
    model_values = {
        conversation["model_id"]
        for conversation in dev_seed_mock_memory.MOCK_CONVERSATIONS
    }

    assert provider_values == {"demo"}
    assert model_values == {"demo-planner", "demo-coach", "demo-travel"}
    assert not {"openai", "anthropic", "google"} & provider_values
    assert all(
        not model_id.startswith(("gpt-", "claude-", "gemini-"))
        for model_id in model_values
    )
