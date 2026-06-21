---
summary: "High-level WindieOS project overview for the desktop runtime, local authority, memory, tools, and future control-plane direction."
read_when:
  - When you need a high-level product overview.
title: "WindieOS Project Overview"
---

# WindieOS Project Overview

## Vision

WindieOS is a desktop runtime for personal AI agents. It operates across the
user's live desktop session, not only inside a single chat box, IDE, browser
tab, or remote workspace.

The system treats screen state, windows, browser sessions, local files, apps,
shell, memory, permissions, and current workflow as first-class runtime context.
Vision, OCR, and visual grounding help the agent understand the desktop it is
working inside.

Core differentiators:
- Agent presence inside the user's personal computer session.
- Visible, permissioned execution across apps, files, browser, and shell.
- Local episodic and semantic memory for continuity.
- Hackable runtime boundaries across desktop UI, SDK, local runtime, and backend.

## What It Does Today

WindieOS accepts natural-language requests and executes multi-step actions
through tool orchestration.

Current focus areas:
- Reliable desktop control through screenshot-based context.
- Practical developer workflows (file edits, shell execution, app navigation).
- Transparent execution feedback in the UI.
- Local memory retrieval to preserve context between turns.

## Key Capabilities

### Intelligent Memory
- Persistent context across sessions.
- Semantic search over local memory.
- Episodic memory of user actions and agent decisions.
- Semantic rollups through backend summarization.

### Advanced Computer Control
- Vision-first navigation with screenshot analysis.
- OCR-assisted coordinate targeting.
- Vision model-based UI grounding.
- Multi-step workflows across applications.
- Visual capture around tool execution for context.

### Tool System
- Backend-owned tool registry and schema contracts.
- Trust-boundary validation for tool calls and arguments.
- SDK path for custom tool development.
- Sandbox hooks in the executor abstraction.
- First-class file editing and shell execution.

### Voice
- Voice input/output support in product surface.
- Wake-word integration path.
- Multi-provider STT/TTS integration path.

### Performance
- Optional GPU acceleration for embeddings/OCR/vision.
- Multi-provider LLM support.
- Provider and embedding caching.

## System Architecture

```text
┌─────────────────────────────────────────────────┐
│       Electron Agent Host + SDK Runtime         │
│  ┌──────────────────────────────────────────┐  │
│  │  React Components                        │  │
│  │  - ChatInterface                         │  │
│  │  - Dashboard                             │  │
│  │  - Screenshot Display                    │  │
│  │  - Tool Execution Status                 │  │
│  └──────────────────────────────────────────┘  │
│                    ↕ IPC (WebSocket)          │
└─────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────┐
│         Python Backend (AI Core)                │
│  ┌──────────────────────────────────────────┐  │
│  │   Agent Orchestrator                     │  │
│  │   - Multi-Provider LLM Client            │  │
│  │   - Tool Calling Engine                  │  │
│  │   - Task Orchestration                   │  │
│  └──────────────────────────────────────────┘  │
│   ↕          ↕          ↕           ↕         │
│ ┌──────────┐  ┌────────┐  ┌──────────┐  ┌──────────┐ │
│ │Embeddings│  │Computer│  │OCR/Vision│  │   AI     │ │
│ │API       │  │Control │  │Services  │  │  Models  │ │
│ │• ST      │  │Tools   │  │• OCR     │  │• OpenAI  │ │
│ │• Cache   │  │• Mouse │  │• UI      │  │• Anthro- │ │
│ │• HTTP    │  │• Scroll│  │  Ground  │  │pic/Gemini│ │
│ └──────────┘  └────────┘  └──────────┘  └──────────┘ │
└─────────────────────────────────────────────────┘
```

## Core Components

### Agent Orchestrator
Coordinates conversation state, model calls, and tool execution.

### Memory System
Runs through local-runtime storage (SQLite + FAISS) plus backend embedding/summarization services.

### Computer Control
Uses screenshot-driven reasoning with OCR and vision grounding for OS-level actions.

### Tool System
Combines schema-validated built-in tools and extension points for custom tools.

### Model Layer
Supports multiple LLM providers and configurable inference backends.

## Product Direction

Current stage: functional hackable desktop runtime with core local-agent
capabilities.

Implemented areas:
- Multi-provider LLM client and streaming response flow.
- Agent orchestration with tool calling.
- Local episodic/semantic memory.
- Tool registry with validation.
- Vision/OCR-assisted desktop interaction.
- Electron UI with live execution feedback.

Active work:
- Voice runtime polish.
- Monitoring and execution observability improvements.
- Performance profiling and tuning.
- Desktop presence and live-turn presentation polish.

Long-term direction: a personal agent control plane across devices, where each
device can have a local agent responsible for its own context and resources.
The current wedge remains the desktop runtime.

## Privacy and Security

WindieOS emphasizes local control of user data.

- Memory, transcripts, and files remain local by default.
- LLM providers receive only required inference payloads.
- Tool execution is routed through explicit contracts.
- Audit and policy surfaces exist for runtime controls.

## Technology Stack

### Backend
- Python 3.11
- FastAPI
- SentenceTransformers, FAISS, RapidOCR, InternVL
- SQLite/aiosqlite

### Frontend
- Electron + React
- Vite
- Context-based UI state
- IPC/WebSocket communication

### Tooling
- LiteLLM for provider abstraction
- SentenceTransformers for embeddings
- RapidOCR for OCR
- FAISS for vector search

## Getting Started

- Quick start: `quick_start.md`
- Installation: `installation.md`
- Architecture: `../architecture/architecture.md`
- Developer guide: `../development/developer_guide.md`
- Tool development: `../development/tool_development.md`
- API reference: `../reference/api_reference.md`
