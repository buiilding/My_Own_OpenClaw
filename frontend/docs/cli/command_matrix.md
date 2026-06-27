---
summary: "Command matrix for the first-class WindieOS CLI surface, including `<windie> diagnostics inspect`, diagnostics list/paths, durable traces, conversation inspection, docs search, `commits search` git commit-history lookup, validation, packaging, backend, endpoint, and self-host commands."
read_when:
  - When looking for Windie command help, `<windie> --help`, or the current command surface.
  - When choosing the correct WindieOS command for local development, diagnostics inspect, diagnostics list, trace inspection, conversation messages, docs work, tests, packaging, `<windie> commits search`, commit-history lookup, or hosted tunnel setup.
  - When changing `<windie>`, command docs, scripts wrapped by the CLI, diagnostics commands, trace commands, conversation commands, commits search behavior, or package command behavior.
title: "Command Matrix"
---

# Command Matrix

WindieOS command-line entrypoints start with the platform shim from the
repository root: `bin\windie.cmd` on Windows PowerShell and `bin/windie.sh` on
Unix-like shells. Lower-level scripts and package tasks are implementation
adapters; document them only when changing the adapter itself. The command
tables below use `<windie>` for the active platform shim.

## Status and Diagnostics

| Command | Purpose |
| --- | --- |
| `<windie> status` | Concise repo/runtime health. |
| `<windie> status --all` | Backend, frontend, local-runtime Python, docs, and dependency summary. |
| `<windie> status --json` | Machine-readable status output. |
| `<windie> doctor` | Local diagnostic pass. |
| `<windie> doctor --fix` | Safe repairs only. |
| `<windie> doctor --deep` | Slower probes such as backend port and local-runtime import checks. |
| `<windie> doctor --json` | Machine-readable diagnostic output. |
| `<windie> diagnostics paths [--json]` | List persistent app diagnostic paths. |
| `<windie> diagnostics list [--path <path>] [--limit <n>] [--json]` | List persistent app diagnostic rows. |
| `<windie> diagnostics inspect <trace-id> [--json]` | Inspect one persistent app diagnostic row. |
| `<windie> trace <conversation-ref> <turn-ref> [--path <path>] [--json]` | Inspect hidden durable trace events for one conversation turn. |
| `<windie> capability trace <conversation-ref> [--turn <turn-ref>] [--limit <n>] [--json]` | Inspect capability-level conversation trace summaries. |
| `<windie> conversation list [--limit <n>] [--json]` | List stored conversations. |
| `<windie> conversation inspect <conversation-ref> [--json]` | Inspect conversation metadata. |
| `<windie> conversation state <conversation-ref> [--json]` | Inspect selected revision, display timeline row count, model-history row count, raw event count, and stale branch diagnostics without dumping message bodies or tool output. |
| `<windie> conversation messages <conversation-ref> [--limit <n>] [--json]` | Print stored visible conversation messages from the local-runtime `desktop-runtime/history/history.db` root unless `AGENT_USER_DATA_DIR` or `WINDIE_USER_DATA_DIR` overrides it. |
| `<windie> conversation events <conversation-ref> [--turn <turn-ref>] [--type <event-type>] [--limit <n>] [--json]` | Inspect persisted conversation events. |
| `<windie> conversation turns <conversation-ref> [--json]` | List turns for a conversation. |
| `<windie> conversation traces <conversation-ref> [--turn <turn-ref>] [--path <path>] [--limit <n>] [--json]` | Inspect persisted trace events for a conversation. |

## Lifecycle and Logs

| Command | Purpose |
| --- | --- |
| `<windie> start backend` | Start the backend dev server. |
| `<windie> start frontend` | Start the Vite renderer dev server. |
| `<windie> start desktop` | Start the Electron development app. |
| `<windie> start dev` | Start the Vite renderer dev server and Electron development app together; Ctrl-C stops both. Also exposes the dev-only Scripted Runtime model in the desktop model picker. |
| `<windie> start customer` | Start the Vite renderer dev server and Electron customer app together through the frontend/local-runtime Python environment wrapper; Ctrl-C stops both. |
| `<windie> start all` | Start backend, frontend, and Electron development app together. |
| `<windie> stop` | Stop tracked Windie dev processes when process tracking exists. |
| `<windie> restart desktop` | Restart the Electron development app. |
| `<windie> logs backend` | Tail local or configured backend logs. |
| `<windie> logs backend --remote --host windie-prod` | Tail remote backend logs through SSH. |
| `<windie> logs frontend` | Tail `.windie/logs/frontend.log`, the captured Electron main/frontend desktop stream. |
| `<windie> logs frontend --tail 500 --no-follow` | Print the last 500 captured frontend log lines and exit. |
| `<windie> logs vite` | Tail the captured Vite dev-server log stream. |
| `<windie> logs main` | Tail Electron main-process logs. |
| `<windie> logs renderer --verbose` | Tail renderer logs and include verbose renderer entries. |
| `<windie> logs local-runtime` | Tail local-runtime daemon logs. |

## Tests and Docs

| Command | Purpose |
| --- | --- |
| `<windie> test backend [pytest args...]` | Run backend pytest. |
| `<windie> test local-runtime [pytest args...]` | Run local-runtime Python pytest. |
| `<windie> test frontend [jest args...]` | Run frontend Jest CI tests. |
| `<windie> test core-loop [jest args...]` | Run the Core Loop Regression Pack for chat pill, dashboard, overlay, SDK projection, conversation runtime, IPC, replay, stop, tool-row, and surface-lease invariants. |
| `<windie> test user-facing` | Run the User-Facing Regression Pack umbrella over product-visible behavior invariants. |
| `<windie> test all` | Run backend, local-runtime Python, and frontend tests. |
| `<windie> test pick <area>` | Print or run test-selection presets. |
| `<windie> docs list` | List docs front matter and `read_when` hints. |
| `<windie> docs check` | Run docs listing plus whitespace checks. |
| `<windie> docs search <query>` | Search local docs and print the top ten matches, ranking exact phrase, all-term, title/path, summary, `read_when`, and heading matches above broad partial matches. |
| `<windie> docs <query>` | Shorthand local docs search with the same ranking behavior. |
| `<windie> commits search <query>` | Search recent git commits and print the top ten matches by subject, body, author, hash, date, and changed paths. |
| `<windie> commits search <query> --limit 20 --json` | Return up to twenty commit matches as structured JSON. |

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

## Backend, Endpoint, and Self-Host

| Command | Purpose |
| --- | --- |
| `<windie> backend health` | Probe backend health. |
| `<windie> backend deploy --host <host>` | Deploy/restart a remote backend host. |
| `<windie> backend deploy --local` | Run the deploy helper locally. |
| `<windie> backend service status` | Inspect backend service state. |
| `<windie> backend service start` | Start the backend service. |
| `<windie> backend service stop` | Stop the backend service. |
| `<windie> backend service restart` | Restart the backend service. |
| `<windie> endpoint show` | Print resolved HTTP/WebSocket endpoint values. |
| `<windie> endpoint local` | Print local endpoint exports. |
| `<windie> endpoint hosted` | Print hosted endpoint exports. |
| `<windie> endpoint probe` | Probe the resolved endpoint. |
| `<windie> self-host bootstrap` | Run self-host bootstrap setup. |
| `<windie> self-host tunnel setup` | Configure Cloudflare Tunnel for the backend origin. |
| `<windie> self-host service install-backend` | Install the backend service. |
| `<windie> self-host service install-cloudflared` | Install the cloudflared service. |
| `<windie> self-host status` | Check backend and tunnel service status. |

## Developer Helpers

| Command | Purpose |
| --- | --- |
| `<windie> extension create <id>` | Scaffold a Windie extension package. |
| `<windie> tools manifest generate` | Generate the executable tool manifest. |
| `<windie> mock backend` | Start the local SDK mock backend. |
| `./scripts/committer.sh "<subject>" --body "<body>" -- <paths...>` | Stage listed files and create a scoped commit. |

Compatibility aliases still accepted by the CLI for older scripts: `<windie>
logs sidecar`, `<windie> test sidecar`, and `<windie> build
sidecar-runtime`. Prefer the primary `local-runtime` commands in new docs and
automation.

Read Cloudflared Self-Host Runbook (private backend docs) before running or changing these scripts.

## Related Docs

- [Validation Commands](validation_commands.md)
- [Packaging and Release Commands](packaging_and_release_commands.md)
- [Commands and Scripts Hub](README.md)
- Runtime Configuration Matrix (private backend docs)
