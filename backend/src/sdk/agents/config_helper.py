"""
Configuration Helper for Agent SDK.

Provides utilities for modifying AppConfig instances, particularly for
overriding model_id for sub-agents.
"""
import copy
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.core.config.models import AppConfig


def override_model_id(config: "AppConfig", model_id: str) -> "AppConfig":
    """
    Create a copy of AppConfig with selected_model_id overridden.
    
    This is a pure function - it does not modify the original config.
    
    Args:
        config: The original AppConfig instance
        model_id: The new model_id to use
        
    Returns:
        A new AppConfig instance with selected_model_id set to model_id
    """
    # Create a deep copy of the config dict
    config_dict = config.model_dump()
    
    # Override selected_model_id
    config_dict["selected_model_id"] = model_id
    
    # Create new AppConfig instance from modified dict
    # Use model_validate to ensure proper validation
    return config.__class__.model_validate(config_dict)

