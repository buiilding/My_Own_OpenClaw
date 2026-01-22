# Desktop Assistant - Project Overview

## 🎯 Vision

**Desktop Assistant** is an AI-powered personal assistant that provides intelligent computer control and automation at the **OS-level** - unlike IDE-based tools like Claude Code or Cursor, it operates across your entire operating system. **The system uses primarily vision (screenshots) to navigate through your computer** - capturing screenshots, analyzing them with vision models and OCR, and using visual understanding to interact with UI elements.

**Key Differentiators:**
- **Code Editing & Command Execution**: Edit code files, execute shell commands, and automate tasks just like Claude Code or Cursor, but at the OS-level across any application
- **OS-Level Operation**: Works across your entire operating system, not confined to a single IDE or application
- **Persistent Memory**: Maintains persistent memory that learns your unique workflow, habits, and personal information to adapt to how you work
- **Privacy-First**: Only AI inference (LLM API calls) goes to the internet - all memory, files, and data stay on your machine

Users can interact with their computer through natural language commands, with the assistant handling complex tasks using a system of specialized tools.

Our mission: **Democratize computer power** - making advanced capabilities accessible to everyone, not just developers.

**Long-term Vision**: Scale from a single assistant to teams of virtual employees - spawn multiple OS instances with parallel agents working together to handle complex, distributed tasks simultaneously.

## ✨ Key Capabilities

### 🧠 Intelligent Memory System
- **Persistent Context**: Remembers conversations and context across sessions
- **Learns Your Workflow**: Adapts to your unique workflow, habits, and personal information over time
- **Semantic Search**: Find relevant information using vector similarity
- **Episodic Memory**: Tracks user actions and agent decisions to build understanding of your preferences
- **Privacy-First**: Memory and conversation history stored locally; only AI inference (LLM API calls) goes to the internet - nothing else

### 🎮 Advanced Computer Control
- **Vision-First Navigation**: The system primarily uses screenshots to navigate your computer - capturing screen states, analyzing visual elements, and using vision models to understand and interact with your interface
- **OCR-Enhanced UI**: `mouse_control` tool with `find_coordinates_by="ocr"` for clicking on text elements detected via optical character recognition from screenshots
- **Vision-Language Models**: `mouse_control` tool with `find_coordinates_by="prediction"` using InternVL to analyze screenshots and intelligently detect UI elements
- **Multi-Step Automation**: Complex workflows across applications, all driven by visual understanding of screen states
- **Visual Feedback**: Automatic screenshots captured before and after every computer interaction for continuous visual context

### 🛠️ Tool System
- **Verified Tools**: Tools loaded from secure verified directory
- **Security Validation**: Permission-based tool execution
- **Custom Development**: SDK for building your own tools
- **Sandbox Execution**: Isolated tool execution with resource limits
- **Code Editing**: Edit code files across any editor or application (like Claude Code/Cursor, but OS-level)
- **Command Execution**: Execute shell commands and automate development workflows

### 🎤 Voice Integration
- **Natural Speech**: Voice commands and responses
- **Wake Word Detection**: Hands-free activation
- **Multi-Provider STT/TTS**: Choose from Whisper, cloud APIs, or local engines

### 🚀 Performance Optimized
- **CUDA Acceleration**: GPU-accelerated embeddings and OCR processing
- **Multi-Provider LLMs**: OpenAI, Anthropic, Google, Ollama, OpenRouter, Mistral, LM Studio
- **Intelligent Caching**: Optimized memory usage and response times
- **Scalable Architecture**: Designed for future expansion

### 🔮 Future Capabilities (Planned)
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

## 🔑 Key Components

### Agent Orchestrator
Core intelligence with tool calling and conversation management. Coordinates between LLM, tools, and memory systems.

### Memory System
FAISS vector search + semantic/episodic memory with CUDA acceleration. Provides persistent context across sessions and learns your unique workflow, habits, and personal information over time.

### Computer Control
Vision-first navigation using screenshots - OCR and vision models analyze screen states to automate UI interactions and file operations. The system primarily relies on visual understanding (screenshots) to navigate and control your computer. Works at the OS-level across any application, not confined to a single IDE.

### Tool System
12 built-in tools with permission-based security. Extensible SDK for custom tool development. Includes code editing and command execution capabilities (like Claude Code/Cursor, but OS-level).

### AI Models
Multi-provider LLM support with CUDA acceleration for embeddings and vision. Supports 8+ LLM providers.

## 📊 Project Status

**Current Stage**: Functional AI Assistant with Advanced Features

### ✅ Completed Features

#### Core AI Infrastructure
- [x] Multi-provider LLM client (OpenAI, Anthropic, Google, Gemini, Ollama, OpenRouter, Mistral, LM Studio)
- [x] Advanced agent orchestrator with tool calling capabilities
- [x] Real-time thinking display and status updates
- [x] Semantic memory system with GPU-accelerated embeddings
- [x] Conversation history and context management
- [x] **Persistent Memory**: Learns user workflow, habits, and personal information over time

#### Tool System
- [x] Tool discovery system for loading verified tools
- [x] Security validation for tool execution
- [x] Tool execution sandboxing with permission controls
- [x] 12 built-in tools for computer control, filesystem, and system operations
- [x] **Code Editing**: Edit code files across any editor or application (like Claude Code/Cursor, but OS-level)
- [x] **Command Execution**: Execute shell commands and automate development workflows

#### Advanced Computer Control
- [x] Vision-First Navigation: Primarily uses screenshots to navigate and understand the computer interface
- [x] OCR-Enhanced UI Automation: Text detection from screenshots for precise UI interaction
- [x] Vision-Language UI Control: AI-powered visual understanding of screen elements from screenshots
- [x] Automatic Screenshot Capture: Continuous visual context through screenshots before and after interactions
- [x] File System Tools
- [x] Terminal Integration

#### Performance & Intelligence
- [x] CUDA Acceleration
- [x] Natural Language Task Execution
- [x] Intelligent Memory

#### User Experience
- [x] Modern Electron UI with chat interface and settings
- [x] Real-time agent status and tool execution feedback
- [x] Screenshot integration for visual context
- [x] Responsive design with dark/light themes

### 🔄 In Progress

- Voice Integration: TTS implementation (STT planned for future)
- Enhanced Monitoring: Basic audit logging and tool execution tracking
- Performance Optimization: CUDA acceleration for embeddings and vision processing

### 🔮 Planned Features

#### Agent Skills
Addressing inconsistent agent behavior by providing rigorous procedures for specific tasks. Skills work well for common, easy-to-medium complexity tasks, providing reliable and repeatable workflows. While some complex tasks cannot be fully grounded due to their variability, skills significantly improve consistency for well-defined operations.

#### Subagents
Specialized agent instances designed for domain-specific tasks and workflows, allowing for more focused and efficient task execution.

#### User Rules
Customizable rules and preferences that guide agent behavior and decision-making, enabling users to tailor the assistant to their specific needs and workflows.

#### External MCPs (Model Context Protocol)
Integration with external MCP servers to extend capabilities and enable integration with external tools and services, expanding the assistant's functionality beyond built-in tools.

#### Virtual Employees
The ability to spawn multiple operating system instances (virtual machines or containers) with multiple agents working in parallel, creating teams of virtual employees. These distributed agent teams can handle complex, multi-faceted tasks simultaneously, with coordination and resource management across instances. This enables scaling from a single assistant to a full team of virtual workers operating across different environments.

## 🛡️ Privacy & Security

**Privacy and Security.** We prioritize privacy and security:

- ✅ **Local memory storage** - Conversation history, memory, files, and all data are stored and searched locally on your machine
- ✅ **Only AI inference goes to internet** - Only LLM API calls (for AI inference) are sent over the internet - user input, screenshots, and all other data stay on your machine
- ✅ **OS-Level Privacy** - Unlike cloud-based services, all your workflow, habits, and personal information remain on your device
- ✅ **Open source** - Audit the code yourself
- ✅ **Tool sandboxing** - Tools run with permission controls and resource limits
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

We welcome contributions! See [Contributing Guide](CONTRIBUTING.md) for guidelines.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

---

**Desktop Assistant** - Building the future of personal computing, one commit at a time.
