---
summary: "Docs update workflow for WindieOS agents, covering docs listing, read_when routing, hub updates, changelog entries, link checks, whitespace checks, and when docs-only changes need tests."
read_when:
  - When adding, moving, renaming, or expanding WindieOS documentation.
  - When tuning docs search grounding, docs-search ranking, `<windie> docs search`, or `read_when` routing quality.
  - When behavior changes require docs updates across hubs, references, runbooks, and changelog entries.
title: "Docs Update Workflow"
---

# Docs Update Workflow

Use this workflow for docs-only work and for implementation changes that require documentation updates.

## Preflight

```bash
git status --short --branch
<windie> docs list
```

For targeted orientation, use docs search before broad file scans:

```bash
<windie> docs search "<feature or symptom>"
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

`<windie> docs search <query>` ranks exact phrase and all-query-term matches
ahead of broad partial matches. Keep titles, summaries, `read_when` hints, and
section headings specific enough that queries like `model catalog` or
`mcp tool result` land on the owning workflow or contract before generic
references.

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
<windie> docs list
git diff --check
```

For changed docs with relative links, run a focused link check or manually verify links. Docs-only changes usually do not need code tests unless a docs generator, schema snapshot, or script changed.

## Commit

Include `CHANGELOG.md` for repo-visible docs coverage changes:

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
No migration required. Note security impact when relevant." -- CHANGELOG.md docs/...
```

## Related Docs

- [Documentation Hub](../getting-started/docs_hub.md)
- [Planning Hub](../planning/README.md)
- [Architecture Decision Records](../adr/README.md)
