# Code Standards

This document outlines the coding standards and best practices for the Personal Assistant project.

## Table of Contents

- [General Principles](#general-principles)
- [Python Standards](#python-standards)
- [JavaScript/TypeScript Standards](#javascripttypescript-standards)
- [Documentation Standards](#documentation-standards)
- [Testing Standards](#testing-standards)
- [Git Standards](#git-standards)
- [Code Review Guidelines](#code-review-guidelines)

## General Principles

### Code Quality

- **Readability First**: Code should be self-documenting and easy to understand
- **Maintainability**: Write code that can be easily modified and extended
- **Performance**: Optimize for performance where it matters, but prioritize correctness
- **Security**: Follow security best practices and validate inputs
- **Consistency**: Follow established patterns and conventions

### Architecture Principles

- **Clean Architecture**: Separate concerns with clear boundaries
- **Dependency Injection**: Use DI containers for loose coupling
- **Protocol-Based Interfaces**: Define contracts with protocols, not concrete classes
- **Async First**: Use async/await for all I/O operations
- **Error Handling**: Implement comprehensive error handling and logging

## Python Standards

### Code Style

- Follow [PEP 8](https://pep8.org/) guidelines
- Use [Black](https://black.readthedocs.io/) for code formatting (88 character line length as configured)
- **Note**: isort and flake8 are mentioned in standards but not currently configured
- **Note**: mypy type checking is recommended but not enforced in CI

### Type Hints

- Use type hints for all function parameters and return values
- Use `typing` module for complex types
- Use `Optional` for nullable parameters
- Use `Union` for multiple possible types

```python
from typing import Optional, List, Dict, Any
from pathlib import Path

def process_file(file_path: Path, options: Optional[Dict[str, Any]] = None) -> List[str]:
    # Function implementation
    pass
```

### Docstrings

- Use Google-style docstrings for all public functions and classes
- Include description, parameters, return values, and exceptions

```python
def calculate_similarity(text1: str, text2: str) -> float:
    """Calculate semantic similarity between two texts.

    Uses sentence transformers to compute cosine similarity between
    the embeddings of the input texts.

    Args:
        text1: First text to compare
        text2: Second text to compare

    Returns:
        Similarity score between 0.0 and 1.0

    Raises:
        ValueError: If either text is empty or None
    """
    pass
```

### Naming Conventions

- **Classes**: `CamelCase`
- **Functions/Methods**: `snake_case`
- **Constants**: `UPPER_SNAKE_CASE`
- **Private members**: `_leading_underscore`
- **Protected members**: `__double_leading_underscore`

### Imports

- Use absolute imports within the project
- Group imports: standard library, third-party, local
- Use explicit imports, avoid `from module import *`

```python
# Standard library imports
import asyncio
import json
from pathlib import Path
from typing import Optional, List

# Third-party imports
import fastapi
from pydantic import BaseModel
import uvicorn

# Local imports
from backend.src.core.config import Config
from backend.src.services.llm import LLMService
```

### Error Handling

- Use custom exception classes that inherit from `Exception`
- Provide meaningful error messages
- Log errors appropriately
- Don't catch broad exceptions without good reason

```python
class ToolExecutionError(Exception):
    """Raised when tool execution fails."""
    pass

class ValidationError(Exception):
    """Raised when input validation fails."""
    pass

def execute_tool(tool_name: str, parameters: dict) -> Any:
    try:
        # Tool execution logic
        pass
    except ToolExecutionError as e:
        logger.error(f"Tool execution failed: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error in tool execution: {e}")
        raise ToolExecutionError(f"Tool {tool_name} failed: {e}")
```

### Async/Await

- Use async/await for all I/O operations
- Name async functions with `_async` suffix when needed for clarity
- Use `asyncio.gather()` for concurrent operations

```python
async def process_multiple_queries(queries: List[str]) -> List[dict]:
    """Process multiple queries concurrently."""
    tasks = [process_query_async(query) for query in queries]
    return await asyncio.gather(*tasks)
```

### Logging

- Use the standard `logging` module
- Configure appropriate log levels
- Include relevant context in log messages
- Use structured logging where possible

```python
import logging

logger = logging.getLogger(__name__)

def process_user_request(user_id: str, request: str) -> None:
    logger.info(f"Processing request for user {user_id}", extra={
        'user_id': user_id,
        'request_length': len(request)
    })
```

## JavaScript/TypeScript Standards

### Code Style

- Use modern ES6+ syntax
- Use 2 spaces for indentation
- Use semicolons
- Use single quotes for strings
- Use camelCase for variables and functions
- Use PascalCase for components and classes

### React Components

- Use functional components with hooks
- Use TypeScript for type safety
- Follow component composition patterns
- Keep components small and focused

```typescript
interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  onSendMessage,
  isLoading
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <div className="chat-interface">
      {/* Component JSX */}
    </div>
  );
};
```

### State Management

- Use React hooks for local state
- Consider context for shared state
- Avoid prop drilling with appropriate patterns

### Error Boundaries

- Implement error boundaries for React components
- Provide fallback UI for error states
- Log errors appropriately

## Documentation Standards

### README Files

- Include clear project description
- Provide installation and setup instructions
- Document API usage examples
- Include contribution guidelines

### Code Documentation

- Document all public APIs
- Include usage examples in docstrings
- Update documentation with code changes
- Use consistent formatting

### API Documentation

- Document all endpoints and parameters
- Include request/response examples
- Document error responses
- Keep API docs synchronized with code

## Testing Standards

### Test Structure

- Use descriptive test names that explain what they're testing
- Follow `Arrange-Act-Assert` pattern
- Test both success and failure scenarios
- Mock external dependencies

### Test Coverage

- Aim for >80% code coverage
- Test edge cases and error conditions
- Include integration tests for complex workflows
- Test async code properly

### Test Naming

```python
def test_calculate_similarity_with_identical_texts():
    # Test implementation

def test_calculate_similarity_with_different_texts():
    # Test implementation

def test_calculate_similarity_with_empty_text_raises_error():
    # Test implementation
```

## Git Standards

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance

### Branch Naming

- `feature/feature-name`: New features
- `fix/issue-description`: Bug fixes
- `docs/update-section`: Documentation updates
- `refactor/component-name`: Refactoring

## Code Review Guidelines

### Review Process

- Review code for correctness, performance, and security
- Check adherence to coding standards
- Verify tests are included and passing
- Ensure documentation is updated
- Consider edge cases and error handling

### Review Checklist

- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] No security vulnerabilities
- [ ] Performance considerations addressed
- [ ] Error handling is appropriate
- [ ] Code is maintainable and readable

### Review Comments

- Be constructive and specific
- Suggest improvements, don't just point out problems
- Explain reasoning for suggestions
- Acknowledge good practices

---

These standards ensure consistency, maintainability, and quality across the Personal Assistant codebase. All contributors are expected to follow these guidelines.
