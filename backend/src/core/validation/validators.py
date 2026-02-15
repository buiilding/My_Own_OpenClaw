"""
Centralized Validation Framework for the Desktop Assistant.

Provides Pydantic-based validation for all API inputs with consistent error handling.
"""

import logging
from typing import Any, Callable, Dict, Literal, Optional, Type, TypeVar
from pydantic import BaseModel, ConfigDict, ValidationError as PydanticValidationError
from backend.src.core.config import AppConfig

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class FrontendConfigPatch(BaseModel):
    """
    Typed frontend-owned runtime settings patch.

    Extra keys are ignored after warning in validate_frontend_config.
    """

    model_config = ConfigDict(
        extra="ignore",
        protected_namespaces=(),
    )

    model_mode: Optional[Literal["local", "online"]] = None
    model_provider: Optional[str] = None
    selected_model_id: Optional[str] = None
    interaction_mode: Optional[Literal["chat", "agent"]] = None
    voice_mode_enabled: Optional[bool] = None
    speech_mode_enabled: Optional[bool] = None
    include_query_screenshot: Optional[bool] = None


class ValidationError(Exception):
    """Custom validation error with structured error information."""

    def __init__(self, message: str, errors: Optional[Dict[str, Any]] = None):
        """
        Initialize validation error.

        Args:
            message: Human-readable error message
            errors: Dictionary of field-specific errors
        """
        super().__init__(message)
        self.message = message
        self.errors = errors or {}


def validate_message(
    data: Dict[str, Any], message_type: str, model_class: Type[T]
) -> T:
    """
    Validate a WebSocket message against a Pydantic model.

    Args:
        data: Raw message data dictionary
        message_type: Type of message (for error messages)
        model_class: Pydantic model class to validate against

    Returns:
        Validated model instance

    Raises:
        ValidationError: If validation fails
    """
    try:
        return model_class(**data)
    except PydanticValidationError as e:
        error_details = {}
        for error in e.errors():
            field = ".".join(str(loc) for loc in error["loc"])
            error_details[field] = error["msg"]

        error_message = f"Validation failed for {message_type} message"
        logger.warning(f"{error_message}: {error_details}")
        raise ValidationError(error_message, errors=error_details) from e
    except Exception as e:
        error_message = f"Unexpected error validating {message_type} message: {str(e)}"
        logger.error(error_message, exc_info=True)
        raise ValidationError(error_message) from e


def validate_dict(
    data: Dict[str, Any], model_class: Type[T], context: Optional[str] = None
) -> T:
    """
    Validate a dictionary against a Pydantic model.

    Args:
        data: Dictionary to validate
        model_class: Pydantic model class to validate against
        context: Optional context string for error messages

    Returns:
        Validated model instance

    Raises:
        ValidationError: If validation fails
    """
    try:
        return model_class(**data)
    except PydanticValidationError as e:
        error_details = {}
        for error in e.errors():
            field = ".".join(str(loc) for loc in error["loc"])
            error_details[field] = error["msg"]

        context_str = f" ({context})" if context else ""
        error_message = f"Validation failed{context_str}"
        logger.warning(f"{error_message}: {error_details}")
        raise ValidationError(error_message, errors=error_details) from e
    except Exception as e:
        context_str = f" ({context})" if context else ""
        error_message = f"Unexpected error during validation{context_str}: {str(e)}"
        logger.error(error_message, exc_info=True)
        raise ValidationError(error_message) from e


def validate_field(
    value: Any,
    field_name: str,
    expected_type: Type,
    required: bool = True,
    validator: Optional[Callable[[Any], Any]] = None,
) -> Any:
    """
    Validate a single field value.

    Args:
        value: Value to validate
        field_name: Name of the field (for error messages)
        expected_type: Expected Python type
        required: Whether the field is required
        validator: Optional custom validator function

    Returns:
        Validated value

    Raises:
        ValidationError: If validation fails
    """
    if value is None:
        if required:
            raise ValidationError(f"Field '{field_name}' is required")
        return None

    if not isinstance(value, expected_type):
        raise ValidationError(
            f"Field '{field_name}' must be of type {expected_type.__name__}, "
            f"got {type(value).__name__}"
        )

    if validator:
        try:
            value = validator(value)
        except Exception as e:
            raise ValidationError(
                f"Validation failed for field '{field_name}': {str(e)}"
            ) from e

    return value


def sanitize_string(value: Any, max_length: int = 10000) -> str:
    """
    Sanitize a string value.

    Args:
        value: Value to sanitize
        max_length: Maximum allowed length

    Returns:
        Sanitized string

    Raises:
        ValidationError: If value cannot be sanitized
    """
    if not isinstance(value, str):
        value = str(value)

    # Remove null bytes
    value = value.replace("\x00", "")

    # Truncate if too long
    if len(value) > max_length:
        logger.warning(f"String truncated from {len(value)} to {max_length} characters")
        value = value[:max_length]

    return value


def validate_query_text(text: str) -> str:
    """
    Validate query text input.

    Args:
        text: Query text to validate

    Returns:
        Validated and sanitized query text

    Raises:
        ValidationError: If validation fails
    """
    if not isinstance(text, str):
        raise ValidationError("Query text must be a string")

    text = sanitize_string(text, max_length=50000)  # Allow longer queries

    if not text.strip():
        raise ValidationError("Query text cannot be empty")

    return text.strip()


def validate_user_id(user_id: str) -> str:
    """
    Validate user_id to reject empty strings, whitespace-only, and 'default_user'.

    This is a shared utility to ensure consistent security enforcement across
    all endpoints that accept user_id. Prevents security bypass and invalid state propagation.

    Args:
        user_id: User ID to validate

    Returns:
        Validated and stripped user_id

    Raises:
        ValidationError: If user_id is invalid
    """
    if not user_id or not user_id.strip() or user_id == "default_user":
        raise ValidationError(
            "user_id cannot be empty, whitespace-only, or 'default_user'"
        )
    return user_id.strip()


def validate_settings_update(settings: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate settings update payload.

    Args:
        settings: Settings dictionary to validate

    Returns:
        Validated settings dictionary

    Raises:
        ValidationError: If validation fails
    """
    if not isinstance(settings, dict):
        raise ValidationError("Settings must be a dictionary")

    # Validate common settings fields
    # Dynamically get allowed fields from AppConfig to ensure we support all config options
    allowed_fields = set(AppConfig.model_fields.keys())

    validated = {}
    for key, value in settings.items():
        if key not in allowed_fields:
            logger.warning(f"Unknown settings field: {key}")
            continue

        # Type validation for common fields
        # For other fields, we rely on AppConfig validation downstream
        if key == "max_history_length":
            validate_field(value, key, int, required=False)
        elif key in ("llm_timeout", "query_timeout"):
            validate_field(value, key, (int, float), required=False)
        elif key == "memory_enabled":
            validate_field(value, key, bool, required=False)
        elif key in (
            "model_provider",
            "selected_model_id",
            "model_mode",
            "embedding_model",
            "interaction_mode",
        ):
            if value is not None:  # Some string fields can be None
                validate_field(value, key, str, required=False)
        elif key == "voice_mode_enabled":
            validate_field(value, key, bool, required=False)

        validated[key] = value

    return validated


# Frontend-owned config fields derived from FrontendConfigPatch schema.
FRONTEND_CONFIG_FIELDS = set(FrontendConfigPatch.model_fields.keys())


def validate_frontend_config(settings: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Validate and filter frontend-provided config overrides.

    Only allows the subset of fields that the frontend owns.

    Args:
        settings: Raw config dictionary from frontend

    Returns:
        Validated config dictionary containing only allowed keys

    Raises:
        ValidationError: If validation fails
    """
    if settings is None:
        return {}
    if not isinstance(settings, dict):
        raise ValidationError("Config must be a dictionary")

    unknown = sorted(set(settings.keys()) - FRONTEND_CONFIG_FIELDS)
    for key in unknown:
        logger.warning(f"Ignoring non-frontend config field: {key}")

    try:
        patch = FrontendConfigPatch.model_validate(settings)
    except PydanticValidationError as e:
        error_details = "; ".join(
            f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}"
            for err in e.errors()
        )
        raise ValidationError(f"Invalid frontend config patch: {error_details}") from e

    return patch.model_dump(exclude_unset=True)
