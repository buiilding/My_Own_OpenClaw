---
summary: "Execution report for explicit plugin, skill, MCP, and CUA Driver control-plane work."
read_when:
  - When resuming the MCP plugin skill control-plane implementation.
  - When checking validation, decisions, blockers, or commit history for CUA Driver MCP integration.
title: "MCP Plugin Skill Control Plane Report"
---

# MCP Plugin Skill Control Plane Report

Plan: `docs/plans/2026-06-11-mcp-plugin-skill-control-plane-plan.md`

## Status

Complete. Core MCP gating, dashboard controls, and CUA declaration are
implemented, validated, and committed.

## Starting State

- `bin/windie docs list` passed and validated 82 `docs.json` references.
- Worktree started with unrelated dirty generated/stamp files:
  - `frontend/.windie-python-runtime-build-stamp`
  - `frontend/src/main/generated/builtin_tool_manifest.json`
- The plan file is a new tracked change for this work:
  - `docs/plans/2026-06-11-mcp-plugin-skill-control-plane-plan.md`
- Recent relevant commits show active cleanup around extension manifests, MCP
  runtime normalization, and Electron main module organization.

## Architecture Findings

- Electron main already owns repo-level contribution discovery through
  `plugins/`, `skills/`, and `mcps/`.
- `buildClientToolManifestWithMcp(...)` exists, but the default capability
  handshake builder still uses the synchronous base client manifest.
- MCP specs can be filtered with `enabled: false`, but there is no explicit
  product-level "visible but user-gated" state for powerful integrations.
- Public registry metadata is the correct source for renderer visibility.
  Runtime discovery and execution registry reconciliation must remain owned by
  Electron main.
- No production main-process caller currently invokes
  `buildAgentCapabilityHandshakePayload(...)`; the first implementation slice
  can add an async MCP-aware builder/export and tests without forcing unrelated
  query dispatch rewiring.

## Checklist

- [x] Create explicit MCP enablement metadata and runtime filtering.
- [x] Add async MCP-aware capability handshake builder.
- [x] Expose dashboard MCP section and renderer intent flow.
- [x] Add main-process IPC/control APIs for list, enable, disable, refresh, and
  status.
- [x] Add disabled-by-default CUA Driver MCP spec.
- [x] Add CUA probe/status handling and stale execution refusal.
- [x] Update docs and changelog.
- [x] Run focused frontend, sidecar, backend, docs, and diff validation.
- [x] Perform final inspection and commit completed slices.

## Validation Log

- `bin/windie docs list` - passed.
- `cd frontend && npm test -- --runTestsByPath ../tests/frontend/ExtensionManifest.test.cjs ../tests/frontend/McpRuntime.test.cjs ../tests/frontend/AgentCapabilityHandshake.test.cjs --runInBand` - passed, 3 suites / 23 tests.
- `cd frontend && npm test -- --runTestsByPath ../tests/frontend/ExtensionManifest.test.cjs ../tests/frontend/McpRuntime.test.cjs ../tests/frontend/McpControl.test.cjs ../tests/frontend/AgentCapabilityHandshake.test.cjs ../tests/frontend/LocalBackendBridgeExtensionRuntime.test.cjs ../tests/frontend/DashboardSidebar.test.jsx ../tests/frontend/McpsSection.test.jsx ../tests/frontend/AgentSettingsTab.test.jsx --runInBand` - passed, 8 suites / 42 tests.
- `./scripts/python-in-env backend python -m pytest tests/backend/test_client_tool_manifest.py tests/backend/test_tool_policy.py -q` - passed, 40 tests.
- `./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_tool_manifest.py tests/sidecar/test_sidecar_daemon.py tests/sidecar/test_repo_agent_example.py -q` - passed, 22 tests after updating the stale launch-context expectation for source identity fields.
- `cd frontend && npm run lint` - passed after removing stale unused bindings unrelated to MCP work.
- `git diff --check` - passed.
- Stale moved-module docs scan - passed except for the plan's intentional reference to old paths that needed cleanup.

## Changes Made

- Added `requires_user_enable` MCP metadata through extension discovery and
  public registry output.
- Added Electron main MCP allowlist filtering using `agent_enabled_mcp_servers`
  and `WINDIE_ENABLED_MCPS`, plus stale execution refusal for gated MCP tools.
- Added an async MCP-aware handshake builder while preserving the existing
  synchronous builder.
- Added main-process MCP control runtime and IPC channels for list, toggle, and
  refresh.
- Added the dashboard MCPs sidebar item and panel.
- Added `mcps/cua-driver/mcp.json` with `cua-driver mcp`, `tool_prefix:
  cua_driver`, and explicit enablement required.
- Added CUA status classification for `Not installed` and `Needs permission`.
- Updated MCP, extension, plugin hub, sidebar docs, and changelog.

## Final Inspection

- User-gated MCPs are visible in the public registry while off.
- Disabled user-gated MCPs are filtered before discovery, model manifest
  construction, available-tools derivation, and execution.
- The MCPs dashboard section uses IPC for list, toggle, and refresh; renderer
  code does not inspect local contribution files.
- CUA Driver uses `cua-driver mcp`, has no local absolute checkout path, has no
  committed fallback schemas, and stays off until explicitly enabled.
- The current user-toggle model is for `requires_user_enable` MCPs. Non-gated
  MCPs remain static platform declarations unless a future slice adds a separate
  per-server disable list.

## Decisions

- Keep CUA Driver behind explicit user enablement. A checked-in MCP spec may be
  listed to the user, but it must not become model-visible or executable until
  enabled and discovered.
- Preserve skills as prompt layers and plugin tools as sidecar-executed
  contributions. Do not route either through MCP control logic.
- Use live MCP `tools/list` as the first CUA schema source of truth; do not
  hand-maintain fallback CUA schemas in the initial integration.

## Commits

- `0bbe32d49 feat(frontend-mcp): add gated MCP control plane`
