<p align="center">
  <img src="artifacts/image.png" alt="WindieOS banner" width="100%">
</p>

# WindieOS

<p align="center">
  <a href="https://github.com/buiilding/WindieOS/releases"><img src="https://img.shields.io/badge/Release-GitHub-2563EB?style=for-the-badge" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-16A34A?style=for-the-badge" alt="MIT License"></a>
  <a href="https://discord.gg/windieos"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
  <a href="AGENTS.md"><img src="https://img.shields.io/badge/Agents-AGENTS.md-FFFFFF?style=for-the-badge" alt="AGENTS.md"></a>
</p>

**The desktop runtime for personal AI agents.** WindieOS gives an agent a place
to live on your computer: it can see the screen when you ask, use the browser,
click and type, run commands, work with files, remember context, and stay visible
while it works.

If you want an AI agent that can operate your desktop instead of just answering
inside a chat box, this is it.

Download Windie on its official website: [WindieOS](https://windieos.com)

Latest releases: [Releases](https://github.com/buiilding/WindieOS/releases)

[Docs](docs/getting-started/docs_hub.md) · [Quick Start](docs/getting-started/quick_start.md) · [Computer-Use](docs/tools/computer.md) · [Browser-Use](docs/browser/browser_control.md) · [Extensions](docs/plugins/README.md) · [SDK](docs/sdk/README.md)

---

## Highlights

<table>
<tr><td><b>Desktop agent loop</b></td><td>A floating chat pill and dashboard keep the agent close to the work. You can redirect it, inspect tool calls, and watch progress without switching to a separate agent console.</td></tr>
<tr><td><b>Computer-use beyond one provider</b></td><td>WindieOS exposes mouse, keyboard, screenshot, scroll, and window actions through its own local tool contract, so desktop control is not locked to one model vendor.</td></tr>
<tr><td><b>Windie daemon</b></td><td>The local daemon runs the actions that need your machine: files, shell, browser-use, computer-use, memory, MCP, and extension tools. Older docs and code may still call this the sidecar.</td></tr>
<tr><td><b>Dedicated browser-use profile</b></td><td>Agent browsing happens in a Windie-owned browser profile, separate from your normal tabs, with persistent state for repeat workflows.</td></tr>
<tr><td><b>Extension packages</b></td><td>Ship tools, skills, MCP servers, prompt layers, settings metadata, lifecycle hooks, config, and permissions as one local Windie extension package.</td></tr>
<tr><td><b>Hosted orchestration</b></td><td>The hosted backend handles model routing, prompts, policy, OCR/vision capability decisions, and streaming while the local daemon keeps desktop authority on your machine.</td></tr>
<tr><td><b>Voice and wakeword</b></td><td>Use wakeword and speech flows when you want to start the agent without reaching for the keyboard.</td></tr>
</table>

---

## Desktop Experience

**The first state is the minimal chat pill.** It floats on your screen, stays
out of the way, and can automatically attach the current screen when you send a
message. This is the state you should live in most of the time.

**The second state is the fullscreen dashboard.** It shows the longer
conversation, live tool logs, memory surfaces, settings, and everything else
you need when you want to inspect the agent loop closely.

WindieOS is designed to feel present without taking over the computer. It gives
the agent a place to react while it clicks, types, browses, runs commands, or
waits for you to redirect it.

## Build Agents With Extensions

WindieOS extensions are local packages for adding agent capabilities without
editing core registries. A package can contain Python tools, Electron-main plugin
tools, MCP servers, skills, prompt layers, settings metadata, lifecycle hooks,
config schemas, and permission declarations.

```text
extensions/
  repo-maintainer/
    extension.json
    tools/
      summarize-diff.schema.json
    python/
      summarize_diff.py
    skills/
      repo-review/SKILL.md
    mcp/
      servers.json
    plugin/
      index.cjs
```

The SDK wakes up agents with those extension capabilities; the Windie daemon
executes the local actions; the hosted backend handles the model loop.

Start with [Extension Convention](docs/development/extensions.md), [Plugins and
Extensions](docs/plugins/README.md), and [WindieClient Runtime Contract](docs/sdk/windie_client_runtime.md).

## Quick Start

### Download

Download Windie on its official website: [WindieOS](https://windieos.com)

Latest releases: [Releases](https://github.com/buiilding/WindieOS/releases)

WindieOS is designed for macOS, Windows, and Linux.

### Run From Source

```bash
git clone https://github.com/buiilding/WindieOS.git
cd WindieOS
```

Install backend dependencies:

```bash
pip install -r backend/requirements.txt
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

Install Windie daemon dependencies:

```bash
cd ..
./scripts/python-in-env sidecar python -m pip install -r frontend/src/main/python/requirements.txt
```

Start the renderer:

```bash
cd frontend
npm run dev
```

In another terminal, start the backend:

```bash
python -m backend.src.main
```

In another terminal, start Electron:

```bash
cd frontend
npm run electron:dev
```

By default, the Electron client talks to the configured WindieOS backend. Use
`BACKEND_*` or `WINDIE_BACKEND_*` overrides when pointing the client at another
compatible backend instance.

## Project Status

Available today:

- desktop app with chat pill, dashboard, browser-use, computer-use, voice, and
  wakeword flows
- hosted backend for agent loop orchestration, model/provider routing, policy,
  prompt construction, OCR/vision capability decisions, SDK routes, and streaming
- local Windie daemon for files, shell, browser-use, computer-use, memory, MCP,
  and extension execution
- extension packages for tools, plugin hooks, MCP servers, skills, prompt layers,
  settings metadata, config, and permissions
- TypeScript and Python SDK package boundaries in the repo

Not yet claimed as finished:

- packaged plugin marketplace
- signed third-party extension distribution
- hot install/update/remove flow for marketplace plugins
- fully published standalone npm/PyPI SDK releases

See [Current vs Future Plugin Boundary](docs/plugins/current_vs_future_plugin_boundary.md).

## Validation

Useful focused checks:

```bash
./scripts/test-backend
./scripts/test-sidecar
cd frontend && npm run test:ci
```

SDK-focused checks:

```bash
cd frontend && npm run test -- WindieSdkClient.test.ts --runInBand
cd .. && ./scripts/python-in-env sidecar pytest tests/sidecar/test_windie_sdk_client.py -q
```

## Docs

Start with the [Documentation Hub](docs/getting-started/docs_hub.md), or jump
directly into a topic:

| Section | What it covers |
| --- | --- |
| [Quick Start](docs/getting-started/quick_start.md) | Install dependencies and run WindieOS from source. |
| [Installation](docs/getting-started/installation.md) | Source install, endpoint overrides, local daemon Python resolution, and verification. |
| [User Guide](docs/getting-started/user_guide.md) | Chat pill, dashboard, browser-use, memory, and stop/redirect behavior. |
| [Frontend Architecture](docs/architecture/frontend_architecture.md) | Electron main, React renderer, preload boundary, and local daemon ownership. |
| [Communication Flow](docs/architecture/communication_flow.md) | IPC, JSON-RPC, WebSocket, HTTP, query, memory, and tool event paths. |
| [Tool System](docs/architecture/tool_system.md) | Hosted orchestration boundary, local tool execution, and renderer visibility. |
| [Computer-Use](docs/tools/computer.md) | Mouse, keyboard, screenshots, scrolling, window actions, and coordinate grounding. |
| [Plugins and Extensions](docs/plugins/README.md) | Extension package surfaces, tool/plugin/MCP routing, and current-vs-future boundaries. |
| [SDK Hub](docs/sdk/README.md) | WindieClient runtime, hosted routes, OCR/vision, auth, traces, and SDK integration. |
| [Browser-Use](docs/browser/browser_control.md) | Windie browser profile, browser automation actions, and runtime behavior. |
| [Frontend Docs](docs/frontend/README.md) | Deep frontend maps across main, renderer, preload, contracts, runtime, and inventory. |
| [Daemon / Sidecar Docs](docs/frontend/sidecar/README.md) | Python daemon runtime, memory, browser automation, services, and tools. |
| [Operations](docs/operations/release.md) | Configuration, packaging, release, security, performance, and local runtime packaging. |
| [Development](docs/development/contributing.md) | Contribution workflow, environment setup, tests, and tool development. |
| [API Reference](docs/reference/api_reference.md) | Backend API and transport surfaces consumed by the client, sidecar, and SDKs. |

The docs describe the Electron frontend, Python local daemon, browser-use runtime,
local memory, backend agent loop, model providers, SDK/API surfaces, packaging,
and operations.

## License

See [LICENSE](LICENSE).
