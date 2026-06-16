"""Subsystem-owned views over the flat AppConfig model."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from backend.src.core.config.models import AppConfig, SecurityLimits


@dataclass(frozen=True, slots=True)
class ProviderModelConfigView:
    model_mode: str
    model_provider: str
    selected_model_id: str
    llm_timeout: int
    debug_litellm: bool


@dataclass(frozen=True, slots=True)
class SessionRuntimeConfigView:
    query_timeout: int
    interaction_mode: str
    history_compaction_enabled: bool
    history_compaction_manual_enabled: bool
    history_compaction_trigger_tokens: Optional[int]
    history_compaction_target_tokens: int
    history_compaction_keep_recent_user_messages: int
    history_compaction_summary_max_tokens: int
    history_compaction_prompt: Optional[str]
    include_query_screenshot: bool


@dataclass(frozen=True, slots=True)
class BrowserRuntimeConfigView:
    browser_automation_enabled: bool
    include_query_screenshot: bool


@dataclass(frozen=True, slots=True)
class MemoryConfigView:
    memory_enabled: bool
    embedding_backend: str
    embedding_model: str
    ocr_backend: str
    ocr_model: str
    ocr_remote_service_url: Optional[str]
    ocr_request_timeout_seconds: float
    vision_backend: str
    vision_model_name: Optional[str]
    vision_remote_service_url: Optional[str]
    vision_request_timeout_seconds: float


@dataclass(frozen=True, slots=True)
class SecurityTransportConfigView:
    security_limits: SecurityLimits
    websocket_max_message_size: int
    websocket_max_concurrent_tasks: int
    websocket_receive_timeout: float
    websocket_task_cancellation_timeout: float
    artifact_store_path: str
    artifact_max_bytes: int


def provider_model_config(config: AppConfig) -> ProviderModelConfigView:
    return ProviderModelConfigView(
        model_mode=config.model_mode,
        model_provider=config.model_provider,
        selected_model_id=config.selected_model_id,
        llm_timeout=config.llm_timeout,
        debug_litellm=config.debug_litellm,
    )


def session_runtime_config(config: AppConfig) -> SessionRuntimeConfigView:
    return SessionRuntimeConfigView(
        query_timeout=config.query_timeout,
        interaction_mode=config.interaction_mode,
        history_compaction_enabled=config.history_compaction_enabled,
        history_compaction_manual_enabled=config.history_compaction_manual_enabled,
        history_compaction_trigger_tokens=config.history_compaction_trigger_tokens,
        history_compaction_target_tokens=config.history_compaction_target_tokens,
        history_compaction_keep_recent_user_messages=config.history_compaction_keep_recent_user_messages,
        history_compaction_summary_max_tokens=config.history_compaction_summary_max_tokens,
        history_compaction_prompt=config.history_compaction_prompt,
        include_query_screenshot=config.include_query_screenshot,
    )


def browser_runtime_config(config: AppConfig) -> BrowserRuntimeConfigView:
    return BrowserRuntimeConfigView(
        browser_automation_enabled=config.browser_automation_enabled,
        include_query_screenshot=config.include_query_screenshot,
    )


def memory_config(config: AppConfig) -> MemoryConfigView:
    return MemoryConfigView(
        memory_enabled=config.memory_enabled,
        embedding_backend=config.embedding_backend,
        embedding_model=config.embedding_model,
        ocr_backend=config.ocr_backend,
        ocr_model=config.ocr_model,
        ocr_remote_service_url=config.ocr_remote_service_url,
        ocr_request_timeout_seconds=config.ocr_request_timeout_seconds,
        vision_backend=config.vision_backend,
        vision_model_name=config.vision_model_name,
        vision_remote_service_url=config.vision_remote_service_url,
        vision_request_timeout_seconds=config.vision_request_timeout_seconds,
    )


def security_transport_config(config: AppConfig) -> SecurityTransportConfigView:
    return SecurityTransportConfigView(
        security_limits=config.security_limits,
        websocket_max_message_size=config.websocket_max_message_size,
        websocket_max_concurrent_tasks=config.websocket_max_concurrent_tasks,
        websocket_receive_timeout=config.websocket_receive_timeout,
        websocket_task_cancellation_timeout=config.websocket_task_cancellation_timeout,
        artifact_store_path=config.artifact_store_path,
        artifact_max_bytes=config.artifact_max_bytes,
    )
