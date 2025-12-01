# Desktop Assistant

> Your AI-powered personal assistant that remembers everything, controls your computer, and adapts to your workflow.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Electron](https://img.shields.io/badge/electron-latest-brightgreen.svg)](https://www.electronjs.org/)
[![Project Status](https://img.shields.io/badge/status-advanced%20development-green.svg)]()

---

## 🎯 Vision

**Desktop Assistant** is an AI-powered personal assistant that fundamentally changes how people interact with their computers. Instead of needing to know commands, navigate complex UIs, or repeatedly explain context to disconnected AI services, users will have a persistent, context-aware agent that:

- **Remembers everything** you've done and are working on
- **Controls your computer** through voice or text commands
- **Execute commands** on the CLI using an agent loop
- **Executes tasks** automatically using a marketplace of tools (possibly MCPs)
- **Adapts to your workflow** by learning from your patterns

Our mission: **Democratize computer power** - making advanced capabilities accessible to everyone, not just developers.

---

## 🚀 Project Status

**Current Stage**: Advanced Automation & AI Integration (Milestone 4+)

We now have a **fully functional AI assistant** with advanced computer control, multi-agent automation, and intelligent task execution!

### ✅ Completed Features

#### 🧠 **Core AI Infrastructure**
- [x] Multi-provider LLM client (OpenAI, Anthropic, Google, Gemini, Ollama, OpenRouter, Mistral, LM Studio)
- [x] Advanced agent orchestrator with tool calling capabilities
- [x] Real-time thinking display and status updates
- [x] Semantic memory system with GPU-accelerated embeddings
- [x] Conversation history and context management

#### 🛠️ **Tool Marketplace System**
- [x] Complete marketplace infrastructure with security validation
- [x] Tool discovery and installation system
- [x] Verified tool registry with community tools
- [x] CoAct-1 multi-agent automation tool
- [x] Example and weather tools as marketplace demonstrations

#### 🎮 **Advanced Computer Control**
- [x] **OCR-Enhanced UI Automation**: `click_ocr_element` tool for precision clicking on detected text
- [x] **Vision-Language UI Control**: `predict_click` tool using InternVL models for intelligent element detection
- [x] **Automatic Screenshot Capture**: All computer interactions include post-execution screen states
- [x] **File System Tools**: Complete file operations (read, write, search, replace)
- [x] **Terminal Integration**: Safe command execution with process management

#### 🚀 **Performance & Intelligence**
- [x] **CUDA Acceleration**: GPU-accelerated embeddings and OCR processing
- [x] **Multi-Agent Coordination**: CoAct-1 system with Orchestrator, Programmer, and GUI Operator agents
- [x] **Natural Language Task Execution**: Complex multi-step task decomposition and execution
- [x] **Intelligent Memory**: Semantic search and episodic memory with vector similarity

#### 🎨 **User Experience**
- [x] Modern Electron UI with chat interface and settings
- [x] Real-time agent status and tool execution feedback
- [x] Screenshot integration for visual context
- [x] Responsive design with dark/light themes

See our [Project Roadmap](docs/ROADMAP.md) for the complete development timeline.

---

## ✨ Key Capabilities

### 🧠 **Intelligent Memory System**
- **Persistent Context**: Remembers conversations and context across sessions
- **Semantic Search**: Find relevant information using vector similarity
- **Episodic Memory**: Tracks user actions and agent decisions
- **Privacy-First**: All data stored locally with user control

### 🎮 **Advanced Computer Control**
- **OCR-Enhanced UI**: Click on text elements detected via optical character recognition
- **Vision-Language Models**: Use InternVL for intelligent UI element detection
- **Multi-Step Automation**: Complex workflows across applications
- **Visual Feedback**: Automatic screenshots after every computer interaction

### 🤖 **Multi-Agent Intelligence**
- **CoAct-1 System**: Three coordinated agents (Orchestrator, Programmer, GUI Operator)
- **Task Decomposition**: Break complex requests into executable steps
- **Intelligent Planning**: LLM-powered decision making for optimal execution
- **Error Recovery**: Graceful handling of failures with alternative approaches

### 🛠️ **Tool Marketplace**
- **Verified Tools**: Curated community tools with security validation
- **Easy Installation**: One-click tool discovery and installation
- **Custom Development**: Framework for building your own tools
- **Sandbox Execution**: Isolated tool execution for safety

### 🎤 **Voice Integration** (In Progress)
- **Natural Speech**: Voice commands and responses
- **Wake Word Detection**: Hands-free activation
- **Multi-Provider STT/TTS**: Choose from Whisper, cloud APIs, or local engines

### 🚀 **Performance Optimized**
- **CUDA Acceleration**: GPU-accelerated embeddings and OCR processing
- **Multi-Provider LLMs**: OpenAI, Anthropic, Google, Ollama, OpenRouter, Mistral, LM Studio
- **Intelligent Caching**: Optimized memory usage and response times
- **Scalable Architecture**: Designed for future expansion

---

## 🚀 Getting Started (For Developers)

### Prerequisites
- **Windows 10/11, macOS, or Linux**
- **Python 3.9+** (and Conda for environment management)
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

#### 4. Pre-commit Hooks
Install the Git hooks to automatically lint and format your code before you commit.
```bash
# From the project root
pre-commit install
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
This project has two separate test suites: one for the Python backend and one for the React frontend.

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

With the core AI assistant fully functional, our focus now includes:

- **Voice Integration**: Adding STT/TTS capabilities for natural interaction
- **Advanced Features**: Enhanced marketplace tools and monitoring capabilities
- **Performance Optimization**: Further improvements to CUDA acceleration and memory usage
- **User Experience**: Polish and additional features for better usability

If you want to contribute, check out:

- [Open Issues](https://github.com/buiilding/ALL_OR_NOTHING/issues)
- Look for issues tagged with `good-first-issue`, `help-wanted`, or `enhancement`

---

## 📖 Documentation

### Project Documentation
- **[Changelog](CHANGELOG.md)** - Version history and release notes
- **[Project Roadmap](docs/ROADMAP.md)** - Complete development timeline and milestones
- **[Backend Documentation](backend/docs/)** - Comprehensive backend documentation
- **[User Guide](backend/docs/user_guide.md)** - Complete guide for end users
- **[Developer Guide](backend/docs/DEVELOPER_GUIDE.md)** - Technical contributor guide
- **[Architecture Overview](backend/docs/architecture.md)** - System design and patterns
- **[API Reference](backend/docs/api_reference.md)** - Technical API documentation
- **[Tool Development Guide](backend/docs/tool_development.md)** - Creating marketplace tools
- **[Testing Guide](backend/docs/testing_guide.md)** - Testing patterns and best practices

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
│  │   - CoAct-1 Multi-Agent System           │  │
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
- **Agent Orchestrator**: Core intelligence with tool calling and multi-agent coordination
- **Memory System**: FAISS vector search + semantic/episodic memory with CUDA acceleration
- **Computer Control**: OCR + vision models for UI automation and file operations
- **Tool Marketplace**: Verified community tools with security validation
- **AI Models**: CUDA-accelerated embeddings, OCR, and vision-language processing

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

- 🔧 **Issue #10**: Help implement voice integration (STT/TTS)
- 📝 **Documentation**: Improve or create documentation
- 💡 **Ideas**: Share thoughts in [Discussions](https://github.com/buiilding/ALL_OR_NOTHING/discussions)
- 🧪 **Research**: Help research advanced AI capabilities
- 🎨 **Design**: Suggest UI/UX improvements for advanced features
- 📣 **Spread the Word**: Star the repo, share with others
- 🛠️ **Tool Development**: Create new marketplace tools

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
- [x] **Tool Marketplace System**: Complete infrastructure with security validation
- [x] **Computer Control Tools**: OCR-enhanced UI automation, vision-language models
- [x] **CoAct-1 Multi-Agent System**: Orchestrator, Programmer, GUI Operator agents
- [x] **Intelligent Task Execution**: Natural language task decomposition

#### Milestone 5: Performance & Polish
- [x] **CUDA Acceleration**: GPU-accelerated embeddings and OCR processing
- [x] **Automatic Screenshots**: Visual feedback for all computer interactions
- [x] **File System Integration**: Complete file operations toolkit
- [x] **Marketplace Tools**: CoAct-1 automation, example tools, weather integration

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

### 📈 **Project Evolution**
- **Started**: Basic IPC communication skeleton
- **Now**: Full-featured AI assistant with advanced automation
- **Next**: Voice integration and advanced monitoring features

[View Full Roadmap](docs/ROADMAP.md) for detailed implementation plans.

---

## 🛡️ Privacy & Security

**Your data will stay on your machine.** We're building with privacy as a core principle:

- ✅ **Local storage only** - No cloud sync by default
- ✅ **Open source** - Audit the code yourself
- ✅ **Transparent memory** - See exactly what's stored
- ✅ **User control** - Delete any data at any time
- ✅ **Sandboxed tools** - Community tools will run in isolation
- ✅ **Encrypted credentials** - API keys will be encrypted at rest

---

## 📊 Project Stats

- **Language**: Python (backend), JavaScript/React (frontend), TypeScript (frontend)
- **License**: MIT
- **Status**: Advanced Development - Full AI Assistant Implementation
- **Team**: Open source, community-driven
- **Lines of Code**: ~20,000+ lines across backend, frontend, and tools
- **Key Technologies**:
  - **AI/ML**: SentenceTransformers, FAISS, RapidOCR, InternVL, CUDA acceleration
  - **Backend**: FastAPI, WebSocket IPC, dependency injection, async architecture
  - **Frontend**: Electron, React, real-time UI updates
  - **Tools**: 60+ built-in tools, verified marketplace system with security validation
- **Performance**: GPU-accelerated embeddings, OCR, and vision processing
- **Architecture**: Clean architecture with protocol interfaces, plugin system, and sandboxing

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

[View Roadmap](docs/ROADMAP.md) · [Join Discussion](https://github.com/buiilding/ALL_OR_NOTHING/discussions) · [Contribute](CONTRIBUTING.md)

</div>
