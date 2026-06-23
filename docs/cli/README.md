---
summary: "Command hub for the first-class WindieOS CLI surface, diagnostics, durable traces, conversation inspection, validation commands, docs search, `commits search` git commit-history lookup, packaging commands, backend operations, and self-host commands."
read_when:
  - When looking for WindieOS command-line entrypoints.
  - When looking for Windie command help, `<windie> --help`, or the current command surface.
  - When using or changing Windie CLI commands, command docs, diagnostics, `<windie> trace`, `<windie> capability trace`, `<windie> conversation messages`, docs tooling, `<windie> commits search`, package commands, or self-host behavior.
title: "Commands and Scripts"
---

# Commands and Scripts

Use the platform shim from the repository root for developer, operator, docs,
test, packaging, backend, endpoint, and self-host workflows: `bin\windie.cmd`
on Windows PowerShell and `bin/windie.sh` on Unix-like shells. Lower-level repo
scripts and package tasks remain implementation adapters behind this command
surface. The command tables below use `<windie>` for the active platform shim.

## Main Commands

| Command | Purpose |
| --- | --- |
| `<windie> status` | Show concise repo and runtime health. |
| `<windie> status --all` | Show backend, frontend, local-runtime Python, docs, and dependency summary. |
| `<windie> doctor` | Run the local diagnostic pass. |
| `<windie> doctor --deep --json` | Run slower probes and emit coding-agent friendly JSON. |
| `<windie> diagnostics paths` | List app diagnostic paths. |
| `<windie> diagnostics list --path <path> --limit <n>` | List persistent app diagnostic rows for a path. |
| `<windie> diagnostics inspect <trace-id>` | Inspect a specific app diagnostic trace row. |
| `<windie> trace <conversation-ref> <turn-ref>` | Inspect durable hidden conversation trace events for a turn. |
| `<windie> capability trace <conversation-ref>` | Inspect capability-level conversation trace summaries. |
| `<windie> conversation list` | List stored conversations. |
| `<windie> conversation state <conversation-ref>` | Inspect selected revision, display timeline row count, model-history row count, raw event count, and stale branch diagnostics without dumping message bodies or tool output. |
| `<windie> conversation messages <conversation-ref>` | Print stored visible conversation messages from the local-runtime `desktop-runtime/history/history.db` root unless `AGENT_USER_DATA_DIR` or `WINDIE_USER_DATA_DIR` overrides it. |
| `<windie> conversation events <conversation-ref>` | Inspect persisted conversation events, optionally by turn/type. |
| `<windie> conversation traces <conversation-ref>` | Inspect persisted trace events for a conversation. |
| `<windie> start backend` | Start the backend dev server. |
| `<windie> start frontend` | Start Vite dev server. |
| `<windie> start desktop` | Start Electron dev app. |
| `<windie> start dev` | Start Vite dev server and Electron dev app together. |
| `<windie> start customer` | Start Vite dev server and Electron customer app together through the frontend/local-runtime Python environment wrapper. |
| `<windie> start all` | Start backend, frontend, and desktop dev processes together. |
| `<windie> stop` | Stop tracked Windie dev processes when process tracking exists. |
| `<windie> logs frontend` | Tail the captured Electron main/frontend desktop log stream. |
| `<windie> logs vite` | Tail the captured Vite dev-server log stream. |
| `<windie> logs main` | Tail Electron main-process logs. |
| `<windie> logs renderer --verbose` | Tail renderer logs, optionally including verbose renderer entries. |
| `<windie> logs local-runtime` | Tail local-runtime daemon logs. |
| `<windie> logs backend --remote --host windie-prod` | Tail remote backend logs through the guarded backend log command. |
| `<windie> test backend` | Run backend tests. |
| `<windie> test local-runtime` | Run local-runtime Python tests. |
| `<windie> test frontend` | Run frontend Jest CI tests. |
| `<windie> test all` | Run backend, local-runtime Python, and frontend validation. |
| `<windie> docs list` | List docs with front matter and read hints. |
| `<windie> docs check` | Run docs listing plus whitespace checks. |
| `<windie> docs search <query>` | Search local docs by path, title, summary, `read_when` hints, and headings; exact phrase and all-term matches rank highest. |
| `<windie> docs <query>` | Shorthand local docs search. |
| `<windie> commits search <query>` | Search recent git commits by subject, body, author, hash, date, and changed paths. |
| `<windie> commits search <query> --limit 20 --json` | Return a bounded machine-readable commit-search result set. |
| `<windie> build frontend` | Build the frontend bundle. |
| `<windie> build local-runtime` | Build the bundled Python local-runtime payload. |
| `<windie> package mac` | Package macOS artifacts. |
| `<windie> package win` | Package Windows artifacts. |
| `<windie> package linux` | Package Linux artifacts. |
| `<windie> reinstall mac` | Rebuild, reinstall, and launch the local macOS app. |
| `<windie> reinstall win` | Rebuild and reinstall the local Windows app. |
| `<windie> reinstall linux` | Rebuild and reinstall the local Linux app. |
| `<windie> backend health` | Probe backend health. |
| `<windie> backend deploy --host windie-prod` | Deploy/restart a remote backend host. |
| `<windie> endpoint show` | Print the resolved HTTP/WebSocket endpoint contract. |
| `<windie> self-host status` | Check self-host backend and tunnel service state. |

## Deep Command Docs

- [Command Matrix](command_matrix.md) maps the full `<windie>` command surface.
- [Validation Commands](validation_commands.md) maps tests, lint, typecheck, docs checks, and focused validation commands by changed boundary.
- [Packaging and Release Commands](packaging_and_release_commands.md) maps bundled Python runtime builds, package commands, smoke helpers, local reinstall commands, and release guardrails.

Compatibility aliases still accepted by the CLI for older scripts: `<windie>
logs sidecar`, `<windie> test sidecar`, and `<windie> build
sidecar-runtime`. Prefer the primary `local-runtime` commands in new docs and
automation.
