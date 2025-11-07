import logging
import os
import platform
from pathlib import Path
from typing import Literal, Optional

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
    """Root model for the application configuration."""

    model_config = ConfigDict(
        extra="ignore",
        protected_namespaces=(),  # Disable protected namespace warnings
    )

    # Model selection mode: "local" or "online"
    model_mode: Literal["local", "online"] = "online"

    # Selected model ID (e.g., "gpt-4o", "llama3", "claude-3.5-sonnet")
    selected_model_id: str = "gpt-4o"

    # Provider name for the selected model (used for API key lookup)
    model_provider: str = "openai"

    # Timeout for LLM requests in seconds
    llm_timeout: int = 300

    # Legacy fields for backward compatibility
    active_provider: Literal[
        "openai", "anthropic", "ollama", "openrouter", "mistral", "gemini"
    ] = "openai"
    preferences: Preferences = Field(default_factory=Preferences)
    llm_providers: LLMProviders = Field(default_factory=LLMProviders)

    # This field will hold the actual API key after it's loaded
    api_key: Optional[str] = Field(default=None, repr=False)

    def get_target_dir(self) -> str:
        """Returns the target directory for file operations."""
        # For now, return the current working directory
        # This should be configurable in the future
        import os
        return os.getcwd()

    def get_workspace_context(self):
        """Returns a workspace context object for path validation."""
        # Simple workspace context that allows all paths for now
        # This should be more sophisticated in the future
        class SimpleWorkspaceContext:
            def is_path_within_workspace(self, path: str) -> bool:
                # For now, allow all paths. This should be restricted to a specific workspace
                return True

        return SimpleWorkspaceContext()

    @property
    def storage(self):
        """Returns a storage object (placeholder for now)."""
        class SimpleStorage:
            def get_project_temp_dir(self):
                import tempfile
                import os
                return os.path.join(tempfile.gettempdir(), "desktop_assistant")

        return SimpleStorage()

    def get_file_service(self):
        """Returns a file service object (placeholder for now)."""
        class SimpleFileService:
            def should_ignore_file(self, path: str, options=None):
                # Simple implementation - ignore common files
                import os
                filename = os.path.basename(path)
                ignored = {'.git', '__pycache__', 'node_modules', '.DS_Store'}
                return any(ignored_part in path for ignored_part in ignored)

            def filter_files_with_report(self, paths, options=None):
                # Simple implementation - return all paths for now
                return paths, 0

        return SimpleFileService()

    def get_file_filtering_options(self):
        """Returns file filtering options."""
        return {
            "respect_git_ignore": True,
            "respect_gemini_ignore": True
        }

    def get_shell_timeout(self):
        """Returns shell command timeout."""
        return 30.0

    @property
    def llm_model(self) -> str:
        """Returns the LiteLLM-compatible model identifier."""
        provider = self.model_provider
        model_id = self.selected_model_id

        if not model_id:
            return ""  # Return empty if no model is selected

        if self.model_mode == "local":
            # For local mode, the model_id is used directly.
            # No special prefixing is needed for LiteLLM.
            return model_id

        # Online models prefixing
        provider_prefixes = {
            "gemini": "gemini/",
            "openrouter": "openrouter/",
            "anthropic": "anthropic/",
            "mistral": "mistral/",
        }

        prefix = provider_prefixes.get(provider)
        if prefix and not model_id.startswith(prefix):
            return f"{prefix}{model_id}"

        return model_id


# --- Main Configuration Loading Logic ---


def load_api_key_for_provider(config_obj: AppConfig) -> None:
    """Loads the API key for the selected provider into the config object."""
    provider_name = config_obj.model_provider or config_obj.active_provider

    config_obj.api_key = None  # Reset key first

    if config_obj.model_mode == "online" and provider_name:
        try:
            provider_config = config_obj.llm_providers.get_provider_config(
                provider_name
            )
            if hasattr(provider_config, "api_key_env"):
                api_key_env_var = provider_config.api_key_env
                api_key = os.getenv(api_key_env_var)
                if not api_key:
                    # Log a warning instead of raising an error, as the key might not
                    # be needed immediately or might be configured elsewhere for
                    # litellm.
                    logger.warning(
                        (
                            "API key environment variable '%s' for provider '%s' "
                            "is not set."
                        ),
                        api_key_env_var,
                        provider_name,
                    )
                config_obj.api_key = api_key
        except ValueError:
            logger.warning("Could not find config for provider: %s", provider_name)


def load_config() -> AppConfig:
    """Loads the application configuration from the YAML file.

    If the config file doesn't exist, it creates one with default values.
    It validates the config structure and loads the active API key from
    environment variables.

    Returns:
        An AppConfig instance with the loaded and validated settings.

    Raises:
        ValueError: If the configuration is invalid or an API key is missing.
    """
    config_dir = get_config_dir()
    config_file = config_dir / CONFIG_FILE_NAME

    config_dir.mkdir(parents=True, exist_ok=True)

    if not config_file.exists():
        # Create a default config file
        default_config = AppConfig()
        with open(config_file, "w", encoding="utf-8") as f:
            # Dump a clean version without the 'api_key' field
            config_dict = default_config.model_dump(exclude={"api_key"})
            yaml.dump(config_dict, f, default_flow_style=False, sort_keys=False)
        # Continue to load API key for consistency
        config = default_config
    else:
        # Load and parse the existing config file
        with open(config_file, "r", encoding="utf-8") as f:
            config_data = yaml.safe_load(f)

        if config_data is None:
            raise ValueError(f"Configuration file at {config_file} is empty")

        # --- MIGRATION LOGIC for google -> gemini provider ---
        # This handles legacy config files that might still reference 'google'.
        if config_data and config_data.get("model_provider") == "google":
            logger.info("Migrating legacy 'google' provider to 'gemini' in config.")
            config_data["model_provider"] = "gemini"
        if config_data and config_data.get("active_provider") == "google":
            logger.info(
                "Migrating legacy 'google' active_provider to 'gemini' in config."
            )
            config_data["active_provider"] = "gemini"
        if config_data and "llm_providers" in config_data:
            if "google" in config_data["llm_providers"]:
                logger.info("Migrating legacy 'google' provider config to 'gemini'.")
                config_data["llm_providers"]["gemini"] = config_data[
                    "llm_providers"
                ].pop("google")
        # --- END MIGRATION LOGIC ---
        try:
            config = AppConfig(**config_data)
        except ValidationError as e:
            raise ValueError(
                f"Configuration file at {config_file} is invalid: {e}"
            ) from e

    # Load the API key for the selected provider
    load_api_key_for_provider(config)

    # Set environment variables for LiteLLM
    # pylint: disable=no-member
    for (
        _provider_name,
        provider_config,
    ) in config.llm_providers.model_dump().items():
        if "api_key_env" in provider_config:
            api_key = os.getenv(provider_config["api_key_env"])
            if api_key:
                # LiteLLM expects env vars like OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.
                os.environ[provider_config["api_key_env"]] = api_key

    return config


def initialize_settings() -> None:
    """
    Loads the config and initializes the global 'settings' object.
    This should be called once at application startup.
    """
    # pylint: disable=global-statement
    global settings
    try:
        settings = load_config()
    except Exception as e:
        logging.critical("Could not load configuration: %s", e)
        raise SystemExit(f"FATAL: Could not load configuration. {e}") from e


# --- Global Config Instance ---

settings: Optional[AppConfig] = None

if __name__ == "__main__":
    # Example of how to use the config
    print("Configuration loaded successfully!")
    print(f"Active Provider: {settings.active_provider}")
    print(f"Active Model: {settings.llm_model}")
    if settings.api_key:
        print("API Key for active provider: [loaded successfully]")
    else:
        print("API Key: Not required for this provider (e.g., Ollama)")

    print("\nFull config object:")
    print(settings.model_dump_json(indent=2, exclude={"api_key"}))
