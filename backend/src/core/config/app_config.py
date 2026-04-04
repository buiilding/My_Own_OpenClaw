"""
Application Configuration.

This module contains the default application configuration.
Edit this file to change application settings.

Note: Changes require application restart to take effect.
"""

from backend.src.core.config.models import (
    AppConfig,
    LLMProviders,
    SecurityLimits,
)

# Default application configuration
# Edit the values below to customize your configuration
APP_CONFIG = AppConfig(
    # LLM Settings
    model_mode="online",
    model_provider="openai",
    selected_model_id="gpt-5.4@@gpt-5-4-none-thinking",
    llm_timeout=300,
    query_timeout=600,
    debug_litellm=False,
    # Provider Configurations
    llm_providers=LLMProviders(),
    # Memory System Settings
    memory_enabled=True,
    embedding_model="all-MiniLM-L6-v2",
    # Agent Execution Settings
    interaction_mode="agent",
    history_compaction_enabled=True,
    history_compaction_manual_enabled=True,
    history_compaction_openai_remote_enabled=False,
    history_compaction_trigger_tokens=None,
    history_compaction_target_tokens=60000,
    history_compaction_keep_recent_user_messages=6,
    history_compaction_summary_max_tokens=1200,
    history_compaction_strategy="auto",
    history_compaction_prompt=None,
    history_compaction_cooldown_turns=1,
    # Vision Model Settings (UI grounding / Venus)
    vision_model_name="OpenGVLab/InternVL3_5-4B",
    # Voice Mode Settings
    voice_mode_enabled=False,
    wakeword_stt_enabled=False,
    agent_full_sudo_enabled=False,
    browser_automation_enabled=False,
    # Wakeword Settings
    wakeword_enabled=True,
    wakeword_phrase="hey jarvis",
    wakeword_greetings=[
        "Hello! I'm listening.",
        "Hi there! How can I help you?",
        "Yes? I'm here to assist.",
        "Good day! What can I do for you?",
        "Hello! Ready to help.",
    ],
    # TTS Settings
    tts_enabled=True,
    speech_provider="local",
    tts_model_path=None,
    speech_mode_enabled=False,
    elevenlabs_api_key_env="ELEVENLABS_API_KEY",
    elevenlabs_voice_id="EXAVITQu4vr4xnSDxMaL",
    elevenlabs_model_id="eleven_flash_v2_5",
    elevenlabs_output_format="pcm_16000",
    elevenlabs_chunk_length_schedule=[50, 80, 120, 160],
    # Security limits
    security_limits=SecurityLimits(),
    # WebSocket Settings
    websocket_max_message_size=10 * 1024 * 1024,  # 10MB
    websocket_max_concurrent_tasks=50,
    websocket_receive_timeout=3600.0,  # 1 hour
    websocket_task_cancellation_timeout=5.0,
)
