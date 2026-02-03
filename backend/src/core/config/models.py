"""
Configuration Models.

This module contains Pydantic models for the application configuration.
"""
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

class OpenAIConfig(BaseModel):
    """Configuration for OpenAI provider."""

    model: str = "gpt-5.1"
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


class Preferences(BaseModel):
    """User-specific preferences."""

    theme: str = "dark"


class SecurityLimits(BaseModel):
    """Security limits for trust boundaries."""
    
    # Parser limits
    max_response_size: int = Field(default=10 * 1024 * 1024, description="Max LLM response size (10MB)")
    max_json_size: int = Field(default=1 * 1024 * 1024, description="Max JSON object size (1MB)")
    max_json_nesting_depth: int = Field(default=100, description="Max JSON nesting depth")
    max_tool_name_length: int = Field(default=256, description="Max tool name length")
    max_parameter_count: int = Field(default=100, description="Max parameters per tool call")
    max_parameter_value_size: int = Field(default=64 * 1024, description="Max parameter value size (64KB)")
    max_tool_calls_per_response: int = Field(default=50, description="Max tool calls per response")
    
    # Parser timeouts
    parse_timeout_seconds: float = Field(default=5.0, description="Parser timeout (seconds)")
    json_load_timeout_seconds: float = Field(default=2.0, description="JSON load timeout (seconds)")
    
    # Prompt constructor limits
    max_message_history_size: int = Field(default=1000, description="Max messages in history")
    max_message_content_size: int = Field(default=1 * 1024 * 1024, description="Max message content size (1MB)")
    max_prompt_size: int = Field(default=50 * 1024 * 1024, description="Max total prompt size (50MB)")


class OCRConfig(BaseModel):
    """Configuration for OCR service."""
    
    # Batch size thresholds based on GPU memory (GB)
    # Format: [min_gpu_memory_gb, rec_batch_num, cls_batch_num]
    batch_size_thresholds: List[List[float | int]] = Field(
        default_factory=lambda: [
            [15.5, 24, 10],  # >= 15.5GB: rec=24, cls=10
            [12.0, 10, 6],   # >= 12GB: rec=10, cls=6
            [8.0, 8, 6],     # >= 8GB: rec=8, cls=6
            [0.0, 6, 4],     # < 8GB or CPU: rec=6, cls=4
        ],
        description="GPU memory thresholds and corresponding batch sizes"
    )
    
    # Global OCR settings
    use_detection: bool = Field(default=True, description="Enable text detection")
    use_classification: bool = Field(default=False, description="Enable text classification (disabled for screenshots)")
    use_recognition: bool = Field(default=True, description="Enable text recognition")
    text_score_threshold: float = Field(default=0.5, description="Text score threshold")
    max_side_len: int = Field(default=2000, description="Max side length")
    min_side_len: int = Field(default=30, description="Min side length")
    
    # Detection settings
    det_limit_side_len: int = Field(default=736, description="Detection limit side length")
    det_limit_type: str = Field(default="min", description="Detection limit type")
    det_thresh: float = Field(default=0.3, description="Detection threshold")
    det_box_thresh: float = Field(default=0.5, description="Detection box threshold")
    det_max_candidates: int = Field(default=1000, description="Max detection candidates")
    det_unclip_ratio: float = Field(default=1.6, description="Detection unclip ratio")
    det_score_mode: str = Field(default="default", description="Detection score mode")
    
    # Classification settings (disabled but parameters needed)
    cls_thresh: float = Field(default=0.9, description="Classification threshold")
    
    # Thread optimization
    use_cpu_cores_for_threads: bool = Field(default=True, description="Use CPU cores for thread optimization")
    inter_op_threads_max: int = Field(default=4, description="Max inter-op threads")
    inter_op_threads_min: int = Field(default=2, description="Min inter-op threads")


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
    selected_model_id: str = "gpt-5.1"
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
    vision_model_name: Optional[str] = "OpenGVLab/InternVL3_5-4B"  # Defaults to "OpenGVLab/InternVL3_5-4B" if None
    
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

    # Security limits
    security_limits: SecurityLimits = Field(default_factory=SecurityLimits)
    
    # OCR configuration
    ocr_config: OCRConfig = Field(default_factory=OCRConfig)
    
    # WebSocket Settings
    websocket_max_message_size: int = Field(
        default=10 * 1024 * 1024,  # 10MB
        description="Maximum WebSocket message size to prevent memory exhaustion attacks"
    )
    websocket_max_concurrent_tasks: int = Field(
        default=50,
        description="Maximum concurrent tasks per WebSocket connection to prevent DoS"
    )
    websocket_receive_timeout: float = Field(
        default=3600.0,  # 1 hour
        description="Timeout for WebSocket receive operations (seconds)"
    )
    websocket_task_cancellation_timeout: float = Field(
        default=5.0,
        description="Timeout for waiting for tasks to cancel on disconnect (seconds)"
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
