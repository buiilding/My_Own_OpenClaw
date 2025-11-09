# Code Standards & Conventions

## Purpose
This document establishes coding standards for the Desktop Assistant project to ensure consistency, readability, and maintainability across all contributions. These standards enable future community developers to easily understand and extend the codebase.

---

## General Principles

### 1. Clarity Over Cleverness
- Write code that is easy to understand, not code that shows off your skills
- If you need to add a comment to explain "how" something works, consider refactoring
- Comments should explain "why" decisions were made, not "what" the code does

### 2. Consistency
- Follow the established patterns in the codebase
- When adding new features, match the style of existing similar components
- Don't mix coding styles within the same file or module

### 3. Modularity
- Each module/class/function should have a single, well-defined responsibility
- Avoid tight coupling between components
- Use dependency injection and interfaces to enable testing and flexibility

### 4. Documentation
- Public APIs must be documented
- Complex logic should have explanatory comments
- README files should exist for major modules explaining their purpose and usage

---

## Python Backend Standards

### Code Style
- **Formatter**: Use `black` with default settings (88 character line length)
- **Linter**: Use `pylint` with project `.pylintrc` configuration
- **Import sorting**: Use `isort` with black-compatible settings
- **Type hints**: Required for all function signatures and class attributes

### Naming Conventions
```python
# Classes: PascalCase
class MemoryInterface:
    pass

# Functions/methods: snake_case
def get_recent_context(num_items: int) -> list:
    pass

# Constants: UPPER_SNAKE_CASE
MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30

# Private members: prefix with single underscore
def _internal_helper():
    pass

# Module-level "protected": single underscore prefix
_module_internal_cache = {}
```

### File Structure
```python
"""
Module docstring describing the purpose and main classes/functions.

Example:
    from backend.agent import Agent
    agent = Agent()
"""

# Standard library imports
import os
import sys
from typing import Optional, Dict, List

# Third-party imports
import requests
from openai import OpenAI

# Local imports
from backend.memory import interface
from backend.tools import base

# Constants
DEFAULT_MODEL = "gpt-4"
MAX_CONTEXT_LENGTH = 8000

# Module code
class YourClass:
    """Class docstring with description."""
    pass
```

### Docstrings
Use Google-style docstrings:

```python
def process_query(query: str, context: Optional[Dict] = None) -> str:
    """Process user query and generate response.

    Args:
        query: The user's input text
        context: Optional dictionary containing conversation history
                 and relevant memory context

    Returns:
        The generated response string

    Raises:
        ValueError: If query is empty
        APIError: If LLM provider fails

    Example:
        >>> process_query("What's the weather?")
        "I'll check the weather for you..."
    """
    pass
```

### Error Handling
```python
# Use specific exceptions
class MemoryStorageError(Exception):
    """Raised when memory storage operations fail."""
    pass

# Always catch specific exceptions
try:
    result = risky_operation()
except FileNotFoundError as e:
    logger.error(f"File not found: {e}")
    raise MemoryStorageError("Failed to load memory data") from e
except Exception as e:
    logger.exception("Unexpected error occurred")
    raise

# Log errors appropriately
import logging
logger = logging.getLogger(__name__)
```

### Type Hints
```python
from typing import Optional, List, Dict, Union, Callable, Any

# Always use type hints for function signatures
def search_tools(
    query: str,
    limit: int = 5,
    filters: Optional[Dict[str, Any]] = None
) -> List[Dict[str, str]]:
    """Search for tools in marketplace."""
    pass

# Use type aliases for complex types
ToolManifest = Dict[str, Union[str, List[str], Dict[str, Any]]]

def load_tool(manifest: ToolManifest) -> bool:
    pass
```

### Async Code
```python
# Use async/await for I/O-bound operations
async def fetch_llm_response(prompt: str) -> str:
    """Asynchronously fetch LLM response."""
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=data) as response:
            return await response.text()

# Properly handle async context managers
async def process_with_lock():
    async with asyncio.Lock():
        # Critical section
        pass
```

### Testing
```python
# Use pytest for all tests
# Test file naming: test_<module_name>.py
# Test function naming: test_<function_name>_<scenario>

import pytest
from backend.agent.orchestrator import Agent

def test_agent_initialization_with_default_config():
    """Test that agent initializes with default configuration."""
    agent = Agent()
    assert agent.config is not None
    assert agent.llm_client is not None

def test_agent_query_raises_error_on_empty_input():
    """Test that agent raises ValueError for empty queries."""
    agent = Agent()
    with pytest.raises(ValueError, match="Query cannot be empty"):
        agent.process_query("")

@pytest.fixture
def mock_llm_client():
    """Fixture providing a mock LLM client."""
    # Setup mock
    yield mock
    # Teardown
```

---

## JavaScript/TypeScript Frontend Standards

### Code Style
- **Formatter**: Use `prettier` with project `.prettierrc`
- **Linter**: Use `eslint` with project `.eslintrc`
- **Framework**: React with functional components and hooks
- **Language**: Prefer TypeScript, but JavaScript is acceptable for simple components

### Naming Conventions
```javascript
// Components: PascalCase
function ChatInterface() {}

// Functions/variables: camelCase
const getUserInput = () => {};
const messageCount = 0;

// Constants: UPPER_SNAKE_CASE
const MAX_MESSAGE_LENGTH = 1000;
const API_ENDPOINT = '/api/chat';

// Private/internal: prefix with underscore (convention only)
const _internalHelper = () => {};

// React hooks: prefix with "use"
function useAgentState() {}

// Event handlers: prefix with "handle"
const handleSubmit = (e) => {};
const handleKeyPress = (e) => {};
```

### File Structure
```javascript
// Imports
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

// Local imports
import { Button } from './components/Button';
import { useAgentState } from './hooks/useAgentState';
import './styles/ChatInterface.css';

// Constants
const MAX_MESSAGES = 100;

// Component
/**
 * ChatInterface - Main chat component for user interaction
 *
 * @param {Object} props - Component props
 * @param {Function} props.onSendMessage - Callback for sending messages
 * @param {Array} props.messages - Array of message objects
 */
function ChatInterface({ onSendMessage, messages }) {
  // State
  const [input, setInput] = useState('');

  // Effects
  useEffect(() => {
    // Effect logic
  }, []);

  // Handlers
  const handleSubmit = (e) => {
    e.preventDefault();
    onSendMessage(input);
    setInput('');
  };

  // Render
  return (
    <div className="chat-interface">
      {/* Component JSX */}
    </div>
  );
}

// PropTypes
ChatInterface.propTypes = {
  onSendMessage: PropTypes.func.isRequired,
  messages: PropTypes.arrayOf(PropTypes.object).isRequired,
};

export default ChatInterface;
```

### React Best Practices
```javascript
// Use functional components with hooks
function MyComponent() {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    // Side effects here
    return () => {
      // Cleanup
    };
  }, [dependencies]);

  return <div>Content</div>;
}

// Extract custom hooks for reusable logic
function useWebSocket(url) {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const ws = new WebSocket(url);
    ws.onmessage = (event) => {
      setMessages(prev => [...prev, JSON.parse(event.data)]);
    };
    setSocket(ws);
    return () => ws.close();
  }, [url]);

  return { socket, messages };
}

// Use prop destructuring
function Button({ label, onClick, disabled = false }) {
  return <button onClick={onClick} disabled={disabled}>{label}</button>;
}

// Avoid inline function definitions in JSX (performance)
// Bad:
<button onClick={() => handleClick(id)}>Click</button>

// Good:
const handleButtonClick = useCallback(() => handleClick(id), [id]);
<button onClick={handleButtonClick}>Click</button>
```

### Error Boundaries
```javascript
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorDisplay error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

---

## Git Commit Standards

### Commit Message Format
Follow Conventional Commits specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependency updates

**Examples**:
```
feat(agent): add multi-provider LLM client support

Implement abstract LLMClient interface and concrete implementations
for OpenAI, Anthropic, and Google providers. Includes automatic
provider switching based on configuration.

Closes #5

---

fix(memory): prevent duplicate entries in conversation history

Added deduplication logic in store() method to check for existing
entries with same timestamp and content before inserting.

Fixes #42

---

docs(tools): add tool development guide

Created comprehensive guide for community developers explaining
tool manifest format, implementation requirements, and testing
procedures.
```

### Branch Naming
```
<type>/<brief-description>

Examples:
feature/llm-integration
fix/memory-leak-in-monitor
refactor/tool-executor-architecture
docs/api-reference
```

### Pull Request Format
```markdown
## Description
Brief description of changes and motivation

## Related Issues
Closes #123
Relates to #456

## Changes Made
- Added X functionality
- Refactored Y component
- Fixed Z bug

## Testing Done
- [ ] Manual testing completed
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Tested on Windows 10/11

## Screenshots (if applicable)
[Add screenshots for UI changes]

## Checklist
- [ ] Code follows project style guidelines
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] No console errors or warnings
- [ ] Reviewed own code before requesting review
```

---

## Code Review Guidelines

### For Authors
- Keep PRs small and focused (< 400 lines changed when possible)
- Write clear PR descriptions with context
- Respond to feedback promptly and professionally
- Test your changes thoroughly before requesting review
- Review your own code first (check the diff on GitHub)

### For Reviewers
- Be constructive and respectful
- Ask questions rather than making demands ("Could we consider...?" vs "Do it this way")
- Praise good solutions and clever approaches
- Focus on correctness, readability, and maintainability
- Don't nitpick minor style issues (that's what linters are for)
- Approve when code is good enough, don't demand perfection

### Review Checklist
- [ ] Code matches the issue/feature requirements
- [ ] No obvious bugs or edge cases unhandled
- [ ] Error handling is appropriate
- [ ] Code is readable and well-organized
- [ ] Functions/classes have single responsibilities
- [ ] Tests cover main functionality
- [ ] Documentation is clear and accurate
- [ ] No security vulnerabilities introduced

---

## Documentation Standards

### README Files
Every major module should have a README.md with:
- Purpose and overview
- Installation/setup instructions (if applicable)
- Usage examples
- API reference (or link to it)
- Contributing guidelines (or link to main CONTRIBUTING.md)

### Code Comments
```python
# Good comments explain WHY:
# We use exponential backoff here because the API has aggressive
# rate limiting and returns 429 errors frequently
retry_delay = 2 ** attempt

# Bad comments explain WHAT (code already shows this):
# Multiply 2 by the attempt number
retry_delay = 2 ** attempt
```

### API Documentation
- All public functions/methods must have docstrings
- Document parameters, return values, and exceptions
- Include usage examples for complex APIs
- Keep documentation up-to-date with code changes

---

## Security Standards

### API Keys and Secrets
- Never commit API keys, tokens, or passwords
- Use environment variables or config files (`.env`, `.config.json`)
- Add sensitive files to `.gitignore`
- Document required environment variables in README

### Input Validation
```python
# Validate all user inputs
def process_command(command: str) -> None:
    if not command or not command.strip():
        raise ValueError("Command cannot be empty")

    if len(command) > MAX_COMMAND_LENGTH:
        raise ValueError(f"Command exceeds maximum length of {MAX_COMMAND_LENGTH}")

    # Sanitize inputs before using in system calls
    safe_command = shlex.quote(command)
```

### Tool Execution Safety
- Sandbox tool execution when possible
- Validate tool manifests before loading
- Implement timeouts for long-running tools
- Log all tool executions for auditing
- Request user confirmation for destructive operations

---

## Performance Standards

### Backend
- Use async/await for I/O operations
- Cache expensive computations when appropriate
- Profile code to identify bottlenecks
- Avoid unnecessary database queries
- Use connection pooling for databases

### Frontend
- Minimize re-renders (use React.memo, useMemo, useCallback)
- Lazy load components when possible
- Debounce frequent operations (search inputs, window resize)
- Optimize bundle size (code splitting, tree shaking)
- Use virtual scrolling for long lists

---

## Accessibility Standards

### Frontend Accessibility
- Use semantic HTML elements
- Provide alt text for images
- Ensure keyboard navigation works
- Maintain sufficient color contrast (WCAG AA minimum)
- Use ARIA labels where necessary
- Test with screen readers

---

## Testing Standards

### Unit Tests
- Test individual functions/methods in isolation
- Mock external dependencies
- Cover edge cases and error conditions
- Aim for >80% code coverage for critical paths

### Integration Tests
- Test interactions between components
- Use realistic test data
- Test error handling and recovery
- Verify end-to-end workflows

### Test Organization
```
tests/
├── backend/
│   ├── agent/
│   │   ├── test_orchestrator.py
│   │   └── test_llm_client.py
│   ├── memory/
│   └── tools/
└── frontend/
    ├── components/
    └── integration/
```

---

## Maintenance Standards

### Dependency Management
- Keep dependencies up-to-date
- Review security advisories regularly
- Document why each dependency is needed
- Avoid unnecessary dependencies

### Deprecation Process
1. Mark feature as deprecated in documentation
2. Add deprecation warnings in code
3. Provide migration guide
4. Remove after at least one major version

---

## Questions & Clarifications

When you're unsure about any standard or pattern:
1. Check existing code for similar patterns
2. Ask in PR comments or team discussions
3. Document your decision in code comments
4. Update this standards document if you establish a new pattern

---

## Enforcement

- Automated checks via CI/CD (linting, formatting, tests)
- Code review process enforces standards
- Regular team discussions to refine standards
- This is a living document - suggest improvements via PR
