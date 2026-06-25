## Required Orientation

Before coding or answering implementation questions:

- Search local docs by feature or symptom:
  `<windie> docs search <query>` or the shorthand `<windie> docs <query>`.
  Use `bin\windie.cmd` on Windows PowerShell and `bin/windie.sh` on
  Unix-like shells; examples below use `<windie>` for the platform shim.
- Read the nearest `read_when` docs until the domain and behavior are clear.
- When finding or fixing a bug, check `<windie> --help` and the command
  registry behind it for existing commands tied to the affected runtime or
  failing path. You can ask the user to simulate the specified bug so you could trace the paths to find the bug
- Search recent commits by affected feature or symptom:
`<windie> commits search <query>`.
- Read `docs/debug/invariants.md` as the central ledger for durable WindieOS
  invariants, only read if relevant. Before implementing something, make sure you don't violate the invariants.

Feature map:

Core WindieOS feature areas:

- Desktop shell: minimal chat pill, response overlay, dashboard, onboarding,
  permissions, window/overlay lifecycle, and desktop logs.
- Agent runtime: SDK `WindieClient`/`WindieAgent`, conversation runtime, live
  turn projection, replay, compaction, title generation, and local/hosted query
  routing.
- Local authority: Python sidecar, executable tool catalog, computer-use,
  browser-use, filesystem, shell, screenshots, OCR/vision, wakeword, voice, and
  local memory.
- Hosted/backend authority: FastAPI routes, websocket query stream, provider
  policy, prompt compilation, remote tools such as `web_search`, artifacts,
  runs API, install auth, and deploy/runtime operations.
  The backend runs remotely and GitHub automatically deploys remote `main`
  updates.
- Extensibility: SDK tools, built-in tool manifests, extension packages, plugin
  tools, MCP server config, skills as prompt layers, provider integrations, and
  future marketplace/plugin boundaries.
- Persistence and memory: renderer transcripts, session/conversation identity,
  backend active history, sidecar episodic/semantic memory, artifacts, caches,
  and migration/compatibility notes.

Fast routing queries:

- `<windie> docs minimal chat pill`
- `<windie> docs overlay phase`
- `<windie> docs tool schema policy`
- `<windie> docs sidecar tool`
- `<windie> docs conversation runtime`
- `<windie> docs memory replay`
- `<windie> docs provider change`
- `<windie> docs websocket event`
- `<windie> docs runs api`
- `<windie> docs extension`
- `<windie> docs screenshot overlay`
- `<windie> docs test selection`

Architecture rules:

- Be unbiased and logical first.
- Treat every user-visible or runtime bug as a discovered invariant.
- Prefer the direct owner-correct path: fix root causes at the owning runtime,
  normalize inputs at boundaries, fail fast on invalid state, and split distinct
  states into named handlers instead of stacking nested fallbacks.
- Prefer deletion-first cleanup. Remove duplicate authorities, stale bridges,
  alias paths, compatibility shims, legacy code,  and adapter layers that only rename payloads
  unless the user explicitly asks for compatibility or a verified dependency
  needs it.
- Decide to widen within the same runtime boundary when it reduces code, duplication,
  coupling, or future compatibility burden. Escalate before crossing subsystem
  ownership boundaries, changing public contracts, or starting a large rewrite.
- Decide to add abstractions only when they simplify the current path, centralize a real
  contract, unlock deletion, or make an invariant testable.
- Keep modules focused. Split large files when it improves clarity or testing;
  keep backend code typed and formatted with `black`/`isort`; keep renderer code
  in `src/renderer`, main-process/IPC code in `src/main`, and use `eslint` for
  related frontend changes.
- Preserve unrelated dirty worktree changes. Report only files and behavior you
  changed, and stop only if unexpected changes affect files you are editing.

## Coding Standards

Environment and commands:

Baseline: Python 3.11 and Node 18+.

Prefer the wrapper over manual environment activation:

- Windows PowerShell: `scripts\python-in-env.cmd <backend|frontend|sidecar> <cmd...>`
- Unix-like shells: `./scripts/python-in-env.sh <backend|frontend|sidecar> <cmd...>`

Validation:

- Backend tests: `<windie> test backend`
- Sidecar tests: `<windie> test sidecar`
- Frontend tests: `<windie> test frontend`
- Frontend lint: `cd frontend && npm run lint`

Docs and testing policy:

When behavior or APIs change:

- Update docs and focused tests in the same change.
- Cover changed behavior, likely regressions, and realistic edge/failure cases.
- Add `read_when` hints for cross-cutting docs when useful.
- Use `pytest` for backend and sidecar tests.
- Use `jest` for frontend tests.
- Put new tests under `tests/backend`, `tests/sidecar`, `tests/frontend`, or
  `tests/sdk` unless extending an existing test module.
- Prefer unit-level tests with minimal I/O.
- Mock network and system calls.
- If you change tool parsing, execution flow, or IPC, add coverage across
  backend, sidecar, and frontend as needed.
- Purely visual UI tweaks may skip new tests when they would be low-signal.

Git and PR workflow:

Safe defaults:

- Allowed by default: `git status`, `git diff`, `git log`.
- Push only when the user asks.
- `git checkout` is allowed for PR review or explicit user request.
- Branch changes require user consent.

Requires explicit approval:

- Destructive commands such as `git reset --hard`, `git clean`, `git restore`,
  and `rm`.

Commit policy:

- Commit completed changes by default after implementation and validation,
  unless the user explicitly asks not to commit or asks to inspect/test first.
- Prefer small, frequent commits.
- Amend only when asked.
- Update `CHANGELOG.md` before committing repo-visible changes.
- Preferred helper: `./scripts/committer.sh` or `committer`.
- `--body` is required for every commit.
- Commit bodies should follow the Architecture Rules completion-artifacts
  guidance. Avoid repeating the subject, summarizing files one by one, or
  describing what changed without why it belongs in that layer.
- On Windows PowerShell, prefer Git Bash or plain `git add` and `git commit`
  instead of invoking `./scripts/committer.sh` directly.

Use Conventional Commits with a body section.

Additional git notes:

- Use HTTPS remotes; flip SSH to HTTPS before pull or push if needed.
- Avoid deleting or renaming unexpected files.
- Prefer targeted edits over repo-wide search-and-replace scripts.
- Keep commits reviewable while still allowing broader same-boundary cleanup
  when it creates less code, stronger ownership, and a more foundational path.
- Avoid manual `git stash`.
- If Git auto-stashes during pull or rebase, that is fine.
- If the user types a command like "pull and push", that counts as consent for
  that command.
- For large reviews, use `git --no-pager diff --color=never`.
- In multi-agent situations, check `git status` and `git diff` before editing.

PR modes:

- Review mode: use `gh pr view` and `gh pr diff`; keep the checkout and code
  unchanged.
- Landing mode: create an integration branch from `main`, bring in PR commits
  with rebase or squash, apply fixes, run relevant tests, merge back to `main`,
  and delete the temporary branch.
- PR summaries should mention testing performed and user-facing changes.

Release flow:

- Look for release instructions in `docs/`, `RELEASING.md`, or `release.md`.
- Change version numbers or publish artifacts only with explicit approval.
- Before any release step, run the relevant tests.
- If UI is touched, include frontend test, lint, and build checks as appropriate.
- For local macOS reinstalls, skip Apple notarization so local rebuild/reinstall
  loops avoid waiting on Apple services.

Security and configuration:

- API keys should come from environment variables.
- Core config lives in `backend/src/core/config/app_config.py` and
  `backend/src/core/config/models.py`.
- Keep real credentials, user data, and machine-specific paths out of docs and
  tests.
- Leave `node_modules` and vendored dependency output untouched.
- Dependency patching, overrides, or vendored changes require explicit approval.

Issues, PR comments, and tmux:

- Use literal multiline strings or heredocs for real newlines in posted issues
  and PR comments.
- Prefer real newlines over `\\n` in posted text.
- Use tmux only when persistence or interactive debugging is needed.
- Quick refs: `tmux new -d -s codex-shell`, `tmux attach -t codex-shell`,
  `tmux list-sessions`, `tmux kill-session -t codex-shell`.
