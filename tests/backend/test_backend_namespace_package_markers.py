"""Covers backend namespace packages that intentionally have no marker file."""

from pathlib import Path
import importlib


ROOT = Path(__file__).resolve().parents[2]

REMOVED_MARKERS = [
    "backend/__init__.py",
    "backend/src/__init__.py",
    "backend/src/agent/__init__.py",
    "backend/src/agent/compaction/__init__.py",
    "backend/src/agent/compaction/strategies/__init__.py",
    "backend/src/agent/execution/__init__.py",
    "backend/src/agent/history/__init__.py",
    "backend/src/agent/llm/__init__.py",
    "backend/src/agent/tools/__init__.py",
    "backend/src/agent/tools/preparation/storage/__init__.py",
    "backend/src/agent/tools/shared/__init__.py",
    "backend/src/agent/tools/waiting/storage/__init__.py",
    "backend/src/api/__init__.py",
    "backend/src/api/auth/__init__.py",
    "backend/src/api/contracts/__init__.py",
    "backend/src/api/infrastructure/__init__.py",
    "backend/src/api/processing/formatters/__init__.py",
    "backend/src/api/processing/tts/__init__.py",
    "backend/src/api/services/__init__.py",
    "backend/src/api/services/query_execution_support/__init__.py",
    "backend/src/api/services/transcription/__init__.py",
    "backend/src/api/transport/__init__.py",
    "backend/src/core/bootstrap/__init__.py",
    "backend/src/core/__init__.py",
    "backend/src/core/interfaces/__init__.py",
    "backend/src/core/messages/__init__.py",
    "backend/src/core/observability/__init__.py",
    "backend/src/core/services/__init__.py",
    "backend/src/core/validation/__init__.py",
    "backend/src/services/vm_run_control_support/__init__.py",
    "backend/src/tools/__init__.py",
    "backend/src/tools/browser/__init__.py",
    "backend/src/tools/remote_tools/__init__.py",
    "backend/src/tools/web_search/__init__.py",
]

CONCRETE_MODULES = [
    "backend.src.agent.compaction.models",
    "backend.src.agent.compaction.strategies.base",
    "backend.src.agent.execution.tool_call_bridge",
    "backend.src.agent.history.history_admission",
    "backend.src.agent.llm.conversation_context",
    "backend.src.agent.tools.preparation.storage.resolved_call_storage",
    "backend.src.agent.tools.shared.logging_utils",
    "backend.src.agent.tools.waiting.storage.result_storage",
    "backend.src.api.auth.router",
    "backend.src.api.contracts.registry",
    "backend.src.api.infrastructure.handler",
    "backend.src.api.processing.formatters.base",
    "backend.src.api.processing.tts.manager",
    "backend.src.api.services.query_execution_support.query_execution_stream_state",
    "backend.src.api.services.transcription.factory",
    "backend.src.api.transport.protocol",
    "backend.src.core.bootstrap.coordinator",
    "backend.src.core.logging_setup",
    "backend.src.core.interfaces.tool",
    "backend.src.core.messages.structures",
    "backend.src.core.observability.trust_boundary_metrics",
    "backend.src.core.services.speech_service",
    "backend.src.core.validation.settings_update_rules",
    "backend.src.services.vm_run_control_support.vm_run_control_helpers",
    "backend.src.tools.browser.schemas",
    "backend.src.tools.remote_tools.base",
    "backend.src.tools.web_search.tool",
]


def test_marker_only_backend_package_files_are_removed():
    for marker in REMOVED_MARKERS:
        assert not (ROOT / marker).exists()


def test_namespace_packages_still_import_concrete_modules():
    for module_name in CONCRETE_MODULES:
        assert importlib.import_module(module_name).__name__ == module_name
