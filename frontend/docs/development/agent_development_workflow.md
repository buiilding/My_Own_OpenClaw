---
summary: "Step-by-step workflow for WindieOS coding agents to inspect docs, choose owners, edit safely, validate, document, and commit changes."
read_when:
  - When starting a non-trivial WindieOS implementation or docs update.
  - When choosing how to move from code discovery to safe edits and commits.
title: "Agent Development Workflow"
---

# Agent Development Workflow

This workflow is for agents working in the WindieOS checkout. It is intentionally concrete: read docs first, identify the owner boundary, make focused edits, validate the changed boundary, update docs, and commit.

## 1. Preflight

Run:

```bash
git status --short --branch
<windie> docs list
```

If `<windie> docs list` is unavailable:

```bash
<windie> docs list
```

Use `git status` to see existing changes. Do not revert unrelated user or agent changes. Work around unrelated dirty files unless they block your task.

## 2. Route the Change

Start with [Documentation Hub](../getting-started/docs_hub.md), then choose the owner:

| Change type | Owner |
| --- | --- |
| websocket route, outgoing event, query loop, prompt metadata | backend API/agent |
| LLM provider, model catalog, prompt, web search | backend LLM/provider |
| model-facing tool schema, tool policy, coordinate prep, result processing | backend tools/agent tools |
| local computer/filesystem/shell/browser execution | local-runtime tools |
| IPC bridge, local-runtime host status, windows, overlays, permissions | Electron main |
| chat/dashboard/settings/memory/model UI | renderer |
| transcript/replay/local memory | renderer plus local-runtime memory; backend history when live agent state changes |
| packaging/reinstall/release/hosted endpoint | operations |

Do not patch a downstream consumer to hide an upstream contract bug unless the consumer is actually the owner.

## 3. Read the Focused Docs

Minimum doc pass:

1. Domain hub for the owner.
2. Capability-to-file matrix if available.
3. Deep reference page for the exact behavior.
4. [Validation Matrix](validation_matrix.md) for test selection.

For tool work, read:

- [Tool Catalog Matrix](../tools/tool_catalog_matrix.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)
- [Tool Policy Profiles and Capabilities](../tools/tool_policy_profiles_and_capabilities.md)

For operations work, read:

- [Operations Hub](../operations/README.md)
- Runtime Configuration Matrix (private backend docs)

## 4. Inspect Code Before Editing

Prefer fast local searches:

```bash
rg "symbol_or_event_name"
rg --files backend/src frontend/src tests docs
```

Read the immediate owner files and the tests around them. When possible, inspect current tests before changing behavior so new coverage matches the local style.

## 5. Edit Scope

Keep each patch around one behavior boundary:

- schema plus parser tests
- IPC channel plus bridge tests
- local-runtime executable plus local-runtime Python tests
- renderer UI state plus renderer tests
- docs-only routing update plus docs listing/link checks

Widen only when the boundary requires it, for example a tool schema change that must update backend schema, SDK/main local-runtime dispatch, local-runtime executable registry implementation, renderer projection handling, docs, and parity tests.

## 6. Validation

Choose the narrowest meaningful command first, then widen if the change has broad impact:

- backend: `./scripts/python-in-env backend python -m pytest <backend-test-or-path>`
- local-runtime Python: `./scripts/python-in-env local-runtime python -m pytest <sidecar-test-or-path>`
- frontend: `<windie> test frontend -- path/to/test`
- docs: `<windie> docs list`

See [Validation Matrix](validation_matrix.md) for broader gates.

## 7. Documentation

Update docs when behavior, APIs, IPC contracts, tool schemas, config, packaging, or debug procedures change.

Preferred doc targets:

- domain hub for discoverability
- deep reference for exact behavior
- [Documentation Hub](../getting-started/docs_hub.md) when the new page materially improves routing
- [OpenClaw Docs Structure Reference](../reference/openclaw_docs_structure_reference.md) for docs-organization changes
- `CHANGELOG.md` under `Unreleased`

## 8. Commit

Use the repo helper:

```bash
./scripts/committer "docs(scope): concise subject" --body "What changed:
Describe what guidance was added or corrected.

Owning layer:
Describe why these docs own the guidance.

Previous behavior:
Describe what agents or users saw before.

New path:
Describe what agents or users can rely on now.

Validation:
List docs checks, link checks, or why validation was limited.

Migration/security:
No migration required. Note security impact when relevant." -- path/to/file.md CHANGELOG.md
```

For code:

```bash
./scripts/committer "fix(scope): concise subject" --body "What changed:
Describe the implementation and behavior change.

Owning layer:
Describe why this runtime, layer, or boundary owns the fix.

Previous behavior:
Describe what happened before.

New path:
Describe what happens now or which path owns the behavior.

Validation:
List focused tests, lint, diagnostics, or manual checks.

Migration/security:
No migration required. Note migration or security impact when relevant." -- changed/files
```

The helper stages only listed paths. Include `CHANGELOG.md` in the same commit when the change updates it.
