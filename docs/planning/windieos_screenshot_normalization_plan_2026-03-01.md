---
summary: "Future plan for dual screenshot pipelines: normalized images for LLM context efficiency and full-resolution images for OCR/coordinate grounding reliability."
read_when:
  - Planning screenshot/token-cost reductions without degrading click/type grounding reliability.
  - Changing query payload contracts for screenshot attachments and capture metadata.
  - Evaluating model-side visual grounding quality tradeoffs under image downscaling.
title: "WindieOS Screenshot Normalization Plan (2026-03-01)"
---

# WindieOS Screenshot Normalization Plan (2026-03-01)

## Objective

Reduce multimodal prompt size and latency by normalizing screenshot inputs sent to the main LLM, while preserving high-resolution screenshots for OCR and coordinate grounding.

## Why This Is Planned (Not Immediate Runtime Change)

- Current WindieOS query flow uses one screenshot stream for both:
  - LLM prompt image input.
  - Screenshot manager/OCR/grounding state.
- This couples token/latency costs to capture resolution.
- A single downscale can hurt small-target visual grounding if used everywhere.

This plan introduces a split contract so optimization and precision are independent.

## External Baseline: Agent-S

Agent-S currently rescales screenshots to fit a max-dimension limit (2400) before inference and reuses that scaled image across planner and grounding calls, then remaps predicted coordinates back to native screen coordinates.

Implication for WindieOS:
- Normalization is a proven cost/perf strategy.
- WindieOS should avoid single-stream coupling by keeping a full-resolution grounding path in parallel.

## Proposed Product Contract

1. LLM image input uses normalized screenshot artifacts.
2. Grounding/OCR uses original full-resolution screenshot artifacts.
3. Manual coordinate execution continues to normalize screenshot-space to desktop-space using capture metadata from the grounding screenshot stream.
4. If normalized screenshot quality is insufficient for model-side reasoning, fallback policy can raise normalization ceiling or switch to original image for that turn.

## Target Data Model

Extend query payload semantics to support dual screenshot references:

- `screenshot_ref` / `screenshot_refs`:
  - normalized artifacts intended for LLM message image inputs.
- `grounding_screenshot_ref` (or `grounding_screenshot_refs`):
  - full-resolution artifacts intended for screenshot manager, OCR, and coordinate preparation.
- `capture_meta`:
  - capture metadata associated with grounding screenshot frame geometry.

Compatibility rule:
- If grounding ref is absent, fallback to existing screenshot refs behavior.

## Execution Flow (Planned)

1. Frontend capture produces original screenshot.
2. Frontend creates normalized variant for LLM path.
3. Frontend uploads both variants as separate artifacts.
4. Frontend sends both ref groups in query payload.
5. Backend query execution:
  - passes normalized screenshot(s) to `process_query(... image_data=...)`.
  - passes full-resolution grounding screenshot to screenshot manager (`process_screenshot`) with `capture_meta`.
6. Tool preparation/coordinate normalization remains keyed to grounding screenshot state, not LLM-normalized image dimensions.

## Normalization Policy (Initial)

- Normalize by max dimension cap (default target: 2400, configurable).
- Preserve aspect ratio.
- Never upscale.
- Use high-quality resize filter.
- Keep content type stable where practical (JPEG -> JPEG, PNG -> PNG unless explicit conversion desired).

## Quality/Risk Controls

Primary risk:
- Main LLM may lose fine-grained visual cues after normalization and make weaker decisions.

Mitigations:
- Keep normalization cap conservative initially (not aggressive thumbnailing).
- Add optional heuristic fallback:
  - If turn involves precision-sensitive UI targets (dense forms, tiny controls), send original image to LLM for that turn.
- Add observability:
  - capture original vs normalized dimensions.
  - log model/tool correction loops that may indicate visual loss.

## Rollout Plan

## Phase 0: Contract and Types

- Add payload/schema support for grounding-specific screenshot refs.
- Keep old path behavior unchanged when new fields are absent.

## Phase 1: Frontend Dual Upload

- Generate normalized variant per captured screenshot.
- Upload normalized + original variants.
- Send both refs in query payload.

## Phase 2: Backend Split Consumption

- Route normalized refs to `image_data` for prompt.
- Route original refs to screenshot manager + OCR state.
- Keep `capture_meta` tied to grounding/original frame.

## Phase 3: Metrics and Guardrails

- Instrument token size, latency, and success proxies.
- Compare click/type retry rates and manual coordinate miss rates before/after.

## Phase 4: Adaptive Policy (Optional)

- Add runtime policy to bypass normalization for precision-critical turns.

## Test Plan (When Implemented)

Backend:
- Query execution helper tests for dual-ref resolution and fallback precedence.
- API handler tests verifying normalized-vs-grounding routing.

Frontend:
- Chat sender tests for dual artifact upload and payload assembly.
- API client tests for optional grounding ref fields.

E2E:
- Dense form fill scenarios, tiny input focus checks, and coordinate stability across mixed DPI/resolutions.

## Out of Scope

- Replacing existing coordinate normalization math.
- Changing capture backend selection logic.
- Reworking OCR engine/model in this plan.

## Success Criteria

- Lower average image payload size sent to main LLM.
- Lower or neutral multimodal latency.
- No regression in click/type grounding success rates.
- No regression in OCR-driven coordinate resolution reliability.

## Cross References

- `docs/backend/api/handlers/query_handler_and_query_execution_service_runtime_reference.md`
- `docs/backend/api/processing/query_execution_runtime_state_and_completion_resolver_reference.md`
- `docs/frontend/renderer/chat/message_send_surface_policy_and_screenshot_capture_reference.md`
- `docs/frontend/main/query_payload_and_relay_reference.md`
