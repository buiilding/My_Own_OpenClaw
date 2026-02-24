---
summary: "Desktop Assistant Documentation"
read_when:
  - When browsing the repo entrypoint.
---

# Desktop Assistant Documentation

Welcome to the comprehensive documentation for the Desktop Assistant project. This documentation covers all aspects of the system, from high-level architecture to detailed implementation guides.

## 📚 Documentation Index

### Documentation Hubs
- [**Documentation Hub**](getting-started/DOCS_HUB.md) - Domain-based navigation for architecture, backend, frontend, and operations
- [**OpenClaw Docs Structure Reference**](reference/OPENCLAW_DOCS_STRUCTURE_REFERENCE.md) - Structure benchmark and WindieOS mapping
- [**Backend Bootstrap/API/Contracts Hubs**](backend/README.md) - Subfolder-level backend navigation mirroring OpenClaw-style layered docs
- [**Frontend Main/Renderer/Contracts/Sidecar Hubs**](frontend/README.md) - Subfolder-level frontend navigation for process/runtime boundaries
- [**Backend Config/LLM/Services Hubs**](backend/README.md) - Additional backend sub-hub navigation for config policy, model stack, and runtime services

### Getting Started
- [**Product Overview**](getting-started/PRODUCT_OVERVIEW.md) - Non-technical summary of current capabilities and future direction
- [**Overview**](getting-started/OVERVIEW.md) - Project overview, vision, and key capabilities
- [**Quick Start Guide**](getting-started/QUICK_START.md) - Get up and running quickly
- [**Installation Guide**](getting-started/INSTALLATION.md) - Detailed installation instructions

### Architecture & Design
- [**Frontend Functionality Map**](frontend/README.md) - Detailed module-level renderer, electron-main, and sidecar runtime maps
- [**Backend Functionality Map**](backend/README.md) - Detailed module-level backend runtime and API maps
- [**Backend Container DI Lifecycle**](backend/bootstrap/CONTAINER_DI_AND_INIT_LIFECYCLE_REFERENCE.md) - Container composition, startup phase sequencing, lazy runtime binders, and config-update propagation
- [**Backend Config Runtime Policy**](backend/config/CONFIG_FIELDS_AND_RUNTIME_POLICY.md) - Exact config fields, runtime normalization, and frontend patch boundaries
- [**Frontend Stream State Machine**](frontend/runtime/STREAM_EVENT_STATE_MACHINE.md) - Event-to-phase transitions and per-turn stream tracking behavior
- [**Frontend Chat Stream + Tool Runtime**](frontend/renderer/CHAT_STREAM_AND_TOOL_EXECUTION_REFERENCE.md) - Provider ownership, query-send flow, backend event routing, stale-turn cancellation, and tool-result relay semantics
- [**Frontend Runtime Paths and Endpoints**](frontend/main/RUNTIME_PATHS_AND_ENDPOINTS.md) - Backend ws/http endpoint derivation, packaged Python path lookup, and frontend config persistence path
- [**Frontend Query Payload Relay**](frontend/main/QUERY_PAYLOAD_AND_RELAY_REFERENCE.md) - Main-process query enrichment pipeline, initial settings ACK gate, local-user-message synthesis, and backend relay failure semantics
- [**Frontend Config Sync Lifecycle**](frontend/runtime/CONFIG_SYNC_AND_SETTINGS_LIFECYCLE_REFERENCE.md) - AppConfig/AppStatus provider ownership, local+disk persistence layering, and main-process `update-settings` ACK gating
- [**Frontend IPC Channel Reference**](frontend/contracts/IPC_CHANNEL_AND_HANDLER_REFERENCE.md) - Exact send/invoke/on channel ownership and handler map
- [**System Architecture**](architecture/ARCHITECTURE.md) - High-level system design and components
- [**Backend Architecture**](architecture/BACKEND_ARCHITECTURE.md) - Backend system design and patterns
- [**Frontend Architecture**](architecture/FRONTEND_ARCHITECTURE.md) - Frontend system design and patterns
- [**Communication Flow**](architecture/COMMUNICATION_FLOW.md) - How frontend and backend communicate

### Core Systems
- [**Agent System**](architecture/AGENT_SYSTEM.md) - Agent orchestrator and execution flow
- [**Tool System**](architecture/TOOL_SYSTEM.md) - Tool execution architecture and development
- [**Backend Tools Docs Hub**](backend/tools/README.md) - Backend schema bridge, policy filtering, and wait/ingress runtime docs for frontend-executed tools
- [**Backend Tool Result Ingress Reference**](backend/tools/TOOL_RESULT_INGRESS_AND_STORAGE_REFERENCE.md) - End-to-end `tool-result`/`tool-bundle-result` flow across API handler, session routing, storage, and futures
- [**Backend Query Execution Pipeline**](backend/runtime/QUERY_EXECUTION_AND_STREAM_PIPELINE_REFERENCE.md) - Query handler to stream pipeline internals, completion backfill rules, and cancellation/task-tracking behavior
- [**Backend Non-Query Handler Flows**](backend/api/NON_QUERY_HANDLER_AND_CONTROL_FLOW_REFERENCE.md) - Settings/model handlers, stop-query cancellation semantics, wakeword activation responses, and transcript rehydrate normalization path
- [**Backend Provider Factory Runtime**](backend/llm/PROVIDER_FACTORY_AND_RUNTIME_SELECTION_REFERENCE.md) - Provider-factory cache keys, provider availability gates, client normalization, and model-service catalog/discovery rules
- [**Backend Artifact + Screenshot Flow**](backend/services/ARTIFACT_SCREENSHOT_AND_SYSTEM_STATE_FLOW_REFERENCE.md) - Artifact upload/load rules and screenshot/system-state propagation across query, tool-result, OCR refresh, and rehydrate flows
- [**Browser Control**](browser/BROWSER_CONTROL.md) - Browser automation architecture and tool behavior
- [**Sidecar Browser Automation Stack**](frontend/sidecar/BROWSER_AUTOMATION_STACK.md) - Renderer->main->sidecar browser runtime and CDP orchestration details
- [**Sidecar JSON-RPC Reference**](frontend/sidecar/LOCAL_BACKEND_JSONRPC_REFERENCE.md) - Main-process bridge method map and local backend JSON-RPC contract details
- [**Sidecar Process Lifecycle**](frontend/sidecar/LOCAL_BACKEND_PROCESS_LIFECYCLE_REFERENCE.md) - Python sidecar spawn env/readiness probe loop, request correlation/timeouts, and restart/failure recovery behavior
- [**Browser Control Runbook**](browser/BROWSER_CONTROL_RUN.md) - Practical setup/testing flow for browser control
- [**Memory System**](architecture/MEMORY_SYSTEM.md) - Memory management and retrieval
- [**Python Sidecar**](architecture/PYTHON_SIDECAR.md) - Local tool execution + memory service
- [**LLM Integration**](architecture/LLM_INTEGRATION.md) - LLM providers and configuration
- [**Billing & Usage (Planned)**](planning/BILLING_AND_USAGE.md) - Subscriptions, entitlements, and usage limits

### Development Guides
- [**Developer Guide**](development/DEVELOPER_GUIDE.md) - Comprehensive development guide
- Developer Guide includes local automation scripts (`node scripts/doc-lists.js`, `scripts/check`, `scripts/test`, `scripts/check-loc.py`) and frontend audit commands (`npm run lint:audit`, `npm run audit:jscpd`, `npm run audit:knip`).
- [**Dev Tool Selection**](development/DEV_TOOL_SELECTION.md) - Backend-only tool schema allow/denylist controls for development
- [**Tool Development Guide**](development/TOOL_DEVELOPMENT.md) - Creating custom tools
- [**API Reference**](reference/API_REFERENCE.md) - Complete API documentation
- [**Extension Points**](architecture/EXTENSION_POINTS.md) - How to extend the system

### Configuration & Deployment
- [**Configuration Guide**](operations/CONFIGURATION.md) - Configuration options and settings
- [**Deployment Guide**](operations/DEPLOYMENT.md) - Production deployment instructions
- [**Release Guide**](operations/release.md) - Repeatable release checklist and guardrails
- [**Future Product Plan (Draft)**](planning/FUTURE_PLAN.md) - Sequenced roadmap for packaging, hosted rollout, and major future features
- [**Environment Setup**](development/ENVIRONMENT_SETUP.md) - Development environment configuration
- [**Security & Compliance (Planned)**](planning/SECURITY_AND_COMPLIANCE.md) - Security posture and compliance roadmap
- [**Plan Matrix (Draft)**](planning/PLAN_MATRIX.md) - Subscription tiers and limits

### User Guides
- [**User Guide**](getting-started/USER_GUIDE.md) - End-user documentation
- [**Troubleshooting**](getting-started/TROUBLESHOOTING.md) - Common issues and solutions

### Additional Resources
- [**Testing Guide**](development/TESTING.md) - Testing strategies and practices
- [**Security Guide**](operations/SECURITY.md) - Security considerations and best practices
- [**Multi-User Runtime Hardening**](operations/MULTI_USER_RUNTIME_HARDENING.md) - Session identity, multi-device policy, and per-user model isolation guidance
- [**Performance Guide**](operations/PERFORMANCE.md) - Performance optimization strategies
- [**Planning Hub**](planning/README.md) - Single entrypoint for roadmap and future initiative plans
- [**Contributing Guide**](development/CONTRIBUTING.md) - How to contribute to the project

### Hosted Platform (Planned)
- [**Planning Hub**](planning/README.md) - Canonical list of hosted roadmap + initiative docs

## 🎯 Quick Navigation

### For Developers
Start with:
1. [Developer Guide](development/DEVELOPER_GUIDE.md) - Understand the codebase structure
2. [Architecture Overview](architecture/ARCHITECTURE.md) - Learn the system design
3. [Tool Development Guide](development/TOOL_DEVELOPMENT.md) - Create custom tools

### For System Administrators
Start with:
1. [Installation Guide](getting-started/INSTALLATION.md) - Set up the system
2. [Configuration Guide](operations/CONFIGURATION.md) - Configure the application
3. [Deployment Guide](operations/DEPLOYMENT.md) - Deploy to production

### For Users
Start with:
1. [User Guide](getting-started/USER_GUIDE.md) - Learn how to use the assistant
2. [Troubleshooting](getting-started/TROUBLESHOOTING.md) - Solve common issues

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

See [Contributing Guide](development/CONTRIBUTING.md) for guidelines on improving documentation.

---

**Last Updated**: February 2026  
**Version**: 1.0.0

## Recent Updates

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

### Productization Roadmap (February 2026)
- **Multi-Tenant Backend**: Auth, subscriptions, usage metering, and plan enforcement
- **Billing UX**: Plan selection, billing portal, and usage limits in the UI
- **Hosted Architecture**: API gateway, session routing, and scalable data plane
