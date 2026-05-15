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

**The open-source desktop layer for personal AI agents.** WindieOS is an
open-source alternative to Codex for people who want computer-use, browser-use,
voice, memory, terminal access, and multimodal model support on the operating
system layer instead of inside one tab.

Ever felt like you had to switch back to Codex just to use your agent? WindieOS
keeps a minimal chat pill on top of the desktop, so the agent stays with you
wherever you are on the OS. It can see the screen you are looking at, react to
your current app, and show its work while it clicks, types, browses, runs
commands, or waits for you to redirect it.

WindieOS is not built around blindly delegating tasks to an isolated agent
workspace. The point is to work with the agent while it shares your context.
Your agent should feel like a companion on the computer, not a distant worker
running alone somewhere else.

Download Windie on its official website: [WindieOS](https://windieos.com)

Latest releases: [Releases](https://github.com/buiilding/WindieOS/releases)

---

## Why Windie

<table>
<tr><td><b>Open-source Codex-style agent</b></td><td>WindieOS gives you a Codex-like agent loop, but with open-source computer-use, desktop control, browser-use, local tools, memory, and SDK surfaces you can inspect and modify.</td></tr>
<tr><td><b>Lives on the OS</b></td><td>The minimal chat pill stays with you across apps instead of making you switch back to a web tab or dashboard whenever you need the agent.</td></tr>
<tr><td><b>Works with your screen</b></td><td>WindieOS can attach the current screen and act in the same desktop context you are using, so the agent sees what you see instead of working blindly in a separate place.</td></tr>
<tr><td><b>Multimodal model friendly</b></td><td>Computer-use runs through WindieOS's own local tool contract, so desktop automation is not locked to one vendor's native computer-use model.</td></tr>
<tr><td><b>Keyboard-free by design</b></td><td>Say "Hey Jarvis", talk into the mic, and WindieOS transcribes your speech into the request that starts the agent loop.</td></tr>
<tr><td><b>Customizable all the way down</b></td><td>Change the UI, instructions, tools, plugins, skills, MCPs, and SDK clients. The project is meant to be shaped by the people building and using desktop agents.</td></tr>
</table>

---

## Desktop Experience

**The first state is the minimal chat pill.** It floats on your screen, stays
out of the way, and can automatically attach the current screen when you send a
message. This is the state you should live in most of the time.

**The second state is the fullscreen dashboard.** It shows the longer
conversation, live tool logs, memory surfaces, settings, and everything else
you need when you want to inspect the agent loop closely.

WindieOS is designed to feel present without taking over the computer. You can
talk to it, watch what it is doing, interrupt it, or open the dashboard when you
want the full agent loop, memory, settings, and tool logs.

## Open Source Runtime

WindieOS is fully open source because desktop agents should be hackable. If you
do not like the UI, change it. If you do not like the instructions, change them.
If the agent needs a new capability, add a plugin, skill, MCP server, or local
tool and let the runtime expose it to the agent.

The SDK is meant for building your own desktop agents on top of the same
runtime: agents that fill forms, check information, book reservations, run
boring workflows, or automate the parts of the computer you do not want to keep
doing by hand.

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
