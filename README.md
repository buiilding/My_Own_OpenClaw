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

**Current Stage**: Core Agent Logic (Milestone 2)

The foundational infrastructure is complete! We have a working application with a UI, a backend server, a robust IPC communication layer, and a complete multi-provider configuration system.

### ✅ Completed (Milestone 1 & 2)
- [x] Project repository structure and standards
- [x] Backend-frontend IPC (WebSocket)
- [x] Basic UI shell with chat and settings panels
- [x] Configuration management system (`config.yaml`)
- [x] Multi-provider LLM client (OpenAI, Anthropic, Google, etc.)
- [x] **Issue #6: Agent Orchestrator**: Implementing the "brain" of the assistant.
- [x] **Issue #7: Thinking Display**: Showing the agent's status in the UI.

### 🔨 Currently Working On
- [ ] Integration and refinement of the core agent.

### 📋 Coming Next (Milestone 3)
- **Issue #8: Passive Memory Storage**: Storing conversation history.

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
- **Windows 10/11, macOS, or Linux**
- **Python 3.10+** (and Conda for environment management)
- **Node.js 18+** and npm
- **Git**

### Setting Up Development Environment

#### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/desktop-assistant.git
cd desktop-assistant
```

#### 2. Backend Setup
```bash
# Create and activate a Conda environment
conda create --name desktop-assistant-env python=3.10 -y
conda activate desktop-assistant-env

# Install Python dependencies
pip install -r backend/requirements.txt
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
python -m backend.server
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

With Milestone 2 complete, our focus now shifts to **Milestone 3: Memory System**. If you want to contribute, check out:

- [Open Issues](https://github.com/yourusername/desktop-assistant/issues)
- [Milestone 3: Memory System](https://github.com/yourusername/desktop-assistant/milestone/3)
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
┌─────────────────────────────────────────────────┐
│           Electron Frontend (UI)                │
│  ┌──────────────────────────────────────────┐  │
│  │  React Components                        │  │
│  │  - ChatInterface                         │  │
│  │  - SettingsPanel                         │  │
│  │  - ...                                   │  │
│  └──────────────────────────────────────────┘  │
│                    ↕ IPC (WebSocket)            │
└─────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────┐
│         Python Backend (Core Logic)             │
│  ┌──────────────────────────────────────────┐  │
│  │   Agent Orchestrator                     │  │
│  │   - LLM Client (Multi-provider)          │  │
│  │   - ...                                  │  │
│  └──────────────────────────────────────────┘  │
│             ↕              ↕           ↕         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────┐ │
│  │   Memory    │  │ Tool         │  │ Voice  │ │
│  │   System    │  │ Marketplace  │  │ Engine │ │
│  └─────────────┘  └──────────────┘  └────────┘ │
└─────────────────────────────────────────────────┘
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

### Milestone 1: Project Foundation (Completed - Weeks 1-2)
- **Issue #1**: Project setup & repository structure ✅
- **Issue #2**: Backend-frontend IPC communication ✅
- **Issue #3**: Basic UI shell ✅
- **Issue #4**: Configuration system ✅

**Goal**: Working skeleton with backend-frontend communication

### Milestone 2: Core Agent (Current - Weeks 3-4)
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
