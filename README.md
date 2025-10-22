# Desktop Assistant

> Your AI-powered personal assistant that remembers everything, controls your computer, and adapts to your workflow.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Electron](https://img.shields.io/badge/electron-latest-brightgreen.svg)](https://www.electronjs.org/)
[![Project Status](https://img.shields.io/badge/status-early%20development-orange.svg)]()

---

## 🎯 Vision

**Desktop Assistant** is an AI-powered personal assistant that fundamentally changes how people interact with their computers. Instead of needing to know commands, navigate complex UIs, or repeatedly explain context to disconnected AI services, users will have a persistent, context-aware agent that:

- **Remembers everything** you've done and are working on
- **Controls your computer** through voice or text commands
- **Executes tasks** automatically using a marketplace of tools
- **Adapts to your workflow** by learning from your patterns

Our mission: **Democratize computer power** - making advanced capabilities accessible to everyone, not just developers.

---

## 🚧 Project Status

**Current Stage**: Foundation & Architecture (Issue #1)

We're just getting started! The project structure has been established, and we're setting up the development environment. This is an excellent time to get involved as a contributor.

### ✅ Completed
- [x] Project repository structure created
- [x] Documentation framework established
- [x] Code standards defined
- [x] Development roadmap planned

### 🔨 Currently Working On
- [ ] Python backend setup with dependency management
- [ ] Electron frontend setup with React
- [ ] Linting and formatting configuration
- [ ] Git pre-commit hooks
- [ ] Development environment documentation

### 📋 Coming Next (Issues #2-4)
- Backend-frontend IPC communication
- Basic UI shell
- Configuration management system

See our [Project Roadmap](docs/ROADMAP.md) for the complete development timeline.

---

## ✨ Planned Features

### 🧠 Persistent Memory
- **Never repeat yourself** - The assistant will remember past conversations and context
- **Active monitoring** - Optionally track what you're working on in real-time
- **Smart recall** - Semantic search to find relevant information from your history
- **Privacy-first** - All memory data stays local on your machine

### 🎤 Natural Voice Interaction
- **Voice commands** - Speak naturally to your assistant
- **Wake word activation** - Hands-free operation with "Hey Assistant"
- **Push-to-talk option** - Manual control when you prefer it
- **Multi-provider STT/TTS** - Choose from Whisper, cloud APIs, or other engines

### 🛠️ Extensible Tool Marketplace
- **Built-in tools** - Terminal execution, file operations, computer control
- **Community tools** - Install tools created by other developers
- **Create your own** - Build custom tools with our simple framework
- **Verified & secure** - All marketplace tools will be reviewed and sandboxed

### 💻 Computer Control & Automation
- **Run terminal commands** - Execute PowerShell or CMD safely
- **Automate workflows** - Multi-step tasks across any application
- **File management** - Read, write, search files with natural language
- **UI automation** - Click, type, and navigate applications automatically

### 🤖 Multi-LLM Support
- **Your choice of AI** - OpenAI, Anthropic, Google, or local models
- **Easy switching** - Change providers in settings
- **Fallback support** - Automatic retry with alternative providers
- **Cost control** - Track token usage and manage API costs

---

## 🚀 Getting Started (For Developers)

### Prerequisites
- **Windows 10/11** (macOS and Linux support planned)
- **Python 3.10+**
- **Node.js 18+** and npm
- **Git**

### Setting Up Development Environment

#### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/desktop-assistant.git
cd desktop-assistant
```

#### 2. Backend Setup (Coming Soon)
```bash
cd backend
# Setup instructions will be added after Issue #1 is complete
# Will include: virtual environment creation, dependency installation, configuration
```

#### 3. Frontend Setup (Coming Soon)
```bash
cd frontend
# Setup instructions will be added after Issue #1 is complete
# Will include: npm install, environment configuration, running dev server
```

#### 4. Pre-commit Hooks (Coming Soon)
```bash
# Automatic linting and formatting setup will be documented here
```

### Running Tests
This project has two separate test suites: one for the Python backend and one for the React frontend.

#### Backend Tests (pytest)
1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Create and activate a Conda environment:
    ```bash
    conda create --name desktop-assistant-env python=3.10 -y
    conda activate desktop-assistant-env
    ```
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Run the tests:
    ```bash
    pytest
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

We're currently working on **Issue #1: Project Setup & Repository Structure**. If you want to contribute, check out:

- [Open Issues](https://github.com/yourusername/desktop-assistant/issues)
- [Milestone 1: Project Foundation](https://github.com/yourusername/desktop-assistant/milestone/1)
- Look for issues tagged with `good-first-issue`

---

## 📖 Documentation

### Project Planning
- **[Project Roadmap](docs/ROADMAP.md)** - Complete development timeline and milestones
- **[Code Standards](CODE_STANDARDS.md)** - Coding conventions and best practices
- **[Contributing Guidelines](CONTRIBUTING.md)** - How to contribute to the project
- **[Architecture Overview](docs/architecture.md)** - System design (will be created)

### Future Documentation (Coming as Features Develop)
- User Guide - How to use the assistant
- Developer Guide - Technical contributor guide
- Tool Development Guide - Creating marketplace tools
- API Reference - Technical API documentation
- FAQ - Common questions and troubleshooting

---

## 🏗️ Architecture

```
.
├── .env
├── .gitignore
├── .pre-commit-config.yaml
├── .github/
│   └── workflows/              # CI/CD workflows
├── backend/                    # Python backend
│   ├── agent/                  # Main agent logic
│   │   ├── orchestrator.py    # Core agent brain
│   │   ├── llm_client.py      # Multi-provider LLM interface
│   │   ├── decision_engine.py # Routing logic
│   │   └── safety_checker.py  # Destructive op detection
│   │
│   ├── memory/                 # Memory system
│   │   ├── interface.py        # Abstract memory interface
│   │   ├── active_monitor.py   # Screen/activity capture
│   │   ├── passive_store.py    # Conversation storage
│   │   └── retrieval.py        # Query and context retrieval
│   │
│   ├── marketplace/            # Tool marketplace
│   │   ├── registry.py         # Tool database
│   │   ├── executor.py         # Tool execution engine
│   │   ├── search.py           # Tool discovery
│   │   └── schema.py           # Tool schema definitions
│   │
│   ├── tools/                  # Built-in tools
│   │   ├── base.py             # Base tool class
│   │   ├── terminal.py         # Command execution
│   │   ├── computer_use.py     # CUA implementation
│   │   └── file_ops.py         # File operations
│   │
│   ├── voice/                  # Voice processing
│   │   ├── stt.py              # Whisper integration
│   │   ├── tts.py              # TTS implementation
│   │   └── audio_manager.py    # Audio I/O
│   │
│   ├── server.py               # IPC server (WebSocket)
│   ├── config.py               # Configuration management
│   ├── requirements.txt        # Python dependencies
│   ├── .pylintrc               # Pylint configuration
│   └── pyproject.toml          # Black and Isort configuration
│
├── frontend/                   # Electron app
│   ├── src/
│   │   ├── main/              # Main process
│   │   │   ├── index.js       # Entry point
│   │   │   └── ipc.js         # IPC with backend
│   │   │
│   │   ├── renderer/          # Renderer process
│   │   │   ├── App.jsx        # Main React component
│   │   │   ├── components/    # UI components
│   │   │   │   ├── ChatInterface.jsx
│   │   │   │   ├── VoiceControls.jsx
│   │   │   │   ├── ThinkingDisplay.jsx
│   │   │   │   ├── ConfirmationDialog.jsx
│   │   │   │   └── SettingsPanel.jsx
│   │   │   └── styles/        # CSS styles
│   │   │
│   │   └── preload.js         # Preload script
│   │
│   ├── package.json            # Node.js dependencies and scripts
│   ├── vite.config.js          # Vite configuration
│   ├── .eslintrc.cjs           # ESLint configuration
│   └── .prettierrc.cjs         # Prettier configuration
│
├── tools/                      # Marketplace tools (separate from built-in)
│   └── verified/
│       └── example_tool/
│           ├── manifest.json   # Tool metadata
│           ├── tool.py         # Tool implementation
│           └── README.md       # Tool-specific documentation
│
├── docs/                       # Documentation
│   ├── architecture.md         # High-level system design
│   ├── tool_development.md     # Guide for creating new tools
│   ├── api_reference.md        # API documentation
│   ├── CODE_STANDARDS.md       # Project coding standards
│   └── ROADMAP.md              # Project development roadmap
│
├── tests/                      # Test suite
│   ├── backend/                # Backend tests
│   └── frontend/               # Frontend tests
│
├── LICENSE                     # Project license
└── README.md                   # This file
```

---

## 🤝 Contributing

**We're in the early stages and would love your help!**

This is a great time to get involved as a founding contributor. Whether you're experienced or just learning, there's a place for you.

### How to Contribute

1. **Check Current Work**: Look at [Milestone 1 Issues](https://github.com/yourusername/desktop-assistant/milestone/1)
2. **Read Guidelines**: Review [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_STANDARDS.md](CODE_STANDARDS.md)
3. **Pick an Issue**: Comment on an issue to claim it (or create a new one)
4. **Make Your Contribution**: Fork, branch, code, test, submit PR
5. **Collaborate**: Respond to feedback and iterate

### Ways to Contribute Right Now

- 🔧 **Issue #1**: Help complete the project setup
- 📝 **Documentation**: Improve or create documentation
- 💡 **Ideas**: Share thoughts in [Discussions](https://github.com/yourusername/desktop-assistant/discussions)
- 🧪 **Research**: Help research best practices for upcoming issues
- 🎨 **Design**: Suggest UI/UX improvements
- 📣 **Spread the Word**: Star the repo, share with others

### First-Time Contributors Welcome!

New to open source? No problem! Look for issues tagged:
- `good-first-issue` - Good for newcomers
- `documentation` - Help improve docs
- `research-needed` - Research and propose solutions

---

## 🗺️ Development Roadmap

### Milestone 1: Project Foundation (Current - Weeks 1-2)
- **Issue #1**: Project setup & repository structure ⏳
- **Issue #2**: Backend-frontend IPC communication
- **Issue #3**: Basic UI shell
- **Issue #4**: Configuration system

**Goal**: Working skeleton with backend-frontend communication

### Milestone 2: Core Agent (Weeks 3-4)
- Multi-provider LLM integration
- Agent orchestrator
- Real-time thinking display

**Goal**: Agent can have intelligent conversations

### Milestone 3: Memory System (Weeks 5-6)
- Passive memory storage
- Active memory monitoring
- Privacy controls

**Goal**: Agent remembers across sessions

### Milestone 4-7: [View Full Roadmap](docs/ROADMAP.md)
- Tool Marketplace
- Built-in Tools
- Voice Interface
- Integration & Polish

**Estimated MVP Timeline**: ~14 weeks (3.5 months)

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

- **Language**: Python (backend), JavaScript/React (frontend)
- **License**: MIT (or your chosen license)
- **Status**: Early Development (Issue #1)
- **Team**: Open source, community-driven
- **Started**: [Your start date]

---

## 🙏 Acknowledgments

Inspired by:
- The vision of ambient computing and personal AI assistants
- Amazing LLM providers (OpenAI, Anthropic, Google)
- Open source communities building the future of AI

---

## 📬 Contact & Community

- **Issues**: [GitHub Issues](https://github.com/yourusername/desktop-assistant/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/desktop-assistant/discussions)
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

[View Roadmap](docs/ROADMAP.md) · [Join Discussion](https://github.com/yourusername/desktop-assistant/discussions) · [Contribute](CONTRIBUTING.md)

</div>
