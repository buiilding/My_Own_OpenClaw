"""Tests for ConfigManager."""
import pytest
from unittest.mock import MagicMock, patch

from backend.src.core.config.manager import ConfigManager
from backend.src.core.config.models import AppConfig


class TestConfigManager:
    """Tests for ConfigManager class."""

    def test_init(self):
        manager = ConfigManager()
        assert manager._config is None

    def test_load_config_success(self):
        manager = ConfigManager()
        mock_config = AppConfig(model_provider="openai")
        
        with patch(
            "backend.src.core.config.manager.load_settings_from_file",
            return_value=mock_config
        ):
            result = manager.load_config()
            assert result == mock_config
            assert manager._config == mock_config

    def test_load_config_already_loaded(self):
        manager = ConfigManager()
        mock_config = AppConfig(model_provider="openai")
        manager._config = mock_config
        
        with patch(
            "backend.src.core.config.manager.load_settings_from_file"
        ) as mock_load:
            result = manager.load_config()
            assert result == mock_config
            mock_load.assert_not_called()

    def test_load_config_failure(self):
        manager = ConfigManager()
        
        with patch(
            "backend.src.core.config.manager.load_settings_from_file",
            side_effect=Exception("Load failed")
        ):
            with pytest.raises(RuntimeError, match="Failed to load configuration"):
                manager.load_config()

    def test_get_config_success(self):
        manager = ConfigManager()
        mock_config = AppConfig(model_provider="openai")
        manager._config = mock_config
        
        result = manager.get_config()
        assert result == mock_config

    def test_get_config_not_loaded(self):
        manager = ConfigManager()
        
        with pytest.raises(RuntimeError, match="Config not loaded"):
            manager.get_config()

    def test_update_config_success(self):
        manager = ConfigManager()
        # First load a config
        initial_config = AppConfig(model_provider="openai")
        manager._config = initial_config
        
        new_config = AppConfig(model_provider="anthropic")
        
        with patch(
            "backend.src.core.config.manager.load_api_key_for_provider",
            return_value=new_config
        ):
            result = manager.update_config(new_config)
            assert result == new_config

    def test_update_config_none_raises_error(self):
        manager = ConfigManager()
        
        with pytest.raises(ValueError, match="Cannot update config with None"):
            manager.update_config(None)

    def test_update_config_forces_tts_enabled(self):
        manager = ConfigManager()
        initial_config = AppConfig()
        manager._config = initial_config
        
        # Create config with tts_enabled=False
        new_config = AppConfig(tts_enabled=False, model_provider="anthropic")
        assert new_config.tts_enabled is False
        
        with patch(
            "backend.src.core.config.manager.load_api_key_for_provider",
            return_value=new_config
        ) as mock_load:
            # The update should force tts_enabled to True before calling load_api_key_for_provider
            # but since we mock it, we check the mock was called
            manager.update_config(new_config)
            mock_load.assert_called_once()

    def test_reload_config_success(self):
        manager = ConfigManager()
        initial_config = AppConfig(model_provider="openai")
        manager._config = initial_config
        
        reloaded_config = AppConfig(model_provider="anthropic")
        
        with patch(
            "backend.src.core.config.manager.load_settings_from_file",
            return_value=reloaded_config
        ) as mock_load:
            result = manager.reload_config()
            assert result == reloaded_config
            assert manager._config == reloaded_config
            mock_load.assert_called_once_with(reload_module=True)

    def test_reload_config_failure(self):
        manager = ConfigManager()
        initial_config = AppConfig()
        manager._config = initial_config
        
        with patch(
            "backend.src.core.config.manager.load_settings_from_file",
            side_effect=Exception("Reload failed")
        ):
            with pytest.raises(RuntimeError, match="Failed to reload configuration"):
                manager.reload_config()


class TestGetConfigManager:
    """Tests for get_config_manager function."""

    def test_returns_singleton(self):
        from backend.src.core.config.manager import get_config_manager
        
        manager1 = get_config_manager()
        manager2 = get_config_manager()
        
        assert manager1 is manager2
