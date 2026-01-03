"""
Configuration Models.

This module contains Pydantic models for the application configuration.
"""
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

class OpenAIConfig(BaseModel):
    """Configuration for OpenAI provider."""

    model: str = "gpt-4o"
    api_key_env: str = "OPENAI_API_KEY"


class AnthropicConfig(BaseModel):
    """Configuration for Anthropic provider."""

    model: str = "claude-3.7-sonnet-20250219"
    api_key_env: str = "ANTHROPIC_API_KEY"


class GeminiConfig(BaseModel):
    """Configuration for Google provider."""

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


class MistralConfig(BaseModel):
    """Configuration for Mistral AI provider."""

    model: str = "mistral-large-2411"
    api_key_env: str = "MISTRAL_API_KEY"


class LMStudioConfig(BaseModel):
    """Configuration for LMStudio (local) provider."""

    model: str = ""  # Not used, models are discovered
    base_url: str = "http://localhost:1234/v1"


class LLMProviders(BaseModel):
    """Container for all supported LLM provider configurations."""

    openai: OpenAIConfig = Field(default_factory=OpenAIConfig)
    anthropic: AnthropicConfig = Field(default_factory=AnthropicConfig)
    gemini: GeminiConfig = Field(default_factory=GeminiConfig)
    ollama: OllamaConfig = Field(default_factory=OllamaConfig)
    openrouter: OpenRouterConfig = Field(default_factory=OpenRouterConfig)
    mistral: MistralConfig = Field(default_factory=MistralConfig)
    lmstudio: LMStudioConfig = Field(default_factory=LMStudioConfig)

    def get_provider_config(self, provider_name: str):
        """Gets the configuration for a specific provider."""
        if not hasattr(self, provider_name):
            raise ValueError(f"Unknown provider: {provider_name}")
        return getattr(self, provider_name)


class Preferences(BaseModel):
    """User-specific preferences."""

    theme: str = "dark"


class AppConfig(BaseModel):
    """Main application configuration model (immutable)."""

    model_config = ConfigDict(
        extra="ignore", 
        protected_namespaces=(),
        frozen=True  # Make config immutable
    )

    # LLM Settings
    model_mode: Literal["local", "online"] = "online"
    model_provider: str = "openai"  # Default provider
    selected_model_id: str = "gpt-4o"
    llm_timeout: int = 300
    query_timeout: int = 600  # New field for query timeout
    debug_litellm: bool = False  # Enable LiteLLM debug logging

    # Provider Configurations
    llm_providers: LLMProviders = Field(default_factory=LLMProviders)

    # Memory System Settings
    memory_enabled: bool = True
    embedding_model: str = "all-MiniLM-L6-v2"

    # Agent Execution Settings
    max_history_length: int = 1000  # Maximum conversation history messages
    max_agent_iterations: int = 1000  # Maximum tool execution iterations per query (high limit to effectively remove constraint)

    # Tool Execution Settings
    # This section is largely redundant as tools execute on the frontend
    # but kept for backend-specific tool configurations if any
    
    # Vision Model Settings
    vision_model_name: Optional[str] = "OpenGVLab/InternVL3_5-2B"  # Defaults to "OpenGVLab/InternVL3_5-4B" if None
    
    # Voice Mode Settings
    voice_mode_enabled: bool = False

    # Wakeword Settings
    wakeword_enabled: bool = True
    wakeword_phrase: str = "hey jarvis"
    wakeword_greetings: List[str] = Field(default_factory=lambda: [
        "Hello! I'm listening.",
        "Hi there! How can I help you?",
        "Yes? I'm here to assist.",
        "Good day! What can I do for you?",
        "Hello! Ready to help."
    ])

    # TTS Settings
    # tts_enabled is always True by default (hardcoded, not configurable via config file)
    # Only changeable by modifying this default value in code
    tts_enabled: bool = True
    tts_model_path: Optional[str] = None
    speech_mode_enabled: bool = False

    # This field is populated at runtime, not loaded from config file
    api_key: Optional[str] = None

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

