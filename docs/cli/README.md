---
summary: "Command hub for the first-class WindieOS CLI surface, diagnostics, durable traces, conversation inspection, validation commands, docs search, `commits search` git commit-history lookup, packaging commands, backend operations, and self-host commands."
read_when:
  - When looking for WindieOS command-line entrypoints.
  - When looking for Windie command help, `bin/windie --help`, or the current command surface.
  - When using or changing Windie CLI commands, command docs, diagnostics, `bin/windie trace`, `bin/windie capability trace`, `bin/windie conversation messages`, docs tooling, `bin/windie commits search`, package commands, or self-host behavior.
title: "Commands and Scripts"
---

# Commands and Scripts

Use `bin/windie ...` from the repository root for developer, operator, docs,
test, packaging, backend, endpoint, and self-host workflows. Lower-level repo
scripts and package tasks remain implementation adapters behind this command
surface.

On Windows PowerShell, use `bin\windie.cmd ...`. The extensionless `bin/windie`
shim is for Unix-like shells and can trigger Windows' file association picker.

## Main Commands

| Command | Purpose |
| --- | --- |
| `bin/windie status` | Show concise repo and runtime health. |
| `bin/windie status --all` | Show backend, frontend, sidecar, docs, and dependency summary. |
| `bin/windie doctor` | Run the local diagnostic pass. |
| `bin/windie doctor --deep --json` | Run slower probes and emit coding-agent friendly JSON. |
| `bin/windie diagnostics paths` | List app diagnostic paths. |
| `bin/windie diagnostics list --path <path> --limit <n>` | List persistent app diagnostic rows for a path. |
| `bin/windie diagnostics inspect <trace-id>` | Inspect a specific app diagnostic trace row. |
| `bin/windie trace <conversation-ref> <turn-ref>` | Inspect durable hidden conversation trace events for a turn. |
| `bin/windie capability trace <conversation-ref>` | Inspect capability-level conversation trace summaries. |
| `bin/windie conversation list` | List stored conversations. |
| `bin/windie conversation messages <conversation-ref>` | Print stored visible conversation messages. |
| `bin/windie conversation events <conversation-ref>` | Inspect persisted conversation events, optionally by turn/type. |
| `bin/windie conversation traces <conversation-ref>` | Inspect persisted trace events for a conversation. |
| `bin/windie start backend` | Start the backend dev server. |
| `bin/windie start frontend` | Start Vite dev server. |
| `bin/windie start desktop` | Start Electron dev app. |
| `bin/windie start dev` | Start Vite dev server and Electron dev app together. |
| `bin/windie start customer` | Start Vite dev server and Electron customer app together. |
| `bin/windie start all` | Start backend, frontend, and desktop dev processes together. |
| `bin/windie stop` | Stop tracked Windie dev processes when process tracking exists. |
| `bin/windie logs frontend` | Tail the captured Electron main/frontend desktop log stream. |
| `bin/windie logs vite` | Tail the captured Vite dev-server log stream. |
| `bin/windie logs main` | Tail Electron main-process logs. |
| `bin/windie logs renderer --verbose` | Tail renderer logs, optionally including verbose renderer entries. |
| `bin/windie logs sidecar` | Tail or print sidecar-log collection guidance. |
| `bin/windie logs backend --remote --host windie-prod` | Tail remote backend logs through the guarded backend log command. |
| `bin/windie test backend` | Run backend tests. |
| `bin/windie test sidecar` | Run sidecar tests. |
| `bin/windie test frontend` | Run frontend Jest CI tests. |
| `bin/windie test all` | Run backend, sidecar, and frontend validation. |
| `bin/windie docs list` | List docs with front matter and read hints. |
| `bin/windie docs check` | Run docs listing plus whitespace checks. |
| `bin/windie docs search <query>` | Search local docs by path, title, summary, `read_when` hints, and headings; exact phrase and all-term matches rank highest. |
| `bin/windie docs <query>` | Shorthand local docs search. |
| `bin/windie commits search <query>` | Search recent git commits by subject, body, author, hash, date, and changed paths. |
| `bin/windie commits search <query> --limit 20 --json` | Return a bounded machine-readable commit-search result set. |
| `bin/windie build frontend` | Build the frontend bundle. |
| `bin/windie build sidecar-runtime` | Build the bundled Python sidecar runtime. |
| `bin/windie package mac` | Package macOS artifacts. |
| `bin/windie package win` | Package Windows artifacts. |
| `bin/windie package linux` | Package Linux artifacts. |
| `bin/windie reinstall mac` | Rebuild, reinstall, and launch the local macOS app. |
| `bin/windie reinstall win` | Rebuild and reinstall the local Windows app. |
| `bin/windie reinstall linux` | Rebuild and reinstall the local Linux app. |
| `bin/windie backend health` | Probe backend health. |
| `bin/windie backend deploy --host windie-prod` | Deploy/restart a remote backend host. |
| `bin/windie endpoint show` | Print the resolved HTTP/WebSocket endpoint contract. |
| `bin/windie self-host status` | Check self-host backend and tunnel service state. |

## Deep Command Docs

- [Command Matrix](command_matrix.md) maps the full `bin/windie` command surface.
- [Validation Commands](validation_commands.md) maps tests, lint, typecheck, docs checks, and focused validation commands by changed boundary.
- [Packaging and Release Commands](packaging_and_release_commands.md) maps sidecar runtime builds, package commands, smoke helpers, local reinstall commands, and release guardrails.
