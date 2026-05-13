# WindieOS

> Welcome to Windie.

WindieOS is a desktop agent for your real computer.

Yes, it belongs in the same conversation as Hermes, OpenClaw, Codex, Claude
Code, and the other agent tools people are building right now. The difference is
where Windie tries to live: not just in a terminal, not just in a browser tab,
and not just in a remote sandbox. Windie lives on your desktop, sees the screen
you are seeing, remembers what happened locally, and can use your computer
through tools while you stay in control.

It is an open-source Electron client with a Python sidecar. The hosted WindieOS
backend owns model orchestration, OCR, vision, embeddings, and other
backend-side services. The client owns the local experience: the floating chat
pill, the fullscreen dashboard, screenshots, shell and filesystem tools,
browser-use, local memory, and computer-use execution.

## Why Windie Exists

Most AI products still ask the human to do the last mile.

You can ask for restaurants, but you still open Maps to check hours. You can ask
for a workflow, but you still jump between tabs. You can ask for code help, but
the agent usually lives inside a repository instead of your whole computer.

WindieOS is built around a different assumption:

```text
The user gives a goal.
Windie sees the current desktop context.
Windie chooses tools.
Windie acts locally.
Windie streams what it is doing back to the user.
```

The point is not to replace the human. The point is to give the agent a real
local body: screen context, memory, browser state, files, shell access, and a UI
that stays with you while the loop runs.

## The Windie Vibe

Windie has two UI states.

The first is the minimal chat pill. It floats on your screen, stays out of the
way, and can attach the current screen automatically when you send a message.
This is the mode you should live in most of the time.

The second is the fullscreen dashboard. It gives you the longer transcript,
tool logs, memory surfaces, settings, and deeper visibility into the agent loop.
Use it when you want to inspect what happened or steer a run more carefully.

The intended flow is simple: talk to the pill, let Windie use the current screen
as context, and open the dashboard when you need the details.

## What Makes It Different

| Area | WindieOS |
| --- | --- |
| Computer-use | Built in, Codex-style, but usable with any supported model provider. It does not depend on one vendor's native computer tool. |
| Desktop control | Screenshot-first today. Windie captures state, reasons over the image/context, executes mouse/keyboard/scroll/browser/shell tools, then observes again. Accessibility-tree control is not the current path. |
| Memory | Designed around human-like memory: episodic traces of what happened, semantic memory for distilled meaning, and procedural memory as the direction for repeatable routines and skills. |
| Browser-use | Uses a WindieOS-owned persistent browser profile instead of attaching an extension to your everyday Chrome profile by default, so your normal browsing can continue separately. |
| UI | Always-present minimal pill for quick goals, plus a dashboard for logs, tool traces, memory, settings, and longer runs. |
| Boundary | Local frontend and sidecar execute tools on the user's machine. Hosted services handle backend-owned model, OCR, vision, embedding, and orchestration work. |

## Compared To Other Agents

| Project | Center of gravity | WindieOS difference |
| --- | --- | --- |
| Codex / Claude Code | Terminal, IDE, repository, coding workflows | WindieOS is broader desktop embodiment: screen, apps, browser, files, shell, voice hooks, and local state. |
| Hermes Agent | Agent runtime, skills, memory, terminal backends, messaging, research tooling | WindieOS is the local desktop surface that can sit beside a broader runtime and operate the user's real machine. |
| OpenClaw | Local-first assistant gateway across channels and device nodes | WindieOS focuses on the computer in front of the user: screen capture, input control, local memory, browser profile, and sidecar tools. |
| Cloud agent computers | Remote VM or browser workspace | WindieOS runs beside the human on the main desktop instead of moving all work into a separate remote computer. |

## Core Pieces

### Computer-Use

Windie can use the desktop through local tools:

- screenshots and system-state capture
- mouse movement, clicking, dragging, and scrolling
- keyboard input
- app and window interactions
- shell commands and long-running processes
- filesystem reads, writes, and searches
- browser-use actions through the Windie browser runtime

The current computer-use path is intentionally screenshot-first. Windie observes
the screen, takes an action, observes again, and continues the loop. That makes
the tool contract model-agnostic and works across providers, but it also means
Windie is not yet using an accessibility tree as its primary desktop interface.

### Memory

Windie memory is local-first and inspired by how people remember:

- **Episodic memory**: records of interactions and what happened.
- **Semantic memory**: distilled facts, preferences, and durable context.
- **Procedural memory**: the planned layer for repeatable routines, workflows,
  and learned ways of doing tasks.

Today the local sidecar stores transcript, episodic, and semantic memory using
SQLite and vector search. Hosted services can be used for embeddings,
summaries, titles, OCR, and vision when configured.

### Browser-Use

Windie does not need to take over your everyday browser profile by default.

Instead, browser-use is designed around a WindieOS-owned persistent browser
profile. The agent can keep its own browser state, cookies, sessions, and
automation context while you continue using your normal browser separately.

### Frontend And Sidecar

This repository is centered on the public client:

- **Electron main process** for windows, permissions, lifecycle, backend
  transport, and sidecar supervision.
- **React renderer** for the chat pill, dashboard, transcript, memory, settings,
  tool progress, voice surfaces, and onboarding.
- **Python sidecar** for local screenshots, browser adapters, shell/filesystem
  tools, local memory, and system state.
- **Transport clients** for talking to hosted WindieOS APIs without importing
  backend internals into the frontend or sidecar.

The sidecar is not a replacement backend. It executes what must happen on the
user's machine and calls hosted services for backend-owned capabilities.

## Architecture

```text
                Hosted WindieOS APIs
          LLM orchestration, OCR, vision,
        embeddings, semantic summaries, SDK
                         ^
                         | HTTPS / WebSocket
                         v
+---------------------------------------------------------+
|                   Electron Main                         |
|  windows, permissions, backend transport, sidecar bridge |
+---------------+-------------------------------+---------+
                | IPC                           | JSON-RPC
                v                               v
+------------------------------+   +------------------------------+
|        React Renderer         |   |        Python Sidecar         |
| pill, dashboard, settings,    |   | local tools, memory, browser, |
| transcript, tool progress     |   | files, shell, system state    |
+------------------------------+   +---------------+--------------+
                                                    |
                                                    v
                                  User computer: screen, browser,
                                  files, shell, windows, apps
```

Runtime boundaries matter:

- The frontend and sidecar own local desktop knowledge.
- Tools execute on the sidecar, not in the hosted backend.
- The frontend and sidecar do not import backend Python packages.
- The backend owns model-facing tool schemas and orchestration.
- Backend sessions can be rebuilt from local transcript state when needed.

## What WindieOS Is Not

- It is not a full replacement operating system.
- It is not a generic agent framework.
- It is not a coding-only agent.
- It is not a messaging gateway.
- It is not a claim that every computation is local. Local execution and memory
  live on the user's machine, while backend-owned services can be hosted.

## Quick Start

### Requirements

- macOS, Windows, or Linux
- Node.js 18+
- Python 3.11 for source development
- Git

Packaged releases are expected to bundle the Python sidecar runtime so end users
do not need a system Python installation.

### Run From Source

Clone the repository:

```bash
git clone <repository-url>
cd WindieOS
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

Install sidecar dependencies for source development:

```bash
cd ../
./scripts/python-in-env sidecar python -m pip install -r frontend/src/main/python/requirements.txt
```

Start the Vite renderer:

```bash
cd frontend
npm run dev
```

In another terminal, start the Electron app:

```bash
cd frontend
npm run electron:dev
```

By default the client is designed to use the configured hosted WindieOS backend.
Use explicit `BACKEND_*` or `WINDIE_BACKEND_*` environment overrides only when
you are intentionally pointing the client at another backend.

## Development Commands

From the repository root:

```bash
./scripts/test-sidecar
./scripts/test-backend
./scripts/test
```

From `frontend/`:

```bash
npm run test
npm run test:ci
npm run lint
npm run electron:dev
```

Use the environment launcher for Python commands:

```bash
./scripts/python-in-env <backend|frontend|sidecar> <cmd...>
```

## Security And Privacy

Windie touches sensitive local surfaces, so the trust boundary is explicit:

- Local tools execute in the Python sidecar on the user's machine.
- Conversation transcripts and local memory are stored locally.
- Hosted calls are used for backend-owned capabilities such as model
  orchestration, embeddings, semantic summarization, OCR, vision, and artifacts.
- OS permissions are requested through onboarding and settings surfaces instead
  of silently assuming access.
- The frontend and sidecar use transport clients for hosted APIs instead of
  importing backend internals.
- Browser automation uses a dedicated Windie runtime path by default and should
  avoid touching the user's normal browser profile unless explicitly configured.

## Repository Map

```text
frontend/
  src/main/              Electron main process, IPC, windows, permissions
  src/renderer/          React chat/dashboard/voice/settings surfaces
  src/main/python/       Python sidecar, tools, memory, browser/system adapters

backend/
  src/                   Hosted backend and agent orchestration implementation

docs/
  architecture/          Frontend, sidecar, backend, tool, and runtime docs
  planning/              Design notes and future architecture plans

tests/
  backend/               Backend-focused pytest suites
  frontend/              Jest/Electron bridge tests
  sidecar/               Sidecar pytest suites
```

Start with:

- [Product Overview](docs/getting-started/product_overview.md)
- [Frontend Architecture](docs/architecture/frontend_architecture.md)
- [Python Sidecar](docs/architecture/python_sidecar.md)
- [Memory System](docs/architecture/memory_system.md)
- [Tool System](docs/architecture/tool_system.md)

## Roadmap

WindieOS is moving toward a cleaner separation between local desktop embodiment
and remote/hosted agent intelligence:

- simpler packaged install and onboarding
- safer permission and tool policy surfaces
- stronger local transcript and memory reliability
- procedural memory for repeatable routines and learned workflows
- dedicated agent browser/workspace flows
- better voice and wakeword interaction
- clearer SDK boundaries for developers building local tools and integrations
- optional remote or VM workspaces for agent tasks that should not interrupt the
  human's active desktop

## Contributing

Contributions are welcome while the project is still early. Good places to help:

- sidecar tools and tests
- frontend onboarding and permission UX
- browser/session reliability
- local memory and transcript flows
- documentation and examples
- security reviews around local tool execution

Before changing behavior, read the relevant docs in `docs/architecture/` and add
focused tests for the touched boundary.

## License

License details will be finalized with the public release.
