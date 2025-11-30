# Contributing Guide

Welcome! We appreciate your interest in contributing to the Personal Assistant Backend. This guide will help you get started with contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Tool Development](#tool-development)
- [Documentation](#documentation)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

This project follows a code of conduct to ensure a welcoming environment for all contributors:

- **Be respectful**: Treat all contributors with respect and kindness
- **Be collaborative**: Work together to improve the project
- **Be inclusive**: Welcome contributors from all backgrounds
- **Be patient**: Understand that everyone has different experience levels
- **Be constructive**: Focus on solutions, not problems

## Getting Started

### Prerequisites

Ensure you have the following installed:

- **Python 3.9+**: Check with `python --version`
- **Git**: For version control
- **Virtual Environment**: venv or conda for dependency management

### Setup

1. **Fork the repository** on GitHub
2. **Clone your fork**:
   ```bash
   git clone https://github.com/your-username/personal-assistant.git
   cd personal-assistant
   ```

3. **Create a virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # Linux/macOS
   # or
   venv\Scripts\activate     # Windows
   ```

4. **Install dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```

5. **Set up API keys** (for testing):
   ```bash
   export OPENAI_API_KEY="your-test-key"
   # or create a .env file
   ```

6. **Verify setup**:
   ```bash
   cd backend
   python -c "import backend.src.main; print('Setup successful')"
   ```

## Development Workflow

### Branching Strategy

We use a feature branch workflow:

```bash
# Create a feature branch
git checkout -b feature/your-feature-name

# Make your changes
# ... development work ...

# Keep your branch updated
git fetch origin
git rebase origin/main

# Push your changes
git push origin feature/your-feature-name
```

### Commit Convention

Follow conventional commits:

```bash
# Features
git commit -m "feat: add user authentication"

# Bug fixes
git commit -m "fix: resolve memory leak in tool execution"

# Documentation
git commit -m "docs: update API reference"

# Refactoring
git commit -m "refactor: simplify agent executor logic"

# Tests
git commit -m "test: add unit tests for tool registry"
```

### Pull Request Process

1. **Create a PR**: Push your branch and create a pull request
2. **Automated Checks**: CI runs tests, linting, and type checking
3. **Code Review**: At least one maintainer reviews your changes
4. **Address Feedback**: Make requested changes
5. **Merge**: PR is merged using squash merge

## Coding Standards

### Python Style Guide

Follow PEP 8 with these additional rules:

#### Type Hints Everywhere
```python
# Good
def process_data(data: Dict[str, Any]) -> Optional[str]:
    pass

# Bad
def process_data(data):
    pass
```

#### Dataclasses for Data Objects
```python
@dataclass
class UserContext:
    user_id: str
    username: Optional[str] = None
    permissions: List[str] = field(default_factory=list)
```

#### Async/Await Patterns
```python
# Good
async def process_query(self, query: str) -> AsyncGenerator[Dict, None]:
    async for chunk in self.llm_client.generate_stream(messages):
        yield chunk

# Bad - blocking operations
def process_query(self, query: str):
    result = requests.get(url)  # Blocks event loop
    return result
```

### Naming Conventions

```python
# Classes: PascalCase
class ToolRegistry:
    pass

# Functions/methods: snake_case
def register_tool(self, tool: Tool) -> None:
    pass

# Constants: UPPER_CASE
MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30

# Private members: leading underscore
def _validate_config(self, config: Dict) -> bool:
    pass
```

### Import Organization

```python
# Standard library
import asyncio
import logging
from typing import Dict, List, Optional

# Third-party packages
from fastapi import WebSocket
import pydantic

# Local imports
from backend.src.core.config import AppConfig
from backend.src.tools.registry import ToolRegistry

# Relative imports (within package)
from .interfaces import ToolInterface
from ..core.events import Event
```

### Error Handling

```python
class ToolExecutionError(Exception):
    """Raised when tool execution fails."""
    pass

async def execute_tool(self, tool: Tool, args: Dict) -> Any:
    try:
        result = await tool.run(args, self.context)
        return result
    except ValidationError as e:
        logger.error(f"Validation error in {tool.name}: {e}")
        raise ToolExecutionError(f"Invalid arguments: {e}") from e
    except PermissionError as e:
        logger.warning(f"Permission denied for {tool.name}: {e}")
        raise ToolExecutionError(f"Permission denied: {e}") from e
    except Exception as e:
        logger.error(f"Unexpected error in {tool.name}: {e}", exc_info=True)
        raise ToolExecutionError(f"Tool execution failed: {e}") from e
```

### Logging Standards

```python
import logging

logger = logging.getLogger(__name__)

class MyClass:
    def __init__(self):
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")

    async def my_method(self, param: str) -> None:
        self.logger.debug(f"Starting my_method with param: {param}")

        try:
            result = await self.do_work(param)
            self.logger.info(f"my_method completed successfully for {param}")
            return result
        except Exception as e:
            self.logger.error(f"my_method failed for {param}: {e}", exc_info=True)
            raise
```

## Testing

### Test Structure

```
tests/
├── backend/
│   ├── unit/                    # Unit tests
│   ├── integration/            # Integration tests
│   ├── e2e/                    # End-to-end tests
│   └── fixtures/               # Test fixtures
```

### Unit Testing

```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from backend.src.tools.registry import ToolRegistry

class TestToolRegistry:
    @pytest.fixture
    def registry(self):
        return ToolRegistry(config=MagicMock())

    @pytest.fixture
    def mock_tool(self):
        tool = MagicMock()
        tool.name = "test_tool"
        tool.get_json_schema.return_value = {"name": "test_tool"}
        return tool

    def test_register_tool(self, registry, mock_tool):
        """Test tool registration."""
        registry.register_tool(mock_tool)

        assert mock_tool.name in registry.tools
        assert registry.tools[mock_tool.name] is mock_tool

    @pytest.mark.asyncio
    async def test_execute_tool(self, registry, mock_tool):
        """Test tool execution."""
        mock_tool.run = AsyncMock(return_value={"success": True})

        registry.register_tool(mock_tool)
        result = await registry.execute_tool("test_tool", {})

        assert result["success"] is True
        mock_tool.run.assert_called_once()
```

### Integration Testing

```python
import pytest
from backend.src.core.container import ApplicationContainer

@pytest.mark.asyncio
class TestAgentIntegration:
    async def test_full_query_flow(self):
        """Test complete query processing flow."""
        container = ApplicationContainer()
        await container.initialize()

        agent = container.create_agent_session("test_user")

        responses = []
        async for response in agent.process_query("Hello"):
            responses.append(response)

        assert len(responses) > 0
        assert any(r.get("type") == "streaming-complete" for r in responses)
```

### Test Coverage

Aim for high test coverage:

```bash
# Run tests with coverage
pytest --cov=backend/src --cov-report=html --cov-report=term --cov-fail-under=80

# Generate coverage report
coverage html
```

### Property-Based Testing

```python
from hypothesis import given, strategies as st

class TestToolValidation:
    @given(st.text(min_size=1, max_size=1000))
    def test_query_validation(self, query: str):
        """Test query validation with various inputs."""
        try:
            validated = validate_query_text(query)
            assert isinstance(validated, str)
            assert len(validated) <= MAX_QUERY_LENGTH
        except ValidationError:
            # Invalid queries should raise ValidationError
            pass
```

## Submitting Changes

### Before Submitting

1. **Run Tests**: Ensure all tests pass
   ```bash
   pytest
   ```

2. **Check Code Quality**: Run linting and type checking
   ```bash
   mypy backend/src
   flake8 backend/src
   ```

3. **Update Documentation**: Update docs for any API changes
   - Update docstrings
   - Update API reference
   - Update configuration docs

4. **Check Formatting**: Code should be properly formatted
   ```bash
   black backend/src
   isort backend/src
   ```

### Pull Request Template

Use this template for pull requests:

```markdown
## Description
Brief description of the changes.

## Type of Change
- [ ] Bug fix (non-breaking change)
- [ ] New feature (non-breaking change)
- [ ] Breaking change
- [ ] Documentation update
- [ ] Refactoring

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed
- [ ] All tests pass

## Checklist
- [ ] Code follows project style guidelines
- [ ] Documentation updated
- [ ] No new linting errors
- [ ] Tests cover new functionality
- [ ] Backward compatibility maintained
```

## Tool Development

### Tool Creation Guidelines

1. **Single Responsibility**: Each tool should do one thing well
2. **Input Validation**: Use Pydantic models for all inputs
3. **Error Handling**: Provide clear, actionable error messages
4. **Documentation**: Include comprehensive docstrings and examples
5. **Testing**: Provide unit tests for all tools

### Tool Submission Process

1. **Create Tool**: Implement your tool following the SDK patterns
2. **Add Tests**: Create comprehensive unit tests
3. **Update Documentation**: Document usage and parameters
4. **Submit PR**: Follow the standard PR process
5. **Review**: Address maintainer feedback

### Tool Categories

Place tools in appropriate categories:

- `filesystem/`: File operations
- `system/`: System information and control
- `computer/`: UI automation and screenshots
- `web/`: Web browsing and scraping
- `custom/`: Specialized tools

## Documentation

### Documentation Standards

- Use Markdown for all documentation
- Include code examples where helpful
- Keep documentation up to date with code changes
- Use consistent formatting and style

### API Documentation

When adding new APIs:

1. Update API reference documentation
2. Include request/response examples
3. Document error conditions
4. Update WebSocket message types if applicable

### Code Documentation

```python
def complex_function(param1: str, param2: int) -> Dict[str, Any]:
    """
    Process data using advanced algorithms.

    This function performs complex data processing including validation,
    transformation, and analysis. It uses multiple algorithms to ensure
    data quality and consistency.

    Args:
        param1: The primary input data string. Must be non-empty and
               contain valid JSON.
        param2: Processing level from 1-10. Higher values mean more
               thorough processing but take longer.

    Returns:
        Dictionary containing:
        - processed_data: The transformed data
        - quality_score: Float between 0-1 indicating processing quality
        - processing_time: Time taken in seconds

    Raises:
        ValueError: If param1 is invalid JSON
        ProcessingError: If processing fails for any reason

    Example:
        >>> result = complex_function('{"key": "value"}', 5)
        >>> result['quality_score'] > 0.8
        True
    """
    pass
```

## Reporting Issues

### Bug Reports

When reporting bugs, include:

1. **Clear Title**: Describe the issue concisely
2. **Steps to Reproduce**: Detailed steps to reproduce the bug
3. **Expected Behavior**: What should happen
4. **Actual Behavior**: What actually happens
5. **Environment**: OS, Python version, relevant versions
6. **Logs**: Relevant log output (remove sensitive information)
7. **Screenshots**: If applicable

### Feature Requests

When requesting features:

1. **Clear Description**: What feature do you want?
2. **Use Case**: Why do you need this feature?
3. **Implementation Ideas**: How might this be implemented?
4. **Alternatives**: Have you considered alternatives?

### Security Issues

For security-related issues:

- **DO NOT** create public GitHub issues
- Email maintainers directly
- Include detailed reproduction steps
- Allow time for fix before public disclosure

## Getting Help

### Communication Channels

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Pull Request Comments**: For code review discussions

### Response Times

- **Bug Reports**: Acknowledged within 24 hours
- **Feature Requests**: Initial response within 1 week
- **Pull Requests**: Initial review within 3-5 business days

### Community Guidelines

- Be patient and respectful
- Provide context and background
- Include code examples when possible
- Follow up on your own issues
- Help others when you can

## Recognition

Contributors are recognized in several ways:

- **GitHub Contributors**: Listed in repository contributors
- **Changelog**: Mentioned in release changelogs
- **Documentation**: Credited in relevant documentation
- **Community**: Acknowledged in community discussions

## License

By contributing to this project, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).

---

Thank you for contributing to the Personal Assistant Backend! Your contributions help make this project better for everyone.
