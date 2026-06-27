---
summary: "Extension Points"
read_when:
  - When adding tools, providers, or integrations.
---

# Extension Points

This document lists the current, concrete extension points in the codebase.

## 1) Backend Tool SDK

Back-end tools can be built using the SDK in:

- `backend/src/sdk/tool.py`
- `backend/src/sdk/context.py`

Tools are registered by the backend tool registry (`backend/src/tools/registry.py`).

Model-visible tool exposure is narrowed after registration by typed agent
capability policy in `backend/src/tools/agent_capability_policy.py` and
`backend/src/tools/tool_policy.py`. Add new production profiles or capability
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

- `backend/src/llm/providers/`

and wiring it into the provider factory in `backend/src/llm/providers/factory.py`.

## 4) Inference Capability Providers

Add or swap OCR, vision, or embedding inference backends through the capability boundaries:

- Contracts: `backend/src/core/interfaces/`
- Routers: `backend/src/core/inference/`
- Local OCR provider adapter: `backend/src/services/ocr/provider.py`
- Remote OCR provider adapter: `backend/src/services/ocr/remote_provider.py`
- Local vision provider adapter: `backend/src/services/vision/provider.py`
- Remote vision provider adapter: `backend/src/services/vision/remote_provider.py`
- Local vision model hosts: `backend/src/services/vision/providers/`

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
