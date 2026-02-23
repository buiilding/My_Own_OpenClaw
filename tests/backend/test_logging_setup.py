"""Tests for backend logging profile configuration."""

import logging

from backend.src.core.logging_setup import _IMPORTANT_PROFILE_LOGGERS


def test_important_profile_keeps_llm_stream_processor_cache_logs_visible() -> None:
    """Important profile should still expose cache diagnostics from stream processor."""
    assert _IMPORTANT_PROFILE_LOGGERS["backend.src.agent.llm"] == logging.WARNING
    assert (
        _IMPORTANT_PROFILE_LOGGERS["backend.src.agent.llm.llm_stream_processor"]
        == logging.INFO
    )
