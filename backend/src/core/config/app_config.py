"""
Application Configuration.

This module contains the default application configuration.
Edit this file to change application settings.

Note: Changes require application restart to take effect.
"""

from backend.src.core.config.models import AppConfig, LLMProviders, SecurityLimits

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
    embedding_backend="vendor",
    embedding_model="text-embedding-3-small",
    embedding_api_key_env="OPENAI_API_KEY",
    embedding_remote_service_url=None,
    embedding_request_timeout_seconds=30.0,
    embedding_max_concurrent_requests=32,
    embedding_queue_timeout_seconds=5.0,
    # Agent Execution Settings
    interaction_mode="agent",
    history_compaction_enabled=True,
    history_compaction_manual_enabled=True,
    history_compaction_trigger_tokens=None,
    history_compaction_target_tokens=60000,
    history_compaction_keep_recent_user_messages=6,
    history_compaction_summary_max_tokens=1200,
    history_compaction_prompt=None,
    # Vision Model Settings (UI grounding / Venus)
    vision_backend="local",
    vision_model_name="OpenGVLab/InternVL3_5-4B",
    vision_remote_service_url=None,
    vision_remote_health_url=None,
    vision_request_timeout_seconds=30.0,
    vision_health_timeout_seconds=5.0,
    ocr_backend="local",
    ocr_model="rapidocr-ppocrv5-server",
    ocr_remote_service_url=None,
    ocr_remote_health_url=None,
    ocr_request_timeout_seconds=10.0,
    ocr_health_timeout_seconds=3.0,
    provider_circuit_breaker_failure_threshold=3,
    provider_circuit_breaker_cooldown_seconds=60.0,
    # Voice Mode Settings
    wakeword_stt_enabled=False,
    stt_provider="openai",
    stt_language="en",
    nova_voice_gateway_url="ws://127.0.0.1:5026",
    openai_realtime_transcription_model="gpt-4o-transcribe",
    stt_vad_threshold=0.5,
    stt_vad_prefix_padding_ms=300,
    stt_vad_silence_duration_ms=500,
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
    speech_provider="elevenlabs",
    tts_model_path=None,
    speech_mode_enabled=False,
    elevenlabs_api_key_env="ELEVENLABS_API_KEY",
    elevenlabs_voice_id="EXAVITQu4vr4xnSDxMaL",
    elevenlabs_model_id="eleven_flash_v2_5",
    elevenlabs_output_format="pcm_16000",
    elevenlabs_auto_mode=False,
    elevenlabs_inactivity_timeout=60,
    elevenlabs_chunk_length_schedule=[50, 80, 120, 160],
    # Security limits
    security_limits=SecurityLimits(),
    # WebSocket Settings
    websocket_max_message_size=10 * 1024 * 1024,  # 10MB
    websocket_max_concurrent_tasks=50,
    websocket_receive_timeout=3600.0,  # 1 hour
    websocket_task_cancellation_timeout=5.0,
    max_active_queries_per_user=4,
    max_active_queries_global=200,
    install_auth_enabled=True,
)
