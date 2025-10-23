"""Tests for the configuration loading and validation."""

import os
import unittest
from pathlib import Path
from unittest.mock import patch, mock_open

import yaml
import pytest
from pydantic import ValidationError

from backend.config import AppConfig, load_config, get_config_dir

# --- Test Fixtures ---

@pytest.fixture(autouse=True)
def mock_env_vars(monkeypatch):
    """Mock environment variables for API keys."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-openai-key-from-env")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-anthropic-key-from-env")
    monkeypatch.setenv("GOOGLE_API_KEY", "google-api-key-from-env")

@pytest.fixture
def mock_config_dir(tmp_path):
    """Creates a temporary config directory for tests."""
    config_dir = tmp_path / "TestApp"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir

# --- Tests ---

def test_get_config_dir_windows(monkeypatch):
    """Test that the correct config dir is returned on Windows."""
    monkeypatch.setattr(os, 'name', 'nt')
    monkeypatch.setenv("APPDATA", "C:\\Users\\TestUser\\AppData\\Roaming")
    expected_path = Path("C:\\Users\\TestUser\\AppData\\Roaming\\DesktopAssistant")
    assert get_config_dir() == expected_path

def test_create_default_config_if_not_exists(mock_config_dir):
    """
    Test that a default config file is created if one doesn't exist.
    """
    with patch('backend.config.get_config_dir', return_value=mock_config_dir):
        config = load_config()
        config_file = mock_config_dir / "config.yaml"

        assert config_file.exists()
        assert config.active_provider == "openai"
        assert config.llm_providers.openai.model == "gpt-4-turbo"

        with open(config_file, "r") as f:
            data = yaml.safe_load(f)
            assert data['active_provider'] == 'openai'
            assert 'api_key' not in data # Ensure api_key is not saved to file

def test_load_valid_config_from_file(mock_config_dir):
    """
    Test that a valid config file is loaded correctly.
    """
    config_content = {
        "active_provider": "anthropic",
        "preferences": {"user_name": "Tester"},
        "llm_providers": {
            "anthropic": {"model": "claude-3-opus"}
        }
    }
    config_file = mock_config_dir / "config.yaml"
    with open(config_file, "w") as f:
        yaml.dump(config_content, f)

    with patch('backend.config.get_config_dir', return_value=mock_config_dir):
        config = load_config()

        assert config.active_provider == "anthropic"
        assert config.preferences.user_name == "Tester"
        # Check that default values are still present for other providers
        assert config.llm_providers.openai.model == "gpt-4-turbo"
        # Check that the specified value overrides the default
        assert config.llm_providers.anthropic.model == "claude-3-opus"
        assert config.api_key == "sk-anthropic-key-from-env"

def test_load_config_with_local_provider(mock_config_dir):
    """
    Test loading a config where the active provider (Ollama) doesn't need an API key.
    """
    config_content = {"active_provider": "ollama"}
    config_file = mock_config_dir / "config.yaml"
    with open(config_file, "w") as f:
        yaml.dump(config_content, f)

    with patch('backend.config.get_config_dir', return_value=mock_config_dir):
        config = load_config()

        assert config.active_provider == "ollama"
        assert config.api_key is None

def test_load_invalid_config_raises_error(mock_config_dir):
    """
    Test that an invalid config file raises a ValueError.
    """
    # 'activate_provider' is a typo
    invalid_config_content = {"activate_provider": "openai"}
    config_file = mock_config_dir / "config.yaml"
    with open(config_file, "w") as f:
        yaml.dump(invalid_config_content, f)

    with patch('backend.config.get_config_dir', return_value=mock_config_dir):
        with pytest.raises(ValueError, match="Configuration file at .* is invalid"):
            load_config()

def test_missing_api_key_env_var_raises_error(mock_config_dir, monkeypatch):
    """
    Test that a missing API key for the active provider raises a ValueError.
    """
    # Unset the env var for the active provider
    monkeypatch.delenv("OPENAI_API_KEY")

    config_content = {"active_provider": "openai"}
    config_file = mock_config_dir / "config.yaml"
    with open(config_file, "w") as f:
        yaml.dump(config_content, f)

    with patch('backend.config.get_config_dir', return_value=mock_config_dir):
        with pytest.raises(ValueError, match="API key environment variable 'OPENAI_API_KEY' for active provider 'openai' is not set"):
            load_config()
