---
summary: "Public command hub for WindieOS frontend, docs, local-runtime, packaging, commit search, and contributor helper commands."
read_when:
  - When looking for public Windie command-line entrypoints.
  - When changing public CLI docs, docs search, commit search, frontend checks,
    local-runtime checks, package commands, or contributor helpers.
title: "Commands and Scripts"
---

# Commands and Scripts

Use the platform shim from the repository root: `bin\windie.cmd` on Windows
PowerShell and `bin/windie.sh` on Unix-like shells. Public docs cover the
frontend contributor surface. private deployment, private hosted service, custom hosted deployment, and
private operator commands live in private backend docs.

## Public Commands

| Command | Purpose |
| --- | --- |
| `<windie> status` | Show concise repo/runtime health. |
| `<windie> doctor` | Run the local diagnostic pass. |
| `<windie> diagnostics paths` | List app diagnostic paths. |
| `<windie> diagnostics list --path <path> --limit <n>` | List persistent app diagnostic rows for a path. |
| `<windie> diagnostics inspect <trace-id>` | Inspect a specific app diagnostic trace row. |
| `<windie> trace <conversation-ref> <turn-ref>` | Inspect durable hidden conversation trace events for a turn. |
| `<windie> capability trace <conversation-ref>` | Inspect capability-level conversation trace summaries. |
| `<windie> conversation list` | List stored conversations. |
| `<windie> conversation state <conversation-ref>` | Inspect local conversation state without dumping message bodies or tool output. |
| `<windie> conversation messages <conversation-ref>` | Print stored visible conversation messages from the local-runtime history store. |
| `<windie> start frontend` | Start the frontend dev server. |
| `<windie> start desktop` | Start the Electron development app. |
| `<windie> start dev` | Start frontend dev server and Electron development app together. |
| `<windie> start customer` | Start frontend dev server and Electron customer app together. |
| `<windie> stop` | Stop tracked Windie dev processes when process tracking exists. |
| `<windie> logs frontend` | Tail the captured Electron main/frontend desktop log stream. |
| `<windie> logs vite` | Tail the captured frontend dev-server log stream. |
| `<windie> logs main` | Tail Electron main-process logs. |
| `<windie> logs renderer --verbose` | Tail renderer logs, optionally including verbose renderer entries. |
| `<windie> logs local-runtime` | Tail local-runtime daemon logs. |
| `<windie> test local-runtime` | Run local-runtime Python tests. |
| `<windie> test frontend` | Run frontend tests. |
| `<windie> docs list` | List docs with front matter and read hints. |
| `<windie> docs check` | Run docs listing plus whitespace checks. |
| `<windie> docs search <query>` | Search public docs. |
| `<windie> commits search <query>` | Search recent git commits. |
| `<windie> build frontend` | Build the frontend bundle. |
| `<windie> build local-runtime` | Build the bundled Python local-runtime payload. |
| `<windie> package mac` | Package macOS artifacts. |
| `<windie> package win` | Package Windows artifacts. |
| `<windie> package linux` | Package Linux artifacts. |
| `<windie> reinstall mac` | Rebuild, reinstall, and launch the local macOS app. |
| `<windie> reinstall win` | Rebuild and reinstall the local Windows app. |
| `<windie> reinstall linux` | Rebuild and reinstall the local Linux app. |
| `<windie> extension create <id>` | Scaffold a Windie extension package. |
| `<windie> tools manifest generate` | Generate the public executable tool manifest. |
| `<windie> mock backend` | Start the local SDK mock backend when available. |

Compatibility aliases still accepted by the CLI for older scripts:
`<windie> logs sidecar`, `<windie> test sidecar`, and
`<windie> build sidecar-runtime`. Prefer the primary `local-runtime` commands
in new docs.

## Deep Command Docs

- [Command Matrix](command_matrix.md)
- [Validation Commands](validation_commands.md)
- [Packaging and Release Commands](packaging_and_release_commands.md)
