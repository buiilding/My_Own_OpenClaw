---
summary: "Command matrix for the first-class WindieOS CLI surface."
read_when:
  - When choosing the correct WindieOS command for local development, docs work, tests, packaging, commits, or hosted tunnel setup.
  - When changing `bin/windie`, command docs, scripts wrapped by the CLI, or package command behavior.
title: "Command Matrix"
---

# Command Matrix

WindieOS command-line entrypoints start with `bin/windie ...` from the
repository root. Lower-level scripts and package tasks are implementation
adapters; document them only when changing the adapter itself.

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
| `bin/windie logs desktop` | Alias for `bin/windie logs frontend`. |
| `bin/windie logs sidecar` | Print current sidecar-log collection guidance. |

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
| `bin/windie docs search <query>` | Search local docs and print matching paths. |
| `bin/windie docs <query>` | Shorthand local docs search, mirroring OpenClaw-style query ergonomics without hosted docs lookup. |

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
