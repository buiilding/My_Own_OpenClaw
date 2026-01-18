"""
Interface for configuration access.
"""
from typing import Protocol, runtime_checkable, Optional


@runtime_checkable
class ConfigInterface(Protocol):
    """
    Interface for accessing application configuration.
    Provides read-only access to configuration values.
    """
    
    @property
    def model_mode(self) -> str:
        """Model mode: 'local' or 'online'."""
        ...
    
    @property
    def model_provider(self) -> str:
        """Current model provider name."""
        ...
    
    @property
    def selected_model_id(self) -> str:
        """Selected model ID."""
        ...
    
    @property
    def llm_timeout(self) -> int:
        """LLM request timeout in seconds."""
        ...
    
    @property
    def query_timeout(self) -> int:
        """Query timeout in seconds."""
        ...
    
    @property
    def memory_enabled(self) -> bool:
        """Whether memory system is enabled."""
        ...
    
    @property
    def embedding_model(self) -> str:
        """Embedding model name."""
        ...
    
    @property
    def summarization_interval(self) -> int:
        """Memory summarization interval in seconds."""
        ...
    
    @property
    def allowed_shell_commands(self) -> list[str]:
        """List of allowed shell commands."""
        ...
    
    @property
    def api_key(self) -> Optional[str]:
        """API key for current provider (runtime only, not persisted)."""
        ...
    
    @property
    def llm_model(self) -> str:
        """Fully qualified model name for the selected provider."""
        ...
    
    def get_provider_config(self, provider_name: str):
        """Get configuration for a specific provider."""
        ...

