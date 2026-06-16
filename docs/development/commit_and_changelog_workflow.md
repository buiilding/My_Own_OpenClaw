---
summary: "Commit and changelog workflow for WindieOS agents, covering scoped commits, Conventional Commit subjects, committer helper usage, file selection, and validation reporting."
read_when:
  - When committing completed WindieOS work.
  - When deciding how to write changelog entries, commit subjects, bodies, and validation summaries for docs or code changes.
title: "Commit and Changelog Workflow"
---

# Commit and Changelog Workflow

WindieOS expects completed work to be committed before handoff unless the user explicitly says not to commit.

## Commit Scope

Prefer small commits by completed behavior boundary:

- docs hub expansion
- one tool contract change
- one provider integration slice
- one frontend runtime bugfix
- one install/packaging runbook update

Do not mix unrelated refactors with feature fixes unless the cleanup is required for the fix.

## Changelog

Update `CHANGELOG.md` under `Unreleased` for repo-visible changes:

- user-visible behavior
- API/IPC/schema/config changes
- docs coverage expansions
- packaging/operations changes
- security-relevant behavior

Keep the entry concise:

```text
- docs(scope): describe the docs coverage added.
- fix(scope): describe the behavior fixed.
- feat(scope): describe the capability added.
```

## Commit Helper

Use:

```bash
./scripts/committer "docs(scope): concise subject" --body "Context: documentation was missing the current agent workflow rule.

Ownership: the development workflow doc owns detailed commit guidance, while AGENTS.md owns the top-level agent operating rule this doc mirrors.

Change: updated the commit-body guidance and changelog entry.

Before: docs search returned the older issue/fix-only body shape.

After: docs search returns the contextual body shape expected by AGENTS.md.

Proof: inspected AGENTS.md and checked the focused docs diff.

Notes: no migration required." -- CHANGELOG.md docs/...
```

The helper requires at least one non-empty `--body` value. Commit bodies should
be contextual enough to make `git log` useful months later. The body should
describe:

- what changed
- why the owning runtime, layer, or boundary owns the change
- the previous behavior
- the new behavior or path
- validation performed, or why validation was intentionally limited
- migration, compatibility, security, risk, or follow-up notes when relevant

For code:

```bash
./scripts/committer "fix(scope): concise subject" --body "Context: describe the bug, missing capability, or cleanup pressure.

Ownership: describe why this runtime, layer, or boundary owns the fix.

Change: describe the implementation and behavior change in plain language.

Before: describe what happened before.

After: describe what happens now.

Proof: list focused tests, lint, diagnostics, or manual checks.

Notes: include migration, compatibility, security, risk, or follow-up notes only when relevant." -- changed/files
```

Avoid bodies that repeat the subject, summarize files one by one, or describe
only what changed without explaining why the change belongs in that layer.

The helper stages only listed paths. Check `git status --short --branch` before and after committing.

## Subject Style

Use Conventional Commit subjects:

- `docs(scope): ...`
- `fix(scope): ...`
- `feat(scope): ...`
- `refactor(scope): ...`
- `test(scope): ...`
- `chore(scope): ...`

Choose the scope by subsystem, not by file extension.

## Validation Reporting

After committing or in the final/handoff summary, report:

- commands run
- any skipped commands and why
- commit hash
- residual risk if validation was limited

## Related Docs

- [Agent Development Workflow](agent_development_workflow.md)
- [Validation Matrix](validation_matrix.md)
- [Docs Update Workflow](docs_update_workflow.md)
