# Contributing to Personal Assistant

Welcome! We're excited that you're interested in contributing to the Personal Assistant project. This document provides guidelines and information for contributors.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)
- [Community Guidelines](#community-guidelines)

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js 18+ (for frontend development)
- Git
- Virtual environment tool (venv, conda, etc.)

### Setup

1. **Fork the repository** on GitHub
2. **Clone your fork**:
   ```bash
   git clone https://github.com/yourusername/personal-assistant.git
   cd personal-assistant
   ```

3. **Create a virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

4. **Install dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   cd frontend && npm install && cd ..
   ```

5. **Set up pre-commit hooks**:
   ```bash
   pre-commit install
   ```

### First Contribution

Look for issues labeled `good-first-issue` or `help-wanted`. These are great starting points for new contributors.

## Development Workflow

### Branch Naming

- Use descriptive branch names: `feature/add-voice-commands`, `fix/memory-leak`, `docs/update-api-reference`
- Base feature branches on `main`
- Keep branches focused on single changes

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
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat: add voice command processing
fix: resolve memory leak in tool execution
docs: update API reference for new endpoints
```

### Development Process

1. **Create a branch** for your changes
2. **Make your changes** following our code standards
3. **Write tests** for new functionality
4. **Run the test suite** to ensure everything works
5. **Update documentation** if needed
6. **Commit your changes** with descriptive messages
7. **Push to your fork** and create a pull request

## Code Standards

### Python Code

- Follow PEP 8 style guidelines
- Use type hints for all function parameters and return values
- Write docstrings for all public functions and classes
- Use descriptive variable names
- Keep functions small and focused (single responsibility)
- Use async/await for I/O operations

### JavaScript/React Code

- Use modern ES6+ syntax
- Follow React best practices
- Use TypeScript for type safety
- Write meaningful component and function names
- Keep components small and reusable

### General Guidelines

- Write self-documenting code
- Add comments for complex logic
- Use consistent naming conventions
- Follow the existing code patterns in the codebase
- Keep the codebase clean and maintainable

## Testing

### Running Tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

### Test Coverage

- Aim for high test coverage (>80%)
- Write unit tests for all new functions
- Write integration tests for complex workflows
- Test edge cases and error conditions

### Test Structure

- Use descriptive test names
- Follow the `Arrange-Act-Assert` pattern
- Mock external dependencies
- Test both success and failure scenarios

## Submitting Changes

### Pull Request Process

1. **Ensure your code passes all tests**
2. **Update documentation** for any changes
3. **Write a clear PR description** including:
   - What changes were made
   - Why the changes were needed
   - How to test the changes
   - Any breaking changes

4. **Request review** from maintainers
5. **Address feedback** and make necessary changes
6. **Wait for approval** before merging

### PR Template

Use this template for your pull requests:

```markdown
## Description
Brief description of the changes made.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Refactoring
- [ ] Test addition

## Testing
Describe how the changes were tested.

## Screenshots (if applicable)
Add screenshots for UI changes.

## Checklist
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Code follows style guidelines
- [ ] Commit messages are clear
```

## Reporting Issues

### Bug Reports

When reporting bugs, please include:

- **Clear title** describing the issue
- **Steps to reproduce** the problem
- **Expected behavior** vs actual behavior
- **Environment details** (OS, Python version, etc.)
- **Logs or error messages**
- **Screenshots** if applicable

### Feature Requests

For feature requests, please:

- **Describe the problem** you're trying to solve
- **Explain your proposed solution**
- **Consider alternative approaches**
- **Discuss potential impacts**

## Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help newcomers learn and contribute
- Maintain professional communication

### Getting Help

- Check existing issues and documentation first
- Ask questions in GitHub Discussions
- Join our community chat (when available)

### Recognition

Contributors are recognized through:
- GitHub contributor statistics
- Mention in release notes for significant contributions
- Community acknowledgments

## Development Resources

- **[Developer Guide](backend/docs/DEVELOPER_GUIDE.md)** - Complete development setup
- **[API Reference](backend/docs/api_reference.md)** - Technical API documentation
- **[Architecture Overview](backend/docs/architecture.md)** - System design principles
- **[Testing Guide](backend/docs/testing_guide.md)** - Testing best practices
- **[Tool Development Guide](backend/docs/tool_development.md)** - Creating marketplace tools

Thank you for contributing to the Personal Assistant project! 🚀
