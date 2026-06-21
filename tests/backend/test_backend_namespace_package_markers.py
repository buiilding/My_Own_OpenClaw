"""Covers backend namespace packages that intentionally have no marker file."""

import importlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BACKEND_SRC_ROOT = ROOT / "backend/src"

REMOVED_MARKERS = [
    "backend/__init__.py",
    "backend/src/__init__.py",
    "backend/src/agent/__init__.py",
    "backend/src/agent/compaction/__init__.py",
    "backend/src/agent/compaction/strategies/__init__.py",
    "backend/src/agent/execution/__init__.py",
    "backend/src/agent/history/__init__.py",
    "backend/src/agent/llm/__init__.py",
    "backend/src/agent/session/__init__.py",
    "backend/src/agent/tools/__init__.py",
    "backend/src/agent/tools/processing/__init__.py",
    "backend/src/agent/tools/preparation/__init__.py",
    "backend/src/agent/tools/preparation/coordinate_resolution/__init__.py",
    "backend/src/agent/tools/preparation/helpers/__init__.py",
    "backend/src/agent/tools/preparation/ocr/__init__.py",
    "backend/src/agent/tools/preparation/screenshot/__init__.py",
    "backend/src/agent/tools/preparation/storage/__init__.py",
    "backend/src/agent/tools/preparation/types/__init__.py",
    "backend/src/agent/tools/shared/__init__.py",
    "backend/src/agent/tools/sending/__init__.py",
    "backend/src/agent/tools/waiting/__init__.py",
    "backend/src/agent/tools/waiting/storage/__init__.py",
    "backend/src/api/__init__.py",
    "backend/src/api/auth/__init__.py",
    "backend/src/api/contracts/__init__.py",
    "backend/src/api/handlers/__init__.py",
    "backend/src/api/infrastructure/__init__.py",
    "backend/src/api/processing/__init__.py",
    "backend/src/api/processing/formatters/__init__.py",
    "backend/src/api/processing/tts/__init__.py",
    "backend/src/api/routes/memory/__init__.py",
    "backend/src/api/routes/memory/embeddings/__init__.py",
    "backend/src/api/routes/memory/semantic/__init__.py",
    "backend/src/api/routes/artifacts/__init__.py",
    "backend/src/api/routes/runs/__init__.py",
    "backend/src/api/routes/sdk/__init__.py",
    "backend/src/api/routes/transcription/__init__.py",
    "backend/src/api/routes/websocket/__init__.py",
    "backend/src/api/schemas/__init__.py",
    "backend/src/api/services/__init__.py",
    "backend/src/api/services/query_execution_support/__init__.py",
    "backend/src/api/services/transcription/__init__.py",
    "backend/src/api/transport/__init__.py",
    "backend/src/core/bootstrap/__init__.py",
    "backend/src/core/__init__.py",
    "backend/src/core/config/__init__.py",
    "backend/src/core/container/__init__.py",
    "backend/src/core/events/__init__.py",
    "backend/src/core/inference/__init__.py",
    "backend/src/core/infrastructure/__init__.py",
    "backend/src/core/infrastructure/error_types/__init__.py",
    "backend/src/core/interfaces/__init__.py",
    "backend/src/core/messages/__init__.py",
    "backend/src/core/observability/__init__.py",
    "backend/src/core/security/__init__.py",
    "backend/src/core/services/__init__.py",
    "backend/src/core/types/__init__.py",
    "backend/src/core/validation/__init__.py",
    "backend/src/embeddings/__init__.py",
    "backend/src/llm/__init__.py",
    "backend/src/llm/models/__init__.py",
    "backend/src/llm/providers/__init__.py",
    "backend/src/llm/prompts/__init__.py",
    "backend/src/sdk/__init__.py",
    "backend/src/services/artifacts/__init__.py",
    "backend/src/services/ocr/__init__.py",
    "backend/src/services/vision/__init__.py",
    "backend/src/services/vision/providers/__init__.py",
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
    "backend.src.agent.session.session",
    "backend.src.agent.tools.processing.coordinator",
    "backend.src.agent.tools.preparation.coordinate_resolution.resolvers",
    "backend.src.agent.tools.preparation.helpers.preparation_helper",
    "backend.src.agent.tools.preparation.ocr.coordinator",
    "backend.src.agent.tools.preparation.preparer",
    "backend.src.agent.tools.preparation.screenshot.manager",
    "backend.src.agent.tools.preparation.storage.resolved_call_storage",
    "backend.src.agent.tools.preparation.types.resolved_tool_call",
    "backend.src.agent.tools.shared.logging_utils",
    "backend.src.agent.tools.sending.sender",
    "backend.src.agent.tools.waiting.handler",
    "backend.src.agent.tools.waiting.storage.result_storage",
    "backend.src.api.auth.router",
    "backend.src.api.contracts.registry",
    "backend.src.api.handlers.query",
    "backend.src.api.infrastructure.handler",
    "backend.src.api.processing.formatters.base",
    "backend.src.api.processing.tts.manager",
    "backend.src.api.routes.memory.embeddings.router",
    "backend.src.api.routes.memory.health",
    "backend.src.api.routes.memory.semantic.router",
    "backend.src.api.routes.artifacts.router",
    "backend.src.api.routes.runs.router",
    "backend.src.api.routes.sdk.router",
    "backend.src.api.routes.transcription.router",
    "backend.src.api.routes.websocket.router",
    "backend.src.api.services.query_execution_support.query_execution_stream_state",
    "backend.src.api.services.transcription.factory",
    "backend.src.api.transport.protocol",
    "backend.src.core.bootstrap.coordinator",
    "backend.src.core.config.loader",
    "backend.src.core.config.manager",
    "backend.src.core.config.models",
    "backend.src.core.config.runtime",
    "backend.src.core.container.facade",
    "backend.src.core.events.bus_events",
    "backend.src.core.events.streaming_events",
    "backend.src.core.inference.embedding_router",
    "backend.src.core.infrastructure.bus",
    "backend.src.core.logging_setup",
    "backend.src.core.interfaces.tool",
    "backend.src.core.messages.structures",
    "backend.src.core.observability.trust_boundary_metrics",
    "backend.src.core.services.speech_service",
    "backend.src.core.types.enums",
    "backend.src.core.validation.settings_update_rules",
    "backend.src.embeddings.openai_provider",
    "backend.src.llm.client",
    "backend.src.llm.models.model_service",
    "backend.src.llm.providers.factory",
    "backend.src.llm.prompts.prompt_metadata",
    "backend.src.llm.prompts.prompts",
    "backend.src.llm.prompts.repo_instructions",
    "backend.src.sdk.tool",
    "backend.src.services.artifacts.store",
    "backend.src.services.ocr.ocr_service",
    "backend.src.services.vision.providers.base",
    "backend.src.services.vision.vision_service",
    "backend.src.services.vm_run_control_support.vm_run_control_helpers",
    "backend.src.tools.browser.shared_contract_loader",
    "backend.src.tools.remote_tools.base",
    "backend.src.tools.web_search.tool",
]

REMOVED_MODULE_FACADES = [
    "backend/src/sdk/agents/response_extractor.py",
    "backend/src/core/config/domains.py",
    "backend/src/core/infrastructure/error_types/configuration.py",
    "backend/src/core/infrastructure/error_types/memory.py",
    "backend/src/core/infrastructure/error_types/session.py",
    "backend/src/core/infrastructure/error_types/tooling.py",
    "backend/src/core/infrastructure/cache.py",
    "backend/src/core/security/executor.py",
    "backend/src/tools/browser/schemas.py",
    "backend/src/tools/remote.py",
]

LIVE_PACKAGE_ENTRYPOINTS = {
    "backend/src/api/routes/__init__.py",
}


def test_marker_only_backend_package_files_are_removed():
    for marker in REMOVED_MARKERS:
        assert not (ROOT / marker).exists()


def test_route_registration_is_the_only_backend_package_entrypoint():
    package_entrypoints = {
        path.relative_to(ROOT).as_posix()
        for path in BACKEND_SRC_ROOT.rglob("__init__.py")
    }

    assert package_entrypoints == LIVE_PACKAGE_ENTRYPOINTS


def test_namespace_packages_still_import_concrete_modules():
    for module_name in CONCRETE_MODULES:
        assert importlib.import_module(module_name).__name__ == module_name


def test_backend_module_facades_are_removed():
    for module_path in REMOVED_MODULE_FACADES:
        assert not (ROOT / module_path).exists()
