---
summary: "Desktop Assistant Documentation"
read_when:
  - When browsing the repo entrypoint.
---

# Desktop Assistant Documentation

Welcome to the comprehensive documentation for the Desktop Assistant project. This documentation covers all aspects of the system, from high-level architecture to detailed implementation guides.

## 📚 Documentation Index

### Getting Started
- [**Overview**](getting-started/OVERVIEW.md) - Project overview, vision, and key capabilities
- [**Quick Start Guide**](getting-started/QUICK_START.md) - Get up and running quickly
- [**Installation Guide**](getting-started/INSTALLATION.md) - Detailed installation instructions

### Architecture & Design
- [**System Architecture**](architecture/ARCHITECTURE.md) - High-level system design and components
- [**Backend Architecture**](architecture/BACKEND_ARCHITECTURE.md) - Backend system design and patterns
- [**Frontend Architecture**](architecture/FRONTEND_ARCHITECTURE.md) - Frontend system design and patterns
- [**Communication Flow**](architecture/COMMUNICATION_FLOW.md) - How frontend and backend communicate

### Core Systems
- [**Agent System**](architecture/AGENT_SYSTEM.md) - Agent orchestrator and execution flow
- [**Tool System**](architecture/TOOL_SYSTEM.md) - Tool execution architecture and development
- [**Browser Control**](browser/BROWSER_CONTROL.md) - Browser automation architecture and tool behavior
- [**Browser Control Runbook**](browser/BROWSER_CONTROL_RUN.md) - Practical setup/testing flow for browser control
- [**Memory System**](architecture/MEMORY_SYSTEM.md) - Memory management and retrieval
- [**Python Sidecar**](architecture/PYTHON_SIDECAR.md) - Local tool execution + memory service
- [**LLM Integration**](architecture/LLM_INTEGRATION.md) - LLM providers and configuration
- [**Billing & Usage (Planned)**](product/BILLING_AND_USAGE.md) - Subscriptions, entitlements, and usage limits

### Development Guides
- [**Developer Guide**](development/DEVELOPER_GUIDE.md) - Comprehensive development guide
- Developer Guide includes local automation scripts (`bin/docs-list`, `scripts/check`, `scripts/test`, `scripts/check-loc.py`).
- [**Dev Tool Selection**](development/DEV_TOOL_SELECTION.md) - Backend-only tool schema allow/denylist controls for development
- [**Tool Development Guide**](development/TOOL_DEVELOPMENT.md) - Creating custom tools
- [**API Reference**](reference/API_REFERENCE.md) - Complete API documentation
- [**Extension Points**](architecture/EXTENSION_POINTS.md) - How to extend the system

### Configuration & Deployment
- [**Configuration Guide**](operations/CONFIGURATION.md) - Configuration options and settings
- [**Deployment Guide**](operations/DEPLOYMENT.md) - Production deployment instructions
- [**Release Guide**](operations/release.md) - Repeatable release checklist and guardrails
- [**Future Product Plan (Draft)**](product/FUTURE_PLAN.md) - Sequenced roadmap for packaging, hosted rollout, and major future features
- [**Environment Setup**](development/ENVIRONMENT_SETUP.md) - Development environment configuration
- [**Security & Compliance (Planned)**](product/SECURITY_AND_COMPLIANCE.md) - Security posture and compliance roadmap
- [**Plan Matrix (Draft)**](product/PLAN_MATRIX.md) - Subscription tiers and limits

### User Guides
- [**User Guide**](getting-started/USER_GUIDE.md) - End-user documentation
- [**Troubleshooting**](getting-started/TROUBLESHOOTING.md) - Common issues and solutions

### Additional Resources
- [**Testing Guide**](development/TESTING.md) - Testing strategies and practices
- [**Security Guide**](operations/SECURITY.md) - Security considerations and best practices
- [**Multi-User Runtime Hardening**](operations/MULTI_USER_RUNTIME_HARDENING.md) - Session identity, multi-device policy, and per-user model isolation guidance
- [**Performance Guide**](operations/PERFORMANCE.md) - Performance optimization strategies
- [**Mobile App Plan**](planning/WINDIEOS_MOBILE_APP_PLAN.md) - Phased plan for iOS/Android client architecture, capability negotiation, and rollout
- [**VM Multi-Agent Plan**](planning/WINDIEOS_VM_MULTI_AGENT_PLAN.md) - One-agent-per-VM architecture, agent-port workflow, and user remote-control plan
- [**Install Permission Onboarding Plan**](planning/WINDIEOS_INSTALL_PERMISSION_ONBOARDING_PLAN.md) - First-run permission-first wizard and capability gating plan
- [**Self-Edit Config Plan**](planning/WINDIEOS_SELF_EDIT_CONFIG_PLAN.md) - Natural-language user preference edits (for example TTS/screenshot attach toggles) through a safe allowlisted config path
- [**Contributing Guide**](development/CONTRIBUTING.md) - How to contribute to the project

### Hosted Platform (Planned)
- [**Future Product Plan (Draft)**](product/FUTURE_PLAN.md) - Feature sequencing and decision tracks
- [**Billing & Usage (Planned)**](product/BILLING_AND_USAGE.md) - Subscriptions, entitlements, and usage limits
- [**Security & Compliance (Planned)**](product/SECURITY_AND_COMPLIANCE.md) - Security posture and compliance roadmap
- [**Plan Matrix (Draft)**](product/PLAN_MATRIX.md) - Subscription tiers and limits
- [**Database Schema (Planned)**](product/DATABASE_SCHEMA.md) - Multi-tenant DB tables
- [**Usage Limits (Planned)**](product/USAGE_LIMITS.md) - Rate limits + quota enforcement

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
