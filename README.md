# WindieOS

> The desktop layer for personal AI agents.

WindieOS is an open-source desktop companion layer that gives an AI a local
presence on your computer: a native desktop UI, an Electron runtime, a Python
sidecar for local tool execution, local memory and transcript storage, browser
control, filesystem access, shell execution, screenshots, system-state capture,
and permission-aware OS integration.

WindieOS is not trying to be another terminal coding agent, another messaging
gateway, or another cloud sandbox. It is the local embodiment layer: the part of
an agent system that can see, remember, and act on the user's real machine while
keeping local execution separate from hosted model and backend services.

## Why WindieOS Exists

Most AI tools still live outside the computer they are supposed to help with.
They can answer questions, write code, or run commands in a narrow workspace,
but they do not naturally share the user's desktop context. The user still has
to copy, paste, switch apps, check browser state, open files, grant permissions,
and connect the result back to the real workflow.

WindieOS explores a different boundary:

```text
Human goal
  -> desktop companion UI
  -> local sidecar tools and memory
  -> hosted model/backend services when needed
  -> visible action on the user's computer
```

The project is built around the idea that personal agents need a real local
surface. They need to capture screen state, operate browsers and files, run
commands, manage local memory, request OS permissions, and stream progress back
to the human without pretending the desktop is just a chat transcript.

## How WindieOS Is Different

| Project | Center of gravity | WindieOS difference |
| --- | --- | --- |
| Codex / Claude Code | Terminal, IDE, and repository workflows | WindieOS is OS-level: screen, apps, browser, files, shell, voice hooks, and local desktop state. |
| Hermes Agent | Agent runtime, skills, memory, terminal backends, messaging, research tooling | WindieOS is the desktop embodiment and local execution surface that can sit beside a broader agent runtime. |
| OpenClaw | Local-first personal assistant gateway across channels and device nodes | WindieOS focuses on the user's computer itself: permissioned screen capture, input control, local memory, and sidecar tools. |
| Cloud agent computers | Remote VM or browser workspace | WindieOS runs beside the human on their real desktop and can bridge local context to hosted services. |

## What This Repo Provides

The open-source client distribution is focused on the frontend, sidecar, and SDK
transport boundary:

- **Electron desktop shell** for windows, overlays, permissions, process
  lifecycle, backend transport, and sidecar supervision.
- **React renderer** for chat, dashboard surfaces, transcript browsing, memory,
  settings, tool progress, and voice/wakeword-facing UI.
- **Python sidecar** for local tools, screenshots, system state, shell commands,
  filesystem operations, browser adapters, and local memory.
- **Local transcript and memory store** backed by SQLite and FAISS, with hosted
  APIs used for embeddings, summarization, title generation, OCR, vision, and
  agent orchestration where configured.
- **Hosted SDK transport clients** in TypeScript and Python for calling public
  WindieOS backend APIs without importing backend code into the client runtime.

The sidecar is not a replacement backend. It executes actions that must happen
on the user's machine and calls hosted services for backend-owned capabilities.

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
| chat, dashboard, settings,    |   | local tools, memory, browser, |
| transcript, tool progress     |   | files, shell, system state    |
+------------------------------+   +---------------+--------------+
                                                    |
                                                    v
                                  User computer: screen, browser,
                                  files, shell, windows, apps
```

Runtime boundaries matter:

- The frontend and sidecar own local desktop knowledge.
- The sidecar does not import backend Python packages.
- Backend sessions are remote inference state and can be rebuilt from the local
  transcript when needed.
- Local tools run through the sidecar, not through the hosted backend.

## Capabilities

- **Screen and system context**: capture screenshots and system state for
  grounded agent turns.
- **Computer control**: mouse, keyboard, scrolling, windows, browser sessions,
  and app launching through local tools.
- **Filesystem and shell tools**: read, write, search, execute commands, and
  manage background shell sessions.
- **Local memory**: store and search episodic and semantic memory locally, with
  hosted embedding and summarization APIs when configured.
- **Transcript ownership**: keep conversation history local and use it to
  restore backend inference context on demand.
- **Permission-aware onboarding**: guide users through screen, accessibility,
  microphone, automation, workspace, and browser setup.
- **Voice and wakeword hooks**: local wakeword process supervision and renderer
  voice surfaces for hands-free interaction.
- **Hosted backend bridge**: call public WindieOS APIs for model, OCR, vision,
  artifact, and SDK operations without requiring end users to run a backend.

## What WindieOS Is Not

- It is not a full replacement operating system.
- It is not a generic agent framework.
- It is not a coding-only agent like Codex or Claude Code.
- It is not a messaging gateway like OpenClaw.
- It is not a promise that all computation is local. Backend-owned services can
  be hosted, while local execution and memory remain on the user's machine.

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

## Security and Privacy Model

WindieOS touches sensitive local surfaces, so the trust boundary is explicit:

- Local tools execute in the Python sidecar on the user's machine.
- Conversation transcripts and local memory are stored locally.
- Hosted calls are used for backend-owned capabilities such as model
  orchestration, embeddings, semantic summarization, OCR, vision, and artifacts.
- OS permissions are requested through onboarding and settings surfaces instead
  of silently assuming access.
- The frontend and sidecar use transport clients for hosted APIs instead of
  importing backend internals.
- Browser automation uses a dedicated runtime path and should avoid touching the
  user's normal browser profile unless the user explicitly configures that path.

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

- [Frontend Architecture](docs/architecture/frontend_architecture.md)
- [Python Sidecar](docs/architecture/python_sidecar.md)
- [System Architecture](docs/architecture/architecture.md)
- [Tool System](docs/architecture/tool_system.md)

## Roadmap

WindieOS is moving toward a cleaner separation between local desktop embodiment
and remote/hosted agent intelligence:

- simpler packaged install and onboarding
- safer permission and tool policy surfaces
- stronger local transcript and memory reliability
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
