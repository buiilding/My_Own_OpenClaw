---
summary: "Execution plan for incrementally converging the desktop renderer, Electron main host, SDK, and backend around the general agent UI runtime boundary."
title: "General Agent UI Runtime Boundary Execution Plan"
---

# General Agent UI Runtime Boundary Execution Plan

Date: 2026-06-16

## User Intent

Implement `plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md` until the codebase reads as:

- Renderer: generic chat desktop UI package plus WindieOS skin/config.
- Main: generic Electron agent host plus OS/window/permission adapters.
- SDK: durable conversation runtime, projections, tool/local runtime contracts, agent API.
- Backend: WindieOS hosted orchestration, provider policy, prompt/runtime specifics.

After context compaction, recover progress from this plan, the matching report, recent commits, and relevant uncommitted changes before choosing the next slice.

## Architectural Change

- Move product-specific renderer presentation details into explicit skin/config modules.
- Keep renderer feature components focused on UI state, interactions, and display projections.
- Move runtime semantics toward SDK contracts and backend-owned policy rather than renderer or Electron compatibility paths.
- Keep Electron main as a host/composition layer that adapts OS, windows, permissions, local machine integration, and IPC to SDK interfaces.
- Delete obsolete compatibility paths when the caller graph proves they are no longer needed.

## Current Slice

Start with renderer skin/config ownership. Settings components still include WindieOS-specific copy and runtime wording directly. Introduce a skin module and use it from these UI components so the renderer can evolve toward a generic desktop agent UI package with a WindieOS skin.

## Out Of Scope For This Slice

- Renaming every renderer CSS class or event channel that intentionally preserves public/internal compatibility.
- Moving SDK command names or IPC channel names.
- Reworking backend provider policy or sidecar tool execution.
- Visual redesign.

## Workflow

1. Inspect live code, recent commits, and uncommitted changes.
2. Record findings in the matching report.
3. Implement one coherent ownership slice.
4. Add focused tests that protect the new boundary.
5. Update docs/changelog for repo-visible behavior or architecture changes.
6. Run targeted validation.
7. Re-inspect affected paths and classify remaining findings.

## Validation Commands

- `cd frontend && npm test -- --runTestsByPath ../tests/frontend/RendererSkinConfigBoundary.test.cjs`
- `git diff --check`

Additional commands should be added to the report when a slice touches SDK, main, backend, or broader renderer runtime behavior.

## Reread Anchors

- `plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md`
- `docs/plans/2026-06-16-general-agent-ui-runtime-boundary-report.md`
- `docs/development/agent_runtime_ownership_and_change_routing.md`
- `docs/architecture/frontend_architecture.md`
- `docs/sdk/windie_client_runtime.md`
- `git status --short --branch`
- `git log --oneline -n 12`

