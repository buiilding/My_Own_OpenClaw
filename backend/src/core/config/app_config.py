"""
Application Configuration.

This module contains the default application configuration.
Edit this file to change application settings.

Note: Changes require application restart to take effect.
"""
from backend.src.core.config.models import AppConfig, LLMProviders, OCRConfig, SecurityLimits
from backend.src.core.config.loader import get_default_tts_model_path


# Default application configuration
# Edit the values below to customize your configuration
APP_CONFIG = AppConfig(
    # LLM Settings
    model_mode="online",
    model_provider="openai",
    selected_model_id="gpt-5.1",
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
    
    # Vision Model Settings (UI grounding / Venus)
    vision_model_name="inclusionAI/UI-Venus-Ground-7B",
    
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
    tts_model_path=get_default_tts_model_path(),
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
