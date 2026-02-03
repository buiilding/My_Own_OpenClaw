---
summary: "Extension Points"
read_when:
  - When adding plugins, tools, or integrations.
---

# Extension Points

This document lists the current, concrete extension points in the codebase.

## 1) Backend Tool SDK

Back-end tools can be built using the SDK in:

- `backend/src/sdk/tool.py`
- `backend/src/sdk/context.py`

Tools are registered by the backend tool registry (`backend/src/tools/registry.py`).

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

## 4) Agent Plugins

Plugins hook into the agent lifecycle:

- Interface: `backend/src/agent/plugins/interface.py`
- Manager: `backend/src/agent/plugins/manager.py`
- Example: `backend/src/agent/plugins/ocr_plugin.py`

## 5) Renderer UI Features

UI features are grouped by domain in:

- `frontend/src/renderer/features/`

Add new feature modules here and wire into `MainLayout`.
