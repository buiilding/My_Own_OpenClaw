"""Configuration management for the Desktop Assistant.

Handles loading, validation, and providing access to application settings
from a YAML file, environment variables, and secure credential stores.
"""

import os
from pathlib import Path
from typing import Dict, Literal, Optional

import yaml
from pydantic import BaseModel, Field, ValidationError

# --- Constants ---
APP_NAME = "DesktopAssistant"
CONFIG_FILE_NAME = "config.yaml"

# --- Helper Functions ---


def get_config_dir() -> Path:
    """Gets the application's configuration directory based on OS."""
    if os.name == "nt":  # Windows
        return Path(os.getenv("APPDATA", "")) / APP_NAME
    # TODO: Add paths for macOS and Linux
    return Path.home() / f".config/{APP_NAME}"


# --- Pydantic Models for Validation ---


class OpenAIConfig(BaseModel):
    """Configuration for OpenAI provider."""

    model: str = "gpt-4-turbo"
    api_key_env: str = "OPENAI_API_KEY"


class AnthropicConfig(BaseModel):
    """Configuration for Anthropic provider."""

    model: str = "claude-3-5-sonnet-20240620"
    api_key_env: str = "ANTHROPIC_API_KEY"


class GoogleConfig(BaseModel):
    """Configuration for Google provider."""

    model: str = "gemini-1.5-pro"
    api_key_env: str = "GOOGLE_API_KEY"


class OllamaConfig(BaseModel):
    """Configuration for Ollama (local) provider."""

    model: str = "llama3"
    base_url: str = "http://localhost:11434"


class LLMProviders(BaseModel):
    """Container for all supported LLM provider configurations."""

    openai: OpenAIConfig = Field(default_factory=OpenAIConfig)
    anthropic: AnthropicConfig = Field(default_factory=AnthropicConfig)
    google: GoogleConfig = Field(default_factory=GoogleConfig)
    ollama: OllamaConfig = Field(default_factory=OllamaConfig)


class Preferences(BaseModel):
    """User-specific preferences."""

    theme: str = "dark"
    user_name: str = "User"


class AppConfig(BaseModel):
    """Root model for the application configuration."""

    active_provider: Literal["openai", "anthropic", "google", "ollama"] = "openai"
    preferences: Preferences = Field(default_factory=Preferences)
    llm_providers: LLMProviders = Field(default_factory=LLMProviders)

    # This field will hold the actual API key after it's loaded
    api_key: Optional[str] = None


# --- Main Configuration Loading Logic ---


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
            config_dict = default_config.dict(exclude={"api_key"})
            yaml.dump(config_dict, f, default_flow_style=False, sort_keys=False)
        return default_config

    # Load and parse the existing config file
    with open(config_file, "r", encoding="utf-8") as f:
        config_data = yaml.safe_load(f)

    try:
        config = AppConfig(**config_data)
    except ValidationError as e:
        raise ValueError(f"Configuration file at {config_file} is invalid: {e}") from e

    # Load the API key for the active provider
    active_provider_name = config.active_provider
    active_provider_config = getattr(config.llm_providers, active_provider_name)

    if hasattr(active_provider_config, "api_key_env"):
        api_key_env_var = active_provider_config.api_key_env
        api_key = os.getenv(api_key_env_var)
        if not api_key:
            raise ValueError(
                f"API key environment variable '{api_key_env_var}' for active "
                f"provider '{active_provider_name}' is not set."
            )
        config.api_key = api_key

    return config


# --- Global Config Instance ---

# Load the config once on startup
try:
    settings = load_config()
except (ValueError, FileNotFoundError) as e:
    # Handle critical config errors on startup
    print(f"FATAL: Could not load configuration. {e}")
    # In a real app, you might show a dialog or exit gracefully.
    # For now, we create a default config to allow the app to run.
    settings = AppConfig()

if __name__ == "__main__":
    # Example of how to use the config
    print("Configuration loaded successfully!")
    print(f"Active Provider: {settings.active_provider}")
    print(
        f"Active Model: {getattr(settings.llm_providers, settings.active_provider).model}"
    )
    if settings.api_key:
        print("API Key: [loaded successfully]")
    else:
        print("API Key: Not required for this provider (e.g., Ollama)")

    print("\nFull config object:")
    print(settings.json(indent=2))
