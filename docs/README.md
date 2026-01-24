# Desktop Assistant Documentation

Welcome to the comprehensive documentation for the Desktop Assistant project. This documentation covers all aspects of the system, from high-level architecture to detailed implementation guides.

## 📚 Documentation Index

### Getting Started
- [**Overview**](OVERVIEW.md) - Project overview, vision, and key capabilities
- [**Quick Start Guide**](QUICK_START.md) - Get up and running quickly
- [**Installation Guide**](INSTALLATION.md) - Detailed installation instructions

### Architecture & Design
- [**System Architecture**](ARCHITECTURE.md) - High-level system design and components
- [**Backend Architecture**](BACKEND_ARCHITECTURE.md) - Backend system design and patterns
- [**Frontend Architecture**](FRONTEND_ARCHITECTURE.md) - Frontend system design and patterns
- [**Communication Flow**](COMMUNICATION_FLOW.md) - How frontend and backend communicate

### Core Systems
- [**Agent System**](AGENT_SYSTEM.md) - Agent orchestrator and execution flow
- [**Tool System**](TOOL_SYSTEM.md) - Tool execution architecture and development
- [**Memory System**](MEMORY_SYSTEM.md) - Memory management and retrieval
- [**LLM Integration**](LLM_INTEGRATION.md) - LLM providers and configuration
- [**Plugin System**](PLUGIN_SYSTEM.md) - Plugin architecture and development
- [**Services**](SERVICES.md) - Core services (Vision, TTS, Wakeword, Context Factory, Agent Factory, GPU Memory Manager)
- [**Event System**](EVENT_SYSTEM.md) - Event types, event bus, and event processing pipeline

### Development Guides
- [**Developer Guide**](DEVELOPER_GUIDE.md) - Comprehensive development guide
- [**Tool Development Guide**](TOOL_DEVELOPMENT.md) - Creating custom tools
- [**API Reference**](API_REFERENCE.md) - Complete API documentation
- [**Python Sidecar**](PYTHON_SIDECAR.md) - Python sidecar architecture and tools
- [**Extension Points**](EXTENSION_POINTS.md) - How to extend the system

### Configuration & Deployment
- [**Configuration Guide**](CONFIGURATION.md) - Configuration options and settings
- [**Deployment Guide**](DEPLOYMENT.md) - Production deployment instructions
- [**Environment Setup**](ENVIRONMENT_SETUP.md) - Development environment configuration

### User Guides
- [**User Guide**](USER_GUIDE.md) - End-user documentation
- [**Troubleshooting**](TROUBLESHOOTING.md) - Common issues and solutions

### Additional Resources
- [**Testing Guide**](TESTING.md) - Testing strategies and practices
- [**Security Guide**](SECURITY.md) - Security considerations and best practices
- [**Performance Guide**](PERFORMANCE.md) - Performance optimization strategies
- [**Contributing Guide**](CONTRIBUTING.md) - How to contribute to the project

## 🎯 Quick Navigation

### For Developers
Start with:
1. [Developer Guide](DEVELOPER_GUIDE.md) - Understand the codebase structure
2. [Architecture Overview](ARCHITECTURE.md) - Learn the system design
3. [Tool Development Guide](TOOL_DEVELOPMENT.md) - Create custom tools

### For System Administrators
Start with:
1. [Installation Guide](INSTALLATION.md) - Set up the system
2. [Configuration Guide](CONFIGURATION.md) - Configure the application
3. [Deployment Guide](DEPLOYMENT.md) - Deploy to production

### For Users
Start with:
1. [User Guide](USER_GUIDE.md) - Learn how to use the assistant
2. [Troubleshooting](TROUBLESHOOTING.md) - Solve common issues

## 📖 Documentation Structure

All documentation is organized in the `docs/` folder at the project root. Each document is self-contained but cross-references related topics.

### Document Conventions

- **Code blocks**: Include file paths and line numbers when referencing existing code
- **Diagrams**: ASCII art diagrams for architecture visualization
- **Examples**: Practical code examples for all major features
- **Warnings**: Important notes and gotchas highlighted

## 🔄 Keeping Documentation Updated

This documentation is maintained alongside the codebase. When making changes:

1. Update relevant documentation files
2. Add examples for new features
3. Update architecture diagrams if structure changes
4. Keep cross-references accurate

## 📝 Contributing to Documentation

See [Contributing Guide](CONTRIBUTING.md) for guidelines on improving documentation.

---

**Last Updated**: January 2026  
**Version**: 1.9.0

## Recent Updates

### Comprehensive Documentation Update (January 2026)
- **New Documentation Files**:
  - [Services Documentation](SERVICES.md) - Complete documentation for all core services (Vision, TTS, Wakeword, Context Factory, Agent Factory, GPU Memory Manager, Token Service)
  - [Python Sidecar Documentation](PYTHON_SIDECAR.md) - Python sidecar architecture, tool execution, and built-in tools
  - [Event System Documentation](EVENT_SYSTEM.md) - Event types, event bus, and event processing pipeline
- **Enhanced Message Handlers Documentation**:
  - Detailed documentation for QueryMessageHandler, ListModelsHandler, ToolResultHandler, WakewordHandler
  - Handler architecture, processing flows, and integration points
  - Metadata validation and security features
- **Enhanced TTS Processing Documentation**:
  - TTSManager lifecycle management and audio streaming
  - TTSProcessor code block and JSON filtering with state machine
  - Heuristic detection and content type switching
- **Enhanced Prompt System Documentation**:
  - PromptManager singleton pattern and thread-safe initialization
  - System prompt structure and placeholders
  - PromptConstructor security limits and validation
- **Enhanced Testing Infrastructure Documentation**:
  - Test structure and categories (unit, integration, pipeline)
  - Tool pipeline tests, parser tests, and system tests
- **Fixed Memory System Documentation**:
  - Corrected architecture to reflect actual implementation (backend provides embeddings API, frontend handles storage)
  - Updated components section to match actual code (SentenceTransformerProvider, LocalMemoryStore)
  - Fixed usage examples to reflect frontend/backend split
  - Updated API reference to match actual REST endpoints
- **Fixed Tool Development Guide**:
  - Updated to use actual SDK pattern (Pydantic models, Tool base class, RemoteToolBase mixin)
  - Corrected tool registration process for both backend and frontend
  - Fixed examples to match actual implementation (run() method, ToolResult format)
  - Updated schema documentation to use Pydantic instead of manual JSON Schema
- **Enhanced Event Bus Documentation**:
  - Added comprehensive EventBus documentation with priority support, filtering, and memory management
  - Documented EventHandlerWrapper with weak reference handling
  - Added usage examples and thread safety details
- **Enhanced Exception Hierarchy Documentation**:
  - Documented all exception categories (Configuration, LLM, Tool, Memory, Session, Trust Boundary)
  - Added error codes and metadata details for each exception type
- **Enhanced Validation Framework Documentation**:
  - Documented all validation functions (validate_message, validate_dict, validate_field, etc.)
  - Added security features (sanitization, length limits)
  - Added usage examples
- **Enhanced Container Documentation**:
  - Added detailed provider lists for all containers (CoreContainer, ToolContainer, MemoryContainer, ApiContainer)
  - Documented ContainerInitializer, ContainerConfigUpdater, ContainerFactories, AgentSessionFactory
  - Added dependency injection details
- **Enhanced API Core Documentation**:
  - Documented MessageHandler and MessageHandlerRegistry
  - Documented error handling utilities (send_error_response, send_success_response, sanitize_error_message)
  - Documented transport abstractions (WebSocketSender Protocol, TransportSender)
- **Enhanced Message Structures Documentation**:
  - Documented StoredMessage, MessageContent, and type definitions
  - Added details on multimodal message conversion
- **Fixed Configuration Documentation**:
  - Updated INSTALLATION.md, QUICK_START.md, and backend/README.md to reflect Python-based configuration (not YAML)
- **Enhanced SDK Documentation**:
  - Documented ToolContext structure (UserContext, SessionContext, ExecutionRuntime)
  - Documented SDK exceptions (SDKError, ToolExecutionError, ConfigurationError)
  - Added context usage examples
- **Enhanced Plugin System Documentation**:
  - Documented PluginConfigManager with configuration loading details
  - Enhanced Plugin Discovery documentation (EntryPointPluginDiscoverer, FilesystemPluginDiscoverer)
  - Enhanced Plugin Lifecycle Manager documentation
  - Added Plugin State Manager documentation
  - Added Plugin Metadata documentation (PluginConfig, PluginMetadata)
  - Documented Plugin Discovery Service
- **Enhanced Frontend Infrastructure Documentation**:
  - Documented ToolExecutionService with detailed methods and features
  - Documented MessageFormatter with formatting functions
  - Documented PlayerService with audio playback management
  - Documented IPC Bridge with channel types and security features
  - Documented frontend utilities (configFilter, configStorage)
  - Enhanced React components documentation (all feature components)
  - Enhanced custom hooks documentation (useChatStream, useChatMessageSender, useTranscription, useVoiceMode, useWakewordDetection)
  - Enhanced state management documentation (ChatStore interface, Context providers)
- **Enhanced Python Sidecar Documentation**:
  - Documented LocalBackend service with all methods and initialization
  - Documented core utilities (ipc_protocol, system_state, thread_pool, remote_embedding_client)
  - Documented platform-specific code (Windows, macOS, Linux window managers)
  - Documented ToolRegistry with registration and execution flow
  - Documented ToolResult and Tool Schemas structures
  - Documented memory_service wrapper
- **Enhanced API Reference Documentation**:
  - Added detailed constraints and features for Embeddings API
  - Added detailed constraints and features for Semantic Memory API
- **Enhanced Testing Documentation**:
  - Added comprehensive test structure with all test files
  - Added test infrastructure details (pytest, mocking strategy)
  - Added frontend testing documentation (Jest, React Testing Library)
- **Enhanced Backend Architecture Documentation**:
  - Added Simulation Backend documentation (testing mode with MockLLMClient)
  - Enhanced Transport Abstractions documentation (WebSocketSender Protocol, thread safety)
  - Enhanced Type Definitions documentation (all enums and TypedDicts)
- **Enhanced Backend Architecture**:
  - Added comprehensive documentation for all core services
  - Documented dependency injection container structure and composition
  - Documented bootstrap system and initialization phases
  - Documented plugin discovery and lifecycle management
  - Documented security system (executor, policy, trust boundary metrics)
  - Documented observability and metrics system
  - Documented coordinate resolvers (OCR, Vision)
  - Documented result transformers and bundle formatters
  - Documented prompt coordination and LLM interaction handling
  - Documented caching system and validation framework
- **Enhanced Frontend Architecture**:
  - Documented all custom hooks (useChatStream, useToolRunner, useChatMessageSender, useTranscription, useVoiceMode, useWakewordDetection)
  - Documented IPC infrastructure (channels, bridge, client)
  - Documented frontend services (ToolExecutionService, MessageFormatter, PlayerService)
  - Documented context providers (AppConfigContext, AppStatusContext, ChatProvider)
  - Documented Zustand chat store
  - Documented main process modules (ipc.cjs, wakeword_bridge.cjs, local_backend_bridge.cjs)
  - Documented Python sidecar components (JSON-RPC protocol, system state, memory store, tool registry)
- **Enhanced API Reference**:
  - Added REST API endpoints (Embeddings, Semantic Memory)
  - Documented WebSocket implementation details
- **Enhanced Tool System**:
  - Documented coordinate resolvers with implementation details
  - Documented result transformers and bundle formatters
  - Documented OcrCoordinator with proactive OCR details
- **Enhanced LLM Integration**:
  - Documented all provider implementations
  - Documented Model Service and model discovery
  - Documented Response Parser with security details
- **Enhanced Configuration**:
  - Documented Python-based configuration system
  - Documented all configuration options with defaults
  - Documented configuration subscriptions and validation

### Frontend Refactor (January 2026)
- **Feature-Based Architecture**: Reorganized into feature modules (chat, settings, voice)
- **Split Contexts**: AppConfigContext and AppStatusContext for better performance
- **Zustand Store**: Chat state managed via Zustand for efficient updates
- **Infrastructure Layer**: New service layer (ToolExecutionService, MessageFormatter, IpcBridge)
- **New Hooks**: useChatStream, useToolRunner, useChatMessageSender

### Backend Optimizations (January 2026)
- **Centralized Tool Result Storage**: ToolResultStorage class with TTL-based cleanup
- **Conversation History Optimization**: O(1) LLM format access via cached conversion
- **Shallow Copy Optimization**: PreparedToolCall uses shallow copy for better performance
