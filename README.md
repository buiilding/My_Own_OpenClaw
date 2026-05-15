<p align="center">
  <img src="image.png" alt="WindieOS banner" width="100%">
</p>

# WindieOS

<p align="center">
  <a href="https://github.com/buiilding/WindieOS/releases"><img src="https://img.shields.io/badge/Release-GitHub-2563EB?style=for-the-badge" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-16A34A?style=for-the-badge" alt="MIT License"></a>
  <a href="https://discord.gg/windieos"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
  <a href="AGENTS.md"><img src="https://img.shields.io/badge/Agents-AGENTS.md-FFFFFF?style=for-the-badge" alt="AGENTS.md"></a>
</p>

**The desktop runtime for personal AI agents.** WindieOS gives agents a local
place to operate: a floating desktop chat surface, hosted model orchestration,
computer-use, browser-use, terminal and file tools, local memory, voice input,
and an extension system for adding your own tools and instructions.

The goal is simple: describe what you want in natural language, and let the
agent use the right local and hosted capabilities to complete it while you can
see what it is doing.

Download Windie on its official website: [WindieOS](https://windieos.com)

Latest releases: [Releases](https://github.com/buiilding/WindieOS/releases)

---

## Why WindieOS

<table>
<tr><td><b>Desktop-native agent surface</b></td><td>The floating chat pill stays with you while the agent works, so you can watch tool calls, progress, and responses without living in one browser tab.</td></tr>
<tr><td><b>Local execution sidecar</b></td><td>File, shell, browser, computer-use, memory, MCP, and extension tools run through a local sidecar instead of being hard-wired into one frontend screen.</td></tr>
<tr><td><b>Computer-use across providers</b></td><td>WindieOS projects local computer-use tools through its own tool contract, so desktop control is not limited to a single vendor's native computer-use stack.</td></tr>
<tr><td><b>Persistent browser runtime</b></td><td>WindieOS uses its own browser-use profile for agent work instead of relying on a normal user tab or a one-off extension session.</td></tr>
<tr><td><b>Extension-first development</b></td><td>Developers add tools, skills, prompt layers, MCP servers, settings metadata, permissions, and plugin hooks as WindieOS extensions.</td></tr>
<tr><td><b>Hosted intelligence, local authority</b></td><td>The hosted backend owns model routing, policy, prompt construction, OCR/vision capability decisions, and streaming. The local runtime owns desktop authority and execution.</td></tr>
</table>

---

## What You Can Build

WindieOS is for people building desktop agents, not just chatbots. A WindieOS
agent can:

- inspect the current screen when the user asks for help
- click, type, scroll, and use desktop applications through computer-use tools
- browse with a persistent Windie-owned browser profile
- run shell commands and work with local files through the sidecar
- use local memory and transcript context across sessions
- call tools contributed by local extensions, plugins, and MCP servers
- stream progress back to the desktop UI while it works

## How It Works

```text
User goal
  -> WindieOS desktop app
  -> WindieClient runtime
  -> hosted backend for model orchestration, policy, prompts, OCR/vision, streaming
  -> local sidecar for files, shell, browser, computer-use, memory, MCP, extensions
  -> visible progress and tool results back in the desktop UI
```

The split matters. The backend decides what the agent can see and call. The
sidecar executes local actions. The desktop app shows the loop and handles the
human-facing experience.

## Developer Model

WindieOS uses an extension-first developer model.

An extension package can contribute:

- Python sidecar tools with a `schema` and local `entrypoint`
- Electron main-process plugin tools
- MCP server definitions
- skills and prompt layers
- settings metadata
- lifecycle hooks
- config schemas and permission declarations

The SDK/runtime wakes up agents with those capabilities. Extension authors
should not need to edit core tool registries for normal local tools.

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

Start with [Extension Convention](docs/development/extensions.md), [Plugins and
Extensions](docs/plugins/README.md), and [WindieClient Runtime Contract](docs/sdk/windie_client_runtime.md).

## Current Status

Implemented today:

- Electron desktop app with chat pill and dashboard surfaces
- hosted FastAPI backend for the agent loop, provider routing, streaming, OCR,
  vision, prompts, policy, SDK routes, and remote tools
- Python sidecar for local execution and memory services
- local sidecar daemon path for SDK-owned tool execution
- extension packages for sidecar tools, plugin tools, MCP servers, skills,
  prompt layers, settings metadata, hooks, config, and permissions
- dedicated browser-use runtime and computer-use tooling
- voice and wakeword flows
- TypeScript and Python SDK runtime code inside the repo

Not yet the public claim:

- packaged plugin marketplace
- signed third-party extension distribution
- hot install/update/remove flow for marketplace plugins
- fully extracted standalone npm/PyPI SDK packages

Those boundaries are intentional. See [Current vs Future Plugin Boundary](docs/plugins/current_vs_future_plugin_boundary.md).

## Desktop Experience

**The first state is the minimal chat pill.** It floats on your screen, stays
out of the way, and can automatically attach the current screen when you send a
message. This is the state you should live in most of the time.

**The second state is the fullscreen dashboard.** It shows the longer
conversation, live tool logs, memory surfaces, settings, and everything else
you need when you want to inspect the agent loop closely.

Windie is designed to feel present without taking over the computer. It gives
the agent a place to react while it clicks, types, browses, runs commands, or
waits for you to redirect it.

## Quick Start

### Download

Download Windie on its official website: [WindieOS](https://windieos.com)

Latest releases: [Releases](https://github.com/buiilding/WindieOS/releases)

Windie is designed for macOS, Windows, and Linux.

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

Install sidecar dependencies:

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
| [Installation](docs/getting-started/installation.md) | Source install, endpoint overrides, sidecar Python resolution, and verification. |
| [User Guide](docs/getting-started/user_guide.md) | Chat pill, dashboard, browser-use, memory, and stop/redirect behavior. |
| [Frontend Architecture](docs/architecture/frontend_architecture.md) | Electron main, React renderer, preload boundary, and sidecar ownership. |
| [Communication Flow](docs/architecture/communication_flow.md) | IPC, JSON-RPC, WebSocket, HTTP, query, memory, and tool event paths. |
| [Tool System](docs/architecture/tool_system.md) | Hosted orchestration boundary, sidecar tool execution, and renderer visibility. |
| [Plugins and Extensions](docs/plugins/README.md) | Extension package surfaces, tool/plugin/MCP routing, and current-vs-future boundaries. |
| [SDK Hub](docs/sdk/README.md) | WindieClient runtime, hosted routes, OCR/vision, auth, traces, and SDK integration. |
| [Browser-Use](docs/browser/browser_control.md) | Windie browser profile, browser automation actions, and runtime behavior. |
| [Frontend Docs](docs/frontend/README.md) | Deep frontend maps across main, renderer, preload, contracts, runtime, and inventory. |
| [Sidecar Docs](docs/frontend/sidecar/README.md) | Python sidecar runtime, memory, browser automation, services, and tools. |
| [Operations](docs/operations/release.md) | Configuration, packaging, release, security, performance, and sidecar runtime packaging. |
| [Development](docs/development/contributing.md) | Contribution workflow, environment setup, tests, and tool development. |
| [API Reference](docs/reference/api_reference.md) | Backend API and transport surfaces consumed by the client, sidecar, and SDKs. |

The docs describe the Electron frontend, Python sidecar, browser-use runtime,
local memory, backend agent loop, model providers, SDK/API surfaces, packaging,
and operations.

## License

See [LICENSE](LICENSE).
