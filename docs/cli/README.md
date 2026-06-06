---
summary: "Command hub for the first-class WindieOS CLI surface, validation commands, packaging commands, backend operations, and self-host commands."
read_when:
  - When looking for WindieOS command-line entrypoints.
  - When changing Windie CLI commands, command docs, package commands, docs tooling, or self-host behavior.
title: "Commands and Scripts"
---

# Commands and Scripts

Use `bin/windie ...` from the repository root for developer, operator, docs,
test, packaging, backend, endpoint, and self-host workflows. Lower-level repo
scripts and package tasks remain implementation adapters behind this command
surface.

## Main Commands

| Command | Purpose |
| --- | --- |
| `bin/windie status` | Show concise repo and runtime health. |
| `bin/windie status --all` | Show backend, frontend, sidecar, docs, and dependency summary. |
| `bin/windie doctor` | Run the local diagnostic pass. |
| `bin/windie doctor --deep --json` | Run slower probes and emit coding-agent friendly JSON. |
| `bin/windie start backend` | Start the backend dev server. |
| `bin/windie start frontend` | Start Vite dev server. |
| `bin/windie start desktop` | Start Electron dev app. |
| `bin/windie start dev` | Start Vite dev server and Electron dev app together. |
| `bin/windie start customer` | Start Vite dev server and Electron customer app together. |
| `bin/windie start all` | Start backend, frontend, and desktop dev processes together. |
| `bin/windie stop` | Stop tracked Windie dev processes when process tracking exists. |
| `bin/windie logs backend --remote --host windie-prod` | Tail remote backend logs through the guarded backend log command. |
| `bin/windie test backend` | Run backend tests. |
| `bin/windie test sidecar` | Run sidecar tests. |
| `bin/windie test frontend` | Run frontend Jest CI tests. |
| `bin/windie test all` | Run backend, sidecar, and frontend validation. |
| `bin/windie docs list` | List docs with front matter and read hints. |
| `bin/windie docs check` | Run docs listing plus whitespace checks. |
| `bin/windie build frontend` | Build the frontend bundle. |
| `bin/windie build sidecar-runtime` | Build the bundled Python sidecar runtime. |
| `bin/windie package mac` | Package macOS artifacts. |
| `bin/windie package win` | Package Windows artifacts. |
| `bin/windie package linux` | Package Linux artifacts. |
| `bin/windie reinstall mac` | Rebuild, reinstall, and launch the local macOS app. |
| `bin/windie backend health` | Probe backend health. |
| `bin/windie backend deploy --host windie-prod` | Deploy/restart a remote backend host. |
| `bin/windie endpoint show` | Print the resolved HTTP/WebSocket endpoint contract. |
| `bin/windie self-host status` | Check self-host backend and tunnel service state. |

## Deep Command Docs

- [Command Matrix](command_matrix.md) maps the full `bin/windie` command surface.
- [Validation Commands](validation_commands.md) maps tests, lint, typecheck, docs checks, and focused validation commands by changed boundary.
- [Packaging and Release Commands](packaging_and_release_commands.md) maps sidecar runtime builds, package commands, smoke helpers, local reinstall commands, and release guardrails.
