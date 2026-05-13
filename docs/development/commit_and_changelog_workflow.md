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
./scripts/committer "docs(scope): concise subject" -- CHANGELOG.md docs/...
```

With body:

```bash
./scripts/committer "fix(scope): concise subject" --body "- explain key behavior\n- mention validation or contract" -- changed/files
```

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
