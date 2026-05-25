"""Tests for backend logging profile configuration."""

import logging
import types

from backend.src.core.logging_setup import (
    _IMPORTANT_PROFILE_LOGGERS,
    _configure_litellm_runtime_flags,
    configure_logging,
)


def test_important_profile_keeps_llm_stream_processor_cache_logs_visible() -> None:
    """Important profile should still expose cache diagnostics from stream processor."""
    assert _IMPORTANT_PROFILE_LOGGERS["backend.src.agent.llm"] == logging.WARNING
    assert (
        _IMPORTANT_PROFILE_LOGGERS["backend.src.agent.llm.llm_stream_processor"]
        == logging.INFO
    )


def test_configure_logging_applies_profile_level_with_existing_root_handler(
    monkeypatch,
) -> None:
    root_logger = logging.getLogger()
    existing_handlers = list(root_logger.handlers)
    existing_level = root_logger.level
    handler = logging.NullHandler()
    root_logger.handlers[:] = [handler]
    root_logger.setLevel(logging.WARNING)
    monkeypatch.delenv("LOG_LEVEL", raising=False)

    try:
        configure_logging(profile="verbose")

        assert root_logger.level == logging.DEBUG
        assert root_logger.handlers == [handler]
    finally:
        root_logger.handlers[:] = existing_handlers
        root_logger.setLevel(existing_level)


def test_configure_litellm_runtime_flags_suppresses_debug_info_by_default(
    monkeypatch,
) -> None:
    fake_litellm = types.SimpleNamespace(
        suppress_debug_info=False,
        set_verbose=True,
    )
    monkeypatch.setitem(__import__("sys").modules, "litellm", fake_litellm)
    monkeypatch.delenv("WINDIEOS_LITELLM_SUPPRESS_DEBUG_INFO", raising=False)

    _configure_litellm_runtime_flags()

    assert fake_litellm.suppress_debug_info is True
    assert fake_litellm.set_verbose is False


def test_configure_litellm_runtime_flags_respects_disable_env(monkeypatch) -> None:
    fake_litellm = types.SimpleNamespace(
        suppress_debug_info=True,
        set_verbose=True,
    )
    monkeypatch.setitem(__import__("sys").modules, "litellm", fake_litellm)
    monkeypatch.setenv("WINDIEOS_LITELLM_SUPPRESS_DEBUG_INFO", "0")

    _configure_litellm_runtime_flags()

    assert fake_litellm.suppress_debug_info is False
    assert fake_litellm.set_verbose is False
