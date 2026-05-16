---
summary: "Backend services/runtime storage map covering artifacts, OCR, vision grounding, token counting, and VM run-control state handling."
read_when:
  - When changing `backend/src/services/*` ownership boundaries or startup initialization behavior.
  - When debugging artifact persistence, OCR/vision runtime fallback paths, token counting mismatches, or VM run-control state transitions.
title: "Services and Storage"
---

# Services and Storage

## Canonical Modules

- `backend/src/services/artifacts/store.py`
- `backend/src/services/ocr/ocr_service.py`
- `backend/src/services/vision/vision_service.py`
- `backend/src/services/vision/coordinates.py`
- `backend/src/services/vision/providers/*`
- `backend/src/services/token_service.py`
- `backend/src/services/vm_run_control.py`
- `backend/src/core/container/{core_container,initializer,factories}.py`

## Service Domain Map

### Artifact storage (`ArtifactStore`)

Responsibilities:

- disk-backed upload storage with strict content-type allowlist (`image/png`, `image/jpeg`)
- artifact id validation (`<uuid>.<png|jpg|jpeg>`)
- max-bytes enforcement from `AppConfig.artifact_max_bytes`

Storage characteristics:

- local filesystem path from `AppConfig.artifact_store_path`
- retrieval supports binary route download and base64 load path

### OCR runtime (`OcrService`)

Responsibilities:

- RapidOCR engine lifecycle with CUDA-first startup and CPU fallback
- screenshot decode and OCR result normalization (`text`, `confidence`, `bbox` variants)
- lazy engine initialization guard for first OCR call when startup init was skipped

Runtime tuning:

- WindieOS pins RapidOCR to a quality-first ONNX Runtime PP-OCRv5 server profile for detection and recognition
- detection/recognition language settings use RapidOCR enum values when available so current library builds accept the startup params without type errors
- startup and runtime still prefer CUDA first, then fall back to CPU on OCR engine errors

### Vision grounding runtime (`VisionService` + providers)

Responsibilities:

- singleton vision model lifecycle (initialize/unload under async lock)
- model-family selection (`InternVLModel` vs `VenusVisionModel`) by configured model name
- coordinate extraction/scaling from model text output through `coordinates.py`

Runtime behaviors:

- model load in executor to avoid blocking event loop
- unload path forces GC and CUDA cache cleanup
- provider helpers include chat/generate fallback strategy and flash-attention runtime disable path

### Token accounting runtime (`TokenService`)

Responsibilities:

- message/token counting via `litellm.token_counter`
- normalization of internal assistant/tool-call message shapes to LiteLLM format
- fallback text-based token estimation on counting failures
- model alias normalization and model max-input-token overrides

Contract notes:

- applies tool-call thought-signature extraction/attachment when normalizing assistant tool calls
- supports multimodal text-part character extraction in fallback estimation path

### VM run-control state runtime (`VmRunControlService`)

Responsibilities:

- in-memory run registry keyed by `run_id`
- workspace queue assignment for worker heartbeat polling
- ordered run event append (`seq`) and status transitions
- control-command queueing (`pause/resume/stop/set-control-mode`) and one-shot worker drain

Storage characteristics:

- ephemeral process memory only (no durable DB)
- single lock (`asyncio.Lock`) guards all state mutation

## Initialization and DI Ownership

Creation ownership:

- OCR and vision services are DI singletons from `core/container/core_container.py` via factory helpers
- embedder initialization is coordinated in same initializer path for memory services
- VM run-control service is route-scoped singleton attached to `app.state.vm_run_control_service` in `api/routes/runs/router.py`

Startup initialization (`ContainerInitializer`):

- config service init
- optional vision init (tool-policy gated)
- optional OCR init (tool-policy gated)
- embedder init
- context-factory wiring for OCR/vision services

## Data Durability and Failure Modes

Persistence tiers:

- durable-ish local disk: artifacts
- in-memory ephemeral: OCR/vision model objects, token service state, VM run-control state

Failure posture:

- artifact upload/read failures map to HTTP errors
- OCR/vision initialization failures degrade gracefully (disabled/uninitialized service state)
- token counting failure falls back to heuristic estimate
- VM run-control state is lost on backend restart by design

## Cross-Layer Touchpoints

- API routes:
  - artifacts routes use `ArtifactStore`
  - memory routes consume embedder + semantic services
  - `/api/runs/*` consumes `VmRunControlService`
- agent/tool runtime:
  - OCR and vision services are injected into session context for coordinate grounding
- frontend VM worker runtime:
  - polls/controls `/api/runs/*` and relays stream events into run timeline

## Related Docs

- [Backend Services Docs Hub](README.md)
- [VM Run Control Support Helper Module Contract Reference](vm_run_control_support_helper_module_contract_reference.md)
- [Artifact, Screenshot, and System-State Flow Reference](artifact_screenshot_and_system_state_flow_reference.md)
- [OCR and Vision Coordinate Runtime Overview](ocr_and_vision_coordinate_runtime_reference.md)
- [Token Service Message Normalization and Fallback Reference](token/token_service_message_normalization_and_fallback_reference.md)
- [Runs Route and VM Control Service Reference](../api/runs_route_and_vm_control_service_reference.md)
