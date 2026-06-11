---
summary: "Plan for making WindieOS plugins, skills, MCPs, and CUA Driver integration explicit, gated, visible, and test-backed."
read_when:
  - When implementing or resuming MCP, plugin, skill, or CUA Driver integration work.
  - When changing extension discovery, client tool manifests, MCP enablement policy, or the dashboard MCP control surface.
title: "MCP Plugin Skill Control Plane Plan"
---

# MCP Plugin Skill Control Plane Plan

## User Intent

Make WindieOS' plugin, skill, and MCP surfaces real enough to test and use,
then add `cua-driver` from the sibling `Windieos_workspace/cua` checkout as an
MCP integration. CUA must not become an always-on product capability: it should
be visible, explicitly enabled, probed, and permission/policy gated before any
`cua_driver__*` tools are sent to the backend or shown to the model.

The desired product shape is a dashboard MCPs section near Memory, Usage, and
Models, where local protocol integrations can be inspected, enabled, disabled,
refreshed, and diagnosed.

## Architecture Target

- Electron main owns repo-local extension discovery and local MCP process
  execution. It reads `plugins/`, `skills/`, and `mcps/`, starts stdio MCP
  servers, discovers tools, and routes MCP tool calls before sidecar fallback.
- Renderer owns presentation and user intent for the MCPs section only. It does
  not decide model-visible tool policy and does not execute MCP processes.
- Backend remains the model-visible policy owner. It validates accepted client
  tool manifests, applies `available_tools`, `disabled_tools`, profiles, and
  provider projection, but does not import local MCP, plugin, or skill files.
- Sidecar remains the local Python executor for built-in tools, sidecar plugin
  tools, and dynamic SDK-registered MCPs. The repo-level desktop MCP path should
  not be silently rerouted through a second sidecar authority.
- CUA Driver is an executor substrate under WindieOS orchestration. WindieOS
  keeps the agent loop, prompt policy, UI, memory, history, and tool-result
  transparency. `cua-driver mcp` owns only the CUA protocol and native
  automation mechanics.
- Prompt-only skills stay prompt layers. They must not become executable tools.
- Sidecar plugins stay Python tool packages. They must not get Electron-main
  `registerTool` handlers.

## Problems To Fix First

- The MCP runtime has `buildClientToolManifestWithMcp(...)`, but the normal
  Electron capability handshake currently builds the synchronous base manifest,
  so repo-level MCP specs can load without becoming model-visible in the
  default desktop agent path.
- MCP specs have no durable product-level enablement model. A checked-in
  `mcps/<id>/mcp.json` should not automatically expose powerful desktop tools.
- The dashboard sidebar has no MCPs section, so users cannot inspect or manage
  local protocol integrations.
- Existing extension docs still have stale path references after the
  `frontend/src/main/extensions/` module move.
- Existing sidecar validation shows unrelated maintenance drift:
  generated browser manifest parity differs on `ref`, and sidecar discovery
  launch-context tests expect fewer source-path fields than current code writes.
  These should be fixed or explicitly separated before trusting broad
  extension validation.

## Out Of Scope

- Replacing WindieOS computer-use tools with CUA Driver.
- Adopting CUA's `ComputerAgent` or Python `cua-mcp-server` as WindieOS'
  orchestration loop.
- Making CUA enabled by default for all users.
- Adding marketplace/package installation semantics.
- Adding credentials, API keys, or machine-specific absolute paths to committed
  MCP specs, docs, or tests.
- Designing a full plugin store. This plan covers local repo contribution roots
  and one explicit CUA Driver MCP integration.

## Ordered Workflow

1. Recover and verify current state.
   - Read this plan, `pending/compaction_safe_plan_execution.md`, docs routing,
     and the extension/MCP docs.
   - Run `bin/windie docs list`.
   - Check `git status` and preserve unrelated dirty files.
   - Inspect recent commits for `extension_manifest.cjs`, `mcp_runtime.cjs`,
     `agent_capability_handshake.cjs`, sidebar navigation, and extension tests.

2. Fix extension/MCP maintenance drift.
   - Update stale docs paths from old `frontend/src/main/mcp_runtime.cjs` style
     references to `frontend/src/main/extensions/*`.
   - Fix or intentionally isolate sidecar validation drift for generated
     built-in manifests and discovery launch-context tests.
   - Re-run focused frontend extension tests and sidecar plugin/MCP tests.

3. Add explicit MCP enablement policy in Electron main.
   - Define an enablement source for repo-level MCPs. Start with a local config
     or environment-backed allowlist, then make it consumable by renderer
     settings.
   - Extend MCP spec normalization with explicit-gate metadata such as
     `requires_user_enable`, without exposing that metadata to the backend as
     policy truth.
   - Filter disabled MCP specs before live discovery and before registry
     reconciliation, so disabled tools are not executable from stale registry
     entries.
   - Add tests proving a disabled spec is visible to the public registry but not
     included in the model manifest or execution registry.

4. Wire MCP discovery into the normal desktop handshake.
   - Introduce an async MCP-aware capability handshake path or make the existing
     desktop startup await `buildClientToolManifestWithMcp(...)`.
   - Preserve plugin tools and skill prompt layers in the same handshake.
   - Include MCP discovery errors in a local status surface, not as backend
     authority.
   - Add tests proving repo-level MCP tools enter `client_tool_manifest` and
     `available_tools` only when enabled and successfully discovered or backed
     by allowed fallback schemas.

5. Add the renderer MCPs section.
   - Add an MCPs product nav item below Models in the dashboard sidebar.
   - Add a section view that lists MCP integrations with status, enabled state,
     command, tool count, last probe/discovery error, and refresh action.
   - Keep the renderer as a view/controller. It should call Electron main IPC
     for registry/status/update actions and should not inspect local files
     directly.
   - Add tests for sidebar rendering, active state, collapsed title behavior,
     and MCP enable/disable intent handling.

6. Add IPC and main-process MCP control APIs.
   - Expose narrow IPC for listing public MCP registry entries, enabling or
     disabling an integration, refreshing discovery, and reading last status.
   - Store user enablement in an existing main-process settings/config boundary
     or a new narrow local store owned by Electron main.
   - Ensure disabled MCPs are removed from the executable MCP registry and from
     the next handshake manifest.
   - Add main-process IPC/runtime tests.

7. Add CUA Driver MCP integration.
   - Add `mcps/cua-driver/mcp.json` with:
     - `id`: `cua-driver`
     - `command`: `cua-driver`
     - `args`: `["mcp"]`
     - `tool_prefix`: `cua_driver`
     - explicit enablement required
     - a timeout long enough for driver startup
   - Prefer `cua-driver mcp`, not Python `cua-mcp-server`, because WindieOS
     should use CUA as driver substrate, not as a nested agent loop.
   - Do not commit local absolute paths to the sibling checkout. If the binary
     is not on `PATH`, surface `Not installed` with installation guidance.
   - Do not hand-maintain 33 fallback schemas in the first slice. Use live
     `tools/list` as the source of truth unless offline diagnostics become a
     hard requirement.

8. Add CUA-specific probing and permission status.
   - Probe non-destructively: binary exists, MCP initialize works, `tools/list`
     works, and optional read-only driver tools such as status/permission checks
     can report readiness.
   - Surface states distinctly: `Off`, `Not installed`, `Needs permission`,
     `Ready`, and `Error`.
   - Do not expose `cua_driver__*` tools when the probe fails.
   - At execution time, refuse stale `cua_driver__*` calls if the integration
     has been disabled since prompt construction.

9. Update docs and product contracts.
   - Update `docs/development/mcp.md`, `docs/development/extensions.md`,
     `docs/plugins/README.md`, and the dashboard sidebar reference.
   - Document that MCP enablement gates model visibility before prompt
     construction and execution at call time.
   - Add a CUA Driver section explaining why it is an executor substrate and
     why it is disabled by default.
   - Update `CHANGELOG.md` during implementation slices.

10. Inspect, validate, and commit in slices.
    - After each slice, reread the touched code and adjacent paths.
    - Record validation and remaining findings in a matching report.
    - Commit small, reviewable slices with `./scripts/committer` after
      validation, unless the user asks not to commit.

## Success Criteria

- Repo-level MCP specs can be listed without enabling them.
- Disabled MCPs do not enter `client_tool_manifest`, `available_tools`, backend
  model-visible schemas, or the local MCP execution registry.
- Enabled MCPs are discovered during the normal desktop handshake and become
  model-visible only after backend client-manifest validation accepts them.
- The MCPs dashboard section shows integration status and can enable, disable,
  and refresh MCP discovery through narrow IPC.
- CUA Driver appears as an explicit disabled-by-default MCP integration.
- CUA Driver tools are exposed as `cua_driver__*` only after explicit enablement
  and a successful non-destructive probe.
- CUA Driver tool execution is refused if the integration is disabled after the
  model saw a prior prompt.
- Skills remain prompt-only and plugin tools remain sidecar-executed.
- Docs and tests describe the final ownership path without stale module paths
  or duplicate authorities.

## Validation Commands

- `bin/windie docs list`
- `cd frontend && npm test -- --runTestsByPath ../tests/frontend/ExtensionManifest.test.cjs ../tests/frontend/McpRuntime.test.cjs ../tests/frontend/AgentCapabilityHandshake.test.cjs ../tests/frontend/LocalBackendBridgeExtensionRuntime.test.cjs --runInBand`
- `cd frontend && npm test -- --runTestsByPath ../tests/frontend/DashboardSidebar.test.jsx --runInBand`
- `./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_tool_manifest.py tests/sidecar/test_sidecar_daemon.py tests/sidecar/test_repo_agent_example.py -q`
- `./scripts/python-in-env backend python -m pytest tests/backend/test_client_tool_manifest.py tests/backend/test_tool_policy.py -q`
- `git diff --check`
- When CUA Driver is installed: `cua-driver list-tools`
- When CUA Driver is installed: run an MCP discovery smoke that initializes
  `cua-driver mcp`, calls `tools/list`, and verifies representative tool names
  such as `list_apps`, `get_window_state`, and `click`.

## Assumptions

- `cua-driver` may not be installed on every machine. The integration must
  report this cleanly and stay disabled/unexposed.
- CUA Driver's live `tools/list` is the schema source of truth for the first
  integration.
- The CUA checkout under `/Users/peterbui/Agent_workspaces/Windieos_workspace/cua`
  is a development checkout, not a committed runtime dependency for WindieOS.
- Existing dirty generated files are unrelated unless an implementation slice
  explicitly validates and updates those generated artifacts.

## Reread Anchors

- `docs/plans/2026-06-11-mcp-plugin-skill-control-plane-plan.md`
- Matching report file once implementation starts:
  `docs/plans/2026-06-11-mcp-plugin-skill-control-plane-report.md`
- `pending/compaction_safe_plan_execution.md`
- `docs/development/mcp.md`
- `docs/development/extensions.md`
- `docs/plugins/README.md`
- `docs/tools/tool_policy_profiles_and_capabilities.md`
- `docs/security/permissions_and_local_authority_workflow.md`
- `docs/frontend/renderer/dashboard/shell/sidebar_search_profile_menu_and_recent_conversation_resume_reference.md`
- `frontend/src/main/extensions/extension_manifest.cjs`
- `frontend/src/main/extensions/mcp_runtime.cjs`
- `frontend/src/main/sdk/agent_capability_handshake.cjs`
- `frontend/src/main/sidecar/local_backend_bridge_execute_tool_runtime.cjs`
- `frontend/src/renderer/features/dashboard/components/sidebar/DashboardSidebarNavigation.jsx`
- `frontend/src/renderer/features/dashboard/components/DashboardSidebar.jsx`
