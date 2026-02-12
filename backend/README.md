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

# For Kimi Coding
$env:KIMI_API_KEY = "your-api-key-here"

# For other providers, see backend/src/core/config/models.py for environment variable names
```

3. **Configuration:**

There is no YAML config file. Backend configuration lives in:

- `backend/src/core/config/app_config.py`
- `backend/src/core/config/models.py`

## Running the Application

### Development Mode

```powershell
cd backend
python -m backend.src.main
```

If you explicitly want auto-reload, use uvicorn directly:

```powershell
cd backend
uvicorn backend.src.main:app --host 0.0.0.0 --port 8765 --reload
```

### Production Mode

```powershell
cd backend
uvicorn backend.src.main:app --host 0.0.0.0 --port 8765
```

## Configuration

The application uses a Python configuration file. Key settings include:

- **LLM Provider**: Choose between OpenAI, Anthropic, Gemini, etc.
- **Model Selection**: Configure which model to use
- **Memory Settings**: Enable/disable memory, configure storage
- **Tool Settings**: Configure tool execution timeouts and limits
- **Security**: Configure permissions and resource limits

See `backend/src/core/config/app_config.py` and `backend/src/core/config/models.py` for the complete `AppConfig` model.

## Project Structure

```
backend/
├── src/                     # Application source code
│   ├── agent/              # Agent domain (session/execution/tools/history)
│   │   ├── session/        # AgentSession, SessionManager, ConversationHistory
│   │   ├── execution/      # AgentExecutor, InteractionLoop
│   │   ├── llm/            # ConversationContext, stream processor, presenter
│   │   ├── tools/          # Tool lifecycle (prepare/send/wait/process)
│   │   ├── history/        # HistoryCommitter
│   │   └── plugins/        # Agent plugin interface + manager
│   ├── api/                # API layer (routes, handlers, processing, transport)
│   ├── core/               # Core infrastructure (config, container, services, plugins)
│   ├── embeddings/         # Embedding provider domain
│   ├── llm/                # LLM domain (client, parser, prompts, providers)
│   ├── sdk/                # SDK for tool development (Tool, ToolContext)
│   ├── tools/              # Tool registry + orchestrator
│   ├── simulation/         # Mock LLM and simulation helpers
│   └── main.py             # Application entry point
└── requirements.txt        # Python dependencies
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

If you encounter import errors, ensure you're running from the project root so the `backend` package is importable:

```powershell
python -m backend.src.main
```

### Configuration Changes Not Taking Effect

Configuration is defined in `backend/src/core/config/app_config.py`. Changes require an application restart, or a manual reload via the ConfigurationService if you wire it up in code.

## Documentation

Documentation lives at the repository root in `docs/`. See:
- `docs/DEVELOPER_GUIDE.md`
- `docs/BACKEND_ARCHITECTURE.md`
- `docs/API_REFERENCE.md`
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
