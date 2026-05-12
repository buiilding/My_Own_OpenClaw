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
gates there instead of extending `backend/dev/tool_selection*.toml`.

## 2) Frontend Python Sidecar Tools

Most OS-level tools are implemented in the Python sidecar:

- `frontend/src/main/python/tools/`
  - `filesystem/` (read/write/search)
  - `computer/` (mouse/keyboard/scroll/screenshot)
  - `system/` (stats/window/wait)

These are executed via IPC from the Electron main process.

## 3) LLM Providers

Add a new provider by implementing `LLMProvider` in:

- `backend/src/llm/providers/`

and wiring it into the provider factory in `backend/src/llm/providers/__init__.py`.

## 4) Inference Capability Providers

Add or swap OCR, vision, or embedding inference backends through the capability boundaries:

- Contracts: `backend/src/core/interfaces/`
- Routers: `backend/src/core/inference/`
- Local OCR provider adapter: `backend/src/services/ocr/provider.py`
- Local vision provider adapter: `backend/src/services/vision/provider.py`
- Local vision model hosts: `backend/src/services/vision/providers/`

The backend orchestration/runtime layers should depend on these capability contracts and routers rather than on concrete singleton model hosts.

## 5) Renderer UI Features

UI features are grouped by domain in:

- `frontend/src/renderer/features/`

Add new feature modules here and wire into `MainLayout`.
