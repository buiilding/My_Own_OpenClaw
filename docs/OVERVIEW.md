---
summary: "Desktop Assistant - Project Overview"
read_when:
  - When you need a high-level product overview.
---

# Desktop Assistant - Project Overview

## 🎯 Vision

**Desktop Assistant** is an AI-powered personal assistant that provides intelligent computer control and automation at the **OS-level** - unlike IDE-based tools like Claude Code or Cursor, it operates across your entire operating system. **The system uses primarily vision (screenshots) to navigate through your computer** - capturing screenshots, analyzing them with vision models and OCR, and using visual understanding to interact with UI elements.

**Key Differentiators:**
- **Code Editing & Command Execution**: Edit code files, execute shell commands, and automate tasks just like Claude Code or Cursor, but at the OS-level across any application
- **OS-Level Operation**: Works across your entire operating system, not confined to a single IDE or application
- **Persistent Memory**: Local episodic + semantic memory with summarization; habit learning is on the roadmap
- **Privacy-First**: Only data required for LLM inference (prompt + screenshots) is sent to providers; memory and files stay local

Users can interact with their computer through natural language commands, with the assistant handling complex tasks using a system of specialized tools.

Our mission: **Democratize computer power** - making advanced capabilities accessible to everyone, not just developers.

**Long-term Vision**: Scale from a single assistant to teams of virtual employees - spawn multiple OS instances with parallel agents working together to handle complex, distributed tasks simultaneously.

## 🚀 Future Vision & Strategic Roadmap

> **Note**: The capabilities described below are **planned features** that have not yet been implemented. They represent our strategic vision and roadmap for future development.
>
> For sequencing and implementation tracks, see `FUTURE_PLAN.md` and `DEPLOYMENT.md`.

### 🚢 Bringing This to Users (Planned)
To move from a developer-focused build to a product for end users, we will add a hosted, multi-tenant backend with subscriptions and usage limits while preserving a local-only mode for privacy-first users.

**Productization roadmap:**
- **Multi-tenant backend**: Single service handling many users with per-tenant isolation.
- **Authentication**: OAuth + email signup, device/session management.
- **Subscriptions**: Stripe-based plans with entitlements and billing portal.
- **Usage limits**: Token/tool quotas, rate limits, usage meter, and hard/soft limit UX.
- **Onboarding**: Guided setup, model selection, and permission flows.
- **Distribution**: Signed installers, auto-updates, crash/telemetry opt-in.

### 📌 Focused Initiative Set (Current Planning)
The following initiative set is being tracked in `FUTURE_PLAN.md` and `DEPLOYMENT.md`:
- Scale OCR and vision grounding instances dynamically for concurrent multi-user workloads.
- Split system prompt policy between computer-use models and non-computer-use models.
- Add controlled self-evolution workflow so Windie can propose frontend implementation changes safely.
- Let the agent interact with its own UI for bounded maintenance flows (including skills authoring UX).
- Add automatic remote tool schema update/synchronization in backend with version + compatibility checks.
- Ship login/signup, landing page, and account onboarding flows.
- Ship student-first chat mode: screenshot capture + immediate dashboard context.
- Evaluate dedicated agent execution environment: local VM vs hosted remote workspace.
- Run long-term “Agent OS” research track for reproducible, policy-enforced agent runtime.

### 🔄 Multi-Agent Orchestration Across Machines (Planned)
**Future Architectural Moat**: Our roadmap includes designing the architecture to support multiple assistants working in parallel across different machines. This distributed multi-agent orchestration capability would be **extremely difficult to replicate** - it requires deep architectural planning, coordination protocols, and resource management that cannot be retrofitted into single-agent systems. When implemented, this would position Desktop Assistant as the foundation for enterprise-scale automation where teams of virtual employees can collaborate across environments, handle distributed workflows, and coordinate complex multi-machine tasks simultaneously.

### 🧠 Adaptive AI Workflows with Real-Time Learning (Planned)
**Future Product Stickiness**: Our vision includes AI workflows that learn and adapt from user behavior in real time, going beyond basic "click-and-run" automation tools. The planned system would remember your habits, workflow patterns, and preferences, automatically optimizing its behavior to match how you work. This would create a **sticky, personalized experience** that becomes more valuable over time - the more you use it, the better it understands you. This adaptive intelligence would transform the assistant from a tool into a true digital colleague that evolves with your needs.

### 👥 Customizable Enterprise Agents (Planned)
**Future Enterprise Scalability**: Our roadmap includes enabling each employee to have a tailored assistant that interacts with tools differently based on their role, preferences, and workflow. Enterprise teams would be able to deploy customized agent configurations - a developer's assistant might prioritize code editing and terminal operations, while a designer's assistant focuses on UI automation and asset management. This **role-based customization** would enable organizations to scale AI assistance across entire teams while maintaining individual productivity optimization.

## ✨ Key Capabilities

### 🧠 Intelligent Memory System
- **Persistent Context**: Remembers conversations and context across sessions
- **Semantic Search**: Find relevant information using vector similarity
- **Episodic Memory**: Tracks user actions and agent decisions
- **Summarization**: Periodic rollups into semantic memory (via backend semantic API)
- **Privacy-First**: Memory and conversation history stored locally; only data required for LLM inference is sent to providers

### 🎮 Advanced Computer Control
- **Vision-First Navigation**: The system primarily uses screenshots to navigate your computer - capturing screen states, analyzing visual elements, and using vision models to understand and interact with your interface
- **OCR-Enhanced UI**: `mouse_control` tool with `find_coordinates_by="ocr"` for clicking on text elements detected via optical character recognition from screenshots
- **Vision-Language Models**: `mouse_control` tool with `find_coordinates_by="prediction"` using InternVL to analyze screenshots and intelligently detect UI elements
- **Multi-Step Automation**: Complex workflows across applications, all driven by visual understanding of screen states
- **Visual Feedback**: Screenshots captured for every user message and after computer-use tool execution to maintain visual context

### 🛠️ Tool System
- **Registered Tools**: Tool registry + schema-driven execution
- **Schema Validation**: Trust-boundary checks on tool calls and parameters
- **Custom Development**: SDK for building your own tools
- **Sandbox Hooks**: Executor abstraction enables sandboxing (not enabled by default)
- **Code Editing**: Edit code files across any editor or application (like Claude Code/Cursor, but OS-level)
- **Command Execution**: Execute shell commands and automate development workflows

### 🎤 Voice Integration
- **Natural Speech**: Voice commands and responses
- **Wake Word Detection**: Hands-free activation
- **Multi-Provider STT/TTS**: Choose from Whisper, cloud APIs, or local engines

### 🚀 Performance Optimized
- **Optional GPU Acceleration**: Embeddings, OCR, and vision can use GPU when configured
- **Multi-Provider LLMs**: OpenAI, Anthropic, Gemini, Ollama, OpenRouter, Mistral, LM Studio
- **Caching**: Provider and embedding caches for performance
- **Scalable Architecture**: Designed for future expansion

### 🔮 Future Capabilities (Planned)

#### Multi-Agent Orchestration (Planned - Strategic Priority)
- **Distributed Agent Coordination**: Multiple assistants working in parallel across different machines with intelligent task distribution and resource management (not yet implemented)
- **Cross-Machine Workflows**: Agents on different machines coordinate to handle complex, distributed tasks that span multiple environments (planned)
- **Orchestration Layer**: Central coordination system managing agent teams, workload balancing, and inter-agent communication (future development)
- **Future Architectural Advantage**: When implemented, this multi-agent capability would be built into the core architecture, making it extremely difficult for competitors to replicate

#### Adaptive Learning & Workflows (Planned)
- **Real-Time Behavior Adaptation**: AI workflows that learn and adapt from user behavior patterns in real time, not just static automation scripts (planned feature)
- **Habit Recognition**: System automatically recognizes and learns from user habits, workflow patterns, and preferences (future capability)
- **Intelligent Automation**: Workflows that evolve and optimize themselves based on what works best for each individual user (roadmap item)
- **Future Product Stickiness**: Would create a personalized experience that becomes more valuable over time, differentiating from basic automation tools

#### Enterprise Customization (Planned)
- **Role-Based Agent Configurations**: Each employee would have a tailored assistant optimized for their specific role and workflow (planned feature)
- **Customizable Tool Interactions**: Agents would interact with tools differently based on user role, preferences, and organizational needs (future capability)
- **Team-Wide Deployment**: Organizations would be able to deploy customized agent configurations across entire teams while maintaining individual optimization (roadmap item)
- **Future Enterprise Scalability**: Would enable scaling AI assistance from individual users to entire organizations with role-specific customization

#### Core Feature Enhancements
- **Agent Skills**: Rigorous procedures for specific tasks to address inconsistent agent behavior - providing reliable, repeatable workflows for common to medium-complexity tasks
- **Subagents**: Specialized agent instances for domain-specific tasks and workflows
- **User Rules**: Customizable rules and preferences that guide agent behavior and decision-making
- **External MCPs**: Integration with Model Context Protocol (MCP) servers for extended capabilities and external tool integration
- **Virtual Employees**: Spawn multiple operating system instances with multiple agents working in parallel, creating a team of virtual employees that can handle complex, distributed tasks simultaneously

## 🏗️ System Architecture

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
│ ┌──────────┐  ┌────────┐  ┌──────────┐  ┌──────────┐ │
│ │Embeddings│  │Computer│  │OCR/Vision│  │   AI     │ │
│ │API       │  │Control │  │Services  │  │  Models  │ │
│ │• ST      │  │Tools   │  │• OCR     │  │• OpenAI  │ │
│ │• Cache   │  │• Mouse │  │• UI      │  │• Anthro- │ │
│ │• HTTP    │  │• Scroll│  │  Ground  │  │pic/Gemini│ │
│ └──────────┘  └────────┘  └──────────┘  └──────────┘ │
└─────────────────────────────────────────────────┘
```

## 🔑 Key Components

### Agent Orchestrator
Core intelligence with tool calling and conversation management. Coordinates between LLM, tools, and memory systems.

### Memory System
Local episodic + semantic memory stored via the Python sidecar (SQLite + FAISS) with periodic summarization. Embeddings are provided by the backend `/api/embeddings` service. Habit learning is planned.

### Computer Control
Vision-first navigation using screenshots - OCR and vision models analyze screen states to automate UI interactions and file operations. The system primarily relies on visual understanding (screenshots) to navigate and control your computer. Works at the OS-level across any application, not confined to a single IDE.

### Tool System
Multiple built-in tools with schema validation and an extensible SDK. Includes code editing and command execution capabilities (like Claude Code/Cursor, but OS-level).

### AI Models
Multi-provider LLM support with optional GPU acceleration for embeddings and vision. Supports multiple LLM providers.

## 📊 Project Status

**Current Stage**: Functional AI Assistant with Advanced Features

### ✅ Completed Features

#### Core AI Infrastructure
- [x] Multi-provider LLM client (OpenAI, Anthropic, Gemini, Ollama, OpenRouter, Mistral, LM Studio)
- [x] Advanced agent orchestrator with tool calling capabilities
- [x] Real-time thinking display and status updates
- [x] Local episodic/semantic memory with FAISS + backend embedding API
- [x] Conversation history and context management
- [x] **Persistent Memory**: Local storage of episodic + semantic memory (adaptive learning planned)

#### Tool System
- [x] Tool registry with schema-based execution
- [x] Trust-boundary validation for tool calls
- [x] Sandbox hooks available (not enabled by default)
- [x] Multiple built-in tools for computer control, filesystem, and system operations
- [x] **Code Editing**: Edit code files across any editor or application (like Claude Code/Cursor, but OS-level)
- [x] **Command Execution**: Execute shell commands and automate development workflows

#### Advanced Computer Control
- [x] Vision-First Navigation: Primarily uses screenshots to navigate and understand the computer interface
- [x] OCR-Enhanced UI Automation: Text detection from screenshots for precise UI interaction
- [x] Vision-Language UI Control: AI-powered visual understanding of screen elements from screenshots
- [x] Strategic Screenshot Capture: Visual context provided through user message screenshots and post-tool execution captures
- [x] File System Tools
- [x] Terminal Integration

#### Performance & Intelligence
- [x] Optional GPU acceleration (when configured)
- [x] Natural Language Task Execution
- [x] Local memory + summarization

#### User Experience
- [x] Modern Electron UI with chat interface and settings
- [x] Real-time agent status and tool execution feedback
- [x] Screenshot integration for visual context
- [x] Responsive design (single theme in current UI)

### 🔄 In Progress

- Voice Integration: TTS implementation (STT planned for future)
- Enhanced Monitoring: Basic audit logging and tool execution tracking
- Performance Optimization: GPU configuration and profiling

### 🔮 Planned Features

#### Agent Skills
Addressing inconsistent agent behavior by providing rigorous procedures for specific tasks. Skills work well for common, easy-to-medium complexity tasks, providing reliable and repeatable workflows. While some complex tasks cannot be fully grounded due to their variability, skills significantly improve consistency for well-defined operations.

#### Subagents
Specialized agent instances designed for domain-specific tasks and workflows, allowing for more focused and efficient task execution.

#### User Rules
Customizable rules and preferences that guide agent behavior and decision-making, enabling users to tailor the assistant to their specific needs and workflows.

#### External MCPs (Model Context Protocol)
Integration with external MCP servers to extend capabilities and enable integration with external tools and services, expanding the assistant's functionality beyond built-in tools.

#### Virtual Employees & Multi-Agent Orchestration (Planned)
The planned ability to spawn multiple operating system instances (virtual machines or containers) with multiple agents working in parallel, creating teams of virtual employees. These distributed agent teams would handle complex, multi-faceted tasks simultaneously, with coordination and resource management across instances. This would enable scaling from a single assistant to a full team of virtual workers operating across different environments.

**Future Strategic Advantage**: When implemented, multi-agent orchestration across machines would be an architectural capability that is extremely difficult to replicate. The system would be designed from the ground up to support distributed agent coordination, making this a core competitive differentiator for enterprise-scale automation.

#### Adaptive AI Workflows (Planned)
Planned AI workflows that learn and adapt from user behavior in real time, creating a sticky product experience. The system would remember habits, workflow patterns, and preferences, automatically optimizing behavior to match individual work styles. This adaptive intelligence would transform the assistant from a basic automation tool into a true digital colleague that evolves with user needs.

**Future Product Stickiness**: Unlike static "click-and-run" automation, the planned adaptive learning would create increasing value over time, making the product more valuable the longer it's used.

#### Customizable Enterprise Agents (Planned)
The planned capability for each employee to have a tailored assistant that interacts with tools differently based on their role, preferences, and workflow. Enterprise teams would be able to deploy customized agent configurations - developers would get code-focused assistants, designers would get UI-focused assistants, etc. This role-based customization would enable organizations to scale AI assistance across entire teams while maintaining individual productivity optimization.

## 🛡️ Privacy & Security

**Privacy and Security.** We prioritize privacy and security:

- ✅ **Local memory storage** - Conversation history, memory, files, and all data are stored and searched locally on your machine
- ✅ **LLM inference data only** - Only data required for LLM inference (prompt + screenshots) is sent to providers; other data stays local
- ✅ **OS-Level Privacy** - Unlike cloud-based services, all your workflow, habits, and personal information remain on your device
- ✅ **Closed source** - Access is restricted to authorized collaborators
- ✅ **Sandbox hooks** - Executor abstraction for sandboxing (not enabled by default)
- ✅ **Basic audit logging** - Tool execution logging for monitoring
- ✅ **No cloud sync** - Memory, conversation data, and personal information are never synced to cloud services

## 📈 Technology Stack

### Backend
- **Language**: Python 3.9+
- **Framework**: FastAPI
- **AI/ML**: SentenceTransformers, FAISS, RapidOCR, InternVL
- **Database**: SQLite (with aiosqlite)
- **Architecture**: Clean architecture with dependency injection

### Frontend
- **Framework**: Electron + React
- **Build Tool**: Vite
- **State Management**: React Context API
- **Communication**: WebSocket IPC

### Tools & Libraries
- **LLM**: LiteLLM (multi-provider support)
- **Embeddings**: SentenceTransformers
- **OCR**: RapidOCR
- **Vision**: InternVL models
- **Vector Search**: FAISS

## 🚀 Getting Started

See [Quick Start Guide](QUICK_START.md) for immediate setup instructions, or [Installation Guide](INSTALLATION.md) for detailed installation steps.

## 📖 Documentation

- [Architecture Overview](ARCHITECTURE.md) - System design details
- [Developer Guide](DEVELOPER_GUIDE.md) - Development instructions
- [Tool Development Guide](TOOL_DEVELOPMENT.md) - Creating custom tools
- [API Reference](API_REFERENCE.md) - Complete API documentation

## 🤝 Contributing

Internal contributions are welcome. See [Contributing Guide](CONTRIBUTING.md) for team guidelines.

## 📜 License

This project is proprietary and closed-source. All rights reserved.

---

**Desktop Assistant** - Building the future of personal computing, one commit at a time.
