---
summary: "Matrix of current WindieOS extension surfaces with owner files, registration points, docs, and validation targets."
read_when:
  - When adding or modifying a tool, provider, inference adapter, SDK route, local-runtime action, browser integration, or renderer feature.
  - When deciding which current extension point should satisfy a plugin-like request.
title: "Extension Surface Matrix"
---

# Extension Surface Matrix

WindieOS extensibility is code-owned, not plugin-manifest-owned. Use this matrix to find the current registration point and validation path.

| Extension surface | Registration/owner | Code roots | Validate |
| --- | --- | --- | --- |
| Backend remote tool | backend tool catalog/registry and policy | private backend implementation | backend tool contract/schema/policy tests |
| Backend SDK tool | SDK `Tool` and `ToolContext` | private backend implementation | SDK tool contract tests |
| Local-runtime executable tool | local-runtime executable registry and manifest-owned exposed tool names | `frontend/src/main/python/tools/registry.py`, `frontend/src/main/python/tools/manifest.py`, domain tool folders | local-runtime Python implementation tests, parity tests |
| Backend-only tool | backend registry only | private backend implementation, domain implementation | backend tool tests and docs explaining no local-runtime executable parity |
| LLM provider | provider factory + config + model catalog | private backend implementation | provider factory/config/model-list/stream tests |
| Inference provider | capability router/adapter | private backend implementation, embedding services | provider health/circuit/tool-output tests |
| Hosted SDK route | FastAPI SDK router + client wrappers | private backend implementation, `packages/windie-sdk-js`, `frontend/src/main/python/windie/sdk.py` | backend route tests, TS/Python SDK client tests |
| Artifact route/storage | artifact route and store | private backend implementation | upload/fetch/client tests |
| Browser action | backend browser schema + local-runtime browser execution | private backend implementation, `frontend/src/main/python/tools/browser` | backend/local-runtime browser schema parity and action tests |
| Renderer feature | feature module + provider/layout wiring | `frontend/src/renderer/features`, `frontend/src/renderer/app`, `frontend/src/renderer/infrastructure` | focused renderer tests |
| Electron main runtime feature | main-process module and IPC/channel owner | `frontend/src/main`, `frontend/src/shared/ipcChannels.json`, preload/IPC docs | main-process IPC/lifecycle tests |

## Extension Decision Flow

1. If the model should call it, start with backend tool schema/policy.
2. If it controls the local machine, add local execution and parity tests.
3. If it calls a model provider, add an LLM provider or provider config/catalog entry.
4. If it exposes hosted introspection/perception to external clients, add an SDK route/client.
5. If it changes desktop UI, add a renderer feature and main/preload IPC only when privileged APIs are needed.
6. If it requires third-party package discovery/loading/isolation, it is future plugin-system work and needs planning first.

## Required Docs Updates

For each extension type:

- backend tool: `docs/tools/`, `docs/backend/tools/`, and this matrix
- local-runtime tool: `docs/tools/`, `docs/frontend/sidecar/tools/`, and [Local Tool Channels](../channels/sidecar_and_tool_channels.md)
- provider: `docs/providers/` and provider-specific page
- SDK route: `docs/sdk/` and `docs/reference/http_api_surface.md`
- renderer/main feature: relevant `docs/desktop/`, `docs/frontend/`, and [Channels Hub](../channels/README.md) if routing changes
- security-sensitive extension: [Security Hub](../security/README.md)

## Validation Checklist

- registration point is explicit.
- model visibility is covered by backend policy tests.
- local-runtime executable behavior is covered when local actions exist.
- provider credentials are loaded from config/env, not hardcoded.
- SDK clients update when public routes change.
- docs and changelog mention the extension surface.
