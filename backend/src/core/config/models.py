"""
Configuration Models.

This module contains Pydantic models for the application configuration.
"""

import os
import platform
from pathlib import Path
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

InferenceBackend = Literal["local", "remote-http", "vendor", "disabled"]
AgentToolProfile = Literal[
    "default", "chat", "coding", "browser", "computer", "full", "custom"
]
AgentCapability = Literal["ocr", "vision", "embeddings", "web_search", "browser"]
CoordinateMethod = Literal["manual", "ocr", "prediction"]
APP_DATA_DIR_NAME = "windieos"


def _default_user_data_root() -> Path:
    if os.name == "nt":
        appdata = os.getenv("APPDATA")
        if appdata:
            return Path(appdata) / APP_DATA_DIR_NAME

    home_dir = Path.home()
    if os.name == "posix" and platform.system() == "Darwin":
        return home_dir / "Library" / "Application Support" / APP_DATA_DIR_NAME
    return home_dir / ".config" / APP_DATA_DIR_NAME


def _default_artifact_store_path() -> str:
    return str(_default_user_data_root() / "artifacts")


def _default_install_auth_db_path() -> str:
    artifact_dir = Path(_default_artifact_store_path())
    return str(artifact_dir.parent / "install-auth.sqlite3")


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
        if not hasattr(self, normalized):
            raise ValueError(f"Unknown provider: {provider_name}")
        return getattr(self, normalized)


class ProviderApiKeyOverride(BaseModel):
    """Client-managed API key override for a single online provider."""

    enabled: bool = False
    api_key: str = ""


class ProviderApiKeys(BaseModel):
    """Client-managed API key overrides by provider."""

    openai: ProviderApiKeyOverride = Field(default_factory=ProviderApiKeyOverride)
    anthropic: ProviderApiKeyOverride = Field(default_factory=ProviderApiKeyOverride)
    google: ProviderApiKeyOverride = Field(default_factory=ProviderApiKeyOverride)
    openrouter: ProviderApiKeyOverride = Field(default_factory=ProviderApiKeyOverride)
    mistral: ProviderApiKeyOverride = Field(default_factory=ProviderApiKeyOverride)
    kimi_coding: ProviderApiKeyOverride = Field(default_factory=ProviderApiKeyOverride)

    def get_provider_override(
        self, provider_name: str
    ) -> Optional[ProviderApiKeyOverride]:
        """Resolve provider override config from current provider keys."""
        normalized = provider_name.lower().replace("-", "_")
        if normalized == "gemini":
            normalized = "google"
        if not hasattr(self, normalized):
            return None
        return getattr(self, normalized)


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
    max_prompt_images_per_message: int = Field(
        default=8, description="Max prompt images attached to one message"
    )
    max_prompt_image_bytes: int = Field(
        default=768 * 1024, description="Max processed bytes per prompt image"
    )
    max_prompt_image_dimension: int = Field(
        default=2048, description="Max width or height for prompt images"
    )


_DEFAULT_TOOL_ALLOWLIST_BY_INTERACTION_MODE: dict[str, set[str]] = {
    "chat": {
        "open_app",
        "process",
        "mouse_control",
        "keyboard_control",
        "screenshot",
        "scroll_control",
        "switch_window",
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
    embedding_backend: InferenceBackend = "vendor"
    embedding_model: str = "text-embedding-3-small"
    embedding_api_key_env: str = "OPENAI_API_KEY"
    embedding_remote_service_url: Optional[str] = None
    embedding_request_timeout_seconds: float = Field(default=30.0, ge=0.1)
    embedding_max_concurrent_requests: int = Field(default=32, ge=1)
    embedding_queue_timeout_seconds: float = Field(default=5.0, ge=0.1)

    # Agent Execution Settings
    interaction_mode: Literal["chat", "agent"] = "agent"
    tool_allowlist: Optional[List[str]] = None
    agent_tool_profile: AgentToolProfile = Field(
        default="default",
        description=(
            "Session-scoped agent tool profile. 'default' preserves the "
            "interaction_mode/tool_allowlist behavior; other profiles further "
            "narrow the model-visible tool surface."
        ),
    )
    agent_disabled_tools: List[str] = Field(
        default_factory=list,
        description="Session/server tool names to remove from the agent-visible surface.",
    )
    agent_available_tools: Optional[List[str]] = Field(
        default=None,
        description=(
            "Client/session tool names that are available for this runtime. "
            "None means the client has not constrained tool availability."
        ),
    )
    agent_coordinate_methods: Optional[List[CoordinateMethod]] = Field(
        default=None,
        description=(
            "Allowed coordinate targeting methods for grounded desktop tools. "
            "None means all methods unless capability gates remove some."
        ),
    )
    agent_available_coordinate_methods: Optional[List[CoordinateMethod]] = Field(
        default=None,
        description=(
            "Client/session coordinate targeting methods available in this runtime. "
            "None means the client has not constrained coordinate availability."
        ),
    )
    agent_disabled_capabilities: List[AgentCapability] = Field(
        default_factory=list,
        description=(
            "Session/server capability gates that remove related tool schema "
            "fields or direct tools before prompt construction."
        ),
    )
    agent_provider_unavailable_capabilities: List[AgentCapability] = Field(
        default_factory=list,
        description=(
            "Provider-health capability gates computed by backend runtime. "
            "These remove capabilities known unavailable before prompt construction."
        ),
    )
    history_compaction_enabled: bool = True
    history_compaction_manual_enabled: bool = True
    history_compaction_trigger_tokens: Optional[int] = Field(default=None, ge=2048)
    history_compaction_target_tokens: int = Field(default=60000, ge=1024)
    history_compaction_keep_recent_user_messages: int = Field(default=6, ge=1)
    history_compaction_summary_max_tokens: int = Field(default=1200, ge=128)
    history_compaction_prompt: Optional[str] = None

    # Tool Execution Settings
    # Backend-owned remote tool configuration. Local tools execute through the
    # client-provided local-runtime manifest.
    brave_search: BraveSearchConfig = Field(default_factory=BraveSearchConfig)

    # Vision Model Settings
    vision_backend: InferenceBackend = "local"
    vision_model_name: Optional[str] = (
        "OpenGVLab/InternVL3_5-4B"  # Defaults to "OpenGVLab/InternVL3_5-4B" if None
    )
    vision_remote_service_url: Optional[str] = None
    vision_remote_health_url: Optional[str] = None
    vision_request_timeout_seconds: float = Field(default=30.0, ge=0.1)
    vision_health_timeout_seconds: float = Field(default=5.0, ge=0.1)
    ocr_backend: InferenceBackend = "local"
    ocr_model: str = "rapidocr-ppocrv5-server"
    ocr_remote_service_url: Optional[str] = None
    ocr_remote_health_url: Optional[str] = None
    ocr_request_timeout_seconds: float = Field(default=10.0, ge=0.1)
    ocr_health_timeout_seconds: float = Field(default=3.0, ge=0.1)
    provider_circuit_breaker_failure_threshold: int = Field(default=3, ge=1)
    provider_circuit_breaker_cooldown_seconds: float = Field(default=60.0, ge=0.1)

    # Voice Mode Settings
    wakeword_stt_enabled: bool = False
    stt_provider: Literal["nova", "openai"] = "openai"
    stt_language: str = "en"
    nova_voice_gateway_url: str = "ws://127.0.0.1:5026"
    openai_realtime_transcription_model: str = "gpt-4o-transcribe"
    stt_vad_threshold: float = 0.5
    stt_vad_prefix_padding_ms: int = 300
    stt_vad_silence_duration_ms: int = 500
    browser_automation_enabled: bool = False
    include_query_screenshot: bool = True
    provider_api_keys: ProviderApiKeys = Field(default_factory=ProviderApiKeys)

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
    max_active_queries_per_user: int = Field(
        default=4,
        description="Maximum concurrently active query tasks per authenticated user",
    )
    max_active_queries_global: int = Field(
        default=200,
        description="Maximum concurrently active query tasks across the backend process",
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
    install_auth_enabled: bool = True
    install_registration_enabled: bool = Field(
        default=True,
        description="Whether /api/install/register can create durable install tokens",
    )
    install_registration_secret: Optional[str] = Field(
        default=None,
        description=(
            "Optional bootstrap secret required in "
            "X-Windie-Install-Registration-Secret for install registration"
        ),
    )
    install_auth_db_path: str = Field(
        default_factory=_default_install_auth_db_path,
        description="SQLite file used for install-token registration and authentication",
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
