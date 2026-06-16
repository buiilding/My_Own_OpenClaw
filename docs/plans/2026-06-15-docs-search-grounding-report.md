---
summary: "Execution report for the docs-search grounding and documentation organization pass."
read_when:
  - When continuing or auditing the docs-search grounding implementation.
  - When checking validations, findings, decisions, and remaining work for the docs-routing pass.
title: "Docs Search Grounding Report"
---

# Docs Search Grounding Report

Plan: [Docs Search Grounding Plan](2026-06-15-docs-search-grounding-plan.md)

## Checklist

- [x] Inspect docs tooling and command behavior.
- [x] Reproduce weak and strong search query samples.
- [x] Inspect current docs hubs, docs navigation, and source-root coverage.
- [x] Improve docs search scoring.
- [x] Add focused tests.
- [x] Update docs metadata, hubs, and navigation.
- [x] Update changelog.
- [x] Run validation.
- [x] Final inspection confirms no in-scope docs-routing findings remain.

## Initial Findings

- `scripts/windie/docs.cjs` scores each query token independently and does not
  reward exact phrase or all-term query intent.
- `model catalog` currently returns
  `docs/frontend/sidecar/tool_catalog_and_execution_model.md` before provider
  docs.
- `mcp tool result` currently returns generic backend tool-result references
  before `docs/development/mcp.md`, which contains the MCP result contract.
- `docs/docs.json` validates 83 canonical page references, but the docs tree has
  hundreds of detailed Markdown pages. This is not inherently wrong; the
  canonical navigation should stay hub-oriented while search handles exact deep
  references.
- Several implemented first-class domains have no canonical docs navigation
  entrypoint: plugins/extensions, platforms, memory, desktop, channels, CLI,
  automation, gateway, nodes, web, and help.

## Decisions

- Keep the docs organized as hubs plus deep references rather than collapsing
  implementation references into one large file.
- Include docs-search scoring in scope because the user asked for
  `bin/windie docs search <query>` to return better specific context.
- Do not restore pre-existing deleted `docs/plans` files; only add this plan and
  report for the active task.
- Demote `docs/plans`, `docs/planning`, and `docs/refactors` results for normal
  feature queries unless the query explicitly asks for plans, refactors, or
  reports. Current code-behavior docs should beat historical planning artifacts.

## Changes Made

- Updated `scripts/windie/docs.cjs` to normalize separators, include Markdown
  headings in the searchable index, reward exact phrase and all-query-term
  matches, use deterministic discovered-file ordering, and keep canonical
  navigation order as a tiebreaker.
- Added Jest coverage for:
  - `model catalog` returning provider/model docs before sidecar tool-catalog docs.
  - `mcp tool result` returning the MCP runtime/result contract first.
  - `workspace context` keeping current workflow docs ahead of historical
    refactor plans.
- Expanded `docs/docs.json` with current feature hubs for runtime nodes,
  channels, gateway, memory, desktop, platforms, plugins, MCP, browser,
  automation, web, help, and CLI.
- Expanded `docs/getting-started/docs_directory.md` with compact routes to the
  same current feature hubs.
- Updated CLI and docs workflow docs to describe docs-search ranking behavior.
- Added `title` and MCP result-contract metadata to `docs/development/mcp.md`.
- Updated `CHANGELOG.md`.

## Validation Log

- Passed: representative docs-search sample set:
  - `bin/windie docs search "model catalog"` returns
    `docs/providers/model_catalog_change_workflow.md` first.
  - `bin/windie docs search "mcp tool result"` returns
    `docs/development/mcp.md` first.
  - `bin/windie docs search "workspace context"` returns current workflow and
    concept docs before historical refactor plans.
  - Other sampled feature queries return specific owner docs near the top:
    `minimal chat pill`, `websocket event`, `vm runs`, `landing page`,
    `wakeword`, `sidecar memory`, `stop query`, `plugins extensions`,
    `platform screenshot`, and `commands scripts`.
- Passed: `bin/windie docs list`
- Passed: `bin/windie test frontend -- WindieDocsIndex.test.cjs DocsListScript.test.cjs`
- Passed: `git diff --check`

## Commits

- Pending.

## Blockers

- None.

## Final Inspection

The in-scope search-quality failures are fixed. Current owner docs now beat the
previous broad or historical results for the weak queries found during
preflight, while the existing strong feature queries still return grounded
domain docs. Canonical navigation remains hub-oriented instead of attempting to
list every deep implementation reference.
