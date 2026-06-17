---
summary: "Command matrix for the first-class WindieOS CLI surface, including `bin/windie diagnostics inspect`, diagnostics list/paths, durable traces, conversation inspection, docs search, `commits search` git commit-history lookup, validation, packaging, backend, endpoint, and self-host commands."
read_when:
  - When looking for Windie command help, `bin/windie --help`, or the current command surface.
  - When choosing the correct WindieOS command for local development, diagnostics inspect, diagnostics list, trace inspection, conversation messages, docs work, tests, packaging, `bin/windie commits search`, commit-history lookup, or hosted tunnel setup.
  - When changing `bin/windie`, command docs, scripts wrapped by the CLI, diagnostics commands, trace commands, conversation commands, commits search behavior, or package command behavior.
title: "Command Matrix"
---

# Command Matrix

WindieOS command-line entrypoints start with `bin/windie ...` from the
repository root. Lower-level scripts and package tasks are implementation
adapters; document them only when changing the adapter itself.

On Windows PowerShell, use `bin\windie.cmd ...`. The extensionless `bin/windie`
shim is for Unix-like shells and can trigger Windows' file association picker.

## Status and Diagnostics

| Command | Purpose |
| --- | --- |
| `bin/windie status` | Concise repo/runtime health. |
| `bin/windie status --all` | Backend, frontend, sidecar, docs, and dependency summary. |
| `bin/windie status --json` | Machine-readable status output. |
| `bin/windie doctor` | Local diagnostic pass. |
| `bin/windie doctor --fix` | Safe repairs only. |
| `bin/windie doctor --deep` | Slower probes such as ports and sidecar imports. |
| `bin/windie doctor --json` | Machine-readable diagnostic output. |
| `bin/windie diagnostics paths [--json]` | List persistent app diagnostic paths. |
| `bin/windie diagnostics list [--path <path>] [--limit <n>] [--json]` | List persistent app diagnostic rows. |
| `bin/windie diagnostics inspect <trace-id> [--json]` | Inspect one persistent app diagnostic row. |
| `bin/windie trace <conversation-ref> <turn-ref> [--path <path>] [--json]` | Inspect hidden durable trace events for one conversation turn. |
| `bin/windie capability trace <conversation-ref> [--turn <turn-ref>] [--limit <n>] [--json]` | Inspect capability-level conversation trace summaries. |
| `bin/windie conversation list [--limit <n>] [--json]` | List stored conversations. |
| `bin/windie conversation inspect <conversation-ref> [--json]` | Inspect conversation metadata. |
| `bin/windie conversation messages <conversation-ref> [--limit <n>] [--json]` | Print stored visible conversation messages. |
| `bin/windie conversation events <conversation-ref> [--turn <turn-ref>] [--type <event-type>] [--limit <n>] [--json]` | Inspect persisted conversation events. |
| `bin/windie conversation turns <conversation-ref> [--json]` | List turns for a conversation. |
| `bin/windie conversation traces <conversation-ref> [--turn <turn-ref>] [--path <path>] [--limit <n>] [--json]` | Inspect persisted trace events for a conversation. |

## Lifecycle and Logs

| Command | Purpose |
| --- | --- |
| `bin/windie start backend` | Start the backend dev server. |
| `bin/windie start frontend` | Start the Vite renderer dev server. |
| `bin/windie start desktop` | Start the Electron development app. |
| `bin/windie start dev` | Start the Vite renderer dev server and Electron development app together; Ctrl-C stops both. |
| `bin/windie start customer` | Start the Vite renderer dev server and Electron customer app together; Ctrl-C stops both. |
| `bin/windie start all` | Start backend, frontend, and Electron development app together. |
| `bin/windie stop` | Stop tracked Windie dev processes when process tracking exists. |
| `bin/windie restart desktop` | Restart the Electron development app. |
| `bin/windie logs backend` | Tail local or configured backend logs. |
| `bin/windie logs backend --remote --host windie-prod` | Tail remote backend logs through SSH. |
| `bin/windie logs frontend` | Tail `.windie/logs/frontend.log`, the captured Electron main/frontend desktop stream. |
| `bin/windie logs frontend --tail 500 --no-follow` | Print the last 500 captured frontend log lines and exit. |
| `bin/windie logs vite` | Tail the captured Vite dev-server log stream. |
| `bin/windie logs main` | Tail Electron main-process logs. |
| `bin/windie logs renderer --verbose` | Tail renderer logs and include verbose renderer entries. |
| `bin/windie logs desktop` | Alias for `bin/windie logs frontend`. |
| `bin/windie logs sidecar` | Tail sidecar logs where available or print sidecar-log collection guidance. |

## Tests and Docs

| Command | Purpose |
| --- | --- |
| `bin/windie test backend [pytest args...]` | Run backend pytest. |
| `bin/windie test sidecar [pytest args...]` | Run sidecar pytest. |
| `bin/windie test frontend [jest args...]` | Run frontend Jest CI tests. |
| `bin/windie test all` | Run backend, sidecar, and frontend tests. |
| `bin/windie test pick <area>` | Print or run test-selection presets. |
| `bin/windie docs list` | List docs front matter and `read_when` hints. |
| `bin/windie docs check` | Run docs listing plus whitespace checks. |
| `bin/windie docs search <query>` | Search local docs and print the top ten matches, ranking exact phrase, all-term, title/path, summary, `read_when`, and heading matches above broad partial matches. |
| `bin/windie docs <query>` | Shorthand local docs search with the same ranking behavior. |
| `bin/windie commits search <query>` | Search recent git commits and print the top ten matches by subject, body, author, hash, date, and changed paths. |
| `bin/windie commits search <query> --limit 20 --json` | Return up to twenty commit matches as structured JSON. |

## Build, Package, and Reinstall

| Command | Purpose |
| --- | --- |
| `bin/windie build frontend` | Build the frontend bundle. |
| `bin/windie build sidecar-runtime` | Build the bundled Python sidecar runtime. |
| `bin/windie package mac` | Package macOS DMG/ZIP. |
| `bin/windie package win` | Package Windows NSIS installer. |
| `bin/windie package linux` | Package Linux AppImage/DEB/RPM. |
| `bin/windie reinstall mac` | Rebuild, reinstall, and launch the local macOS app. |
| `bin/windie reinstall win` | Rebuild and reinstall the local Windows app. |
| `bin/windie reinstall linux` | Rebuild and reinstall the local Linux app. |

## Backend, Endpoint, and Self-Host

| Command | Purpose |
| --- | --- |
| `bin/windie backend health` | Probe backend health. |
| `bin/windie backend deploy --host <host>` | Deploy/restart a remote backend host. |
| `bin/windie backend deploy --local` | Run the deploy helper locally. |
| `bin/windie backend service status` | Inspect backend service state. |
| `bin/windie backend service start` | Start the backend service. |
| `bin/windie backend service stop` | Stop the backend service. |
| `bin/windie backend service restart` | Restart the backend service. |
| `bin/windie endpoint show` | Print resolved HTTP/WebSocket endpoint values. |
| `bin/windie endpoint local` | Print local endpoint exports. |
| `bin/windie endpoint hosted` | Print hosted endpoint exports. |
| `bin/windie endpoint probe` | Probe the resolved endpoint. |
| `bin/windie self-host bootstrap` | Run self-host bootstrap setup. |
| `bin/windie self-host tunnel setup` | Configure Cloudflare Tunnel for the backend origin. |
| `bin/windie self-host service install-backend` | Install the backend service. |
| `bin/windie self-host service install-cloudflared` | Install the cloudflared service. |
| `bin/windie self-host status` | Check backend and tunnel service status. |

## Developer Helpers

| Command | Purpose |
| --- | --- |
| `bin/windie extension create <id>` | Scaffold a Windie extension package. |
| `bin/windie tools manifest generate` | Generate the executable tool manifest. |
| `bin/windie mock backend` | Start the local SDK mock backend. |
| `./scripts/committer "<subject>" --body "<body>" -- <paths...>` | Stage listed files and create a scoped commit. |

Read [Cloudflared Self-Host Runbook](../operations/cloudflared_self_host_windieos.md) before running or changing these scripts.

## Related Docs

- [Validation Commands](validation_commands.md)
- [Packaging and Release Commands](packaging_and_release_commands.md)
- [Commands and Scripts Hub](README.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)
