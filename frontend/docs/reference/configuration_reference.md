---
summary: "Public reference map for WindieOS frontend, Electron main, local-runtime, browser, and packaging configuration."
read_when:
  - When adding, removing, renaming, documenting, or debugging public frontend
    environment variables and runtime config fields.
  - When deciding whether a setting belongs to Electron main, renderer storage,
    local-runtime env, browser runtime, or release packaging.
title: "Configuration Reference"
---

# Configuration Reference

Public configuration docs cover the frontend and local-runtime surface. Backend
`AppConfig`, hosted auth, provider environment policy, deployment secrets, and
VM-runs control-plane settings live in private backend docs.

## Owner Map

| Owner | Stores/applies | Primary docs |
| --- | --- | --- |
| Electron main | endpoint selection, local desktop UI config, local-runtime env, windows/overlay policy | [Frontend Runtime Surface](../frontend/runtime/frontend_runtime_surface_main_renderer_sidecar_and_vm_worker_reference.md), [Runtime Paths and Endpoints](../frontend/main/runtime_paths_and_endpoints.md) |
| Renderer | user-facing settings subset and local UI state | [Renderer Config Sync Lifecycle](../frontend/runtime/config_sync_and_settings_lifecycle_reference.md) |
| Local-runtime implementation | local tool env flags, local storage roots, browser runtime knobs | [Local Runtime Python Implementation Docs Hub](../frontend/sidecar/README.md) |
| Release/CI | package targets, signing, bundled Python runtime | [Release Guide](../operations/release.md), [Bundled Python Runtime Packaging](../operations/sidecar_runtime_packaging.md) |

## Public Variables

| Category | Variables |
| --- | --- |
| endpoint selection | `BACKEND_HTTP_URL`, `BACKEND_WS_URL`, `BACKEND_HOST`, `BACKEND_PORT`, `WINDIE_DEFAULT_BACKEND_HTTP_URL`, `WINDIE_DEFAULT_BACKEND_WS_URL`, `WINDIE_BACKEND_HTTP_URL` |
| local-runtime implementation | `WINDIE_PYTHON_PATH`, `WINDIE_SIDECAR_LOG_LEVEL`, `AGENT_LOCAL_RUNTIME_LOG_LEVEL`, `AGENT_SIDECAR_LOG_LEVEL`, `WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR`, `WINDIE_USER_DATA_DIR`, `AGENT_USER_DATA_DIR`, `WINDIE_APP_DIAGNOSTICS_DB`, `AGENT_APP_DIAGNOSTICS_DB`, `WINDIE_TEST_PLATFORM`, `AGENT_TEST_PLATFORM` |
| local-runtime workers | `WINDIE_INTERACTIVE_WORKERS`, `AGENT_INTERACTIVE_WORKERS`, `WINDIE_BACKGROUND_WORKERS`, `AGENT_BACKGROUND_WORKERS`, `WINDIE_SHELL_JOB_TTL_SECONDS`, `AGENT_SHELL_JOB_TTL_SECONDS` |
| browser runtime | `AGENT_BROWSER_CDP_PORT`, `WINDIE_BROWSER_CDP_PORT`, `AGENT_BROWSER_USE_HOME`, `WINDIE_BROWSER_USE_HOME`, `AGENT_BROWSER_USE_SESSION`, `WINDIE_BROWSER_USE_SESSION`, `AGENT_BROWSER_USE_CLI`, `WINDIE_BROWSER_USE_CLI`, `AGENT_BROWSER_USE_COMMAND_TIMEOUT_SECONDS`, `WINDIE_BROWSER_USE_COMMAND_TIMEOUT_SECONDS`, `AGENT_BROWSER_FILES_DIR`, `WINDIE_BROWSER_FILES_DIR` |
| packaging/signing | `WINDIE_PYTHON_BUILD`, `WINDIE_REQUIRE_WAKEWORD_PREFETCH`, `WINDIE_REQUIRE_SIGNING`, `CSC_LINK`, `CSC_KEY_PASSWORD`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |

## Rules

- Renderer persistence should contain only user-facing settings, not secrets or
  provider internals.
- The local runtime receives the active backend URL from Electron main; do not
  make the local-runtime Python implementation guess endpoint policy.
- Electron main passes the host-skinned user-data root to the local-runtime
  implementation. Standalone local-runtime launches default to neutral paths
  unless `AGENT_USER_DATA_DIR` or `WINDIE_USER_DATA_DIR` is set.
- Release signing variables are release-only. Local reinstall flows intentionally
  bypass notarization/signing unless a release workflow requires it.

## Add-a-Config Checklist

1. Pick the owner layer.
2. Add the field and default at that layer.
3. Add validation/normalization near the owner.
4. Propagate only the normalized downstream value.
5. Add tests at owner and protocol boundaries.
6. Update this reference and any feature docs.
7. Run `<windie> docs check`.

## Deep Docs

- [Model Provider Selection](../concepts/model_provider_selection.md)
- [Settings Sync Change Workflow](../frontend/runtime/settings_sync_change_workflow.md)
- [Runtime Paths and Endpoints](../frontend/main/runtime_paths_and_endpoints.md)
- [Bundled Python Runtime Packaging](../operations/sidecar_runtime_packaging.md)
