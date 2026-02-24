# Desktop Assistant

> Your AI-powered personal assistant that remembers context locally, controls your computer, and adapts to your workflow.

[![Source](https://img.shields.io/badge/source-closed--source-red.svg)]()
[![Python](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/downloads/)
[![Electron](https://img.shields.io/badge/electron-latest-brightgreen.svg)](https://www.electronjs.org/)
[![Project Status](https://img.shields.io/badge/status-functional%20AI%20assistant-green.svg)]()

---

## 🎯 Vision

**Desktop Assistant** is an AI-powered personal assistant that provides intelligent computer control and automation at the **OS-level** - unlike IDE-based tools like Claude Code or Cursor, it operates across your entire operating system.

> 💡 **Think ChatGPT, but you never have to copy-paste again.** Just ask, and it does the work directly on your computer. **The system uses primarily vision (screenshots) to navigate through your computer** - capturing screenshots, analyzing them with vision models and OCR, and using visual understanding to interact with UI elements. 

**Key Differentiators:**
- **Code Editing & Command Execution**: Edit code files, execute shell commands, and automate tasks just like Claude Code or Cursor, but at the OS-level across any application
- **OS-Level Operation**: Works across your entire operating system, not confined to a single IDE or application
- **Persistent Memory**: Local episodic + semantic memory (adaptive learning planned)
- **Privacy-First**: Only data required for LLM inference (prompt + screenshots) is sent to providers

Users can interact with their computer through natural language commands, with the assistant handling complex tasks using a system of specialized tools.

Key capabilities include:

- **Vision-First Navigation**: Primarily uses screenshots and visual analysis to understand and navigate your computer interface
- **Code Editing & Automation**: Edit code files, execute commands, and automate development workflows across any editor or application
- **Intelligent Task Execution** through natural language commands
- **Computer Control** with OCR-enhanced UI automation and vision models
- **Persistent Memory System** with local episodic + semantic storage across sessions
- **Tool Ecosystem** with multiple built-in tools for computer control and automation
- **Multi-Provider LLM Support** for flexible AI integration

Our mission: **Democratize computer power** - making advanced capabilities accessible to everyone, not just developers.

**Long-term Vision**: Scale from a single assistant to teams of virtual employees - spawn multiple OS instances with parallel agents working together to handle complex, distributed tasks simultaneously.

---

## 🚀 Project Status

**Current Stage**: Functional AI Assistant with Advanced Features

We have a **working AI assistant** with computer control, LLM integration, and tool execution capabilities.

### ✅ Completed Features

#### 🧠 **Core AI Infrastructure**
- [x] Multi-provider LLM client (OpenAI, Anthropic, Gemini, Ollama, OpenRouter, Mistral, LM Studio)
- [x] Advanced agent orchestrator with tool calling capabilities
- [x] Real-time thinking display and status updates
- [x] Local episodic/semantic memory with FAISS + backend embedding API
- [x] Conversation history and context management
- [x] **Persistent Memory**: Local episodic + semantic storage (adaptive learning planned)

#### 🛠️ **Tool System**
- [x] Tool registry with schema-based execution
- [x] Trust-boundary validation for tool calls
- [x] Sandbox hooks available (not enabled by default)
- [x] Multiple built-in tools for computer control, filesystem, and system operations
- [x] **Code Editing**: Edit code files across any editor or application (like Claude Code/Cursor, but OS-level)
- [x] **Command Execution**: Execute shell commands and automate development workflows

#### 🎮 **Advanced Computer Control**
- [x] **Vision-First Navigation**: Primarily uses screenshots to navigate and understand the computer interface
- [x] **OCR-Enhanced UI Automation**: `mouse_control` tool with `find_coordinates_by="ocr"` for precision clicking on detected text from screenshots
- [x] **Vision-Language UI Control**: `mouse_control` tool with `find_coordinates_by="prediction"` using InternVL models to analyze screenshots and intelligently detect UI elements
- [x] **Automatic Screenshot Capture**: Query screenshots captured when enabled (`include_query_screenshot=true` by default) and after computer-use tool execution
- [x] **File System Tools**: Read/write/list file operations
- [x] **Terminal Integration**: Safe command execution with process management

#### 🚀 **Performance & Intelligence**
- [x] **Optional GPU Acceleration**: Embeddings/OCR/Vision when configured
- [x] **Natural Language Task Execution**: Complex multi-step task decomposition and execution
- [x] **Local Memory**: Semantic search and episodic memory with vector similarity

#### 🎨 **User Experience**
- [x] Modern Electron UI with chat interface and settings
- [x] Real-time agent status and tool execution feedback
- [x] Screenshot integration for visual context
- [x] Responsive design (single theme in current UI)

For future planning and roadmap docs, use the [Planning Hub](docs/planning/README.md).

---

## ✨ Key Capabilities

### 🧠 **Intelligent Memory System**
- **Persistent Context**: Remembers conversations and context across sessions
- **Semantic Search**: Find relevant information using vector similarity
- **Episodic Memory**: Tracks user actions and agent decisions to build understanding of your preferences
- **Summarization**: Periodic rollups into semantic memory via backend semantic API
- **Privacy-First**: Memory and conversation history stored locally; only data needed for LLM inference is sent to providers

### 🎮 **Advanced Computer Control**
- **Vision-First Navigation**: The system primarily uses screenshots to navigate your computer - capturing screen states, analyzing visual elements, and using vision models to understand and interact with your interface
- **OCR-Enhanced UI**: `mouse_control` tool with `find_coordinates_by="ocr"` for clicking on text elements detected via optical character recognition from screenshots
- **Vision-Language Models**: `mouse_control` tool with `find_coordinates_by="prediction"` using InternVL to analyze screenshots and intelligently detect UI elements
- **Multi-Step Automation**: Complex workflows across applications, all driven by visual understanding of screen states
- **Visual Feedback**: Query screenshots captured when enabled (`include_query_screenshot=true` by default), plus post-computer-use screenshots for visual context

### 🛠️ **Tool System**
- **Registered Tools**: Tool registry + schema-driven execution
- **Schema Validation**: Tool arguments validated against schemas
- **Custom Development**: SDK for building your own tools
- **Sandbox Hooks**: Executor abstraction enables sandboxing (not enabled by default)

### 🎤 **Voice Integration** (In Progress)
- **Natural Speech**: Voice commands and responses
- **Wake Word Detection**: Hands-free activation
- **Multi-Provider STT/TTS**: Choose from Whisper, cloud APIs, or local engines

### 🚀 **Performance Optimized**
- **Optional GPU Acceleration**: Embeddings/OCR/Vision when configured
- **Multi-Provider LLMs**: OpenAI, Anthropic, Gemini, Ollama, OpenRouter, Mistral, LM Studio
- **Caching**: Provider and embedding caches for performance
- **Scalable Architecture**: Designed for future expansion

### 🔮 **Future Capabilities** (Planned)
- **Agent Skills**: Rigorous procedures for specific tasks to address inconsistent agent behavior - providing reliable, repeatable workflows for common to medium-complexity tasks
- **Subagents**: Specialized agent instances for domain-specific tasks and workflows
- **User Rules**: Customizable rules and preferences that guide agent behavior and decision-making
- **External MCPs**: Integration with Model Context Protocol (MCP) servers for extended capabilities and external tool integration
- **Virtual Employees**: Spawn multiple operating system instances with multiple agents working in parallel, creating a team of virtual employees that can handle complex, distributed tasks simultaneously

Canonical future-roadmap docs live in `docs/planning/README.md`.

---

## 🚀 Getting Started (For Developers)

### Prerequisites
- **Windows 10/11, macOS, or Linux**
- **Python 3.11**
- **Node.js 18+** and npm
- **Git**

### Setting Up Development Environment

#### 1. Clone the Repository
```bash
git clone <repository-url>
cd WindieOS
```

#### 2. Backend Setup
```bash
# Navigate to backend directory
cd backend

# Install Python dependencies
pip install -r requirements.txt
```

#### 3. Frontend Setup
```bash
cd frontend
npm install
cd .. # Return to project root
```

#### 4. Python Sidecar Setup (Required for Electron Tool Execution)
Install sidecar Python deps in the same environment you use to launch Electron:

```bash
cd frontend/src/main/python
pip install -r requirements.txt
cd ../../../../  # Return to project root
```

Helper scripts auto-route commands to conda envs when available:
- backend commands -> `jarvis`
- frontend/sidecar commands -> `frontend_jarvis`

You can run commands through:

```bash
./scripts/python-in-env <backend|sidecar|frontend> <cmd...>
```


### Running the Application for Development

You must run the backend and frontend in separate terminals.

**Terminal 1: Start the Backend**
```bash
# Set an API key for the provider you plan to use
export OPENAI_API_KEY="your-key"
# Note: Local providers (Ollama/LM Studio) do not require API keys.

# Run the server from the project root (auto-uses jarvis env if available)
./scripts/run-backend
```

**Terminal 2: Start the Frontend UI (Vite)**
```bash
./scripts/run-frontend-dev
```

**Terminal 3: Start the Frontend App (Electron)**
```bash
./scripts/run-frontend-electron
```

### Running Tests
The project includes backend, sidecar, and frontend test suites.

#### Full Test Gate
1.  From the repo root, run:
    ```bash
    ./scripts/test
    ```
    This runs backend + sidecar tests, and runs frontend tests when `frontend/node_modules` is present.

#### Targeted Python Suites
1.  Backend only:
    ```bash
    ./scripts/test-backend
    ```
2.  Sidecar only:
    ```bash
    ./scripts/test-sidecar
    ```

#### Frontend Tests (Jest)
1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```
2.  Install Node.js dependencies:
    ```bash
    npm install
    ```
3.  Run the tests:
    ```bash
    npm test
    ```

### Current Development Focus

The core AI assistant is functional. Current development priorities include:

- **Voice Integration**: TTS implementation (STT planned for future)
- **Enhanced Monitoring**: Basic audit logging and tool execution tracking
- **Performance Optimization**: GPU configuration and profiling
- **User Experience**: UI improvements and additional tool capabilities

If you want to contribute, check out:

- Open Issues: use the repository `Issues` tab
- Look for issues tagged with `good-first-issue`, `help-wanted`, or `enhancement`

---

## 📖 Documentation

### Project Documentation
- **[Documentation Index](docs/README.md)** - Full documentation index
- **[Quick Start](docs/quick_start.md)** - Get running quickly
- **[Installation](docs/installation.md)** - Detailed setup instructions
- **[Architecture](docs/architecture.md)** - System architecture overview
- **[Backend Architecture](docs/backend_architecture.md)** - Backend responsibilities and implementation
- **[Frontend Architecture](docs/frontend_architecture.md)** - Frontend responsibilities and implementation
- **[Python Sidecar](docs/python_sidecar.md)** - Local tool execution + memory service
- **[Tool System](docs/tool_system.md)** - Tool execution architecture and flow
- **[API Reference](docs/api_reference.md)** - WebSocket and REST payloads

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│           Electron Frontend (UI)                │
│  ┌──────────────────────────────────────────┐  │
│  │  React Components                        │  │
│  │  - ChatInterface                         │  │
│  │  - Dashboard                             │  │
│  │  - Screenshot Display                    │  │
│  │  - Tool Execution Status                 │  │
│  └──────────────────────────────────────────┘  │
│                    ↕ IPC (WebSocket)            │
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

**Key Components:**
- **Agent Orchestrator**: Core intelligence with tool calling and conversation management
- **Memory System**: Local episodic/semantic memory via sidecar (SQLite + FAISS) with backend embedding API
- **Computer Control**: Vision-first navigation using screenshots - OCR and vision models analyze screen states to automate UI interactions and file operations
- **Tool System**: Schema-driven tools executed by the sidecar (code editing, command execution, OS-level automation)
- **AI Models**: Multi-provider LLM support with optional GPU acceleration for embeddings/vision
- **OS-Level Operation**: Works across your entire operating system, not confined to a single IDE or application

---

## 🤝 Contributing

**We're in the early stages and would love your help!**

This is a great time to get involved as a founding contributor. Whether you're experienced or just learning, there's a place for you.

### How to Contribute

1. **Check Current Work**: Look at open Issues in your repository
2. **Read Guidelines**: Review [docs/contributing.md](docs/contributing.md)
3. **Pick an Issue**: Comment on an issue to claim it (or create a new one)
4. **Make Your Contribution**: Fork, branch, code, test, submit PR
5. **Collaborate**: Respond to feedback and iterate

### Ways to Contribute Right Now

- 🎤 **Voice Features**: Help implement TTS improvements and STT integration
- 📝 **Documentation**: Improve accuracy and completeness of documentation
- 🛠️ **Tool Development**: Create new tools for the system
- 🧪 **Testing**: Add tests and improve test coverage
- 💡 **Ideas**: Share thoughts on new features and improvements

### First-Time Contributors Welcome!

New to the project? No problem! Look for issues tagged:
- `good-first-issue` - Good for newcomers
- `documentation` - Help improve docs
- `research-needed` - Research and propose solutions
- `tool-development` - Build new marketplace tools

---

## 🗺️ Development Roadmap

### ✅ **Completed Milestones**

#### Milestone 1: Project Foundation
- [x] Project setup & repository structure
- [x] Backend-frontend IPC communication
- [x] Basic UI shell with Electron
- [x] Configuration management system

#### Milestone 2: Core Agent Intelligence
- [x] Multi-provider LLM integration (8+ providers)
- [x] Advanced agent orchestrator with tool calling
- [x] Real-time thinking display and status updates
- [x] Conversation history and context management

#### Milestone 3: Memory & Learning
- [x] Local memory store (SQLite + FAISS) for episodic/semantic memory
- [x] Summarization via backend semantic API
- [x] Optional GPU acceleration (when configured)
- [x] Local data storage (no cloud sync)

#### Milestone 4: Advanced Automation
- [x] **Tool System**: Schema-driven tools executed in the Python sidecar
- [x] **Computer Control Tools**: Vision-first navigation using screenshots - OCR-enhanced UI automation and vision-language models for visual understanding
- [x] **Agent System**: Multi-step task execution with tool coordination
- [x] **Intelligent Task Execution**: Natural language task decomposition

#### Milestone 5: Performance & Polish
- [x] **Optional GPU Acceleration**: Embeddings/OCR/Vision when configured
- [x] **Automatic Screenshots**: Query screenshots when enabled (`include_query_screenshot=true` by default) and after computer-use tools
- [x] **File System Integration**: Complete file operations toolkit
- [x] **Example Tools**: Filesystem, system, and computer control tools

### 🔄 **Current Development Focus**

#### Milestone 6: Voice Integration (In Progress)
- [ ] Voice command input (STT integration)
- [ ] Text-to-speech output (TTS)
- [ ] Wake word detection
- [ ] Audio processing pipeline

#### Milestone 7: Advanced Features (Planned)
- [ ] Active memory monitoring and analytics
- [ ] Advanced marketplace features and curation
- [ ] Plugin system expansion and marketplace
- [ ] Performance optimizations and scaling
- [ ] Enhanced security and privacy features

#### Milestone 8: Agent Intelligence & Extensibility (Planned)
- [ ] **Agent Skills**: Rigorous procedures for specific tasks to address inconsistent agent behavior - providing reliable, repeatable workflows for common to medium-complexity tasks
- [ ] **Subagents**: Specialized agent instances for domain-specific tasks and workflows
- [ ] **User Rules**: Customizable rules and preferences that guide agent behavior and decision-making
- [ ] **External MCPs**: Integration with Model Context Protocol (MCP) servers for extended capabilities and external tool integration

#### Milestone 9: Virtual Employees & Distributed Agents (Planned)
- [ ] **Multiple OS Instances**: Spawn and manage multiple operating system instances (virtual machines or containers)
- [ ] **Parallel Agent Execution**: Deploy multiple agents working in parallel across different OS instances
- [ ] **Virtual Employee Teams**: Create teams of virtual employees that can handle complex, distributed tasks simultaneously
- [ ] **Distributed Task Coordination**: Coordinate tasks across multiple agents and OS instances
- [ ] **Resource Management**: Manage resources, scheduling, and load balancing across virtual employee instances

### 📈 **Project Evolution**
- **Started**: Basic IPC communication skeleton
- **Now**: Functional AI assistant with computer control and tool execution
- **Next**: Voice integration and enhanced monitoring capabilities
- **Future**: Agent skills, subagents, user rules, and external MCP integration for more reliable and extensible agent behavior
- **Vision**: Multiple OS instances with parallel agents working as virtual employees, creating distributed teams capable of handling complex, multi-faceted tasks simultaneously

See the [Development Roadmap](#-development-roadmap) section above for detailed implementation plans.

---

## 🛡️ Privacy & Security

**Privacy and Security.** We prioritize privacy and security:

- ✅ **Local memory storage** - Conversation history, memory, files, and all data are stored and searched locally on your machine
- ✅ **LLM inference data only** - Only data required for LLM inference (prompt + screenshots) is sent to providers
- ✅ **OS-Level Privacy** - Unlike cloud-based services, all your workflow, habits, and personal information remain on your device
- ✅ **Closed source** - Access is restricted to authorized collaborators
- ✅ **Sandbox hooks** - Executor abstraction for sandboxing (not enabled by default)
- ✅ **Basic audit logging** - Tool execution logging for monitoring
- ✅ **No cloud sync** - Memory, conversation data, and personal information are never synced to cloud services

---

## 📊 Project Stats

- **Language**: Python (backend), JavaScript/React (frontend), TypeScript (frontend)
- **License**: Proprietary (closed-source)
- **Status**: Functional AI Assistant with Active Development
- **Team**: Internal team with authorized contributors
- **Lines of Code**: Varies by branch and build
- **Key Technologies**:
  - **AI/ML**: SentenceTransformers, FAISS, RapidOCR, InternVL (optional GPU acceleration)
  - **Backend**: FastAPI, WebSocket IPC, dependency injection, async architecture
  - **Frontend**: Electron, React, real-time UI updates
  - **Tools**: Multiple built-in tools executed in the Python sidecar
- **Performance**: Optional GPU acceleration for embeddings/OCR/vision when configured
- **Architecture**: Clean architecture with dependency injection and protocol interfaces

---

## 🙏 Acknowledgments

Inspired by:
- The vision of ambient computing and personal AI assistants
- Amazing LLM providers (OpenAI, Anthropic, Gemini)
- Teams building the future of AI

---

## 📬 Contact & Community

- **Issues**: repository `Issues` tab
- **Discussions**: repository `Discussions` tab
- **Email**: contact@yourproject.com
- **Discord**: [Join our community](#) (coming soon)

For security concerns (once code is developed), email: security@yourproject.com

---

## 📜 License

This project is proprietary and closed-source. All rights reserved.

---

## ⭐ Star This Project

If this vision excites you, please star the repository! It helps others discover the project and shows your support for the team.

---

<div align="center">

**🚀 Building the future of personal computing, one commit at a time**

Use repository `Discussions` · [Contribute](docs/contributing.md)

</div>
