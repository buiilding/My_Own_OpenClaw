"""
Application Configuration Management.

This module handles loading, validation, and management of application configuration.
Supports YAML-based configuration files with environment-specific settings and
immutable configuration objects for type safety.
"""
import logging
import os
import platform
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

logger = logging.getLogger(__name__)

# --- Constants ---
APP_NAME = "DesktopAssistant"
CONFIG_FILE_NAME = "config.yaml"

# --- Helper Functions ---


def get_config_dir() -> Path:
    """Gets the application's configuration directory based on OS."""
    if os.name == "nt":  # Windows
        appdata = os.getenv("APPDATA")
        if not appdata:
            raise ValueError("APPDATA environment variable is not set on Windows")
        return Path(appdata) / APP_NAME

    if os.name == "posix":
        if platform.system() == "Darwin":  # macOS
            return Path.home() / "Library" / "Application Support" / APP_NAME
        # Linux and other Unix-like
        return Path.home() / ".config" / APP_NAME

    raise ValueError(f"Unsupported OS: {os.name}")


# --- Pydantic Models for Validation ---


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

    # Shell Tool Settings
    allowed_shell_commands: List[str] = Field(
        default_factory=lambda: [
            "echo",
            "pwd",
            "whoami",
            "date",
            "ls",
            "dir",
            "cat",
            "type",
        ]
    )

    # Provider Configurations
    llm_providers: LLMProviders = Field(default_factory=LLMProviders)

    # Memory System Settings
    memory_enabled: bool = True
    memory_db_path: Optional[str] = None  # Defaults to config_dir/memory
    embedding_model: str = "all-MiniLM-L6-v2"
    summarization_interval: int = 3600  # seconds
    memory_summarization_batch_size: int = 10  # Number of interactions per batch
    memory_summarization_limit: int = 1000  # Max memories to fetch for summarization

    # Agent Execution Settings
    max_history_length: int = 10  # Maximum conversation history messages
    max_agent_iterations: int = 1000  # Maximum tool execution iterations per query (high limit to effectively remove constraint)

    # Tool Execution Settings
    shell_timeout: float = 30.0  # Shell command timeout in seconds
    search_file_timeout: float = 5.0  # File search timeout in seconds
    marketplace_search_limit: int = 5  # Marketplace search result limit
    model_registry_timeout: float = 2.0  # Model registry API timeout in seconds

    # Computer/Screenshot Settings
    screenshot_delay_after_action: float = (
        0.5  # seconds to wait before screenshot after computer actions
    )
    
    # Voice Mode Settings
    voice_mode_enabled: bool = False

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


# --- Singleton for Settings ---

# settings: Optional[AppConfig] = None  # Removed global singleton side-effect

# Deprecated: Use ConfigManager instead
def get_settings() -> AppConfig:
    """
    DEPRECATED: Loads settings from YAML file and returns an AppConfig instance.
    This function reads from disk each time it's called.
    Use ConfigManager.get_config() instead for cached config access.
    """
    logger.warning("get_settings() is deprecated. Use ConfigManager.get_config() instead.")
    return load_settings_from_file()


class ConfigManager:
    """
    Manages application configuration with single load at startup.
    Provides immutable config access and config change events.
    """
    
    def __init__(self):
        """Initialize the config manager."""
        self._config: Optional[AppConfig] = None
        self._config_file_path: Optional[Path] = None
    
    def load_config(self) -> AppConfig:
        """
        Load configuration from file (called once at startup).
        
        Returns:
            Loaded AppConfig instance
        """
        if self._config is not None:
            logger.debug("Config already loaded. Returning existing config.")
            return self._config
        
        config_dir = get_config_dir()
        self._config_file_path = config_dir / CONFIG_FILE_NAME
        self._config = load_settings_from_file()
        logger.info(f"Configuration loaded from {self._config_file_path}")
        return self._config
    
    def get_config(self) -> AppConfig:
        """
        Get the current configuration.
        
        Returns:
            Current AppConfig instance
            
        Raises:
            RuntimeError: If config has not been loaded
        """
        if self._config is None:
            raise RuntimeError("Config not loaded. Call load_config() first.")
        return self._config
    
    def update_config(self, new_config: AppConfig) -> AppConfig:
        """
        Update configuration and save to file.
        Publishes config change event.
        
        Args:
            new_config: New configuration instance
            
        Returns:
            Updated config with API key loaded
        """
        # Load API key for new config
        updated_config = load_api_key_for_provider(new_config)
        
        # Save to file
        save_settings_to_file(updated_config)
        
        # Update cached config
        self._config = updated_config
        
        # Publish config change event (async, will be handled by event bus subscribers)
        logger.info("Configuration updated")
        
        return updated_config
    
    def reload_config(self) -> AppConfig:
        """
        Reload configuration from file.
        
        Returns:
            Reloaded AppConfig instance
        """
        self._config = load_settings_from_file()
        logger.info("Configuration reloaded from file")
        
        return self._config


# Global config manager instance
_config_manager = ConfigManager()


def get_config_manager() -> ConfigManager:
    """Get the global config manager instance."""
    return _config_manager


def load_api_key_for_provider(cfg: AppConfig) -> AppConfig:
    """
    Loads the API key for the currently selected provider from environment variables.
    Returns a new AppConfig instance with the api_key set.
    For local models, no API key is required.
    """
    # For local models, no API key is needed
    if cfg.model_mode == "local":
        logger.info("Local model mode selected - no API key required.")
        return cfg.model_copy(update={"api_key": None})

    provider_name = cfg.model_provider
    api_key_env_var = None

    try:
        provider_config = cfg.llm_providers.get_provider_config(provider_name)
        api_key_env_var = getattr(provider_config, "api_key_env", None)
    except ValueError:
        logger.warning(
            "No config found for provider '%s' when loading API key.", provider_name
        )
        return cfg.model_copy(update={"api_key": None})

    if api_key_env_var:
        api_key = os.getenv(api_key_env_var)
        if not api_key:
            logger.warning(
                "Environment variable '%s' for provider '%s' is not set.",
                api_key_env_var,
                provider_name,
            )
        return cfg.model_copy(update={"api_key": api_key})
    else:
        # This case is for local models like Ollama that don't require an API key
        logger.info("No API key environment variable for provider '%s'.", provider_name)
        return cfg.model_copy(update={"api_key": None})


def load_settings_from_file() -> AppConfig:
    """
    Loads the application configuration from a YAML file.
    This function should only be called once at startup.
    Use ConfigManager for runtime config access.
    """
    config_dir = get_config_dir()
    config_file = config_dir / CONFIG_FILE_NAME

    if not config_file.exists():
        logger.info("Config file not found. Creating a default one.")
        default_config = AppConfig()
        save_settings_to_file(default_config)
        return load_api_key_for_provider(default_config)

    try:
        with open(config_file, "r", encoding="utf-8") as f:
            config_data = yaml.safe_load(f) or {}
        app_config = AppConfig(**config_data)
    except (yaml.YAMLError, ValidationError, TypeError) as e:
        logger.error("Failed to load or validate config file: %s", e, exc_info=True)
        logger.warning("Falling back to default configuration.")
        app_config = AppConfig()

    # Load API key for the selected provider (returns new instance)
    return load_api_key_for_provider(app_config)


def save_settings_to_file(cfg: AppConfig) -> None:
    """Saves the application configuration to a YAML file."""
    config_dir = get_config_dir()
    config_file = config_dir / CONFIG_FILE_NAME
    config_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Exclude the runtime-only api_key field from being saved
        config_to_save = cfg.model_dump(exclude={"api_key"})
        with open(config_file, "w", encoding="utf-8") as f:
            yaml.dump(config_to_save, f, default_flow_style=False, sort_keys=False)
        logger.info("Successfully saved settings to %s", config_file)
    except (yaml.YAMLError, OSError) as e:
        logger.error("Failed to save settings to file: %s", e, exc_info=True)
        raise


# Initialize settings on module load
# settings = get_settings()  # Removed global side-effect


if __name__ == "__main__":
    # Example of how to use the configuration system
    config_manager = get_config_manager()
    config_manager.load_config()
    current_settings = config_manager.get_config()
    
    print(f"Current provider: {current_settings.model_provider}")
    print(f"Current model ID: {current_settings.selected_model_id}")
    print(f"Full model name for LLM: {current_settings.llm_model}")
    print(f"API Key loaded: {'Yes' if current_settings.api_key else 'No'}")

    # Example of updating settings
    print("\nUpdating provider to 'anthropic'...")
    updated_config = current_settings.model_copy(update={
        "model_provider": "anthropic",
        "selected_model_id": "claude-3.7-sonnet-20250219"
    })
    config_manager.update_config(updated_config)

    reloaded_settings = config_manager.get_config()
    print(f"New provider: {reloaded_settings.model_provider}")
    print(f"New model ID: {reloaded_settings.selected_model_id}")
    print(f"New full model name: {reloaded_settings.llm_model}")
    print(f"New API Key loaded: {'Yes' if reloaded_settings.api_key else 'No'}")

    # Reset to default
    print("\nResetting to default...")
    default_settings = AppConfig()
    save_settings_to_file(default_settings)
    config_manager.reload_config()
    print("Done.")

# This is a sample script to generate a schema for the AppConfig model.
# It's useful for documentation or for building tools that interact with the config.


def generate_config_schema():
    """Generates and prints the JSON schema for AppConfig."""
    schema = AppConfig.model_json_schema()
    import json

    print(json.dumps(schema, indent=2))


# --- Service Classes for Tools ---
# DEPRECATED: These classes have been moved to backend/src/core/services/
# Use ServiceContainer from backend.src.core.services instead
# This section is kept for backward compatibility only


class WorkspaceContext:
    """Context for workspace operations."""

    def __init__(self, workspace_path: Optional[str] = None):
        self.workspace_path = workspace_path or os.getcwd()

    def is_path_within_workspace(self, path: str) -> bool:
        """Check if a path is within the workspace.

        Modified to allow operations anywhere on the system for global file access.
        """
        # Allow access to any path on the system
        return True


class FileService:
    """Service for file operations."""

    def should_ignore_file(
        self, file_path: str, filtering_options: Dict[str, Any]
    ) -> bool:
        """Check if a file should be ignored based on filtering options."""
        # For now, just check if it's a common ignore pattern
        path_obj = Path(file_path)
        ignore_patterns = [".git", "__pycache__", "node_modules", ".DS_Store"]

        for pattern in ignore_patterns:
            if pattern in str(path_obj):
                return True

        return False

    def filter_files_with_report(
        self, relative_paths: List[str], filtering_options: Dict[str, Any]
    ) -> tuple[List[str], int]:
        """Filter files based on filtering options and return report.

        Args:
            relative_paths: List of relative file paths to filter
            filtering_options: Dict with filtering options like 'respect_git_ignore', 'respect_gemini_ignore'

        Returns:
            Tuple of (filtered_paths, ignored_count)
        """
        filtered_paths = []
        ignored_count = 0

        for path in relative_paths:
            if self.should_ignore_file(path, filtering_options):
                ignored_count += 1
            else:
                filtered_paths.append(path)

        return filtered_paths, ignored_count


class StorageService:
    """Service for storage operations."""

    def __init__(self, temp_dir: Optional[str] = None):
        self.temp_dir = temp_dir or os.path.join(os.getcwd(), "temp")

    def get_project_temp_dir(self) -> Optional[str]:
        """Get the project temp directory."""
        return self.temp_dir


class AppServices:
    """
    DEPRECATED: Use ServiceContainer from backend.src.core.services instead.
    
    This class is kept for backward compatibility only.
    New code should use ServiceContainer.
    """
    def __init__(self, config: AppConfig):
        self.config = config
        self._workspace_context: Optional[WorkspaceContext] = None
        self._file_service: Optional[FileService] = None
        self._storage: Optional[StorageService] = None

    def get_workspace_context(self) -> WorkspaceContext:
        """Get the workspace context."""
        if self._workspace_context is None:
            # Use current working directory as workspace for now
            self._workspace_context = WorkspaceContext()
        return self._workspace_context

    def get_file_service(self) -> FileService:
        """Get the file service."""
        if self._file_service is None:
            self._file_service = FileService()
        return self._file_service

    def get_file_filtering_options(self) -> Dict[str, Any]:
        """Get file filtering options."""
        return {
            "respect_git_ignore": True,
            "respect_gemini_ignore": True,
        }

    @property
    def storage(self) -> StorageService:
        """Get the storage service."""
        if self._storage is None:
            self._storage = StorageService()
        return self._storage

    def get_allowed_tools(self) -> List[str]:
        """Get the list of allowed shell commands."""
        return self.config.allowed_shell_commands

    def get_shell_timeout(self) -> float:
        """Get the shell command timeout in seconds."""
        return 30.0  # Default timeout for shell commands


# To run this, you would execute `python -m backend.config` and it would
# demonstrate the config system and then you could uncomment the schema
# generation call if needed.
# generate_config_schema()
