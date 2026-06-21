---
summary: "Deep reference for backend namespace-package boundaries and the no package-level compatibility facade rule for `backend/src/**` modules."
read_when:
  - When adding/removing backend package marker files or changing concrete owner-module import paths.
  - When debugging import-path breakages after backend refactors or package moves.
title: "Backend Package `__init__` Exports and Public Import Surface Reference"
---

# Backend Package `__init__` Exports and Public Import Surface Reference

This page documents backend package entrypoint surfaces and the rule that
backend packages should not publish compatibility import facades. Empty
marker-only `__init__.py` files are not kept; namespace packages are used for
package directories whose callers import concrete modules directly.

## Import-Surface Contract

Backend package `__init__.py` files should not expose curated import surfaces
or marker-only package files. Callers should import concrete owner modules so
implementation boundaries remain visible.

## High-Value Export Aggregators

There are no backend package `__init__.py` compatibility export aggregators.
The only live package entrypoint is
`backend/src/api/routes/__init__.py`, where `API_ROUTERS` is the
FastAPI app assembly contract for route registration.

## Minimal/Marker Entrypoints

Marker-only files are intentionally absent for package directories whose
callers import concrete modules directly, including `backend.src.agent`,
`backend.src.api.services`, `backend.src.core`, `backend.src.tools`, and their
non-exporting subpackages. Do not add a package `__init__.py` only for a
docstring or compatibility path.

- `backend/src/core/interfaces/__init__.py` is intentionally absent; import
  interface contracts from concrete modules such as
  `backend.src.core.interfaces.tool` or
  `backend.src.core.interfaces.embedding`.
- `backend/src/core/observability/__init__.py` is intentionally absent; import
  metrics contracts from `backend.src.core.observability.trust_boundary_metrics`.
- `backend/src/core/security/__init__.py` is intentionally absent; import
  security policy primitives from `backend.src.core.security.policy`.
- `backend/src/core/services/__init__.py` is intentionally absent; import core
  services from concrete modules such as
  `backend.src.core.services.context_factory` or
  `backend.src.core.services.speech_service`.
- `backend/src/core/types/__init__.py` is intentionally absent; import core
  enums and typed schemas from `backend.src.core.types.enums` and
  `backend.src.core.types.schemas`.
- `backend/src/core/validation/__init__.py` is intentionally absent; import
  validation helpers from `backend.src.core.validation.validators` or
  `backend.src.core.validation.settings_update_rules`.
- `backend/src/core/messages/__init__.py` is intentionally absent; import
  message structures and converters from `backend.src.core.messages.structures`
  and `backend.src.core.messages.converters`.
- `backend/src/agent/tools/preparation/storage/__init__.py` is intentionally
  absent; import resolved-call storage from
  `backend.src.agent.tools.preparation.storage.resolved_call_storage`.
- `backend/src/agent/tools/waiting/storage/__init__.py` is intentionally
  absent; import tool-result storage from
  `backend.src.agent.tools.waiting.storage.result_storage`.
- `backend/src/agent/tools/sending/__init__.py` is intentionally absent; import
  `ToolSender` from `backend.src.agent.tools.sending.sender`.
- `backend/src/agent/tools/waiting/__init__.py` is intentionally absent; import
  tool-result waiting components from concrete modules such as
  `backend.src.agent.tools.waiting.handler`,
  `backend.src.agent.tools.waiting.receiver`, and
  `backend.src.agent.tools.waiting.router`.
- `backend/src/agent/tools/processing/__init__.py` is intentionally absent;
  import tool-result processing components from concrete modules such as
  `backend.src.agent.tools.processing.coordinator`,
  `backend.src.agent.tools.processing.processor`,
  `backend.src.agent.tools.processing.synthetic_factory`, and
  `backend.src.agent.tools.processing.transformer`.
- `backend/src/agent/tools/preparation/__init__.py` is intentionally absent;
  import `ToolPreparer` from
  `backend.src.agent.tools.preparation.preparer`.
- `backend/src/agent/tools/preparation/coordinate_resolution/__init__.py` is
  intentionally absent; import coordinate resolvers from
  `backend.src.agent.tools.preparation.coordinate_resolution.resolvers`.
- `backend/src/agent/tools/preparation/helpers/__init__.py` is intentionally
  absent; import preparation helpers from their concrete helper modules under
  `backend.src.agent.tools.preparation.helpers`.
- `backend/src/agent/tools/preparation/ocr/__init__.py` is intentionally
  absent; import `OcrCoordinator` from
  `backend.src.agent.tools.preparation.ocr.coordinator`.
- `backend/src/agent/tools/preparation/screenshot/__init__.py` is intentionally
  absent; import screenshot manager, processor, and state components from
  concrete modules under `backend.src.agent.tools.preparation.screenshot`.
- `backend/src/agent/tools/preparation/types/__init__.py` is intentionally
  absent; import `ExecutionRef` and `ResolvedToolCall` from their concrete
  modules under `backend.src.agent.tools.preparation.types`.
- `backend/src/agent/session/__init__.py` is intentionally absent; import
  session runtime classes from concrete modules such as
  `backend.src.agent.session.session`, `backend.src.agent.session.manager`, and
  `backend.src.agent.session.state`.
- `backend/src/api/auth/__init__.py` is intentionally absent; import install
  auth routes/services from concrete modules such as
  `backend.src.api.auth.router` and `backend.src.api.auth.service`.
- `backend/src/api/handlers/__init__.py` is intentionally absent; import
  websocket handlers from their concrete modules under
  `backend.src.api.handlers`.
- `backend/src/api/infrastructure/__init__.py` is intentionally absent; import
  handler, registry, and error helpers from concrete modules under
  `backend.src.api.infrastructure`.
- `backend/src/api/transport/__init__.py` is intentionally absent; import
  websocket transport protocols, senders, envelopes, and safe-websocket helpers
  from concrete modules under `backend.src.api.transport`.
- `backend/src/core/bootstrap/__init__.py` is intentionally absent; import
  startup coordinators and entrypoints from concrete modules under
  `backend.src.core.bootstrap`.
- `backend/src/core/infrastructure/__init__.py` is intentionally absent; import
  infrastructure primitives from concrete modules such as
  `backend.src.core.infrastructure.bus`,
  `backend.src.core.infrastructure.cache_store`,
  `backend.src.core.infrastructure.cache_manager`, and
  `backend.src.core.infrastructure.error_types.base`.
- `backend/src/core/infrastructure/error_types/__init__.py` is intentionally
  absent; import exception classes from concrete domain modules such as
  `backend.src.core.infrastructure.error_types.llm` or
  `backend.src.core.infrastructure.error_types.trust_boundary`.
- `backend/src/core/container/__init__.py` is intentionally absent; import the
  runtime `Container` from `backend.src.core.container.facade` and concrete DI
  containers from their owner modules under `backend.src.core.container`.
- `backend/src/core/config/__init__.py` is intentionally absent; import config
  models from `backend.src.core.config.models`, managers from
  `backend.src.core.config.manager`, loaders from
  `backend.src.core.config.loader`, runtime policy helpers from
  `backend.src.core.config.runtime`, and checked-in defaults from
  `backend.src.core.config.app_config`.
- `backend/src/core/events/__init__.py` is intentionally absent; import bus
  events from `backend.src.core.events.bus_events`, streaming events from
  `backend.src.core.events.streaming_events`, and the base event class from
  `backend.src.core.events.base`.
- `backend/src/api/processing/tts/__init__.py` is intentionally absent; import
  TTS manager and processor types from
  `backend.src.api.processing.tts.manager` and
  `backend.src.api.processing.tts.processor`.
- `backend/src/api/processing/formatters/__init__.py` is intentionally absent;
  import formatter classes from their concrete modules under
  `backend.src.api.processing.formatters`.
- `backend/src/api/processing/__init__.py` is intentionally absent; import
  `StreamPipeline` from `backend.src.api.processing.pipeline` and
  `ResponseFormatter` from `backend.src.api.processing.formatter`.
- `backend/src/api/routes/artifacts/__init__.py` is intentionally absent;
  route registration imports `router` from
  `backend.src.api.routes.artifacts.router`.
- `backend/src/api/routes/runs/__init__.py` is intentionally absent; route
  registration imports `router` from `backend.src.api.routes.runs.router`.
- `backend/src/api/routes/transcription/__init__.py` is intentionally absent;
  route registration imports `router` from
  `backend.src.api.routes.transcription.router`.
- `backend/src/api/routes/memory/__init__.py` is intentionally absent; import
  memory health helpers from `backend.src.api.routes.memory.health` and route
  routers from concrete memory route modules.
- `backend/src/api/routes/memory/embeddings/__init__.py` is intentionally
  absent; route registration imports `router` from
  `backend.src.api.routes.memory.embeddings.router`.
- `backend/src/api/routes/memory/semantic/__init__.py` is intentionally
  absent; route registration imports `router` from
  `backend.src.api.routes.memory.semantic.router`.
- `backend/src/api/routes/sdk/__init__.py` is intentionally absent; route
  registration imports `router` from `backend.src.api.routes.sdk.router`.
- `backend/src/api/routes/websocket/__init__.py` is intentionally absent;
  route registration imports `router` from
  `backend.src.api.routes.websocket.router`.
- `backend/src/services/artifacts/__init__.py` is intentionally absent;
  import `ArtifactStore` and `ArtifactMeta` from
  `backend.src.services.artifacts.store`.
- `backend/src/services/ocr/__init__.py` is intentionally absent; import OCR
  service and providers from `backend.src.services.ocr.ocr_service`,
  `backend.src.services.ocr.provider`, and
  `backend.src.services.ocr.remote_provider`.
- `backend/src/core/inference/__init__.py` is intentionally absent; import
  inference routers and errors from concrete modules such as
  `backend.src.core.inference.embedding_router`,
  `backend.src.core.inference.ocr_router`,
  `backend.src.core.inference.vision_router`, and
  `backend.src.core.inference.errors`.
- `backend/src/embeddings/__init__.py` is intentionally absent; import
  embedding providers from concrete modules such as
  `backend.src.embeddings.openai_provider`,
  `backend.src.embeddings.remote_provider`, and
  `backend.src.embeddings.limited_provider`.
- `backend/src/services/vision/__init__.py` is intentionally absent; import
  vision service, providers, coordinates, and utilities from concrete modules
  under `backend.src.services.vision`.
- `backend/src/services/vision/providers/__init__.py` is intentionally absent;
  import vision provider base/classes from concrete modules under
  `backend.src.services.vision.providers`.
- `backend/src/llm/__init__.py` is intentionally absent; import LLM client
  helpers from `backend.src.llm.client`.
- `backend/src/llm/models/__init__.py` is intentionally absent; import
  `ModelService` from `backend.src.llm.models.model_service` and model catalog
  constants from `backend.src.llm.models.models_config`.
- `backend/src/llm/providers/__init__.py` is intentionally absent; import
  provider factory helpers from `backend.src.llm.providers.factory` and provider
  implementations from their concrete modules.
- `backend/src/llm/prompts/__init__.py` is intentionally absent; import
  prompt construction from `backend.src.llm.prompts.prompt_constructor`,
  metadata dataclasses from `backend.src.llm.prompts.prompt_metadata`, prompt
  manager helpers from `backend.src.llm.prompts.prompts`, and repo instruction
  helpers from `backend.src.llm.prompts.repo_instructions`.
- `backend/src/sdk/__init__.py` is intentionally absent; import backend SDK
  tool/context types from concrete modules such as `backend.src.sdk.tool` and
  `backend.src.sdk.context`.

Remaining `__init__.py` files matter only when they publish a live import
contract or route-registration surface. Focused backend tests assert that the
route-registration package is the only live backend source entrypoint, so new
package markers or facades must be added deliberately with matching docs.

## `__all__` Governance

Backend packages should not add `__all__` export aggregators. If a package
entrypoint appears necessary, prefer documenting the concrete owner module or
creating a focused owner module with tests instead of reintroducing a
compatibility facade.

Concrete backend modules should also avoid `__all__` wildcard export lists.
Callers import the needed symbols directly from the owner module. The current
exception is the route-registration surface in `backend/src/api/routes/__init__.py`,
where `API_ROUTERS` is the app assembly contract rather than a compatibility
re-export.

## Refactor Safety Checklist

When moving a class/function between modules:

1. prefer direct imports from the owning module
2. update package `__init__.py` exports only when that package still has a
   live public import contract
3. keep `__all__` synchronized with actual imports where a package export
   remains
4. run tests that import package-level symbols
5. update docs that reference package-level import paths

## Related Docs

- [Backend Source Maps Docs Hub](README.md)
- [Backend API/Core Folder Topology and Data-Flow Source Map Reference](api_core_folder_topology_and_data_flow_source_map_reference.md)
- [Backend Functionality Map](../README.md)
