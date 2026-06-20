---
summary: "Conceptual safety and trust boundaries for local execution, provider capabilities, permissions, schemas, and hosted backend behavior."
read_when:
  - When changing permissions, local tools, schema validation, provider health, or trust-boundary behavior.
  - When deciding whether to narrow capabilities before prompt construction.
title: "Safety Boundaries"
---

# Safety Boundaries

WindieOS safety is split across prompt-visible capabilities, backend validation, frontend permission checks, local execution limits, and platform controls. The model should only see tools and capabilities that the current client can actually execute.

## Boundary Layers

| Layer | Owner | Safety job |
| --- | --- | --- |
| Model-facing schema | Backend tool registry and policy | Hide unavailable tools and invalid coordinate methods before prompting |
| Parser/validation | Backend LLM parser and API schemas | Reject malformed or oversized model/API payloads |
| Frontend relay | Electron main and renderer services | Preserve request ids, session identity, and allowed IPC channels |
| Permission probes | Electron main permission services and renderer onboarding | Verify local OS capabilities before using screen, input, browser, or microphone flows |
| Local-runtime execution | Local runtime with Python tool registry and tool implementations | Execute only exposed local tools with normalized results |
| Provider health | Backend provider health and capability policy | Disable OCR/vision/embeddings/browser/web-search capability when unavailable |

## Design Rules

- Narrow capabilities before prompt construction when possible.
- Prefer explicit denial or hidden capability over letting the model repeatedly call unavailable tools.
- Do not expose a broad preload IPC channel to make a renderer feature easier.
- Do not make the frontend import backend schemas for parity. Use contract tests.
- Keep credentials in environment variables or renderer-managed encrypted/explicit config surfaces, never in docs or tests.
- Treat hosted backend identity and install-token auth as security-critical behavior.

## Deep Docs

- [Operations Security](../operations/security.md)
- [Backend Input Validation + Client Settings Patch Guard Reference](../backend/core/validation/input_validation_and_client_settings_patch_guard_reference.md)
- [Backend Trust-Boundary Metrics + Enforcement Reference](../backend/core/observability/trust_boundary_metrics_and_enforcement_reference.md)
- [Frontend Preload Channel Allowlist + Renderer Bridge Reference](../frontend/preload/preload_channel_allowlist_and_renderer_bridge_reference.md)
- [Frontend Permission Manifest, Probe, and IPC Request Contract Reference](../frontend/main/permission_manifest_probe_and_request_ipc_reference.md)
