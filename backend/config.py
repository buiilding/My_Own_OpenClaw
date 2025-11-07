import logging
import os
import platform
from pathlib import Path
from typing import Any, Dict, Literal, Optional

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from backend.utils.file_utils import is_within_directory

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
    """Main application configuration model."""

    model_config = ConfigDict(extra="ignore")

    # LLM Settings
    model_mode: Literal["local", "online"] = "online"
    model_provider: str = "openai"  # Default provider
    selected_model_id: str = "gpt-4o"
    llm_timeout: int = 300
    query_timeout: int = 600  # New field for query timeout

    # Provider Configurations
    llm_providers: LLMProviders = Field(default_factory=LLMProviders)

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

settings: Optional[AppConfig] = None


def get_settings() -> AppConfig:
    """
    Loads settings from YAML file and returns an AppConfig instance.
    Implements singleton pattern to avoid repeated file I/O.
    """
    global settings
    if settings is None:
        settings = load_settings_from_file()
    return settings


def reload_settings() -> None:
    """Forces a reload of the settings from the config file."""
    global settings
    settings = load_settings_from_file()


def load_api_key_for_provider(cfg: AppConfig) -> None:
    """
    Loads the API key for the currently selected provider from environment variables.
    The key is stored in the `api_key` field of the AppConfig object.
    """
    provider_name = cfg.model_provider
    api_key_env_var = None

    try:
        provider_config = cfg.llm_providers.get_provider_config(provider_name)
        api_key_env_var = getattr(provider_config, "api_key_env", None)
    except ValueError:
        logger.warning(
            "No config found for provider '%s' when loading API key.", provider_name
        )
        cfg.api_key = None
        return

    if api_key_env_var:
        cfg.api_key = os.getenv(api_key_env_var)
        if not cfg.api_key:
            logger.warning(
                "Environment variable '%s' for provider '%s' is not set.",
                api_key_env_var,
                provider_name,
            )
    else:
        # This case is for local models like Ollama that don't require an API key
        cfg.api_key = None
        logger.info("No API key environment variable for provider '%s'.", provider_name)


def load_settings_from_file() -> AppConfig:
    """Loads the application configuration from a YAML file."""
    config_dir = get_config_dir()
    config_file = config_dir / CONFIG_FILE_NAME

    if not config_file.exists():
        logger.info("Config file not found. Creating a default one.")
        default_config = AppConfig()
        save_settings_to_file(default_config)
        return default_config

    try:
        with open(config_file, "r", encoding="utf-8") as f:
            config_data = yaml.safe_load(f) or {}
        app_config = AppConfig(**config_data)
    except (yaml.YAMLError, ValidationError, TypeError) as e:
        logger.error("Failed to load or validate config file: %s", e, exc_info=True)
        logger.warning("Falling back to default configuration.")
        app_config = AppConfig()

    # Load API key for the selected provider
    load_api_key_for_provider(app_config)

    return app_config


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
settings = get_settings()

# --- Functions for managing config.py ---

# The following functions (get_model_id, set_model_id, etc.) are deprecated
# and will be removed. Direct manipulation of the AppConfig object (via get_settings())
# is now the preferred way to manage configuration.


def get_config_path() -> str:
    """DEPRECATED: Returns the path to the config file."""
    return str(get_config_dir() / CONFIG_FILE_NAME)


def get_model_id() -> str:
    """DEPRECATED: Gets the current model ID from settings."""
    return get_settings().selected_model_id


def set_model_id(model_id: str) -> None:
    """DEPRECATED: Sets the model ID in settings and saves to file."""
    current_settings = get_settings()
    current_settings.selected_model_id = model_id
    save_settings_to_file(current_settings)
    reload_settings()


def get_provider() -> str:
    """DEPRECATED: Gets the current provider from settings."""
    return get_settings().model_provider


def set_provider(provider: str) -> None:
    """DEPRECATED: Sets the provider in settings and saves to file."""
    current_settings = get_settings()
    current_settings.model_provider = provider
    save_settings_to_file(current_settings)
    reload_settings()


def get_model_mode() -> str:
    """DEPRECATED: Gets the current model mode from settings."""
    return get_settings().model_mode


def set_model_mode(mode: str) -> None:
    """DEPRECATED: Sets the model mode in settings and saves to file."""
    current_settings = get_settings()
    if mode not in ["local", "online"]:
        raise ValueError("Invalid model mode. Must be 'local' or 'online'.")
    current_settings.model_mode = mode
    save_settings_to_file(current_settings)
    reload_settings()


def get_full_model_name() -> str:
    """DEPRECATED: Gets the full model name."""
    return get_settings().llm_model


if __name__ == "__main__":
    # Example of how to use the configuration system
    current_settings = get_settings()
    print(f"Current provider: {current_settings.model_provider}")
    print(f"Current model ID: {current_settings.selected_model_id}")
    print(f"Full model name for LLM: {current_settings.llm_model}")
    print(f"API Key loaded: {'Yes' if current_settings.api_key else 'No'}")

    # Example of updating settings
    print("\nUpdating provider to 'anthropic'...")
    current_settings.model_provider = "anthropic"
    current_settings.selected_model_id = "claude-3.7-sonnet-20250219"
    save_settings_to_file(current_settings)
    reload_settings()

    reloaded_settings = get_settings()
    print(f"New provider: {reloaded_settings.model_provider}")
    print(f"New model ID: {reloaded_settings.selected_model_id}")
    print(f"New full model name: {reloaded_settings.llm_model}")
    print(f"New API Key loaded: {'Yes' if reloaded_settings.api_key else 'No'}")

    # Reset to default
    print("\nResetting to default...")
    default_settings = AppConfig()
    save_settings_to_file(default_settings)
    reload_settings()
    print("Done.")

# This is a sample script to generate a schema for the AppConfig model.
# It's useful for documentation or for building tools that interact with the config.


def generate_config_schema():
    """Generates and prints the JSON schema for AppConfig."""
    schema = AppConfig.model_json_schema()
    import json

    print(json.dumps(schema, indent=2))


# --- Service Classes for Tools ---


class WorkspaceContext:
    """Context for workspace operations."""

    def __init__(self, workspace_path: Optional[str] = None):
        self.workspace_path = workspace_path or os.getcwd()

    def is_path_within_workspace(self, path: str) -> bool:
        """Check if a path is within the workspace."""
        try:
            return is_within_directory(path, self.workspace_path)
        except Exception:
            return False


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


class StorageService:
    """Service for storage operations."""

    def __init__(self, temp_dir: Optional[str] = None):
        self.temp_dir = temp_dir or os.path.join(os.getcwd(), "temp")

    def get_project_temp_dir(self) -> Optional[str]:
        """Get the project temp directory."""
        return self.temp_dir


class AppServices:
    """Service container that provides access to various application services."""

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


# To run this, you would execute `python -m backend.config` and it would
# demonstrate the config system and then you could uncomment the schema
# generation call if needed.
# generate_config_schema()
