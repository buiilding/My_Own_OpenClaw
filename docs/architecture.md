# Desktop Assistant - Architecture Overview

This document provides a high-level overview of the system architecture, technology stack, and key design patterns used in the Desktop Assistant project.

---

## System Architecture Diagram (Conceptual)

The application is divided into two main processes: a Python backend that contains all the core logic, and an Electron frontend that serves as the user interface. They communicate via a WebSocket-based IPC (Inter-Process Communication) bridge.

```
┌─────────────────────────────────────────────────┐
│           Electron Frontend (UI)                │
│  ┌──────────────────────────────────────────┐  │
│  │  React Components                        │  │
│  │  - ChatInterface                         │  │
│  │  - VoiceControls                         │  │
│  │  - ThinkingDisplay                       │  │
│  │  - SettingsPanel                         │  │
│  │  - MemoryViewer                          │  │
│  └──────────────────────────────────────────┘  │
│                    ↕ IPC (WebSocket)            │
└─────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────┐
│         Python Backend (Core Logic)             │
│  ┌──────────────────────────────────────────┐  │
│  │   Agent Orchestrator                     │  │
│  │   - LLM Client (Multi-provider)          │  │
│  │   - Decision Engine                      │  │
│  │   - Safety Checker                       │  │
│  └──────────────────────────────────────────┘  │
│             ↕              ↕           ↕         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────┐ │
│  │   Memory    │  │ Tool         │  │ Voice  │ │
│  │   System    │  │ Marketplace  │  │ Engine │ │
│  │             │  │              │  │        │ │
│  │ - Storage   │  │ - Registry   │  │ - STT  │ │
│  │ - Retrieval │  │ - Executor   │  │ - TTS  │ │
│  │ - Monitor   │  │ - Search     │  │ - Wake │ │
│  └─────────────┘  └──────────────┘  └────────┘ │
│                           ↕                      │
│                    ┌─────────────┐              │
│                    │   Tools     │              │
│                    │ - Terminal  │              │
│                    │ - FileOps   │              │
│                    │ - CUA       │              │
│                    └─────────────┘              │
└─────────────────────────────────────────────────┘
                      ↕
              ┌───────────────┐
              │  Windows OS   │
              │  - Filesystem │
              │  - Processes  │
              │  - UI/Display │
              └───────────────┘
```

---

## Technology Stack

### Backend (Python 3.10+)
- **Core Framework**: `asyncio` for asynchronous operations.
- **IPC**: `websockets` for the server that communicates with the frontend.
- **Configuration**: `PyYAML` for file parsing and `pydantic` for data validation.
- **LLM SDKs**:
  - `openai` (for OpenAI, Ollama, OpenRouter, and Mistral)
  - `anthropic` (for Claude models)
  - `google-generativeai` (for Gemini models)
- **Testing**: `pytest` and `pytest-asyncio`.

### Frontend (Electron + React)
- **Framework**: Electron for the desktop application wrapper.
- **UI**: React 18+ with functional components and hooks.
- **Build Tool**: Vite for a fast development experience.
- **IPC**: Native browser WebSocket client.
- **Testing**: Jest and React Testing Library.

### Development Tools
- **Linting/Formatting**: `pylint`, `black`, `isort` (Python) and `eslint`, `prettier` (JavaScript).
- **Git Hooks**: `pre-commit` to automate code quality checks.
- **CI/CD**: GitHub Actions.

---

## Key Design Patterns

### 1. Agent Orchestrator
The "brain" of the application, responsible for receiving user queries and coordinating the other components (LLM, Memory, Tools) to generate a response.

### 2. Multi-Provider LLM Client (Strategy & Factory Pattern)
- **Abstract Base Class**: An `LLMClient` interface defines a common contract (`get_completion`, `get_completion_stream`).
- **Strategy Pattern**: Concrete classes (`OpenAIClient`, `AnthropicClient`, etc.) provide specific implementations for each provider.
- **Factory Function**: A `get_llm_client()` function reads the application's configuration and instantiates the appropriate client, decoupling the agent from the specific provider implementations.

### 3. Configuration Management
- **Externalized Config**: A `config.yaml` file in the user's application directory stores all settings, separating configuration from code.
- **Secure Credential Handling**: API keys are not stored in the config file. Instead, the name of an environment variable is stored, and the key is loaded from the environment at runtime.
- **Validation**: Pydantic models are used to define a strict schema and validate the configuration on load.

### 4. Asynchronous, Non-Blocking I/O
- The entire backend is built on `asyncio`.
- All I/O operations, especially network requests to LLM APIs and file system writes, are handled asynchronously to ensure the server remains responsive.
- Blocking I/O calls (like writing the config file) are moved to a separate thread pool using `asyncio.to_thread`.

### 5. Real-time Thinking Display
- To provide transparency, the agent's thought process is streamed from the backend to the frontend in real-time.
- LLM clients (like the Google Gemini client) can emit special "thinking" events.
- These events are sent over the WebSocket IPC bridge to the frontend.
- The frontend UI has a dedicated `ThinkingDisplay` component that accumulates and displays these thoughts, allowing the user to see the agent's reasoning as it happens.
