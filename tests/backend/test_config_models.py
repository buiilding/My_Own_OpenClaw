"""Tests for configuration models."""
import pytest
from pydantic import ValidationError

from backend.src.core.config.models import (
    AnthropicConfig,
    AppConfig,
    GeminiConfig,
    KimiCodingConfig,
    LLMProviders,
    LMStudioConfig,
    MistralConfig,
    OCRConfig,
    OllamaConfig,
    OpenAIConfig,
    OpenRouterConfig,
    Preferences,
    SecurityLimits,
)


class TestOpenAIConfig:
    """Tests for OpenAIConfig model."""

    def test_default_values(self):
        config = OpenAIConfig()
        assert config.model == "gpt-5.1"
        assert config.api_key_env == "OPENAI_API_KEY"

    def test_custom_values(self):
        config = OpenAIConfig(model="gpt-4", api_key_env="CUSTOM_KEY")
        assert config.model == "gpt-4"
        assert config.api_key_env == "CUSTOM_KEY"


class TestAnthropicConfig:
    """Tests for AnthropicConfig model."""

    def test_default_values(self):
        config = AnthropicConfig()
        assert config.model == "claude-sonnet-4-5-20250929"
        assert config.api_key_env == "ANTHROPIC_API_KEY"


class TestGeminiConfig:
    """Tests for GeminiConfig model."""

    def test_default_values(self):
        config = GeminiConfig()
        assert config.model == "gemini-2.5-flash"
        assert config.api_key_env == "GOOGLE_API_KEY"


class TestOllamaConfig:
    """Tests for OllamaConfig model."""

    def test_default_values(self):
        config = OllamaConfig()
        assert config.model == "llama3"
        assert config.base_url == "http://localhost:11434/v1"


class TestOpenRouterConfig:
    """Tests for OpenRouterConfig model."""

    def test_default_values(self):
        config = OpenRouterConfig()
        assert config.model == "openrouter/auto"
        assert config.api_key_env == "OPENROUTER_API_KEY"
        assert config.base_url == "https://openrouter.ai/api/v1"


class TestMistralConfig:
    """Tests for MistralConfig model."""

    def test_default_values(self):
        config = MistralConfig()
        assert config.model == "mistral-large-latest"
        assert config.api_key_env == "MISTRAL_API_KEY"


class TestLMStudioConfig:
    """Tests for LMStudioConfig model."""

    def test_default_values(self):
        config = LMStudioConfig()
        assert config.model == ""
        assert config.base_url == "http://localhost:1234/v1"


class TestKimiCodingConfig:
    """Tests for KimiCodingConfig model."""

    def test_default_values(self):
        config = KimiCodingConfig()
        assert config.model == "k2p5"
        assert config.api_key_env == "KIMI_API_KEY"
        assert config.base_url == "https://api.kimi.com/coding"


class TestLLMProviders:
    """Tests for LLMProviders model."""

    def test_default_values(self):
        providers = LLMProviders()
        assert isinstance(providers.openai, OpenAIConfig)
        assert isinstance(providers.anthropic, AnthropicConfig)
        assert isinstance(providers.gemini, GeminiConfig)
        assert isinstance(providers.ollama, OllamaConfig)
        assert isinstance(providers.openrouter, OpenRouterConfig)
        assert isinstance(providers.mistral, MistralConfig)
        assert isinstance(providers.lmstudio, LMStudioConfig)
        assert isinstance(providers.kimi_coding, KimiCodingConfig)

    def test_get_provider_config_openai(self):
        providers = LLMProviders()
        config = providers.get_provider_config("openai")
        assert isinstance(config, OpenAIConfig)

    def test_get_provider_config_case_insensitive(self):
        providers = LLMProviders()
        config = providers.get_provider_config("OpenAI")
        assert isinstance(config, OpenAIConfig)

    def test_get_provider_config_with_dashes(self):
        providers = LLMProviders()
        config = providers.get_provider_config("kimi-code")
        assert isinstance(config, KimiCodingConfig)

    def test_get_provider_config_kimi_coding(self):
        providers = LLMProviders()
        config = providers.get_provider_config("kimi_coding")
        assert isinstance(config, KimiCodingConfig)

    def test_get_provider_config_unknown(self):
        providers = LLMProviders()
        with pytest.raises(ValueError, match="Unknown provider: unknown"):
            providers.get_provider_config("unknown")


class TestPreferences:
    """Tests for Preferences model."""

    def test_default_values(self):
        prefs = Preferences()
        assert prefs.theme == "dark"


class TestSecurityLimits:
    """Tests for SecurityLimits model."""

    def test_default_values(self):
        limits = SecurityLimits()
        assert limits.max_response_size == 10 * 1024 * 1024  # 10MB
        assert limits.max_json_size == 1 * 1024 * 1024  # 1MB
        assert limits.max_json_nesting_depth == 100
        assert limits.max_tool_name_length == 256
        assert limits.max_parameter_count == 100
        assert limits.max_parameter_value_size == 64 * 1024  # 64KB
        assert limits.max_tool_calls_per_response == 50
        assert limits.parse_timeout_seconds == 5.0
        assert limits.json_load_timeout_seconds == 2.0
        assert limits.max_message_history_size == 1000
        assert limits.max_message_content_size == 1 * 1024 * 1024  # 1MB
        assert limits.max_prompt_size == 50 * 1024 * 1024  # 50MB


class TestOCRConfig:
    """Tests for OCRConfig model."""

    def test_default_values(self):
        config = OCRConfig()
        assert len(config.batch_size_thresholds) == 4
        assert config.use_detection is True
        assert config.use_classification is False
        assert config.use_recognition is True
        assert config.text_score_threshold == 0.5
        assert config.max_side_len == 2000
        assert config.min_side_len == 30

    def test_batch_size_thresholds_structure(self):
        config = OCRConfig()
        # Each threshold should be [min_gpu_memory_gb, rec_batch_num, cls_batch_num]
        for threshold in config.batch_size_thresholds:
            assert len(threshold) == 3
            assert isinstance(threshold[0], float)  # min_gpu_memory_gb
            assert isinstance(threshold[1], int)  # rec_batch_num
            assert isinstance(threshold[2], int)  # cls_batch_num


class TestAppConfig:
    """Tests for AppConfig model."""

    def test_default_values(self):
        config = AppConfig()
        assert config.model_mode == "online"
        assert config.model_provider == "openai"
        assert config.selected_model_id == "gpt-5.1"
        assert config.llm_timeout == 300
        assert config.query_timeout == 600
        assert config.debug_litellm is False
        assert config.memory_enabled is True
        assert config.embedding_model == "all-MiniLM-L6-v2"
        assert config.max_history_length == 1000
        assert config.max_agent_iterations == 1000
        assert config.interaction_mode == "chat"
        assert config.voice_mode_enabled is False
        assert config.agent_full_sudo_enabled is False
        assert config.include_query_screenshot is True
        assert config.wakeword_enabled is True
        assert config.wakeword_phrase == "hey jarvis"
        assert len(config.wakeword_greetings) == 5
        assert config.tts_enabled is True
        assert config.speech_mode_enabled is False

    def test_llm_model_property_online(self):
        config = AppConfig(model_mode="online", model_provider="openai", selected_model_id="gpt-4")
        assert config.llm_model == "openai/gpt-4"

    def test_llm_model_property_local(self):
        config = AppConfig(model_mode="local", selected_model_id="llama3")
        assert config.llm_model == "llama3"

    def test_get_tool_allowlist_chat_mode(self):
        config = AppConfig(interaction_mode="chat")
        allowlist = config.get_tool_allowlist()
        assert allowlist == {"read_file", "replace", "run_shell_command", "process", "screenshot"}

    def test_get_tool_allowlist_agent_mode(self):
        config = AppConfig(interaction_mode="agent")
        allowlist = config.get_tool_allowlist()
        assert allowlist is None

    def test_config_is_immutable(self):
        config = AppConfig()
        with pytest.raises(ValidationError):
            config.model_mode = "local"

    def test_config_extra_fields_ignored(self):
        config = AppConfig(unknown_field="should_be_ignored")
        assert not hasattr(config, "unknown_field")

    def test_nested_models(self):
        config = AppConfig()
        assert isinstance(config.llm_providers, LLMProviders)
        assert isinstance(config.security_limits, SecurityLimits)
        assert isinstance(config.ocr_config, OCRConfig)

    def test_websocket_settings_defaults(self):
        config = AppConfig()
        assert config.websocket_max_message_size == 10 * 1024 * 1024  # 10MB
        assert config.websocket_max_concurrent_tasks == 50
        assert config.websocket_receive_timeout == 3600.0
        assert config.websocket_task_cancellation_timeout == 5.0
