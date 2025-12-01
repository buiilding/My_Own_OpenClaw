# Personal Assistant Backend

Production-grade backend for the Personal Assistant application with dependency injection, SDK-based tools, and comprehensive architecture.

## Prerequisites

- Python 3.9 or higher
- pip or poetry for package management
- API keys for your chosen LLM provider (OpenAI, Anthropic, etc.)

## Installation

1. **Install dependencies:**

```powershell
cd backend
pip install -r requirements.txt
```

2. **Set up environment variables:**

Set your API keys as environment variables:

```powershell
# For OpenAI
$env:OPENAI_API_KEY = "your-api-key-here"

# For Anthropic
$env:ANTHROPIC_API_KEY = "your-api-key-here"

# For other providers, see config.py for environment variable names
```

3. **Create configuration file:**

The application will automatically create a config file at:
- **Windows**: `%APPDATA%\DesktopAssistant\config.yaml`
- **macOS**: `~/Library/Application Support/DesktopAssistant/config.yaml`
- **Linux**: `~/.config/DesktopAssistant/config.yaml`

You can also create/edit this file manually. See `backend/src/core/config.py` for available configuration options.

## Running the Application

### Development Mode (with auto-reload)

```powershell
cd backend
python -m src.main
```

Or using uvicorn directly:

```powershell
cd backend
uvicorn src.main:app --host 0.0.0.0 --port 8765 --reload
```

### Production Mode

```powershell
cd backend
uvicorn src.main:app --host 0.0.0.0 --port 8765
```

## Configuration

The application uses a YAML configuration file. Key settings include:

- **LLM Provider**: Choose between OpenAI, Anthropic, Google, etc.
- **Model Selection**: Configure which model to use
- **Memory Settings**: Enable/disable memory, configure storage
- **Tool Settings**: Configure tool execution timeouts and limits
- **Security**: Configure permissions and resource limits

See `backend/src/core/config.py` for the complete `AppConfig` model with all available options.

## Project Structure

```
backend/
├── src/                    # Application source code
│   ├── agent/             # Agent domain (sessions, executor)
│   ├── tools/             # Tools domain (registry, loader, tools)
│   ├── memory/            # Memory domain (storage, retrieval)
│   ├── llm/               # LLM domain (client, prompts)
│   ├── api/               # API layer (routes, dependencies)
│   ├── core/              # Core infrastructure
│   │   ├── container.py   # DI container
│   │   ├── config.py      # Configuration management
│   │   ├── exceptions.py  # Exception hierarchy
│   │   └── interfaces/    # Protocol interfaces
│   └── sdk/               # SDK for tool development
│       ├── tool.py        # Base Tool class
│       ├── context.py     # Context classes
│       └── errors.py      # SDK exceptions
├── docs/                  # Documentation
│   ├── architecture.md   # System architecture
│   ├── tool_development.md # Tool development guide
│   ├── api_reference.md   # API documentation
│   └── extension_points.md # Extension guide
└── requirements.txt       # Python dependencies
```

## Key Features

- **Dependency Injection**: Using `dependency-injector` for clean architecture
- **SDK-Based Tools**: All tools inherit from `backend.src.sdk.tool.Tool`
- **Agent SDK**: Specialized agents for complex multi-step tasks with sub-conversations
- **Vision Services**: AI-powered visual understanding with InternVL models for UI interaction
- **Type Safety**: Strict type hints with mypy support
- **Async I/O**: Fully asynchronous using `aiofiles` and `aiosqlite`
- **Caching**: Built-in caching for tool schemas, embeddings, and LLM clients
- **Security**: Permission system, resource limits, and audit logging
- **Event System**: Event bus for extensibility
- **Plugin System**: Plugin registry for extensions

## API Endpoints

- **WebSocket**: `ws://localhost:8765/ws` - Main communication endpoint
- **CORS**: Configured for `http://localhost:5173` (frontend)

## Development

### Running Tests

```powershell
cd backend
pytest
```

### Type Checking

```powershell
cd backend
mypy src/
```

### Code Formatting

```powershell
cd backend
black src/
isort src/
```

## Troubleshooting

### Import Errors

If you encounter import errors, ensure you're running from the project root and that `backend` is in your Python path:

```powershell
# From backend directory
python -m src.main
```

### Configuration Not Found

The application will create a default config file on first run. If you need to reset it, delete the config file and restart the application.

### Database Errors

If you encounter SQLite errors, ensure the database directory exists and is writable. The database is stored in the same location as the config file.

## Documentation

### Getting Started
- [Developer Guide](docs/DEVELOPER_GUIDE.md) - Comprehensive guide for developers
- [Extension Points Catalog](docs/EXTENSION_POINTS_CATALOG.md) - Complete reference for all extension points

### Technical Documentation
- [Architecture Overview](docs/architecture.md) - System architecture
- [Bootstrap System](docs/bootstrap_system.md) - System initialization and startup
- [Core Services](docs/core_services.md) - Infrastructure services and components
- [Tool Development Guide](docs/tool_development.md) - Creating tools
- [LLM Providers](docs/llm_providers.md) - LLM provider implementations
- [Plugin System](docs/plugin_system.md) - Plugin architecture and development
- [API Reference](docs/api_reference.md) - API documentation
- [Extension Points Guide](docs/extension_points.md) - Extension guide

### Architecture Decision Records
- [ADR Index](docs/adr/) - Architecture Decision Records documenting key decisions

### Implementation Phases
- [Phase 1 Implementation](docs/PHASE1_IMPLEMENTATION.md) - Message handlers, config service
- [Phase 2 Implementation](docs/PHASE2_IMPLEMENTATION.md) - Tool discovery, execution strategies
- [Phase 3 Implementation](docs/PHASE3_IMPLEMENTATION.md) - Enhanced plugin system
- [Phase 4 Implementation](docs/PHASE4_IMPLEMENTATION.md) - Documentation & testing

## License

[Your License Here]

