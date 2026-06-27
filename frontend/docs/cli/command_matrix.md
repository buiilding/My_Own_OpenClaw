---
summary: "Public Windie command matrix for diagnostics, conversation inspection, docs search, commit search, frontend validation, local-runtime validation, packaging, and contributor helpers."
read_when:
  - When looking for Windie command help, `<windie> --help`, or the public
    command surface.
  - When changing public command docs, diagnostics, docs tooling, commit
    search, frontend checks, package commands, or contributor helpers.
title: "Command Matrix"
---

# Command Matrix

Commands below use `<windie>` for the active platform shim: `bin\windie.cmd` on
Windows PowerShell and `bin/windie.sh` on Unix-like shells.

Private deployment, Private hosted service, and custom hosted deployment commands are intentionally
not part of the public frontend command matrix.

## Status and Diagnostics

| Command | Purpose |
| --- | --- |
| `<windie> status` | Concise repo/runtime health. |
| `<windie> status --json` | Machine-readable status output. |
| `<windie> doctor` | Local diagnostic pass. |
| `<windie> doctor --deep --json` | Slower probes with JSON output. |
| `<windie> diagnostics paths [--json]` | List persistent app diagnostic paths. |
| `<windie> diagnostics list [--path <path>] [--limit <n>] [--json]` | List persistent app diagnostic rows. |
| `<windie> diagnostics inspect <trace-id> [--json]` | Inspect one persistent app diagnostic row. |
| `<windie> trace <conversation-ref> <turn-ref> [--json]` | Inspect hidden durable trace events for one conversation turn. |
| `<windie> capability trace <conversation-ref> [--json]` | Inspect capability-level conversation trace summaries. |
| `<windie> conversation list [--json]` | List stored conversations. |
| `<windie> conversation inspect <conversation-ref> [--json]` | Inspect conversation metadata. |
| `<windie> conversation state <conversation-ref> [--json]` | Inspect selected revision, display timeline row count, model-history row count, raw event count, and stale branch diagnostics. |
| `<windie> conversation messages <conversation-ref> [--json]` | Print stored visible conversation messages from the local-runtime history store. |

## Lifecycle and Logs

| Command | Purpose |
| --- | --- |
| `<windie> start frontend` | Start the frontend dev server. |
| `<windie> start desktop` | Start the Electron development app. |
| `<windie> start dev` | Start frontend dev server and Electron development app together. |
| `<windie> start customer` | Start frontend dev server and Electron customer app together. |
| `<windie> stop` | Stop tracked Windie dev processes when process tracking exists. |
| `<windie> restart desktop` | Restart the Electron development app. |
| `<windie> logs frontend` | Tail the captured Electron main/frontend desktop stream. |
| `<windie> logs vite` | Tail the captured frontend dev-server log stream. |
| `<windie> logs main` | Tail Electron main-process logs. |
| `<windie> logs renderer --verbose` | Tail renderer logs and include verbose renderer entries. |
| `<windie> logs local-runtime` | Tail local-runtime daemon logs. |

## Tests and Docs

| Command | Purpose |
| --- | --- |
| `<windie> test local-runtime [pytest args...]` | Run local-runtime Python tests. |
| `<windie> test frontend [test args...]` | Run frontend tests. |
| `<windie> test core-loop [args...]` | Run the frontend core-loop regression pack when present. |
| `<windie> test user-facing` | Run the user-facing regression pack when present. |
| `<windie> docs list` | List docs front matter and `read_when` hints. |
| `<windie> docs check` | Run docs listing plus whitespace checks. |
| `<windie> docs search <query>` | Search docs by path, title, summary, `read_when`, and headings. |
| `<windie> commits search <query>` | Search recent git commits by subject, body, author, hash, date, and changed paths. |

## Build, Package, and Reinstall

| Command | Purpose |
| --- | --- |
| `<windie> build frontend` | Build the frontend bundle. |
| `<windie> build local-runtime` | Build the bundled Python local-runtime payload. |
| `<windie> package mac` | Package macOS DMG/ZIP. |
| `<windie> package win` | Package Windows NSIS installer. |
| `<windie> package linux` | Package Linux AppImage/DEB/RPM. |
| `<windie> reinstall mac` | Rebuild, reinstall, and launch the local macOS app. |
| `<windie> reinstall win` | Rebuild and reinstall the local Windows app. |
| `<windie> reinstall linux` | Rebuild and reinstall the local Linux app. |

## Developer Helpers

| Command | Purpose |
| --- | --- |
| `<windie> extension create <id>` | Scaffold a Windie extension package. |
| `<windie> tools manifest generate` | Generate the executable tool manifest. |
| `<windie> mock backend` | Start the local SDK mock backend when available. |
| `./scripts/committer.sh "<subject>" --body "<body>" -- <paths...>` | Stage listed files and create a scoped commit. |

## Related Docs

- [Validation Commands](validation_commands.md)
- [Packaging and Release Commands](packaging_and_release_commands.md)
- [Commands and Scripts Hub](README.md)
