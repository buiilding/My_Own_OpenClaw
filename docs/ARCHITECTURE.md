# System Architecture Overview

## High-Level Architecture

The Desktop Assistant is a desktop application built with a **frontend-backend separation** architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Frontend                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Renderer    │  │  Main        │  │  Python      │     │
│  │  (React)     │  │  (Node.js)   │  │  Sidecar     │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘            │
│                            │                                 │
│                            │ IPC                             │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             │
                             │ WebSocket
                             │
┌────────────────────────────┼─────────────────────────────────┐
│                    Python Backend (FastAPI)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Agent       │  │  LLM         │  │  Vision     │     │
│  │  Core        │  │  Client      │  │  Service    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Tool        │  │  Memory      │  │  Plugins     │     │
│  │  System      │  │  System      │  │  (OCR)       │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### Frontend (Electron)
- **Renderer Process (React)**: User interface, chat display, user input
- **Main Process (Node.js)**: IPC coordination, WebSocket client, tool execution bridge
- **Python Sidecar**: Local tool execution (mouse, keyboard, filesystem), system state capture, memory storage

### Backend (FastAPI)
- **Agent Core**: Conversation management, LLM orchestration, tool coordination
- **LLM Client**: Multi-provider LLM integration (OpenAI, Anthropic, Gemini, etc.)
- **Tool System**: Tool schema management, remote tool stubs (delegates to frontend)
- **Memory System**: Episodic and semantic memory coordination
- **Vision Service**: InternVL model for UI grounding
- **Plugins**: OCR analysis (RapidOCR)

## Key Design Principles

1. **Frontend Executes Tools**: All computer control and filesystem operations happen on the frontend sidecar
2. **Backend Orchestrates**: Backend manages conversation, LLM interaction, and tool coordination
3. **WebSocket Communication**: Real-time bidirectional communication between frontend and backend
4. **Automatic Screenshots**: Frontend automatically captures screenshots after tool execution
5. **System Context**: Frontend provides system state (active window, mouse position, time, clipboard)

## Data Flow

1. User sends message → Frontend (Renderer)
2. Frontend → Main Process → WebSocket → Backend
3. Backend processes with LLM → Determines tool calls
4. Backend → WebSocket → Frontend → Tool execution (sidecar)
5. Tool result → Frontend → Backend (with screenshot)
6. Backend processes result → Updates conversation → Streams response
7. Response → Frontend → Display to user

For detailed information, see:
- [Frontend Responsibilities](./FRONTEND.md)
- [Backend Responsibilities](./BACKEND.md)
- [Communication Flow](./COMMUNICATION.md)
