"""
Configuration Models.

This module contains Pydantic models for the application configuration.
"""

import os
import platform
from pathlib import Path
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


def _default_artifact_store_path() -> str:
    app_name = "DesktopAssistant"
    if os.name == "nt":
        appdata = os.getenv("APPDATA")
        if appdata:
            return str(Path(appdata) / app_name / "artifacts")

    home_dir = Path.home()
    if os.name == "posix" and platform.system() == "Darwin":
        return str(
            home_dir / "Library" / "Application Support" / app_name / "artifacts"
        )
    return str(home_dir / ".config" / app_name / "artifacts")


class OpenAIConfig(BaseModel):
    """Configuration for OpenAI provider."""

    model: str = "gpt-5.4"
    api_key_env: str = "OPENAI_API_KEY"


class AnthropicConfig(BaseModel):
    """Configuration for Anthropic provider."""

    model: str = "claude-sonnet-4-5-20250929"
    api_key_env: str = "ANTHROPIC_API_KEY"


class GeminiConfig(BaseModel):
    """Configuration for Gemini provider."""

    model: str = "gemini-2.5-flash"
    api_key_env: str = "GOOGLE_API_KEY"


class OllamaConfig(BaseModel):
    """Configuration for Ollama (local) provider."""

    model: str = "llama3"
    base_url: str = "http://localhost:11434/v1"


class OpenRouterConfig(BaseModel):
    """Configuration for OpenRouter provider."""

    model: str = "openrouter/auto"
    api_key_env: str = "OPENROUTER_API_KEY"
    base_url: str = "https://openrouter.ai/api/v1"


class MistralConfig(BaseModel):
    """Configuration for Mistral AI provider."""

    model: str = "mistral-large-latest"
    api_key_env: str = "MISTRAL_API_KEY"


class LMStudioConfig(BaseModel):
    """Configuration for LMStudio (local) provider."""

    model: str = ""  # Not used, models are discovered
    base_url: str = "http://localhost:1234/v1"


class KimiCodingConfig(BaseModel):
    """Configuration for Kimi Coding provider (Anthropic-compatible)."""

    model: str = "k2p5"
    api_key_env: str = "KIMI_API_KEY"
    base_url: str = "https://api.kimi.com/coding"


class BraveSearchConfig(BaseModel):
    """Configuration for backend Brave Search fallback."""

    api_key_env: str = "BRAVE_SEARCH_API_KEY"


class LLMProviders(BaseModel):
    """Container for all supported LLM provider configurations."""

    openai: OpenAIConfig = Field(default_factory=OpenAIConfig)
    anthropic: AnthropicConfig = Field(default_factory=AnthropicConfig)
    gemini: GeminiConfig = Field(default_factory=GeminiConfig)
    ollama: OllamaConfig = Field(default_factory=OllamaConfig)
    openrouter: OpenRouterConfig = Field(default_factory=OpenRouterConfig)
    mistral: MistralConfig = Field(default_factory=MistralConfig)
    lmstudio: LMStudioConfig = Field(default_factory=LMStudioConfig)
    kimi_coding: KimiCodingConfig = Field(default_factory=KimiCodingConfig)

    def get_provider_config(self, provider_name: str):
        """Gets the configuration for a specific provider."""
        normalized = provider_name.lower().replace("-", "_")
        if normalized == "kimi_code":
            normalized = "kimi_coding"
        if not hasattr(self, normalized):
            raise ValueError(f"Unknown provider: {provider_name}")
        return getattr(self, normalized)


class ProviderApiKeyOverride(BaseModel):
    """Frontend-managed API key override for a single online provider."""

    enabled: bool = False
    api_key: str = ""


class ProviderApiKeys(BaseModel):
    """Frontend-managed API key overrides by provider."""

    openai: ProviderApiKeyOverride = Field(default_factory=ProviderApiKeyOverride)
    anthropic: ProviderApiKeyOverride = Field(default_factory=ProviderApiKeyOverride)
    google: ProviderApiKeyOverride = Field(default_factory=ProviderApiKeyOverride)
    openrouter: ProviderApiKeyOverride = Field(default_factory=ProviderApiKeyOverride)
    mistral: ProviderApiKeyOverride = Field(default_factory=ProviderApiKeyOverride)
    kimi_coding: ProviderApiKeyOverride = Field(default_factory=ProviderApiKeyOverride)

    def get_provider_override(
        self, provider_name: str
    ) -> Optional[ProviderApiKeyOverride]:
        """Resolve provider override config with provider alias normalization."""
        normalized = provider_name.lower().replace("-", "_")
        if normalized == "kimi_code":
            normalized = "kimi_coding"
        if normalized == "gemini":
            normalized = "google"
        if not hasattr(self, normalized):
            return None
        return getattr(self, normalized)


class ProviderOAuthEntry(BaseModel):
    """Frontend-managed OAuth credential entry for a provider."""

    connected: bool = False
    access_token: str = ""
    refresh_token: str = ""
    expires_at: Optional[int] = None
    profile_id: str = ""


class ProviderOAuth(BaseModel):
    """Frontend-managed OAuth credentials by provider."""

    openai_codex: ProviderOAuthEntry = Field(default_factory=ProviderOAuthEntry)


class Preferences(BaseModel):
    """User-specific preferences."""

    theme: str = "dark"


class SecurityLimits(BaseModel):
    """Security limits for trust boundaries."""

    # Parser limits
    max_response_size: int = Field(
        default=10 * 1024 * 1024, description="Max LLM response size (10MB)"
    )
    max_json_size: int = Field(
        default=1 * 1024 * 1024, description="Max JSON object size (1MB)"
    )
    max_json_nesting_depth: int = Field(
        default=100, description="Max JSON nesting depth"
    )
    max_tool_name_length: int = Field(default=256, description="Max tool name length")
    max_parameter_count: int = Field(
        default=100, description="Max parameters per tool call"
    )
    max_parameter_value_size: int = Field(
        default=64 * 1024, description="Max parameter value size (64KB)"
    )
    max_tool_calls_per_response: int = Field(
        default=50, description="Max tool calls per response"
    )

    # Parser timeouts
    parse_timeout_seconds: float = Field(
        default=5.0, description="Parser timeout (seconds)"
    )
    json_load_timeout_seconds: float = Field(
        default=2.0, description="JSON load timeout (seconds)"
    )

    # Prompt constructor limits
    max_message_history_size: int = Field(
        default=1000, description="Max messages in history"
    )
    max_message_content_size: int = Field(
        default=1 * 1024 * 1024, description="Max message content size (1MB)"
    )
    max_prompt_size: int = Field(
        default=50 * 1024 * 1024, description="Max total prompt size (50MB)"
    )


_DEFAULT_TOOL_ALLOWLIST_BY_INTERACTION_MODE: dict[str, set[str]] = {
    "chat": {
        "open_app",
        "process",
        "mouse_control",
        "keyboard_control",
        "screenshot",
        "scroll_control",
        "switch_tab",
        "wait",
        "run_shell_command",
        "replace",
        "read_file",
        "get_system_stats",
        "get_open_windows",
        "web_search",
    },
}


class AppConfig(BaseModel):
    """Main application configuration model (immutable)."""

    model_config = ConfigDict(
        extra="ignore", protected_namespaces=(), frozen=True  # Make config immutable
    )

    # LLM Settings
    model_mode: Literal["local", "online"] = "online"
    model_provider: str = "openai"  # Default provider
    selected_model_id: str = "gpt-5.4@@gpt-5-4-none-thinking"
    llm_timeout: int = 300
    query_timeout: int = 600  # New field for query timeout
    debug_litellm: bool = False  # Enable LiteLLM debug logging
    # Provider Configurations
    llm_providers: LLMProviders = Field(default_factory=LLMProviders)

    # Memory System Settings
    memory_enabled: bool = True
    embedding_model: str = "all-MiniLM-L6-v2"

    # Agent Execution Settings
    interaction_mode: Literal["chat", "agent"] = "agent"
    tool_allowlist: Optional[List[str]] = None
    history_compaction_enabled: bool = True
    history_compaction_manual_enabled: bool = True
    history_compaction_openai_remote_enabled: bool = False
    history_compaction_trigger_tokens: Optional[int] = Field(default=None, ge=2048)
    history_compaction_target_tokens: int = Field(default=60000, ge=1024)
    history_compaction_keep_recent_user_messages: int = Field(default=6, ge=1)
    history_compaction_summary_max_tokens: int = Field(default=1200, ge=128)
    history_compaction_strategy: Literal["auto", "inline", "openai-remote"] = "auto"
    history_compaction_prompt: Optional[str] = None
    history_compaction_cooldown_turns: int = Field(default=1, ge=0)

    # Tool Execution Settings
    # This section is largely redundant as tools execute on the frontend
    # but kept for backend-specific tool configurations if any
    brave_search: BraveSearchConfig = Field(default_factory=BraveSearchConfig)

    # Vision Model Settings
    vision_model_name: Optional[str] = (
        "OpenGVLab/InternVL3_5-4B"  # Defaults to "OpenGVLab/InternVL3_5-4B" if None
    )

    # Voice Mode Settings
    wakeword_stt_enabled: bool = False
    stt_provider: Literal["nova", "openai"] = "openai"
    stt_language: str = "en"
    nova_voice_gateway_url: str = "ws://127.0.0.1:5026"
    openai_realtime_session_model: str = "gpt-realtime-1.5"
    openai_realtime_transcription_model: str = "gpt-4o-transcribe"
    stt_vad_threshold: float = 0.5
    stt_vad_prefix_padding_ms: int = 300
    stt_vad_silence_duration_ms: int = 500
    agent_full_sudo_enabled: bool = False
    browser_automation_enabled: bool = False
    include_query_screenshot: bool = True
    provider_api_keys: ProviderApiKeys = Field(default_factory=ProviderApiKeys)
    provider_oauth: ProviderOAuth = Field(default_factory=ProviderOAuth)

    # Wakeword Settings
    wakeword_enabled: bool = True
    wakeword_phrase: str = "hey jarvis"
    wakeword_greetings: List[str] = Field(
        default_factory=lambda: [
            "Hello! I'm listening.",
            "Hi there! How can I help you?",
            "Yes? I'm here to assist.",
            "Good day! What can I do for you?",
            "Hello! Ready to help.",
        ]
    )

    # TTS Settings
    # tts_enabled is always True by default (hardcoded, not configurable via config file)
    # Only changeable by modifying this default value in code
    tts_enabled: bool = True
    speech_provider: Literal["local", "elevenlabs"] = "elevenlabs"
    tts_model_path: Optional[str] = None
    speech_mode_enabled: bool = False
    elevenlabs_api_key_env: str = "ELEVENLABS_API_KEY"
    elevenlabs_voice_id: str = "EXAVITQu4vr4xnSDxMaL"
    elevenlabs_model_id: str = "eleven_flash_v2_5"
    elevenlabs_output_format: str = "pcm_16000"
    elevenlabs_auto_mode: bool = False
    elevenlabs_inactivity_timeout: int = 60
    elevenlabs_chunk_length_schedule: List[int] = Field(
        default_factory=lambda: [50, 80, 120, 160]
    )

    # This field is populated at runtime, not loaded from config file
    api_key: Optional[str] = None

    # Security limits
    security_limits: SecurityLimits = Field(default_factory=SecurityLimits)

    # WebSocket Settings
    websocket_max_message_size: int = Field(
        default=10 * 1024 * 1024,  # 10MB
        description="Maximum WebSocket message size to prevent memory exhaustion attacks",
    )
    websocket_max_concurrent_tasks: int = Field(
        default=50,
        description="Maximum concurrent tasks per WebSocket connection to prevent DoS",
    )
    websocket_receive_timeout: float = Field(
        default=3600.0,  # 1 hour
        description="Timeout for WebSocket receive operations (seconds)",
    )
    websocket_task_cancellation_timeout: float = Field(
        default=5.0,
        description="Timeout for waiting for tasks to cancel on disconnect (seconds)",
    )

    # Artifact Settings (HTTP storage for large blobs)
    artifact_store_path: str = Field(
        default_factory=_default_artifact_store_path,
        description="Local directory for uploaded artifacts",
    )
    artifact_max_bytes: int = Field(
        default=25 * 1024 * 1024,  # 25MB
        description="Maximum artifact size accepted by HTTP upload",
    )

    @property
    def llm_model(self) -> str:
        """
        Returns the fully qualified model name for the selected provider.
        For local models, this is just the model ID.
        For online models, it's usually provider/model_id.
        """
        if self.model_mode == "local":
            return self.selected_model_id
        return f"{self.model_provider}/{self.selected_model_id}"

    def get_tool_allowlist(self) -> Optional[set[str]]:
        """Return allowed tool names for the current interaction mode."""
        if self.tool_allowlist:
            return {
                name
                for name in self.tool_allowlist
                if isinstance(name, str) and name.strip()
            }
        default_allowlist = _DEFAULT_TOOL_ALLOWLIST_BY_INTERACTION_MODE.get(
            self.interaction_mode
        )
        if default_allowlist is not None:
            return set(default_allowlist)
        return None
