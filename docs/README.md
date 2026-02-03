---
summary: "Desktop Assistant Documentation"
read_when:
  - When browsing the repo entrypoint.
---

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
- [**Python Sidecar**](PYTHON_SIDECAR.md) - Local tool execution + memory service
- [**LLM Integration**](LLM_INTEGRATION.md) - LLM providers and configuration
- [**Plugin System**](PLUGIN_SYSTEM.md) - Plugin architecture and development
- [**Billing & Usage (Planned)**](BILLING_AND_USAGE.md) - Subscriptions, entitlements, and usage limits

### Development Guides
- [**Developer Guide**](DEVELOPER_GUIDE.md) - Comprehensive development guide
- [**Tool Development Guide**](TOOL_DEVELOPMENT.md) - Creating custom tools
- [**API Reference**](API_REFERENCE.md) - Complete API documentation
- [**Extension Points**](EXTENSION_POINTS.md) - How to extend the system

### Configuration & Deployment
- [**Configuration Guide**](CONFIGURATION.md) - Configuration options and settings
- [**Deployment Guide**](DEPLOYMENT.md) - Production deployment instructions
- [**Environment Setup**](ENVIRONMENT_SETUP.md) - Development environment configuration
- [**Security & Compliance (Planned)**](SECURITY_AND_COMPLIANCE.md) - Security posture and compliance roadmap
- [**Plan Matrix (Draft)**](PLAN_MATRIX.md) - Subscription tiers and limits

### User Guides
- [**User Guide**](USER_GUIDE.md) - End-user documentation
- [**Troubleshooting**](TROUBLESHOOTING.md) - Common issues and solutions

### Additional Resources
- [**Testing Guide**](TESTING.md) - Testing strategies and practices
- [**Security Guide**](SECURITY.md) - Security considerations and best practices
- [**Performance Guide**](PERFORMANCE.md) - Performance optimization strategies
- [**Contributing Guide**](CONTRIBUTING.md) - How to contribute to the project

### Hosted Platform (Planned)
- [**Billing & Usage (Planned)**](BILLING_AND_USAGE.md) - Subscriptions, entitlements, and usage limits
- [**Security & Compliance (Planned)**](SECURITY_AND_COMPLIANCE.md) - Security posture and compliance roadmap
- [**Plan Matrix (Draft)**](PLAN_MATRIX.md) - Subscription tiers and limits
- [**Database Schema (Planned)**](DATABASE_SCHEMA.md) - Multi-tenant DB tables
- [**Usage Limits (Planned)**](USAGE_LIMITS.md) - Rate limits + quota enforcement

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
