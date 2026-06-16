---
summary: "Plan for aligning WindieOS documentation routing and docs-search results with current code behavior."
read_when:
  - When continuing the docs-search grounding and documentation organization pass.
  - When changing `bin/windie docs search`, docs navigation, docs hubs, or docs coverage expectations.
title: "Docs Search Grounding Plan"
---

# Docs Search Grounding Plan

## User Intent

Update WindieOS documentation so it matches current code behavior and make
`bin/windie docs search <query>` return the most specific, grounded context for
common implementation questions. Organize the docs by splitting, unifying, or
rewiring pages where that improves routing. Docs should cover the current feature
surface.

## Current Findings

- `bin/windie docs search` loads `docs/docs.json` plus every discovered Markdown
  file under `docs/`.
- The scorer currently adds independent term matches for page, title, summary,
  and `read_when` text. It does not reward phrase matches or full-query intent.
- Sample searches are strong for some domains (`minimal chat pill`,
  `websocket event`, `vm runs`, `landing page`, `wakeword`, `workspace context`,
  `sidecar memory`, `stop query`) but weak for ambiguous terms:
  - `model catalog` ranks sidecar tool-catalog docs before provider/model docs.
  - `mcp tool result` ranks generic backend tool-result internals before the
    MCP runtime contract.
- `docs/docs.json` is intentionally compact, but it under-represents several
  first-class feature domains as curated entrypoints: plugins/extensions,
  platforms, memory, desktop, channels, CLI, automation, gateway, nodes, web,
  and help.
- Backend and frontend docs already contain broad, source-root-grounded hubs and
  many implementation references. The better path is to preserve those detailed
  docs, improve routing, and add missing canonical hub entrypoints instead of
  duplicating all detailed pages in top-level navigation.

## Architecture

- Source of truth for docs content remains Markdown front matter and hub pages.
- Source of truth for canonical navigation remains `docs/docs.json`.
- Source of truth for searchable results remains the docs indexer in
  `scripts/windie/docs.cjs`.
- `bin/windie docs search` should prefer exact phrase, title/path, and
  all-query-term intent over broad single-token overlap.
- Existing detailed backend/frontend/source-map docs stay in place. This pass
  should route agents to the right hub or exact reference, not flatten all docs
  into one mega-file.

## In Scope

1. Improve docs-search ranking so exact phrase and all-term matches beat broad
   partial matches.
2. Add focused tests for search quality regressions.
3. Update docs metadata/hubs where weak queries need more precise routing.
4. Expand `docs/docs.json` with missing first-class domain hubs and workflow
   entrypoints, while keeping implementation references discoverable by search.
5. Update docs workflow/CLI docs if search semantics change.
6. Update `CHANGELOG.md`.
7. Keep this plan's matching report current with findings, validations, and any
   deviations.

## Out of Scope

- Rewriting every deep generated/source-map reference.
- Deleting existing detailed implementation docs without a concrete duplicate
  owner and verification.
- Changing product/runtime behavior unrelated to docs search and docs routing.
- Restoring or reverting unrelated pre-existing worktree deletions under
  `docs/plans`.

## Workflow

1. Reproduce current docs search behavior with representative feature queries.
2. Inspect the docs indexer, docs listing validator, source-root docs hubs, and
   command tests.
3. Tighten `scripts/windie/docs.cjs` scoring to reward:
   - exact phrase matches,
   - title/path/summary matches more than body/read_when matches,
   - documents matching every query term,
   - canonical navigation order as a deterministic tiebreaker.
4. Add focused Jest coverage for the weak query cases.
5. Update the most relevant docs metadata and hub routing for MCP, provider
   model catalog, docs-search semantics, and missing first-class domains.
6. Update `docs/docs.json` to expose current feature hubs without trying to
   enumerate every deep implementation reference.
7. Run focused validations.
8. Perform a final search-quality inspection and update the report.

## Success Criteria

- `bin/windie docs search "model catalog"` returns provider/model catalog docs
  before sidecar tool catalog docs.
- `bin/windie docs search "mcp tool result"` returns the MCP runtime/result
  contract before generic backend tool-result internals.
- Existing strong sample searches still return specific, domain-owned docs near
  the top.
- `bin/windie docs list` passes.
- Focused frontend docs-index tests pass.
- `git diff --check` passes.
- `CHANGELOG.md` describes the docs/search behavior change.

## Validation Commands

```bash
bin/windie docs search "model catalog"
bin/windie docs search "mcp tool result"
bin/windie docs search "minimal chat pill"
bin/windie docs search "websocket event"
bin/windie docs search "vm runs"
bin/windie docs list
bin/windie test frontend -- WindieDocsIndex.test.cjs DocsListScript.test.cjs
git diff --check
```

## Reread Anchors

- `pending/compaction_safe_plan_execution.md`
- `docs/development/docs_update_workflow.md`
- `scripts/windie/docs.cjs`
- `tests/frontend/WindieDocsIndex.test.cjs`
- `docs/docs.json`
- `docs/getting-started/docs_hub.md`
- `docs/getting-started/docs_directory.md`
- `docs/development/mcp.md`
- `docs/providers/README.md`
- `docs/cli/README.md`
- `docs/cli/command_matrix.md`

## Assumptions

- The active `/goal` means implementation should continue after the plan rather
  than waiting for a separate approval turn.
- This pass can touch docs tooling because the requested outcome is the quality
  of `bin/windie docs search <query>` output.
- The existing dirty worktree state is user-owned unless this task directly
  modifies a path.
