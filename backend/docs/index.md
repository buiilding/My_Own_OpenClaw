# Personal Assistant Backend Documentation

Welcome to the Personal Assistant Backend documentation. This documentation provides comprehensive guidance for developers working with the Personal Assistant system.

## Quick Start

- **[Quick Start Guide](quick_start.md)** - Get up and running in under 10 minutes
- **[Getting Started](../README.md)** - Installation, configuration, and basic usage
- **[Developer Guide](DEVELOPER_GUIDE.md)** - Comprehensive development guide
- **[Architecture Overview](architecture.md)** - System design and patterns
- **[Code Examples and Tutorials](examples/code_examples.md)** - Practical SDK usage examples

## Core Documentation

### Architecture & Design
- **[Architecture Overview](architecture.md)** - System architecture, components, and data flow
- **[Bootstrap System](bootstrap_system.md)** - System initialization and startup process
- **[Core Services](core_services.md)** - Infrastructure services (file, TTS, workspace, agent factory)
- **[Configuration Management](reference/configuration_management.md)** - Unified config system and change notifications
- **[Core Utilities](core_utilities.md)** - File handling, type detection, and schema generation
- **[Caching System](caching_system.md)** - Multi-level caching for performance optimization
- **[Dependency Injection](dependency_injection.md)** - Container patterns and DI usage
- **[Plugin System](plugin_system.md)** - Plugin architecture and development
- **[Memory System](memory_system.md)** - Vector-based memory storage and retrieval
- **[Security Framework](security_framework.md)** - Permission system and security controls
- **[Validation Framework](validation_framework.md)** - Input validation and error handling
- **[Tool Execution System](tool_execution_system.md)** - Tool orchestration and execution
- **[Extension Points Guide](extension_points.md)** - How to extend the system
- **[Extension Points Catalog](EXTENSION_POINTS_CATALOG.md)** - Complete reference of all extension points

### User Guides
- **[User Guide](user_guide.md)** - Complete guide for end users on how to use the Personal Assistant
- **[Quick Start Guide](quick_start.md)** - Get up and running in under 10 minutes

### Development Guides
- **[Module Reference](reference/module_reference.md)** - Comprehensive reference for all backend modules
- **[SDK Reference Guide](reference/sdk_reference.md)** - Complete SDK API reference and examples
- **[Configuration Reference](reference/config_reference.md)** - All configuration options explained
- **[Advanced Configuration Guide](reference/advanced_configuration.md)** - Advanced config scenarios and optimization
- **[Plugin Development Guide](development/plugin_development_guide.md)** - Comprehensive plugin development with examples
- **[Internal API Reference](reference/internal_api_reference.md)** - Internal APIs and interfaces documentation
- **[Performance Tuning Guide](performance/performance_tuning_guide.md)** - Optimization techniques and monitoring
- **[Contributing Guide](contributing.md)** - How to contribute to the project
- **[Tool Development Guide](development/tool_development.md)** - Creating tools and agents
- **[Tool Marketplace](development/tool_marketplace.md)** - Community tool sharing and management
- **[Computer Control Tools](development/computer_control.md)** - Desktop automation and interaction
- **[Filesystem Tools](development/filesystem_tools.md)** - File system operations and management
- **[System Tools](development/system_tools.md)** - Shell command execution and system interaction
- **[Vision Services](development/vision_services.md)** - AI-powered visual understanding
- **[LLM Integration](development/llm_integration.md)** - Multi-provider LLM support and management
- **[LLM Providers](development/llm_providers.md)** - Detailed provider implementations and configuration
- **[Testing Guide](development/testing_guide.md)** - Testing patterns and best practices
- **[API Reference](reference/api_reference.md)** - REST API and WebSocket documentation
- **[Developer Guide](DEVELOPER_GUIDE.md)** - Complete development workflow

### Operations & Deployment
- **[Deployment Checklist](deployment_checklist.md)** - Comprehensive deployment verification
- **[Deployment & Operations](deployment_operations.md)** - Production deployment and monitoring
- **[Performance Monitoring](performance/performance_monitoring.md)** - Metrics, alerting, and optimization
- **[Performance Optimization](performance/performance_optimization.md)** - System performance tuning and optimization
- **[Security & Permissions](security_framework.md)** - Security framework and access control
- **[Troubleshooting Guide](troubleshooting/troubleshooting.md)** - Debugging and issue resolution
- **[Troubleshooting Quick Reference](troubleshooting/troubleshooting_quick_ref.md)** - Common issues and solutions

### Implementation Records
- **[Architecture Decision Records](adr/)** - Key architectural decisions and rationale
- **[Phase 1 Implementation](PHASE1_IMPLEMENTATION.md)** - Message handlers and config service
- **[Phase 2 Implementation](PHASE2_IMPLEMENTATION.md)** - Tool discovery and execution
- **[Phase 3 Implementation](PHASE3_IMPLEMENTATION.md)** - Enhanced plugin system
- **[Phase 4 Implementation](PHASE4_IMPLEMENTATION.md)** - Documentation and testing

## Key Components

### Core Systems
- **Agent System**: Session management, conversation handling, and execution orchestration
- **Tool System**: Dynamic tool loading, execution, and management
- **Memory System**: Vector storage, semantic search, and conversation persistence
- **LLM Integration**: Multi-provider support with prompt engineering
- **Plugin Architecture**: Extensible component system with dependency injection

### Infrastructure
- **Dependency Injection**: Clean architecture with `dependency-injector`
- **Configuration Management**: YAML-based configuration with environment variable support
- **Event System**: Asynchronous event bus for component communication
- **Security Framework**: Permission system and resource limits
- **Caching Layer**: Multi-level caching for performance optimization

## API Endpoints

- **WebSocket**: `ws://localhost:8765/ws` - Real-time communication
- **CORS**: Configured for `http://localhost:5173` (frontend development)

## Development Workflow

1. **Setup**: Install dependencies and configure environment
2. **Development**: Use auto-reload mode for development
3. **Testing**: Run comprehensive test suite
4. **Documentation**: Update docs for any changes
5. **Deployment**: Use production mode for deployment

## Contributing

- Follow the existing code patterns and architectural principles
- Add tests for new functionality
- Update documentation for API changes
- Use type hints and maintain mypy compatibility
- Follow async/await patterns for I/O operations

## Support

- Check the [Troubleshooting Guide](troubleshooting/troubleshooting.md) for common issues
- Review [Architecture Decision Records](adr/) for design rationale
- Examine the [Developer Guide](DEVELOPER_GUIDE.md) for detailed workflows
