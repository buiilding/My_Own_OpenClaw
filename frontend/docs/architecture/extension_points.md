---
summary: "Extension Points"
read_when:
  - When adding tools, providers, or integrations.
---

# Extension Points

This document lists the current, concrete extension points in the codebase.

## 1) Backend Tool SDK

Back-end tools can be built using the SDK in:

- private backend implementation
- private backend implementation

Tools are registered by the backend tool registry (private backend implementation).

Model-visible tool exposure is narrowed after registration by typed agent
capability policy in private backend implementation and
private backend implementation. Add new production profiles or capability
gates there.

## 2) Local-Runtime Python Tools

Most OS-level tools execute through the SDK/main local-runtime boundary and are
currently backed by local-runtime Python modules:

- `frontend/src/main/python/tools/`
  - `filesystem/` (read/write/search)
  - `computer/` (mouse/keyboard/scroll/screenshot)
  - `system/` (stats/window/wait)

These are executed through SDK/main local-runtime dispatch; Electron main owns
the agent-host bridge and local-runtime Python modules own the current
implementation behavior.

## 3) LLM Providers

Add a new provider by implementing `LLMProvider` in:

- private backend implementation

and wiring it into the provider factory in private backend implementation.

## 4) Inference Capability Providers

Add or swap OCR, vision, or embedding inference backends through the capability boundaries:

- Contracts: private backend implementation
- Routers: private backend implementation
- Local OCR provider adapter: private backend implementation
- Remote OCR provider adapter: private backend implementation
- Local vision provider adapter: private backend implementation
- Remote vision provider adapter: private backend implementation
- Local vision model hosts: private backend implementation

The backend orchestration/runtime layers should depend on these capability contracts and routers rather than on concrete singleton model hosts.

Provider availability feeds the agent capability policy through
`agent_provider_unavailable_capabilities`. If a provider is missing, disabled,
failed, or otherwise known unavailable before prompt construction, the backend
removes the matching capability from the model-visible surface for that session.
OCR and vision routers support `local`, `remote-http`, and `disabled` backends.
Remote OCR uses `/health` and `/ocr/analyze`; remote vision uses `/health`,
`/vision/locate`, and `/vision/describe`. Router circuit breakers stop
advertising repeatedly failing providers during the cooldown window and provider
failures during a turn are returned as structured provider-error payloads through
the normal tool-output recovery path.

## 5) Renderer UI Features

UI features are grouped by domain in:

- `frontend/src/renderer/features/`

Add new feature modules here and wire into `MainLayout`.
