"""Tests for ConfigurationService."""
import asyncio
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.src.core.config.service import ConfigurationService
from backend.src.core.config.models import AppConfig
from backend.src.core.config.manager import ConfigManager
from backend.src.core.infrastructure.bus import EventBus


class MockSubscriber:
    def __init__(self):
        self.on_config_changed = AsyncMock()


class TestConfigurationService:
    """Tests for ConfigurationService class."""

    @pytest.fixture
    def mock_config_manager(self):
        manager = MagicMock(spec=ConfigManager)
        return manager

    @pytest.fixture
    def mock_event_bus(self):
        return AsyncMock(spec=EventBus)

    @pytest.fixture
    def service(self, mock_config_manager, mock_event_bus):
        return ConfigurationService(
            config_manager=mock_config_manager,
            event_bus=mock_event_bus
        )

    def test_init(self, mock_config_manager, mock_event_bus):
        service = ConfigurationService(
            config_manager=mock_config_manager,
            event_bus=mock_event_bus
        )
        assert service._config_manager is mock_config_manager
        assert service._event_bus is mock_event_bus
        assert service._config is None

    def test_initialize(self, service, mock_config_manager):
        mock_config = AppConfig()
        mock_config_manager.load_config.return_value = mock_config
        
        result = service.initialize()
        
        assert result == mock_config
        assert service._config == mock_config
        mock_config_manager.load_config.assert_called_once()

    def test_initialize_already_initialized(self, service, mock_config_manager):
        mock_config = AppConfig()
        service._config = mock_config
        mock_config_manager.load_config.return_value = AppConfig()
        
        result = service.initialize()
        
        assert result == mock_config
        mock_config_manager.load_config.assert_not_called()

    def test_get_config_success(self, service, mock_config_manager):
        mock_config = AppConfig()
        service._config = mock_config
        
        result = service.get_config()
        
        assert result == mock_config

    def test_get_config_not_initialized(self, service):
        with pytest.raises(RuntimeError, match="ConfigurationService not initialized"):
            service.get_config()

    def test_config_property(self, service):
        mock_config = AppConfig()
        service._config = mock_config
        
        assert service.config == mock_config

    def test_subscribe(self, service):
        mock_subscriber = MagicMock()
        
        service.subscribe(mock_subscriber)
        
        assert mock_subscriber in service._subscription_manager._subscribers

    def test_subscribe_callback(self, service):
        mock_callback = MagicMock()
        
        service.subscribe_callback(mock_callback)
        
        assert mock_callback in service._subscription_manager._callbacks

    def test_unsubscribe(self, service):
        mock_subscriber = MagicMock()
        service.subscribe(mock_subscriber)
        
        result = service.unsubscribe(mock_subscriber)
        
        assert result is True
        assert mock_subscriber not in service._subscription_manager._subscribers

    def test_unsubscribe_not_found(self, service):
        mock_subscriber = MagicMock()
        
        result = service.unsubscribe(mock_subscriber)
        
        assert result is False

    @pytest.mark.asyncio
    async def test_update_config_success(self, service, mock_config_manager, mock_event_bus):
        old_config = AppConfig(model_provider="openai")
        new_config = AppConfig(model_provider="anthropic")
        updated_config = AppConfig(model_provider="anthropic", api_key="test-key")
        
        service._config = old_config
        mock_config_manager.update_config.return_value = updated_config
        
        result = await service.update_config(new_config)
        
        assert result == updated_config
        assert service._config == updated_config
        mock_config_manager.update_config.assert_called_once_with(new_config)
        mock_event_bus.publish.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_config_serializes_concurrent_updates(self, service, mock_config_manager):
        service._config = AppConfig(model_provider="openai")
        subscriber = MockSubscriber()
        service.subscribe(subscriber)

        first_config = AppConfig(model_provider="anthropic")
        second_config = AppConfig(model_provider="gemini")

        def update_with_delay(new_cfg: AppConfig) -> AppConfig:
            if new_cfg.model_provider == "anthropic":
                time.sleep(0.05)
            return new_cfg

        mock_config_manager.update_config.side_effect = update_with_delay

        task_one = asyncio.create_task(service.update_config(first_config))
        await asyncio.sleep(0.01)  # ensure task_one acquires the single-writer gate first
        task_two = asyncio.create_task(service.update_config(second_config))
        await asyncio.gather(task_one, task_two)

        calls = subscriber.on_config_changed.await_args_list
        assert len(calls) == 2
        assert calls[0].args[0].model_provider == "openai"
        assert calls[0].args[1].model_provider == "anthropic"
        assert calls[1].args[0].model_provider == "anthropic"
        assert calls[1].args[1].model_provider == "gemini"
        assert service._config.model_provider == "gemini"

    @pytest.mark.asyncio
    async def test_update_config_not_initialized(self, service):
        with pytest.raises(RuntimeError, match="ConfigurationService not initialized"):
            await service.update_config(AppConfig())

    def test_get_config_value_success(self, service):
        mock_config = AppConfig(model_provider="openai")
        service._config = mock_config
        
        result = service.get_config_value("model_provider")
        
        assert result == "openai"

    def test_get_config_value_nested(self, service):
        mock_config = AppConfig()
        service._config = mock_config
        
        result = service.get_config_value("llm_providers.openai.model")
        
        assert result == "gpt-5.1"

    def test_get_config_value_with_default(self, service):
        mock_config = AppConfig()
        service._config = mock_config
        
        result = service.get_config_value("nonexistent.path", default="default_value")
        
        assert result == "default_value"

    def test_get_config_value_not_initialized(self, service):
        with pytest.raises(RuntimeError, match="ConfigurationService not initialized"):
            service.get_config_value("model_provider")

    @pytest.mark.asyncio
    async def test_reload_config_success(self, service, mock_config_manager):
        old_config = AppConfig(model_provider="openai")
        reloaded_config = AppConfig(model_provider="anthropic")
        
        service._config = old_config
        mock_config_manager.reload_config.return_value = reloaded_config
        
        result = await service.reload_config()
        
        assert result == reloaded_config
        assert service._config == reloaded_config
        # Note: reload_config does not publish to event bus (only update_config does)

    @pytest.mark.asyncio
    async def test_reload_config_not_initialized(self, service):
        with pytest.raises(RuntimeError, match="ConfigurationService not initialized"):
            await service.reload_config()

    def test_get_default_tts_model_path(self, service):
        with patch(
            "backend.src.core.config.loader.get_default_tts_model_path",
            return_value="/path/to/tts/model"
        ):
            result = service.get_default_tts_model_path()
            assert result == "/path/to/tts/model"

    def test_build_user_config_merges_config(self, service):
        global_config = AppConfig(model_provider="openai", tts_enabled=True)
        service._config = global_config
        
        user_overrides = {"model_provider": "anthropic"}
        
        with patch(
            "backend.src.core.config.loader.load_api_key_for_provider",
            return_value=AppConfig(model_provider="anthropic", api_key="test-key")
        ):
            result = service.build_user_config(user_overrides)
            
            assert result.model_provider == "anthropic"

    def test_build_user_config_sets_default_tts_path(self, service):
        global_config = AppConfig(tts_enabled=True, tts_model_path=None)
        service._config = global_config
        
        user_overrides = {}
        
        with patch(
            "backend.src.core.config.loader.get_default_tts_model_path",
            return_value="/default/path"
        ):
            result = service.build_user_config(user_overrides)
            assert result.tts_model_path == "/default/path"

    def test_build_user_config_runtime_builder_uses_provider_loader(self, service):
        global_config = AppConfig(model_provider="openai")
        service._config = global_config

        with patch(
            "backend.src.core.config.loader.load_api_key_for_provider",
            side_effect=lambda cfg: cfg.model_copy(update={"api_key": "k"})
        ):
            result = service.build_user_config({})
            assert result.api_key == "k"

    def test_build_user_config_validation_error(self, service):
        global_config = AppConfig()
        service._config = global_config
        
        # Invalid: model_mode must be "local" or "online"
        user_overrides = {"model_mode": "invalid"}
        
        with pytest.raises(ValueError, match="Invalid configuration"):
            service.build_user_config(user_overrides)
