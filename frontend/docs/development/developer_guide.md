---
summary: "Developer Guide"
read_when:
  - When onboarding developers or setting up local dev.
---

# Developer Guide

## Overview

This guide provides comprehensive information for developers working on WindieOS.
It covers codebase structure, development workflow, testing, and contribution
guidelines.

## Codebase Structure

### Backend Structure

```
private backend implementation/
├── agent/              # Agent domain
│   ├── session/        # AgentSession, SessionManager, ConversationHistory
│   ├── execution/      # AgentExecutor, InteractionLoop
│   ├── llm/            # ConversationContext, stream processor, presenter
│   ├── tools/          # Tool lifecycle (prepare/send/wait/process)
│   └── history/        # HistoryCommitter
├── api/                # API layer (routes, handlers, processing, transport)
├── core/               # Core infrastructure (bootstrap, config, container, events, security, validation)
├── embeddings/         # Embedding provider domain
├── llm/                # LLM domain (client, prompts, providers)
├── services/           # Runtime services (vision, OCR, token counting)
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
│   ├── local_runtime_bridge.cjs  # Local runtime bridge
│   └── python/        # Local-runtime Python implementation
│       ├── local_backend.py  # Local-runtime Python service
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
│   ├── features/      # Feature-based modules
│   │   ├── chat/      # Chat feature
│   │   │   ├── components/  # Chat components
│   │   │   ├── hooks/       # Chat hooks
│   │   │   └── stores/      # Zustand store
│   │   ├── dashboard/ # Dashboard feature
│   │   │   ├── components/  # dashboard shell + dashboard sections
│   │   │   └── utils/       # Display/model/memory helper logic
│   │   ├── settings/  # Settings feature
│   │   │   └── hooks/ # Settings management hook
│   │   └── voice/     # Voice feature
│   │       ├── components/
│   │       ├── hooks/
│   │       └── utils/
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

- Python 3.11
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
   private backend start command
   ```

2. **Start Frontend Dev Server**:
   ```bash
   <windie> start frontend
   ```

3. **Launch Electron**:
   ```bash
   <windie> start desktop
   ```

### Local Automation

- `<windie> docs list`: Lists docs and front-matter metadata.
- `<windie> test all`: Runs backend, local-runtime Python, and frontend tests.
- `scripts/committer "<subject>" --body "<body>" -- <files...>`: Scoped commits using the shared `committer` helper. The body is required and must use the enforced `What changed`, `Owning layer`, `Previous behavior`, `New path`, `Validation`, and `Migration/security` sections.
- Frontend checks auto-skip when `frontend/node_modules` is missing.
- `cd frontend && npm run typecheck`: Runs TS gate (`tsc --noEmit -p tsconfig.eslint.json`).
- `cd frontend && npm run lint`: Lints `js/jsx/cjs/ts/tsx`.
- `cd frontend && npm run lint:audit`: Runs React compiler + deprecation audits.
- `cd frontend && npm run audit:jscpd`: Runs duplication scan across backend, frontend, and tests.
- `cd frontend && npm run audit:knip`: Runs dead-code audit.

There is no current repo-root `scripts/check` or `scripts/check-loc.py` in this
checkout. Use [Validation Matrix](validation_matrix.md) to compose validation
for the boundary you changed.

## Future: Productization Checklist (Planned)

To ship to end users with subscriptions and usage limits, plan for:
See `../planning/future_plan.md` and Deployment Guide (private backend docs) for sequencing and deployment tracks.

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

### Priority Future Initiatives
- Dynamic OCR/vision grounding scaling for concurrent multi-user workloads.
- Prompt policy split for computer-use vs non-computer-use paths.
- Controlled frontend self-evolution workflow (proposal -> review -> apply).
- Agent self-UI interaction in bounded maintenance contexts.
- Automatic backend remote-tool schema synchronization with compatibility checks.
- Login/signup + landing + onboarding flows.
- Student-first chat mode with immediate screenshot/dashboard context.
- Dedicated execution environment strategy (local VM vs hosted workspace).

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
 * @param {string|null} screenshotRef - Optional uploaded screenshot artifact id
 */
const sendMessage = async (text, screenshotRef = null) => {
  ...
};
```

## Testing

### Backend Tests

**Run Tests**:
```bash
private backend tests
```

**Test Structure**:
```
private backend tests
├── test_llm_client.py
├── test_interaction_loop.py
├── test_tool_result_orchestrator.py
└── test_websocket_message_handler.py
```

### Local-Runtime Python Tests

**Run Tests**:
```bash
<windie> test local-runtime
```

**Test Structure**:
```
tests/sidecar/
├── test_local_backend.py
├── test_tool_registry.py
└── tools/
    ├── test_browser_tool.py
    └── test_chrome_detection.py
```

### Frontend Tests

**Run Tests**:
```bash
cd frontend
<windie> test frontend
```

**Test Structure**:
```
tests/frontend/
├── ChatStore.test.ts
├── AgentSdkConversationRuntime.test.ts
├── MessageInput.test.jsx
└── landing/LandingPage.test.jsx
```

**Example Backend Unit Test**:
```python
from backend.src.tools.categorization import ToolDomain


def test_tool_domain_values_stable():
    assert ToolDomain.BROWSER.value == "browser"
```

**Example Frontend Unit Test**:
```javascript
import { DesktopMessageClassRuntime } from '../../frontend/src/renderer/app/runtime/desktopMessageClassRuntime.js';

test('adds screenshot class when screenshot data exists', () => {
  const cls = DesktopMessageClassRuntime.buildMessageClassName({
    sender: 'assistant',
    screenshot: 'abc123',
  });
  expect(cls).toContain('message-has-screenshot');
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
private backend start command
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
from backend.src.core.infrastructure.bus import EventBus

await event_bus.publish(InteractionCompleted(session_id=session_id))
```

### Protocol-Based Interfaces

Protocol interfaces for type safety:

```python
from typing import Protocol
from backend.src.sdk.context import ToolContext

class ToolExecutor(Protocol):
    async def run(self, args: object, ctx: ToolContext) -> dict:
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
   from pydantic import BaseModel, ConfigDict, Field
   from backend.src.sdk.tool import Tool
   from backend.src.sdk.context import ToolContext
   
   class MyToolArgs(BaseModel):
       model_config = ConfigDict(extra="forbid")
       param1: str = Field(..., description="Parameter description")

   class MyTool(Tool[MyToolArgs]):
       name = "my_tool"
       description = "My tool description"
       args_model = MyToolArgs

       async def run(self, args: MyToolArgs, context: ToolContext) -> dict:
           ...
   ```

2. **Wire Tool**:
   ```python
   # LLM-callable remote tools:
   # - add backend stub in private backend implementation
   # - add a catalog entry in private backend implementation
   # - add local-runtime Python implementation + frontend/src/main/python/tools/registry.py entry
   # - keep EXPOSED_TO_BACKEND_TOOLS in sync

   # Backend-only tools (not auto-discovered by default runtime):
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

### Adding a Vision Provider

1. **Create Provider Class**:
   ```python
   from backend.src.services.vision.providers.base import BaseVisionModel

   class MyVisionModel(BaseVisionModel):
       def _load(self):
           ...
   ```

2. **Wire Selection**:
   - Import the concrete provider module in private backend implementation
   - Select it in the service model selection path

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
- **Conversation-First Shell**: `DashboardShell` keeps chat mounted and opens memory/models/settings in modal panels
- **Stable IPC Listeners**: IPC callbacks use refs to maintain stable identity
- **O(1) Channel Lookup**: IPC bridge uses Set data structures for fast channel validation

### Backend Performance

- **O(1) History Access**: ConversationHistory maintains cached LLM format for instant retrieval
- **Token Count Cache**: ConversationHistory caches token counts per model
- **Memory Protection**: Image data automatically cleared from old messages (last 5 turns)
- **Centralized Storage**: ToolResultStorage provides single source of truth with TTL cleanup

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

- [Architecture Overview](../architecture/architecture.md)
- [API Reference](../reference/api_reference.md)
- Backend Tool Development (private backend docs)

### External Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev/)
- [Electron Documentation](https://www.electronjs.org/)

---

For more information, see:
- Backend Tool Development (private backend docs)
- [API Reference](../reference/api_reference.md)
- [Contributing Guide](contributing.md)
