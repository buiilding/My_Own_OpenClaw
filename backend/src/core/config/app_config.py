"""
Application Configuration.

This module contains the default application configuration.
Edit this file to change application settings.

Note: Changes require application restart to take effect.
"""
import os
from pathlib import Path

from backend.src.core.config.models import AppConfig, LLMProviders, OCRConfig, SecurityLimits

# Default TTS model path
def _get_default_tts_model_path() -> str:
    """Get default TTS model path based on OS."""
    if os.name == "nt":  # Windows
        appdata = os.getenv("APPDATA")
        if appdata:
            return str(Path(appdata) / "DesktopAssistant" / "tts_models" / "piper" / "en_GB-jenny_dioco-medium.onnx")
    elif os.name == "posix":
        home_dir = Path.home()
        import platform
        if platform.system() == "Darwin":  # macOS
            return str(home_dir / "Library" / "Application Support" / "DesktopAssistant" / "tts_models" / "piper" / "en_GB-jenny_dioco-medium.onnx")
        else:  # Linux
            return str(home_dir / ".config" / "DesktopAssistant" / "tts_models" / "piper" / "en_GB-jenny_dioco-medium.onnx")
    # Fallback
    return str(Path.home() / ".config" / "DesktopAssistant" / "tts_models" / "piper" / "en_GB-jenny_dioco-medium.onnx")


# Default application configuration
# Edit the values below to customize your configuration
APP_CONFIG = AppConfig(
    # LLM Settings
    model_mode="online",
    model_provider="openai",
    selected_model_id="gpt-4o",
    llm_timeout=300,
    query_timeout=600,
    debug_litellm=False,
    
    # Provider Configurations
    llm_providers=LLMProviders(),
    
    # Memory System Settings
    memory_enabled=True,
    embedding_model="all-MiniLM-L6-v2",
    
    # Agent Execution Settings
    max_history_length=1000,
    max_agent_iterations=1000,
    
    # Vision Model Settings
    vision_model_name="OpenGVLab/InternVL3_5-2B",
    
    # Voice Mode Settings
    voice_mode_enabled=False,
    
    # Wakeword Settings
    wakeword_enabled=True,
    wakeword_phrase="hey jarvis",
    wakeword_greetings=[
        "Hello! I'm listening.",
        "Hi there! How can I help you?",
        "Yes? I'm here to assist.",
        "Good day! What can I do for you?",
        "Hello! Ready to help."
    ],
    
    # TTS Settings
    tts_enabled=True,
    tts_model_path=_get_default_tts_model_path(),
    speech_mode_enabled=False,
    
    # Security limits
    security_limits=SecurityLimits(),
    
    # OCR configuration
    ocr_config=OCRConfig(),
    
    # WebSocket Settings
    websocket_max_message_size=10 * 1024 * 1024,  # 10MB
    websocket_max_concurrent_tasks=50,
    websocket_receive_timeout=3600.0,  # 1 hour
    websocket_task_cancellation_timeout=5.0,
)
