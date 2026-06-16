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
./scripts/committer "docs(scope): concise subject" --body "What changed:
Updated the commit workflow docs and changelog entry for the agent instruction rule.

Owning layer:
The development workflow docs own detailed commit guidance, while AGENTS.md owns the top-level agent operating rule this doc mirrors.

Previous behavior:
Docs search returned an older body shape that did not match the current AGENTS.md completion-artifacts rule.

New path:
Docs search returns the same required section structure that the committer helper enforces.

Validation:
Ran the focused docs diff and committer helper tests.

Migration/security:
No migration required. No security-sensitive boundary changed." -- CHANGELOG.md docs/...
```

The helper requires at least one non-empty `--body` value and rejects commits
whose combined body does not use this exact section order:

- `What changed:`
- `Owning layer:`
- `Previous behavior:`
- `New path:`
- `Validation:`
- `Migration/security:`

Each section must include non-placeholder content. Keep `Migration/security:`
present even when there is no migration or security-sensitive boundary; use an
explicit note such as "No migration required. No security-sensitive boundary
changed."

For code:

```bash
./scripts/committer "fix(scope): concise subject" --body "What changed:
Describe the implementation and behavior change in plain language.

Owning layer:
Describe why this runtime, layer, or boundary owns the fix.

Previous behavior:
Describe what happened before.

New path:
Describe what happens now or which path owns the behavior.

Validation:
List focused tests, lint, diagnostics, or manual checks.

Migration/security:
Include migration, compatibility, security, risk, or follow-up notes; when none apply, say so explicitly." -- changed/files
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
