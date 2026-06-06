---
summary: "Docs update workflow for WindieOS agents, covering docs listing, read_when routing, hub updates, changelog entries, link checks, whitespace checks, and when docs-only changes need tests."
read_when:
  - When adding, moving, renaming, or expanding WindieOS documentation.
  - When behavior changes require docs updates across hubs, references, runbooks, and changelog entries.
title: "Docs Update Workflow"
---

# Docs Update Workflow

Use this workflow for docs-only work and for implementation changes that require documentation updates.

## Preflight

```bash
git status --short --branch
bin/windie docs list
```

If `bin/windie docs list` is unavailable:

```bash
bin/windie docs list
```

## Choose The Doc Type

| Need | Doc target |
| --- | --- |
| route agents to a subsystem | domain hub or `docs/getting-started/docs_hub.md` |
| expose a page in canonical navigation | `docs/docs.json` |
| expose a page in the compact route map | `docs/getting-started/docs_directory.md` |
| explain current behavior | stable domain doc under `docs/<domain>` |
| capture exact API/event/config fields | `docs/reference` or owner-specific contracts |
| explain operational/debug procedure | `docs/operations`, `docs/debug`, `docs/help`, or `docs/install` |
| describe future work | `docs/planning` |
| capture durable decision | `docs/adr` |
| compare docs organization | `docs/reference/openclaw_docs_structure_reference.md` |

## Required Front Matter

Every Markdown doc under `docs/` should include:

```yaml
---
summary: "One sentence describing the page."
read_when:
  - When this page should be read.
title: "Page Title"
---
```

Use `read_when` hints to route agents before code edits.

## Hub Wiring

When adding a page, consider:

- `docs/docs.json` when the page belongs in canonical navigation
- `docs/getting-started/docs_directory.md` when the page should be easy to find from the compact directory
- owner domain hub
- `docs/README.md`
- `docs/getting-started/docs_hub.md`
- `docs/reference/openclaw_docs_structure_reference.md` for docs-organization changes
- neighboring troubleshooting/runbook pages

Do not add every deep implementation page to every hub. Add pages that materially improve routing.

## Validation

Run:

```bash
bin/windie docs list
git diff --check
```

For changed docs with relative links, run a focused link check or manually verify links. Docs-only changes usually do not need code tests unless a docs generator, schema snapshot, or script changed.

## Commit

Include `CHANGELOG.md` for repo-visible docs coverage changes:

```bash
./scripts/committer "docs(scope): concise subject" --body "Issue: describe why the docs changed.

Fix: describe what guidance was added or corrected.

Previous behavior: describe what agents or users saw before.

Behavior after fix: describe what they can rely on now." -- CHANGELOG.md docs/...
```

## Related Docs

- [Documentation Hub](../getting-started/docs_hub.md)
- [Planning Current vs Future Boundary](../planning/current_vs_future_boundary.md)
- [Architecture Decision Records](../adr/README.md)
