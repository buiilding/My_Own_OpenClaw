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

**WindieOS is a hackable desktop runtime for personal AI agents.** It turns your
desktop session into an AI workspace: screen state, windows, browser sessions,
local files, apps, shell, memory, permissions, and the user's current workflow
become first-class runtime context for the agent.

Most AI agents begin inside a chat box. They receive messages, call tools, use
memory, run commands, browse the web, and reply. That model is useful, but it
still treats the computer as something outside the agent. WindieOS starts from a
different assumption: if AI is going to help with real personal work, it needs to
live inside the user's computing environment.

WindieOS is built around the live desktop session, not the chat window. The
minimal chat pill matters because it makes the agent feel present on the
machine, not trapped inside a web app. The agent can observe the workspace, act
through the same apps the user uses, ask permission before sensitive actions,
and work beside the user in a visible way.

Download Windie on its official website: [WindieOS](https://windieos.com)

Latest releases: [Releases](https://github.com/buiilding/WindieOS/releases)

---

## Product Contract

WindieOS is centered on the personal computer, not a chat box, coding agent,
browser agent, or generic assistant gateway. The current wedge is the desktop
runtime: the agent has visible desktop presence, observes the live workspace,
acts through the same apps the user uses, asks permission before sensitive
actions, and works beside the user inside the machine.

The long-term direction is a personal agent control plane across devices, but
current docs and code should describe multi-device coordination only when the
implementation supports that claim.

WindieOS spans Electron UX, the Windie SDK runtime, a Python local-runtime
implementation for local authority, and a Python FastAPI backend for hosted or
self-hosted agent orchestration. Frontend and local-runtime code stay
import-independent from backend runtime code; parity flows through public
transport contracts, manifests, docs, and tests.

---

## Why Windie

<table>
<tr><td><b>Desktop session as runtime</b></td><td>WindieOS treats the user's live desktop session as the agent workspace: screen, windows, browser state, files, apps, shell, memory, permissions, and current workflow.</td></tr>
<tr><td><b>Visible desktop presence</b></td><td>The minimal chat pill stays on top of the operating system, so the agent feels present on the machine instead of trapped inside a browser tab or separate app.</td></tr>
<tr><td><b>Shared-workspace collaboration</b></td><td>WindieOS can work from the same screen you are looking at. It does not need you to describe every button, page, or app state before it can help.</td></tr>
<tr><td><b>Voice-first by design</b></td><td>Say "Hey Jarvis", speak your request, and WindieOS transcribes it into the agent loop. The goal is a keyboard-free agent you can call while your hands are busy.</td></tr>
<tr><td><b>Model-provider flexible</b></td><td>WindieOS is designed for multimodal model providers instead of one native computer-use stack. The backend owns provider policy while the SDK local runtime owns local execution.</td></tr>
<tr><td><b>Hackable agent runtime</b></td><td>Change the instructions, add skills, register local tools, wire MCP servers, or build your own desktop agent on top of the SDK and local-runtime contracts.</td></tr>
</table>

---

## Just Talk To It

WindieOS is meant to be usable without reaching for the keyboard.

You say "Hey Jarvis". WindieOS records your voice, transcribes it, attaches the
screen context when useful, and sends the request into the agent loop. The agent
can answer, browse, click through forms, inspect files, run terminal commands,
remember local context, and show its progress without pulling you into a
separate app.

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

WindieOS is fully open source because the agent's operating environment should
be shaped by the person using it.

If the default instructions are wrong, replace them. If the UI does not fit your
workflow, change the frontend. If the agent needs a new capability, add a local
tool, skill, plugin, or MCP server. If you want to build a different desktop
agent entirely, use the Windie SDK, local runtime, and hosted-agent contracts as
the starting point.

The repo is structured so the desktop app, SDK local runtime, local-runtime
Python implementation, extension roots, and backend contracts can be developed
directly instead of treated as a closed product shell.

## Architecture

WindieOS is a local desktop environment built around an agent working inside the
user's computer session. The TypeScript Windie SDK runtime is the canonical
client runtime for conversations, model selection, backend transport, local tool
routing, replay, projections, and pluggable conversation stores.

```text
CLI / custom UI / Electron desktop / tests
        |
        v
Windie SDK runtime
        |-- hosted backend HTTP/WebSocket
        |-- SDK local runtime (local-runtime Python daemon)
        |-- conversation store adapters
```

The hosted backend owns inference, model/provider policy, prompts, provider
history, compaction decisions, OCR/vision/prediction policy, and backend-visible
tool schemas. The SDK local runtime owns filesystem, shell, browser,
computer-use, MCP, plugin, extension, local memory, and permission-checked
desktop execution, backed by the local-runtime Python implementation.

The Electron desktop is the flagship reference client built on that SDK
runtime. It should render SDK display projections, collect user input, expose
settings, and host desktop-specific permissions and windows. UI rows are not the
storage truth; backend rehydrate history is generated from normalized SDK
conversation events or complete compacted replay snapshots.

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

Install local-runtime Python dependencies:

```bash
cd ..
./scripts/python-in-env.sh sidecar python -m pip install -r frontend/src/main/python/requirements.txt
```

Start the backend:

```bash
# Windows PowerShell:
bin\windie.cmd start backend

# Unix-like shells:
bin/windie.sh start backend
```

In another terminal, start the desktop dev loop. This starts the Vite renderer
dev server and Electron dev app together; Ctrl-C stops both.

```bash
# Windows PowerShell:
bin\windie.cmd start dev

# Unix-like shells:
bin/windie.sh start dev
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
| [Installation](docs/getting-started/installation.md) | Source install, endpoint overrides, local-runtime Python resolution, and verification. |
| [User Guide](docs/getting-started/user_guide.md) | Chat pill, dashboard, browser-use, memory, and stop/redirect behavior. |
| [Frontend Architecture](docs/architecture/frontend_architecture.md) | Electron main, React renderer, preload boundary, and local-runtime ownership. |
| [Communication Flow](docs/architecture/communication_flow.md) | IPC, JSON-RPC, WebSocket, HTTP, query, memory, and tool event paths. |
| [Tool System](docs/architecture/tool_system.md) | Hosted orchestration boundary, local-runtime tool execution, and renderer visibility. |
| [Windie SDK Runtime](docs/sdk/windie_client_runtime.md) | Canonical client runtime, model switching, conversation stores, projections, and local tool routing. |
| [Computer-Use](docs/tools/computer.md) | Mouse, keyboard, screenshots, scrolling, window actions, and coordinate grounding. |
| [Browser-Use](docs/browser/browser_control.md) | Windie browser profile, browser automation actions, and runtime behavior. |
| [Frontend Docs](docs/frontend/README.md) | Deep frontend maps across main, renderer, preload, contracts, runtime, and inventory. |
| [Local-Runtime Python Docs](docs/frontend/sidecar/README.md) | Python implementation behind local-runtime memory, browser automation, services, and tools. |
| [Operations](docs/operations/release.md) | Configuration, packaging, release, security, performance, and bundled local-runtime Python packaging. |
| [Development](docs/development/contributing.md) | Contribution workflow, environment setup, tests, and tool development. |
| [API Reference](docs/reference/api_reference.md) | Backend API and transport surfaces consumed by the client, local-runtime Python implementation, and SDKs. |

The docs describe the Electron desktop app, local-runtime Python implementation,
browser-use runtime, local memory, backend agent loop, model providers, SDK/API
surfaces, packaging, and operations.

## License

See [LICENSE](LICENSE).
