---
summary: "Future-state architecture plan for scaling WindieOS OCR, vision, and embedding inference via worker pools and vendor-backed providers behind a stateless backend orchestrator."
read_when:
  - Planning hosted multi-user inference architecture for OCR, vision, and embeddings.
  - Deciding when to move capability execution out of the backend app server.
  - Designing worker pools, remote adapters, or third-party inference integration for backend capabilities.
title: "Inference Services Future Plan (2026-04-15)"
---

# Inference Services Future Plan (2026-04-15)

## Objective

Move WindieOS toward a hosted architecture where OCR, vision, and embeddings are no longer process-local singleton models inside the backend app server. The target state is:

- backend app server = orchestration and routing
- inference backends = replaceable capability services
- deployment = mix of self-hosted worker pools and vendor APIs

## Future-State Principles

1. The backend must be stateless with respect to heavyweight inference models.
2. Every capability must support more than one backend implementation.
3. Vendor APIs are first-class backends, not special-case exceptions.
4. Expensive capabilities must support queueing, admission control, and health-aware routing.
5. Embedding-space identity must remain stable and explicit per memory index.

## Target Runtime Shape

### 1. Backend control plane

Responsibilities:

- user/session orchestration
- policy and entitlements
- capability routing
- telemetry, tracing, metering
- artifact coordination

The control plane should not directly own:

- long-lived GPU model residency for hosted OCR/vision
- the only active embedding model instance in the system

### 2. Capability services

WindieOS should support capability-specific backends:

- Embeddings
  - local worker pool
  - hosted internal embedding service
  - vendor embedding API
- OCR
  - local OCR worker pool
  - hosted internal OCR service
  - specialist OCR API vendor
- Vision
  - dedicated GPU worker pools by model family
  - hosted internal grounding service
  - future external specialist grounding vendor if one fits the contract

### 3. Routing layer

The backend chooses a provider using:

- capability type
- configured backend preference
- requested model id
- tenant/plan policy
- worker health and queue depth
- latency/cost policy

The backend should be free to route one request to a local worker and the next to a vendor backend without changing higher-level orchestration code.

## Capability-Specific Future

## Embeddings

Embeddings should likely be the first capability extracted from the app server because they are:

- the most frequent
- easiest to batch
- easiest to normalize
- least coupled to desktop interaction semantics

Future requirements:

- batch endpoints by default
- model/version identity in every memory index
- reindex jobs when embedding space changes
- routing by memory/index policy, not ad hoc per request

Important invariant:

- one memory index must not silently mix vectors from different embedding spaces

## OCR

OCR should support both:

- self-hosted internal OCR workers
- external OCR vendor adapters

Requirements:

- one canonical normalized OCR result contract
- adapter-owned vendor translation
- timeout/cost/error normalization at the provider boundary

This is the easiest capability to swap to a specialist third-party provider later.

## Vision

Vision should be treated as scarce compute, not a generic low-cost HTTP helper.

Requirements:

- model-family-specific worker pools
- explicit queueing and bounded concurrency
- GPU-aware health checks
- admission control and backpressure
- model-specific retry rules

The backend should not assume one shared global vision model instance can serve many users efficiently.

## Deployment Phases

### Phase A: provider-ready backend

Precondition:

- capability provider refactor complete

Result:

- backend can route to local or remote implementations without orchestration rewrites

### Phase B: embeddings extraction

Move embeddings to:

- dedicated worker pool or service
- optional vendor adapter

Add:

- batching
- queue depth metrics
- per-index embedding identity

### Phase C: OCR extraction

Move OCR to:

- hosted OCR worker pool
- optional vendor OCR backend

Add:

- canonical OCR normalization
- backend-side provider failover

### Phase D: vision worker pools

Move vision to:

- dedicated GPU worker services by model family

Add:

- bounded concurrency
- health-aware routing
- queue-based scheduling
- explicit cost and latency controls

## Interface and Data Requirements

All remote capability services should support:

- request id
- provider id
- model id
- normalized result payload
- normalized error payload
- timing metadata
- optional cost metadata
- health endpoint

The backend should record enough metadata to answer:

- which provider handled the request
- which model/version produced the result
- how long it took
- what fallback path was used

## Operational Requirements

### Routing and reliability

- health-aware provider selection
- circuit breaker for failing providers
- bounded retries where safe
- deadline propagation from backend to capability service

### Scaling

- horizontal scale per capability, not only per app server
- queue depth and p95 latency as autoscaling signals
- vision and OCR GPU capacity isolated from embedding CPU/GPU capacity

### Cost and policy

- provider choice can depend on plan tier
- vendor backends can be restricted to premium or overflow paths
- expensive vision paths can be rate-limited independently of standard LLM chat

## Risks

1. Premature service splitting without stable contracts will just distribute current coupling over the network.
2. Vision worker pools can become operationally expensive before request patterns are understood.
3. Embedding model switching without index metadata will corrupt retrieval quality.
4. Vendor dependence without normalized contracts will spread vendor-specific assumptions through the codebase.

## Recommended Long-Term End State

WindieOS should aim for this structure:

- backend app server:
  - stateless orchestration
  - routing
  - policy
  - telemetry
- capability services:
  - embedding workers
  - OCR workers
  - vision workers
  - vendor adapters

This lets WindieOS:

- self-host when it makes sense
- buy specialized inference when that is cheaper or better
- change provider strategy without rewriting agent, tool, or session code

## Relationship To Current Refactor

The execution-track refactor that should happen first is documented here:

- `docs/planning/windieos_inference_provider_refactor_plan_2026-04-15.md`

That document is about code boundaries now.
This document is about deployment architecture later.
