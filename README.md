# Desktop Assistant

> Your AI-powered personal assistant that remembers everything, controls your computer, and adapts to your workflow.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![Electron](https://img.shields.io/badge/electron-latest-brightgreen.svg)](https://www.electronjs.org/)
[![Project Status](https://img.shields.io/badge/status-functional%20AI%20assistant-green.svg)]()

---

## 🎯 Vision

**Desktop Assistant** is an AI-powered personal assistant that provides intelligent computer control and automation at the **OS-level** - unlike IDE-based tools like Claude Code or Cursor, it operates across your entire operating system. **The system uses primarily vision (screenshots) to navigate through your computer** - capturing screenshots, analyzing them with vision models and OCR, and using visual understanding to interact with UI elements. 

**Key Differentiators:**
- **Code Editing & Command Execution**: Edit code files, execute shell commands, and automate tasks just like Claude Code or Cursor, but at the OS-level across any application
- **OS-Level Operation**: Works across your entire operating system, not confined to a single IDE or application
- **Persistent Memory**: Maintains persistent memory that learns your unique workflow, habits, and personal information to adapt to how you work
- **Privacy-First**: Only AI inference (LLM API calls) goes to the internet - all memory, files, and data stay on your machine

Users can interact with their computer through natural language commands, with the assistant handling complex tasks using a system of specialized tools.

Key capabilities include:

- **Vision-First Navigation**: Primarily uses screenshots and visual analysis to understand and navigate your computer interface
- **Code Editing & Automation**: Edit code files, execute commands, and automate development workflows across any editor or application
- **Intelligent Task Execution** through natural language commands
- **Computer Control** with OCR-enhanced UI automation and vision models
- **Persistent Memory System** that learns your workflow, habits, and personal information across sessions
- **Tool Ecosystem** with 12 built-in tools for computer control and automation
- **Multi-Provider LLM Support** for flexible AI integration

Our mission: **Democratize computer power** - making advanced capabilities accessible to everyone, not just developers.

**Long-term Vision**: Scale from a single assistant to teams of virtual employees - spawn multiple OS instances with parallel agents working together to handle complex, distributed tasks simultaneously.

---

## 🚀 Project Status

**Current Stage**: Functional AI Assistant with Advanced Features

We have a **working AI assistant** with computer control, LLM integration, and tool execution capabilities.

### ✅ Completed Features

#### 🧠 **Core AI Infrastructure**
- [x] Multi-provider LLM client (OpenAI, Anthropic, Google, Gemini, Ollama, OpenRouter, Mistral, LM Studio)
- [x] Advanced agent orchestrator with tool calling capabilities
- [x] Real-time thinking display and status updates
- [x] Semantic memory system with GPU-accelerated embeddings
- [x] Conversation history and context management
- [x] **Persistent Memory**: Learns user workflow, habits, and personal information over time

#### 🛠️ **Tool System**
- [x] Tool discovery system for loading verified tools
- [x] Security validation for tool execution
- [x] Tool execution sandboxing with permission controls
- [x] 12 built-in tools for computer control, filesystem, and system operations
- [x] **Code Editing**: Edit code files across any editor or application (like Claude Code/Cursor, but OS-level)
- [x] **Command Execution**: Execute shell commands and automate development workflows

#### 🎮 **Advanced Computer Control**
- [x] **Vision-First Navigation**: Primarily uses screenshots to navigate and understand the computer interface
- [x] **OCR-Enhanced UI Automation**: `mouse_control` tool with `find_coordinates_by="ocr"` for precision clicking on detected text from screenshots
- [x] **Vision-Language UI Control**: `mouse_control` tool with `find_coordinates_by="prediction"` using InternVL models to analyze screenshots and intelligently detect UI elements
- [x] **Automatic Screenshot Capture**: Continuous visual context through screenshots captured before and after all computer interactions
- [x] **File System Tools**: Complete file operations (read, write, search, replace)
- [x] **Terminal Integration**: Safe command execution with process management

#### 🚀 **Performance & Intelligence**
- [x] **CUDA Acceleration**: GPU-accelerated embeddings and OCR processing
- [x] **Natural Language Task Execution**: Complex multi-step task decomposition and execution
- [x] **Intelligent Memory**: Semantic search and episodic memory with vector similarity

#### 🎨 **User Experience**
- [x] Modern Electron UI with chat interface and settings
- [x] Real-time agent status and tool execution feedback
- [x] Screenshot integration for visual context
- [x] Responsive design with dark/light themes

See our [Development Roadmap](#-development-roadmap) section below for the complete development timeline.

---

## ✨ Key Capabilities

### 🧠 **Intelligent Memory System**
- **Persistent Context**: Remembers conversations and context across sessions
- **Learns Your Workflow**: Adapts to your unique workflow, habits, and personal information over time
- **Semantic Search**: Find relevant information using vector similarity
- **Episodic Memory**: Tracks user actions and agent decisions to build understanding of your preferences
- **Privacy-First**: Memory and conversation history stored locally; only AI inference (LLM API calls) goes to the internet - nothing else

### 🎮 **Advanced Computer Control**
- **Vision-First Navigation**: The system primarily uses screenshots to navigate your computer - capturing screen states, analyzing visual elements, and using vision models to understand and interact with your interface
- **OCR-Enhanced UI**: `mouse_control` tool with `find_coordinates_by="ocr"` for clicking on text elements detected via optical character recognition from screenshots
- **Vision-Language Models**: `mouse_control` tool with `find_coordinates_by="prediction"` using InternVL to analyze screenshots and intelligently detect UI elements
- **Multi-Step Automation**: Complex workflows across applications, all driven by visual understanding of screen states
- **Visual Feedback**: Automatic screenshots captured before and after every computer interaction for continuous visual context

### 🛠️ **Tool System**
- **Verified Tools**: Tools loaded from secure verified directory
- **Security Validation**: Permission-based tool execution
- **Custom Development**: SDK for building your own tools
- **Sandbox Execution**: Isolated tool execution with resource limits

### 🎤 **Voice Integration** (In Progress)
- **Natural Speech**: Voice commands and responses
- **Wake Word Detection**: Hands-free activation
- **Multi-Provider STT/TTS**: Choose from Whisper, cloud APIs, or local engines

### 🚀 **Performance Optimized**
- **CUDA Acceleration**: GPU-accelerated embeddings and OCR processing
- **Multi-Provider LLMs**: OpenAI, Anthropic, Google, Ollama, OpenRouter, Mistral, LM Studio
- **Intelligent Caching**: Optimized memory usage and response times
- **Scalable Architecture**: Designed for future expansion

### 🔮 **Future Capabilities** (Planned)
- **Agent Skills**: Rigorous procedures for specific tasks to address inconsistent agent behavior - providing reliable, repeatable workflows for common to medium-complexity tasks
- **Subagents**: Specialized agent instances for domain-specific tasks and workflows
- **User Rules**: Customizable rules and preferences that guide agent behavior and decision-making
- **External MCPs**: Integration with Model Context Protocol (MCP) servers for extended capabilities and external tool integration
- **Virtual Employees**: Spawn multiple operating system instances with multiple agents working in parallel, creating a team of virtual employees that can handle complex, distributed tasks simultaneously

---

## 🚀 Getting Started (For Developers)

### Prerequisites
- **Windows 10/11, macOS, or Linux**
- **Python 3.9+**
- **Node.js 18+** and npm
- **Git**

### Setting Up Development Environment

#### 1. Clone the Repository
```bash
git clone <repository-url>
cd personal-assistant
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


### Running the Application for Development

You must run the backend and frontend in separate terminals.

**Terminal 1: Start the Backend**
```bash
# Make sure your conda env is active
conda activate desktop-assistant-env

# Set a required API key (even a dummy one) for startup
export OPENAI_API_KEY="dummy-key"
# Note: A dummy key is sufficient for the application to start.
# A valid API key is only required if you set OpenAI as the active provider.

# Run the server as a module from the project root
python -m backend.src.main
```

**Terminal 2: Start the Frontend UI (Vite)**
```bash
cd frontend
npm run dev
```

**Terminal 3: Start the Frontend App (Electron)**
```bash
cd frontend
npm run electron
```

### Running Tests
The project has basic test coverage for the backend.

#### Backend Tests (pytest)
1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
3.  Run the tests:
    ```bash
    pytest ../tests/backend
    ```
    Note: Only basic pytest and pytest-asyncio are included. Advanced testing tools may need to be added separately.

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
- **Performance Optimization**: CUDA acceleration for embeddings and vision processing
- **User Experience**: UI improvements and additional tool capabilities

If you want to contribute, check out:

- [Open Issues](https://github.com/buiilding/ALL_OR_NOTHING/issues)
- Look for issues tagged with `good-first-issue`, `help-wanted`, or `enhancement`

---

## 📖 Documentation

### Project Documentation
- **[Changelog](CHANGELOG.md)** - Version history and release notes
- **[Architecture Overview](docs/ARCHITECTURE.md)** - High-level system architecture
- **[Backend Documentation](docs/BACKEND.md)** - Backend responsibilities and implementation
- **[Frontend Documentation](docs/FRONTEND.md)** - Frontend responsibilities and implementation
- **[Communication Flow](docs/COMMUNICATION.md)** - How frontend and backend communicate
- **[Tool System](docs/TOOLS.md)** - Tool execution architecture and flow
- **[Backend Architecture](backend/docs/architecture.md)** - Backend system design and patterns

**Note**: Additional documentation (User Guide, Developer Guide, API Reference, Tool Development Guide, Testing Guide) is planned but not yet available.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│           Electron Frontend (UI)                │
│  ┌──────────────────────────────────────────┐  │
│  │  React Components                        │  │
│  │  - ChatInterface                         │  │
│  │  - SettingsPanel                         │  │
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
│ ┌─────┐  ┌────────┐  ┌──────┐  ┌──────────┐ │
│ │Memory│  │Computer│  │Market│  │   AI     │ │
│ │System│  │Control │  │place │  │  Models  │ │
│ │      │  │Tools   │  │      │  │  (CUDA)  │ │
│ │• FAISS│  │• OCR  │  │• Tool │  │• Embed- │ │
│ │• Local│  │• Mouse│  │• Disc-│  │• Vision │ │
│ │• CUDA │  │• Files│  │• Secu-│  │• Rapid- │ │
│ └─────┘  └────────┘  └──────┘  └──────────┘ │
└─────────────────────────────────────────────────┘
```

**Key Components:**
- **Agent Orchestrator**: Core intelligence with tool calling and conversation management
- **Memory System**: FAISS vector search + semantic/episodic memory with CUDA acceleration - learns your workflow, habits, and personal information
- **Computer Control**: Vision-first navigation using screenshots - OCR and vision models analyze screen states to automate UI interactions and file operations
- **Tool System**: 12 built-in tools with permission-based security - code editing, command execution, and OS-level automation
- **AI Models**: Multi-provider LLM support with CUDA acceleration for embeddings and vision
- **OS-Level Operation**: Works across your entire operating system, not confined to a single IDE or application

---

## 🤝 Contributing

**We're in the early stages and would love your help!**

This is a great time to get involved as a founding contributor. Whether you're experienced or just learning, there's a place for you.

### How to Contribute

1. **Check Current Work**: Look at open [Issues](https://github.com/buiilding/ALL_OR_NOTHING/issues)
2. **Read Guidelines**: Review [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_STANDARDS.md](CODE_STANDARDS.md)
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

New to open source? No problem! Look for issues tagged:
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
- [x] Semantic memory system with FAISS vector search
- [x] Episodic memory for user actions tracking
- [x] CUDA-accelerated embeddings for performance
- [x] Privacy controls and local data storage

#### Milestone 4: Advanced Automation
- [x] **Tool System**: 12 built-in tools with security validation and sandboxing
- [x] **Computer Control Tools**: Vision-first navigation using screenshots - OCR-enhanced UI automation and vision-language models for visual understanding
- [x] **Agent System**: Multi-step task execution with tool coordination
- [x] **Intelligent Task Execution**: Natural language task decomposition

#### Milestone 5: Performance & Polish
- [x] **CUDA Acceleration**: GPU-accelerated embeddings and OCR processing
- [x] **Automatic Screenshots**: Visual feedback for all computer interactions
- [x] **File System Integration**: Complete file operations toolkit
- [x] **Marketplace Tools**: Example tools, weather integration

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
- ✅ **Only AI inference goes to internet** - Only LLM API calls (for AI inference) are sent over the internet - user input, screenshots, and all other data stay on your machine
- ✅ **OS-Level Privacy** - Unlike cloud-based services, all your workflow, habits, and personal information remain on your device
- ✅ **Open source** - Audit the code yourself
- ✅ **Tool sandboxing** - Tools run with permission controls and resource limits
- ✅ **Basic audit logging** - Tool execution logging for monitoring
- ✅ **No cloud sync** - Memory, conversation data, and personal information are never synced to cloud services

---

## 📊 Project Stats

- **Language**: Python (backend), JavaScript/React (frontend), TypeScript (frontend)
- **License**: MIT
- **Status**: Functional AI Assistant with Active Development
- **Team**: Open source, community-driven
- **Lines of Code**: ~20,000+ lines across backend, frontend, and tools
- **Key Technologies**:
  - **AI/ML**: SentenceTransformers, FAISS, RapidOCR, InternVL, CUDA acceleration
  - **Backend**: FastAPI, WebSocket IPC, dependency injection, async architecture
  - **Frontend**: Electron, React, real-time UI updates
  - **Tools**: 12 built-in tools with permission-based security and sandboxing
- **Performance**: GPU-accelerated embeddings, OCR, and vision processing
- **Architecture**: Clean architecture with dependency injection, protocol interfaces, and tool sandboxing

---

## 🙏 Acknowledgments

Inspired by:
- The vision of ambient computing and personal AI assistants
- Amazing LLM providers (OpenAI, Anthropic, Google)
- Open source communities building the future of AI

---

## 📬 Contact & Community

- **Issues**: [GitHub Issues](https://github.com/buiilding/ALL_OR_NOTHING/issues)
- **Discussions**: [GitHub Discussions](https://github.com/buiilding/ALL_OR_NOTHING/discussions)
- **Email**: contact@yourproject.com
- **Discord**: [Join our community](#) (coming soon)

For security concerns (once code is developed), email: security@yourproject.com

---

## 📜 License

This project will be licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## ⭐ Star This Project

If this vision excites you, please star the repository! It helps others discover the project and shows your support for the team.

---

<div align="center">

**🚀 Building the future of personal computing, one commit at a time**

[Join Discussion](https://github.com/buiilding/ALL_OR_NOTHING/discussions) · [Contribute](CONTRIBUTING.md)

</div>
