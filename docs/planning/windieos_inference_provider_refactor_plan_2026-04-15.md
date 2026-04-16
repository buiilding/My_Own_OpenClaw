---
summary: "Execution-track refactor plan for replacing singleton-bound OCR, vision, and embedding services with provider-routed capability boundaries inside the current backend."
read_when:
  - Refactoring backend OCR, vision, or embedding service ownership.
  - Designing provider boundaries that can support local, remote, and vendor-backed inference implementations.
  - Removing direct singleton-model assumptions from backend orchestration paths without yet splitting the app into many deployable services.
title: "Inference Provider Refactor Plan (2026-04-15)"
---

# Inference Provider Refactor Plan (2026-04-15)

## Summary

Refactor the backend so OCR, vision, and embeddings are consumed through explicit provider boundaries instead of process-global singleton model instances wired directly into the app server. This plan is the "do now" track:

- keep the current backend product shape intact
- introduce stable capability interfaces and routing
- preserve current local model implementations as provider adapters
- make later extraction to worker pools or third-party APIs a deployment change instead of a cross-cutting rewrite

This plan does not yet require separate deployable OCR/vision/embedding services. It creates the code structure that makes that future possible.

## Problem Statement

Today the backend owns heavy inference services as process-wide singletons:

- `CoreContainer.vision_service`
- `CoreContainer.ocr_service`
- `MemoryContainer.embedder`

That shape is acceptable for a dev backend, but it creates long-term problems for hosted multi-user operation:

1. The API/orchestration server is tightly coupled to model hosting concerns.
2. There is no clean way to use multiple implementations of the same capability in one runtime.
3. Config changes are global and uneven:
   - embedder can be rebound globally
   - OCR/vision are effectively startup-owned
4. The app server cannot cleanly choose between:
   - local in-process model
   - local out-of-process worker
   - Windie-hosted service
   - vendor API
5. Scaling strategy is unclear because the service boundary is the whole backend process, not the inference capability itself.

## Goals

1. Introduce first-class provider contracts for OCR, vision, and embeddings.
2. Route backend call sites through capability routers instead of concrete singleton services.
3. Preserve current local implementations by wrapping them as provider adapters.
4. Support per-capability backend config that selects provider backend and model id without mutating unrelated runtime layers.
5. Make future remote/vendor providers additive rather than invasive.

## Non-Goals

1. Do not split the backend into multiple deployable services in this refactor.
2. Do not add autoscaling, queue workers, or cross-process GPU scheduling in this refactor.
3. Do not introduce per-user arbitrary embedding-model selection for existing memory indexes.
4. Do not rewrite all OCR/vision/embedding implementations at once; wrap current ones first.

## Design Principles

### 1. Capability boundary first, deployment split later

The backend should depend on stable capability contracts, not on whether the implementation is local or remote.

### 2. Normalize outputs at the provider boundary

Vendor-specific or model-specific response formats must be converted into WindieOS-native normalized results before higher layers see them.

### 3. API server remains orchestration-first

The backend app server should increasingly act as:

- session/orchestration layer
- policy/router layer
- tracing/metering layer

and less like:

- the place where every heavy model must be loaded directly

### 4. Embedding-space stability is explicit

Embedding provider/model identity must become part of memory-index metadata. Retrieval cannot assume one global embedding space forever.

## Proposed Architecture

## 1. New capability interfaces

Add three capability contracts:

- `EmbeddingProvider`
  - existing contract can be extended with provider/model identity
- `IOcrProvider`
  - `analyze_image(...)`
  - `health(...)`
  - normalized OCR result schema
- `IVisionProvider`
  - `predict_coordinates(...)`
  - optional `answer_question_about_image(...)`
  - normalized grounding result schema

Each provider contract should expose:

- `provider_id`
- `model_id`
- `capabilities`
- async execution methods
- readiness/health surface

## 2. Add capability routers

Create orchestration-level routers:

- `EmbeddingRouter`
- `OcrRouter`
- `VisionRouter`

Responsibilities:

- resolve configured provider backend
- choose implementation by capability + policy + model id
- centralize health/error mapping
- keep higher layers agnostic to local vs remote vs vendor execution

Call sites should depend on routers or narrow provider protocols, not on concrete local classes.

## 3. Wrap existing local implementations as providers

Initial providers:

- `LocalSentenceTransformerEmbeddingProvider`
- `LocalRapidOcrProvider`
- `LocalInternVLVisionProvider`
- `LocalVenusVisionProvider`

These should delegate to the current implementations while conforming to the new contracts.

This keeps the first migration bounded:

- same inference behavior
- new boundary
- less direct coupling

## 4. Introduce provider-oriented config

Add backend config fields per capability:

- embeddings:
  - `embedding_backend`
  - `embedding_model`
- OCR:
  - `ocr_backend`
  - `ocr_model`
- vision:
  - `vision_backend`
  - `vision_model_name` or renamed `vision_model`

Initial allowed values:

- `local`
- `remote-http`
- `vendor`

Only `local` needs to be implemented immediately.

## 5. Add provider registry/factory layer

Replace direct singleton creation with provider factories/registries.

Shape:

- `InferenceContainer`
  - provider registries/factories
  - capability routers
- local provider factories remain DI-managed
- current singleton local models may still exist behind local providers for now

This is a code-ownership change first, not yet a throughput change.

## 6. Narrow existing direct service lookups

Migrate current call sites:

- memory routes -> `EmbeddingRouter`
- semantic helpers that depend on embedder metadata -> `EmbeddingRouter`
- OCR coordinator / screenshot manager paths -> `OcrRouter`
- coordinate resolution / prediction paths -> `VisionRouter`

Session/runtime code should stop reaching through container/session graphs for concrete vision/OCR classes.

## 7. Add embedding identity to memory metadata

Before remote/provider flexibility expands, add explicit metadata for:

- `embedding_provider_id`
- `embedding_model_id`
- `embedding_dimension`
- `embedding_space_version`

This metadata must be available anywhere retrieval/index rebuild logic operates.

Without this, future model switching will silently corrupt retrieval assumptions.

## Execution Phases

### Phase 1: Contract extraction

Deliverables:

- new OCR + vision provider interfaces
- enriched embedding provider identity surface
- normalized result schema types

Acceptance:

- current code still works with the same local implementations
- type boundaries exist independent of deployment mode

### Phase 2: Local provider adapters

Deliverables:

- wrap existing local OCR/vision/embedding implementations as providers
- add provider id/model id reporting

Acceptance:

- local behavior unchanged
- routers can resolve one local provider per capability

### Phase 3: Router migration

Deliverables:

- OCR/vision/embedding call sites switched to routers
- direct singleton references removed from orchestration paths

Acceptance:

- no tool/runtime path needs to know concrete local model class
- tests prove provider substitution is possible

### Phase 4: Config and lifecycle cleanup

Deliverables:

- provider-oriented config fields
- consistent config update semantics
- remove ad hoc singleton rebinding assumptions

Acceptance:

- backend config chooses capability backend declaratively
- model/provider changes are explicit and capability-scoped

### Phase 5: Memory-index identity hardening

Deliverables:

- embedding-space metadata persisted and read through memory paths
- migration/rebuild hooks planned for future model changes

Acceptance:

- retrieval code no longer assumes one eternal embedding space

## Testing Plan

Add focused coverage for:

1. provider factory selection by config
2. router delegation to local provider adapters
3. normalized OCR result contract
4. normalized vision prediction contract
5. embedding provider identity propagation
6. config update behavior per capability
7. memory-index metadata carrying embedding-space identity

## Refactor Guardrails

1. Do not let routers leak vendor-specific response shapes upward.
2. Do not let provider selection depend on deep session graph traversal.
3. Do not preserve hidden singleton assumptions behind a new interface name.
4. Do not allow embedding provider/model swaps to change retrieval semantics without explicit metadata/versioning.

## Completion Criteria

This refactor is complete when:

- OCR, vision, and embeddings are consumed through provider-routed boundaries
- current local implementations sit behind those boundaries
- direct orchestration-time dependence on singleton inference services is removed
- future remote/vendor backends can be added without changing the agent/tool/runtime call sites

## Follow-Up

After this refactor lands, the next architecture track is the actual separation of inference execution into scalable worker pools and/or vendor-backed adapters. That future-state plan is tracked in:

- `docs/planning/windieos_inference_services_future_plan_2026-04-15.md`
