---
summary: "Reference map for WindieOS runtime configuration ownership, important environment variables, credential rules, propagation paths, and validation docs."
read_when:
  - When adding, removing, renaming, documenting, or debugging WindieOS environment variables and runtime config fields.
  - When deciding whether a setting belongs to backend config, Electron main,
    renderer storage, local-runtime env, VM worker env, or release CI.
title: "Configuration Reference"
---

# Configuration Reference

WindieOS config is split by runtime owner. Add a field where the owner can enforce it, then propagate only the normalized values needed by downstream nodes.

## Owner Map

| Owner | Stores/applies | Primary docs |
| --- | --- | --- |
| Backend `AppConfig` | model/provider defaults, API-key env names, inference routing, tool policy, install auth, artifact limits | [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md), [Configuration](../operations/configuration.md) |
| Electron main | backend endpoint resolution, local desktop UI config file, local-runtime env, VM mode, windows/overlay policy | [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md), [Frontend Runtime Surface](../frontend/runtime/frontend_runtime_surface_main_renderer_sidecar_and_vm_worker_reference.md) |
| Renderer | user-facing settings subset and local UI state | [Renderer Config Sync Lifecycle](../frontend/runtime/config_sync_and_settings_lifecycle_reference.md) |
| Local-runtime implementation | local tool env flags, backend URL for remote clients, workers, browser runtime | [Local Runtime Python Implementation Docs Hub](../frontend/sidecar/README.md) |
| Release/CI | package targets, signing, notarization, bundled Python runtime | [Release Guide](../operations/release.md), [Bundled Python Runtime Packaging](../operations/sidecar_runtime_packaging.md) |

## High-Touch Variables

| Category | Variables |
| --- | --- |
| backend endpoints | `BACKEND_HTTP_URL`, `BACKEND_WS_URL`, `BACKEND_HOST`, `BACKEND_PORT`, `WINDIE_DEFAULT_BACKEND_HTTP_URL`, `WINDIE_DEFAULT_BACKEND_WS_URL`, `WINDIE_BACKEND_HTTP_URL` |
| LLM credentials | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`, `KIMI_API_KEY` |
| inference/audio/search | `BRAVE_SEARCH_API_KEY`, `ELEVENLABS_API_KEY`, OCR/vision/embedding backend fields in backend config |
| local-runtime implementation | `WINDIE_PYTHON_PATH`, `WINDIE_SIDECAR_LOG_LEVEL` / `AGENT_LOCAL_RUNTIME_LOG_LEVEL` / `AGENT_SIDECAR_LOG_LEVEL`, `WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR`, `WINDIE_INTERACTIVE_WORKERS` / `AGENT_INTERACTIVE_WORKERS`, `WINDIE_BACKGROUND_WORKERS` / `AGENT_BACKGROUND_WORKERS`, `WINDIE_SHELL_JOB_TTL_SECONDS` / `AGENT_SHELL_JOB_TTL_SECONDS`, `WINDIE_USER_DATA_DIR` / `AGENT_USER_DATA_DIR`, `WINDIE_APP_DIAGNOSTICS_DB` / `AGENT_APP_DIAGNOSTICS_DB`, `WINDIE_TEST_PLATFORM` / `AGENT_TEST_PLATFORM` |
| browser runtime | `AGENT_BROWSER_CDP_PORT` / `WINDIE_BROWSER_CDP_PORT`, `AGENT_BROWSER_USE_HOME` / `WINDIE_BROWSER_USE_HOME`, `AGENT_BROWSER_USE_SESSION` / `WINDIE_BROWSER_USE_SESSION`, `AGENT_BROWSER_USE_CLI` / `WINDIE_BROWSER_USE_CLI`, `AGENT_BROWSER_USE_COMMAND_TIMEOUT_SECONDS` / `WINDIE_BROWSER_USE_COMMAND_TIMEOUT_SECONDS`, `AGENT_BROWSER_FILES_DIR` / `WINDIE_BROWSER_FILES_DIR` |
| VM worker/runs | `WINDIE_VM_MODE`, `WINDIE_VM_WORKER_MODE`, `WINDIE_VM_WORKSPACE_ID`, `WINDIE_VM_WORKER_ID`, `WINDIE_VM_ID`, `WINDIE_VM_AGENT_ID`, `WINDIE_VM_WORKER_HEARTBEAT_MS`, `WINDIE_RUNS_API_KEY`, `WINDIE_VM_RUNS_API_KEY` |
| packaging/signing | `WINDIE_PYTHON_BUILD`, `WINDIE_REQUIRE_WAKEWORD_PREFETCH`, `WINDIE_REQUIRE_SIGNING`, `CSC_LINK`, `CSC_KEY_PASSWORD`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |

## Rules

- API keys must come from environment variables or secure local config paths, never committed docs/tests/fixtures.
- Renderer persistence should contain only user-facing settings, not provider internals or secrets.
- The local runtime receives the active backend URL from Electron main; do not
  make the local-runtime Python implementation guess the app's endpoint policy.
- Electron main passes the host-skinned user-data root to the local-runtime
  implementation;
  standalone local-runtime launches default to neutral `desktop-runtime` paths unless
  `AGENT_USER_DATA_DIR` or `WINDIE_USER_DATA_DIR` is set.
- VM worker variables configure the Electron main worker mode and `/api/runs/*` control plane; normal desktop chat still uses `/ws`.
- Release signing variables are release-only. Local reinstall flows intentionally bypass Apple notarization.

## Add-a-Config Checklist

1. Pick the owner layer.
2. Add the field and default at that layer.
3. Add validation/normalization near the owner.
4. Propagate only the normalized downstream value.
5. Add tests at owner and protocol boundaries.
6. Update [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md), [Configuration](../operations/configuration.md), and any feature docs.
7. Run `<windie> docs list`.

Use [Backend Config and Container Change Workflow](../backend/config/backend_config_and_container_change_workflow.md) when the owner is backend `AppConfig`, a session-scoped settings update, or a container/provider rebinding path.

## Deep Docs

- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)
- [Configuration](../operations/configuration.md)
- [Backend Config and Container Change Workflow](../backend/config/backend_config_and_container_change_workflow.md)
- [Hosted Backend Auth](../operations/hosted_backend_auth.md)
- [Provider Credentials](../providers/credentials.md)
- [Model Provider Selection](../concepts/model_provider_selection.md)
- [VM Worker Node](../nodes/vm_worker_node.md)
