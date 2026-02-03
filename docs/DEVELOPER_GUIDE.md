---
summary: "Developer Guide"
read_when:
  - When onboarding developers or setting up local dev.
---

# Developer Guide

## Overview

This guide provides comprehensive information for developers working on Desktop Assistant. It covers codebase structure, development workflow, testing, and contribution guidelines.

## Codebase Structure

### Backend Structure

```
backend/src/
├── agent/              # Agent domain
│   ├── session/        # AgentSession, SessionManager, ConversationHistory
│   ├── execution/      # AgentExecutor, InteractionLoop
│   ├── llm/            # ConversationContext, stream processor, presenter
│   ├── tools/          # Tool lifecycle (prepare/send/wait/process)
│   ├── history/        # HistoryCommitter
│   └── plugins/        # Agent plugin interface + manager
├── api/                # API layer (routes, handlers, processing, transport)
├── core/               # Core infrastructure (config, container, services, plugins)
├── embeddings/         # Embedding provider domain
├── llm/                # LLM domain (client, prompts, providers)
├── sdk/                # SDK for tool development
├── tools/              # Tool registry + orchestrator
├── simulation/         # Mock LLM and simulation helpers
└── main.py             # Application entry point
```

### Frontend Structure

```
frontend/src/
├── main/              # Main process (Electron)
│   ├── index.cjs      # Electron entry
│   ├── ipc.cjs        # IPC bridge
│   ├── wakeword_bridge.cjs  # Wakeword service bridge
│   ├── local_backend_bridge.cjs  # Local backend bridge
│   └── python/        # Python sidecar
│       ├── local_backend.py  # Local backend service
│       ├── memory_service.py  # Memory service
│       ├── core/      # Core utilities
│       ├── tools/     # Tool implementations
│       └── memory/    # Memory storage
├── preload.js         # Preload script
├── renderer/          # Renderer process (React)
│   ├── app/           # App-level components
│   │   ├── App.jsx    # Root component
│   │   ├── main.jsx   # React entry point
│   │   └── providers/ # Context providers
│   │       ├── AppProvider.jsx  # Main app provider
│   │       ├── AppConfigContext.jsx  # Config context
│   │       ├── AppStatusContext.jsx  # Status context
│   │       └── ChatProvider.jsx  # Chat provider
│   ├── components/    # Shared React components
│   │   ├── ErrorBoundary.jsx
│   │   └── MainLayout.jsx
│   ├── features/      # Feature-based modules
│   │   ├── chat/      # Chat feature
│   │   │   ├── components/  # Chat components
│   │   │   ├── hooks/       # Chat hooks
│   │   │   └── stores/      # Zustand store
│   │   ├── settings/  # Settings feature
│   │   │   ├── components/
│   │   │   └── hooks/
│   │   └── voice/     # Voice feature
│   │       ├── components/
│   │       └── hooks/
│   ├── infrastructure/ # Infrastructure layer
│   │   ├── api/       # API client
│   │   ├── ipc/       # IPC bridge abstraction
│   │   ├── services/  # Business logic services
│   │   └── audio/     # Audio services
│   ├── utils/         # Utilities
│   └── styles/        # CSS styles
└── types/             # TypeScript types
```

## Development Setup

### Prerequisites

- Python 3.9+
- Node.js 18+
- Git
- IDE (VS Code recommended)

### Environment Setup

1. **Clone Repository**:
   ```bash
   git clone <repository-url>
   cd WindieOS
   ```

2. **Backend Setup**:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. **Frontend Setup**:
   ```bash
   cd frontend
   npm install
   ```

4. **Environment Variables**:
   ```bash
   export OPENAI_API_KEY="your-api-key"
   ```

### Development Workflow

1. **Start Backend**:
   ```bash
   python -m backend.src.main
   ```

2. **Start Frontend Dev Server**:
   ```bash
   cd frontend
   npm run dev
   ```

3. **Launch Electron**:
   ```bash
   cd frontend
   npm run electron
   ```

### Local Automation

- `bin/docs-list`: Lists docs and fails on empty/missing docs.
- `scripts/test`: Runs backend + frontend tests.
- `scripts/check`: Runs docs list, backend tests, frontend lint + tests.
- `scripts/check-loc.py --max 500`: Reports files over the LOC guideline (`--fail` to exit non-zero).
- `scripts/committer "<msg>" <files...>`: Scoped commits using the shared `committer` helper.
- Frontend checks auto-skip when `frontend/node_modules` is missing.

## Future: Productization Checklist (Planned)

To ship to end users with subscriptions and usage limits, plan for:

### Backend
- Multi-tenant auth + session management
- Usage metering (tokens, tool calls, screenshots, compute time)
- Rate limiting + quota enforcement per plan
- Billing integration (Stripe) with entitlements
- Admin tooling for support + account overrides

### Frontend
- Login/signup + device management
- Plan selection + billing portal access
- Usage meter + limit warning states
- Feature gating based on entitlements

### Ops & Delivery
- Hosted backend environment (staging + production)
- Observability (metrics, tracing, logs)
- Signed desktop builds + auto-updater
- Telemetry + crash reporting (opt-in)

## Code Style

### Python Style

- **Formatter**: Black
- **Linter**: mypy, pylint
- **Type Hints**: Required for all functions
- **Docstrings**: Google style

**Example**:
```python
def process_message(
    message: str,
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Process a message with optional context.
    
    Args:
        message: The message to process
        context: Optional context dictionary
        
    Returns:
        Processed message result
    """
    ...
```

### JavaScript Style

- **Formatter**: Prettier
- **Linter**: ESLint
- **React**: Functional components with hooks
- **Comments**: JSDoc style

**Example**:
```javascript
/**
 * Processes a user message and sends it to the backend.
 * 
 * @param {string} text - The message text
 * @param {string|null} screenshot - Optional screenshot data
 */
const sendMessage = async (text, screenshot = null) => {
  ...
};
```

## Testing

### Backend Testing

**Run Tests**:
```bash
cd backend
pytest ../tests/backend
```

**Test Structure**:
```
tests/backend/
├── test_agent_system.py
├── test_tool_execution.py
├── test_llm_integration.py
└── test_parser_helpers.py
```

**Writing Tests**:
```python
import pytest
from backend.src.agent.core.core import AgentSession

@pytest.mark.asyncio
async def test_agent_query():
    session = AgentSession(...)
    result = await session.process_query("test query")
    assert result is not None
```

### Frontend Testing

**Run Tests**:
```bash
cd frontend
npm test
```

**Test Structure**:
```
tests/frontend/
├── App.spec.jsx
├── ChatInterface.spec.jsx
└── MainLayout.spec.jsx
```

**Writing Tests**:
```javascript
import { render, screen } from '@testing-library/react';
import ChatInterface from '../ChatInterface';

test('renders chat interface', () => {
  render(<ChatInterface />);
  expect(screen.getByText('Chat')).toBeInTheDocument();
});
```

## Debugging

### Backend Debugging

**Logging**:
```python
import logging

logger = logging.getLogger(__name__)
logger.debug("Debug message")
logger.info("Info message")
logger.warning("Warning message")
logger.error("Error message")
```

**Debug Mode**:
```bash
export DESKTOP_ASSISTANT_LOG_LEVEL=DEBUG
python -m backend.src.main
```

### Frontend Debugging

**React DevTools**:
- Install React DevTools browser extension
- Use in Electron DevTools

**Console Logging**:
```javascript
console.log("Debug message");
console.error("Error message");
```

**DevTools**:
- Press `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS)
- Open DevTools in Electron window

## Architecture Patterns

### Dependency Injection

Backend uses `dependency-injector`:

```python
from dependency_injector import containers, providers

class Container(containers.DeclarativeContainer):
    config = providers.Configuration()
    tool_registry = providers.Singleton(ToolRegistry, config=config)
    llm_client = providers.Factory(get_llm_client, config=config)
```

### Event-Driven Architecture

Event bus for component communication:

```python
from backend.src.core.bus import EventBus

event_bus.emit(InteractionCompleted(session_id=session_id))
```

### Protocol-Based Interfaces

Protocol interfaces for type safety:

```python
from typing import Protocol

class ToolExecutor(Protocol):
    async def execute(self, tool_call: ToolCall) -> ToolResult:
        ...
```

### Frontend Architecture Patterns

**Split Contexts for Performance**:
- AppConfigContext: Infrequently changing state (config, models)
- AppStatusContext: Frequently changing state (save status)
- Prevents unnecessary re-renders when only status changes

**Zustand Store for Chat State**:
```typescript
import { useChatStore } from '../features/chat/stores/chatStore';

// Direct subscription to store slice
const messages = useChatStore((state) => state.messages);
const addMessage = useChatStore((state) => state.addMessage);
```

**Infrastructure Layer**:
- Pure services (no React dependencies)
- Callback-based architecture for UI updates
- Type-safe IPC bridge with channel validation

**Feature-Based Organization**:
- Features are self-contained modules
- Each feature has components, hooks, and stores
- Infrastructure layer shared across features

## Extension Points

### Adding a New Tool

1. **Create Tool Class**:
   ```python
   from backend.src.sdk.tool import Tool
   
   class MyTool(Tool):
       name = "my_tool"
       description = "My tool description"
       
       def get_schema(self) -> dict:
           return {...}
       
       async def execute(self, args: dict, context: ToolContext) -> ToolResult:
           ...
   ```

2. **Register Tool**:
   ```python
   tool_registry.register_tool(MyTool())
   ```

### Adding a New LLM Provider

1. **Create Provider Class**:
   ```python
   from backend.src.llm.providers.base import LLMProvider
   
   class MyProvider(LLMProvider):
       async def get_completion(self, model: str, messages: List[LLMMessage]) -> str:
           ...
   ```

2. **Register Provider**:
   ```python
   provider_factory.register("my_provider", MyProvider)
   ```

### Adding a New Plugin

1. **Create Plugin Class**:
   ```python
   from backend.src.agent.plugins.interface import AgentPlugin, PluginResult
   
   class MyPlugin(AgentPlugin):
       name = "my_plugin"

       async def initialize(self, container=None) -> None:
           ...

       async def on_tool_end(self, tool_name: str, result: object):
           return PluginResult(artifacts={"tool": tool_name})
   ```

2. **Register Plugin**:
   ```python
   plugin_registry.register(MyPlugin())
   ```

## Performance Optimization

### Caching

- **LLM Client Caching**: Provider instances cached
- **Embedding Cache**: Avoid re-computing embeddings
- **Tool Schema Cache**: Cached tool definitions
- **Conversation History Cache**: O(1) LLM format access via cached conversion
- **Tool Result Storage**: Centralized storage with TTL-based cleanup (5 minutes)

### Parallelization

- **Async I/O**: All I/O operations async
- **Parallel Tool Execution**: Multiple tools in parallel
- **Batch Processing**: Batch embeddings and OCR

### GPU Acceleration

- **CUDA Support (Optional)**: Embeddings can use GPU when configured
- **OCR Acceleration**: OCR can leverage GPU if available
- **Vision Models**: Vision inference can use GPU if available

### Frontend Performance

- **Split Contexts**: AppConfigContext and AppStatusContext separated to prevent unnecessary re-renders
- **Zustand Store**: Direct subscriptions to store slices, no context propagation overhead
- **Lazy Loading**: SettingsPanel loaded lazily to improve initial render time
- **Stable IPC Listeners**: IPC callbacks use refs to maintain stable identity
- **O(1) Channel Lookup**: IPC bridge uses Set data structures for fast channel validation

### Backend Performance

- **Shallow Copy Optimization**: PreparedToolCall uses shallow copy instead of deep copy for parameters
- **O(1) History Access**: ConversationHistory maintains cached LLM format for instant retrieval
- **Memory Protection**: Image data automatically cleared from old messages (last 5 turns)
- **Centralized Storage**: ToolResultStorage provides single source of truth with automatic cleanup

## Security Best Practices

### Input Validation

- Validate all user inputs
- Sanitize data before processing
- Use type checking

### Tool Execution

- Sandbox tool execution
- Set resource limits
- Audit all tool executions

### Data Security

- Encrypt sensitive data
- Store memory and conversation history locally
- Note: User input and screenshots must be sent to LLM providers via internet APIs (required for AI functionality)
- No cloud sync of memory/conversation data by default

## Contributing

### Contribution Workflow

1. **Fork Repository**
2. **Create Branch**: `git checkout -b feature/my-feature`
3. **Make Changes**: Follow code style guidelines
4. **Write Tests**: Add tests for new features
5. **Run Tests**: Ensure all tests pass
6. **Submit PR**: Create pull request

### Code Review Process

1. **Automated Checks**: CI runs tests and linting
2. **Code Review**: At least one reviewer required
3. **Approval**: Maintainer approval required
4. **Merge**: Squash and merge

### Commit Messages

Follow conventional commits:

```
feat: Add new tool for file operations
fix: Fix tool execution timeout issue
docs: Update API documentation
refactor: Refactor tool registry
test: Add tests for tool execution
```

## Resources

### Documentation

- [Architecture Overview](ARCHITECTURE.md)
- [API Reference](API_REFERENCE.md)
- [Tool Development Guide](TOOL_DEVELOPMENT.md)

### External Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev/)
- [Electron Documentation](https://www.electronjs.org/)

---

For more information, see:
- [Tool Development Guide](TOOL_DEVELOPMENT.md)
- [API Reference](API_REFERENCE.md)
- [Contributing Guide](CONTRIBUTING.md)
