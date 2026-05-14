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

**The desktop layer for personal AI agents.** Windie gives agents a visible,
always-present surface on your computer: a chat pill that follows you across the
operating system, watches the current screen when you ask for help, and shows
what the agent is doing in real time.

No setup flow, no extension pinned to one tab, and no model lock-in. Download
Windie, talk to the pill, and let the agent use computer-use, browser-use,
terminal, files, and memory from the desktop you already work in.

Download Windie on its official website: [WindieOS](https://windieos.com)

Latest releases: [Releases](https://github.com/buiilding/WindieOS/releases)

---

## Why Windie

<table>
<tr><td><b>No setup desktop agent</b></td><td>Windie is built for macOS, Windows, and Linux. Download the app, open it, and start talking to your agent from the desktop.</td></tr>
<tr><td><b>An operating-system layer</b></td><td>The floating chat pill stays with you while the agent works, so you can see its reactions, tool calls, and progress instead of guessing what the model is doing.</td></tr>
<tr><td><b>Computer-use for any model provider</b></td><td>Windie's computer-use tools run through its own local tool contract, so they are not limited to one vendor's native computer-use model.</td></tr>
<tr><td><b>Hands-free voice</b></td><td>Say "Hey Jarvis", talk into the mic, and Windie transcribes your speech into the query that starts the agent loop.</td></tr>
<tr><td><b>Dedicated browser-use profile</b></td><td>Windie uses its own persistent Chrome profile instead of attaching an extension to one of your normal browser tabs.</td></tr>
</table>

---

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
