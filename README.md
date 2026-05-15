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

**WindieOS is the open-source desktop layer for personal AI agents.** It brings
the Codex-style agent loop to the operating system itself: computer-use,
browser-use, terminal access, persistent memory, coding workflows, voice input,
and model-provider flexibility in one desktop runtime.

Most agents ask you to leave your flow. You switch tabs, paste context, launch a
remote workspace, or delegate work into an environment you cannot really see.
WindieOS stays on the OS layer instead. The minimal chat pill follows you across
apps, sees the screen you are looking at when you ask for help, and keeps the
agent's work visible while it clicks, types, browses, runs commands, or waits for
you to redirect it.

WindieOS is built for collaboration, not blind delegation. The agent works beside
you on the computer you already use, with your permission and with a visible
trail of what it is doing. It is meant to feel less like a worker you send away
and more like a desktop companion you can interrupt, reshape, and extend.

Download Windie on its official website: [WindieOS](https://windieos.com)

Latest releases: [Releases](https://github.com/buiilding/WindieOS/releases)

---

## Why Windie

<table>
<tr><td><b>Open-source Codex alternative</b></td><td>WindieOS gives you a coding-capable agent with desktop tools, browser automation, computer-use, memory, and terminal access without locking the experience behind a closed client.</td></tr>
<tr><td><b>Lives where you work</b></td><td>The minimal chat pill stays on top of the operating system, so you do not have to keep switching back to a browser tab or a separate coding window just to talk to your agent.</td></tr>
<tr><td><b>Shared-screen collaboration</b></td><td>WindieOS can work from the same screen you are looking at. It does not need you to describe every button, page, or app state before it can help.</td></tr>
<tr><td><b>Voice-first by design</b></td><td>Say "Hey Jarvis", speak your request, and WindieOS transcribes it into the agent loop. The goal is a keyboard-free agent you can call while your hands are busy.</td></tr>
<tr><td><b>Model-provider flexible</b></td><td>WindieOS is designed for multimodal model providers instead of one native computer-use stack. The backend owns provider policy while the desktop sidecar owns local execution.</td></tr>
<tr><td><b>Hackable agent runtime</b></td><td>Change the instructions, add skills, register local tools, wire MCP servers, or build your own desktop agent on top of the SDK and sidecar runtime.</td></tr>
</table>

---

## Just Talk To It

WindieOS is meant to be usable without reaching for the keyboard.

You say "Hey Jarvis". WindieOS records your voice, transcribes it, attaches the
screen context when useful, and sends the request into the agent loop. The agent
can answer, code, browse, click through forms, inspect files, run terminal
commands, remember local context, and show its progress without pulling you into
a separate app.

That is the core product bet: the agent should be present wherever you are on
the computer.

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

## Build Your Own Windie

WindieOS is fully open source because the agent should be shaped by the person
using it.

If the default instructions are wrong, replace them. If the UI does not fit your
workflow, change the frontend. If the agent needs a new capability, add a local
tool, skill, plugin, or MCP server. If you want to build a different desktop
agent entirely, use the Windie SDK, sidecar daemon, and hosted-agent contracts as
the starting point.

The repo is structured so the desktop app, local sidecar, SDKs, extension roots,
and backend contracts can be developed directly instead of treated as a closed
product shell.

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
| [Computer-Use](docs/tools/computer.md) | Mouse, keyboard, screenshots, scrolling, window actions, and coordinate grounding. |
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
