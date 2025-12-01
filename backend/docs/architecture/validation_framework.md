# Validation Framework

This document provides comprehensive documentation for the Personal Assistant Backend validation framework, which provides centralized input validation, sanitization, and error handling across the entire system.

## Overview

The validation framework ensures data integrity, security, and consistency by providing:

- Pydantic-based schema validation for all inputs
- Structured error reporting with detailed field-level errors
- Input sanitization and normalization
- Type-safe validation with automatic type conversion
- Consistent validation patterns across API endpoints and services

## Core Components

### Validation System (`backend/src/core/validation.py`)

The central validation system provides utilities for validating data against Pydantic models.

#### Validation Error Handling

```python
from backend.src.core.validation import ValidationError, validate_message, validate_dict

class ValidationError(Exception):
    """Custom validation error with structured error information."""

    def __init__(self, message: str, errors: Optional[Dict[str, Any]] = None):
        self.message = message
        self.errors = errors or {}  # Field-specific errors
```

#### Message Validation

```python
# Validate WebSocket messages
from backend.src.api.schema import QueryMessage

def validate_message(
    data: Dict[str, Any],
    message_type: str,
    model_class: Type[T]
) -> T:
    """Validate a WebSocket message against a Pydantic model."""

# Usage
try:
    validated = validate_message(data, "query", QueryMessage)
    query_text = validated.payload.text
except ValidationError as e:
    # Structured error information
    logger.error(f"Validation failed: {e.message}")
    for field, error in e.errors.items():
        logger.error(f"  {field}: {error}")
```

#### Dictionary Validation

```python
# Validate arbitrary dictionaries
def validate_dict(
    data: Dict[str, Any],
    model_class: Type[T],
    context: Optional[str] = None
) -> T:
    """Validate a dictionary against a Pydantic model."""

# Usage
config_data = {"model": "gpt-4", "temperature": 0.7}
config = validate_dict(config_data, ModelConfig, "LLM configuration")
```

## Schema Definitions (`backend/src/api/schema.py`)

### Message Schemas

All WebSocket messages are validated against Pydantic schemas:

```python
from pydantic import BaseModel, Field
from typing import Optional

class MessagePayload(BaseModel):
    """Base payload structure."""
    pass

class QueryPayload(MessagePayload):
    """Query message payload."""
    text: str = Field(..., min_length=1, max_length=10000, description="User query text")

class QueryMessage(BaseModel):
    """Query message schema."""
    id: str = Field(..., description="Unique message identifier")
    type: str = Field("query", description="Message type")
    payload: QueryPayload
    user_id: Optional[str] = Field(None, description="User identifier")
```

### Validation Rules

#### Query Validation

```python
def validate_query_text(text: str) -> str:
    """
    Validate and sanitize query text.

    Args:
        text: Raw query text

    Returns:
        Sanitized query text

    Raises:
        ValidationError: If validation fails
    """
    if not text or not text.strip():
        raise ValidationError("Query text cannot be empty")

    sanitized = text.strip()

    # Length checks
    if len(sanitized) > 10000:
        raise ValidationError("Query text too long (max 10000 characters)")

    # Content checks
    if len(sanitized) < 1:
        raise ValidationError("Query text cannot be empty after sanitization")

    return sanitized
```

#### Settings Validation

```python
class SettingsPayload(MessagePayload):
    """Settings update payload."""
    selected_model_id: Optional[str] = Field(None, description="Selected model ID")
    max_history_length: Optional[int] = Field(None, ge=1, le=1000, description="Max conversation history")
    memory_enabled: Optional[bool] = Field(None, description="Enable memory system")
    tts_enabled: Optional[bool] = Field(None, description="Enable text-to-speech")
```

## Configuration Validation (`backend/src/core/config/models.py`)

### Application Configuration Schema

```python
from pydantic import BaseModel, Field, validator
from typing import Optional, List

class AppConfig(BaseModel):
    """Main application configuration schema."""

    # LLM Configuration
    selected_model_id: Optional[str] = Field(None, description="Currently selected model")
    model_provider: str = Field("openai", description="LLM provider")

    # System Configuration
    max_history_length: int = Field(100, ge=1, le=1000, description="Max conversation history")
    max_tool_execution_time: float = Field(30.0, ge=1, le=300, description="Max tool execution time")

    # Feature Flags
    memory_enabled: bool = Field(True, description="Enable memory system")
    tts_enabled: bool = Field(False, description="Enable text-to-speech")

    # Security Configuration
    security_enabled: bool = Field(True, description="Enable security features")
    max_file_size_mb: int = Field(10, ge=1, le=100, description="Max file size in MB")

    @validator('max_history_length')
    def validate_history_length(cls, v):
        if v < 1:
            raise ValueError('History length must be at least 1')
        if v > 1000:
            raise ValueError('History length cannot exceed 1000')
        return v

    @validator('selected_model_id')
    def validate_model_id(cls, v):
        if v and not v.strip():
            raise ValueError('Model ID cannot be empty')
        return v
```

### Provider-Specific Validation

```python
class OpenAIConfig(BaseModel):
    """OpenAI provider configuration."""
    api_key: str = Field(..., min_length=1, description="OpenAI API key")
    organization: Optional[str] = Field(None, description="OpenAI organization ID")
    base_url: str = Field("https://api.openai.com/v1", description="API base URL")

class AnthropicConfig(BaseModel):
    """Anthropic provider configuration."""
    api_key: str = Field(..., min_length=1, description="Anthropic API key")
    base_url: str = Field("https://api.anthropic.com", description="API base URL")
```

## Tool Validation (`backend/src/tools/validation/validator.py`)

### Tool Schema Validation

```python
from backend.src.tools.validation.validator import ToolValidator

class ToolValidator:
    """Validates tool definitions and parameters."""

    def validate_tool_definition(self, tool: SDKTool) -> List[str]:
        """Validate a tool definition."""

    def validate_tool_parameters(self, tool_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Validate tool parameters against schema."""

    def validate_tool_execution(self, tool: SDKTool, args: Dict[str, Any]) -> bool:
        """Validate tool can be executed with given arguments."""
```

### Parameter Validation

```python
# Example parameter validation
def validate_file_path(path: str) -> str:
    """Validate and normalize file path."""
    if not path:
        raise ValidationError("File path cannot be empty")

    # Resolve path and check existence
    resolved = Path(path).resolve()

    # Security checks
    if not resolved.exists():
        raise ValidationError(f"File does not exist: {path}")

    if not resolved.is_file():
        raise ValidationError(f"Path is not a file: {path}")

    return str(resolved)
```

## Error Handling Patterns

### Structured Error Responses

```python
# API error responses include validation details
{
  "type": "error",
  "id": "msg_123",
  "payload": {
    "message": "Validation failed for query message",
    "errors": {
      "payload.text": "String should have at least 1 character",
      "payload.max_length": "Input should be less than or equal to 10000"
    }
  }
}
```

### Validation in Handlers

```python
from backend.src.api.handlers.base import MessageHandler
from backend.src.core.validation import ValidationError, validate_message

class QueryHandler(MessageHandler):
    def validate_message(self, data: Dict[str, Any]) -> bool:
        try:
            validate_message(data, "query", QueryMessage)
            return True
        except ValidationError:
            return False

    async def handle(self, data: Dict[str, Any], websocket: WebSocket, user_id: str):
        try:
            validated = validate_message(data, "query", QueryMessage)
            # Process validated message
        except ValidationError as e:
            await self.send_error(websocket, data.get("id"), str(e))
```

## Security Validation

### Input Sanitization

```python
def sanitize_input(text: str) -> str:
    """Sanitize user input to prevent injection attacks."""
    # Remove potentially dangerous characters
    sanitized = re.sub(r'[<>]', '', text)

    # Normalize whitespace
    sanitized = ' '.join(sanitized.split())

    # Length limits
    if len(sanitized) > 10000:
        sanitized = sanitized[:10000]

    return sanitized
```

### Path Traversal Protection

```python
def validate_safe_path(base_path: str, requested_path: str) -> str:
    """Validate path is safe and within allowed directory."""
    base = Path(base_path).resolve()
    requested = (base / requested_path).resolve()

    # Ensure path is within base directory
    if not requested.is_relative_to(base):
        raise ValidationError("Path traversal detected")

    return str(requested)
```

## Testing Validation

### Validation Test Patterns

```python
import pytest
from backend.src.core.validation import ValidationError, validate_message

def test_query_validation():
    # Valid query
    valid_data = {
        "id": "test_123",
        "type": "query",
        "payload": {"text": "Hello world"}
    }
    validated = validate_message(valid_data, "query", QueryMessage)
    assert validated.payload.text == "Hello world"

def test_query_validation_empty_text():
    # Invalid query - empty text
    invalid_data = {
        "id": "test_123",
        "type": "query",
        "payload": {"text": ""}
    }
    with pytest.raises(ValidationError) as exc_info:
        validate_message(invalid_data, "query", QueryMessage)

    assert "text" in str(exc_info.value)
```

### Schema Testing

```python
def test_config_schema():
    # Valid configuration
    config_data = {
        "selected_model_id": "gpt-4",
        "max_history_length": 100,
        "memory_enabled": True
    }
    config = AppConfig(**config_data)
    assert config.selected_model_id == "gpt-4"

def test_config_validation():
    # Invalid configuration
    with pytest.raises(ValidationError):
        AppConfig(max_history_length=0)  # Too low

    with pytest.raises(ValidationError):
        AppConfig(max_history_length=2000)  # Too high
```

## Performance Considerations

### Validation Caching

```python
from functools import lru_cache

@lru_cache(maxsize=100)
def validate_cached_message(data_hash: str, data: Dict[str, Any]) -> Any:
    """Cache validation results for repeated messages."""
    return validate_message(data, "query", QueryMessage)
```

### Lazy Validation

```python
class LazyValidator:
    """Perform validation only when needed."""

    def __init__(self, data: Dict[str, Any]):
        self._data = data
        self._validated = None

    @property
    def validated(self):
        if self._validated is None:
            self._validated = validate_message(self._data, "query", QueryMessage)
        return self._validated
```

## Integration with Other Systems

### Database Validation

```python
# Validate before database operations
def create_user(user_data: Dict[str, Any]) -> User:
    validated = validate_dict(user_data, UserCreateSchema)
    return User.create(**validated.dict())
```

### API Response Validation

```python
# Validate API responses
def validate_llm_response(response: Dict[str, Any]) -> LLMResponse:
    return validate_dict(response, LLMResponseSchema, "LLM response")
```

### Configuration Validation

```python
# Validate configuration on startup
def load_and_validate_config(config_path: str) -> AppConfig:
    config_data = load_yaml(config_path)
    return validate_dict(config_data, AppConfig, "application configuration")
```

This validation framework ensures data integrity, security, and consistent error handling throughout the Personal Assistant Backend system.
