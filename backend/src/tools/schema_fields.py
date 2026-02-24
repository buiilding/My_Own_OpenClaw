"""Shared Pydantic Field helpers for tool argument schemas."""

from pydantic import Field

EXPLANATION_FIELD_DESCRIPTION = (
    "One sentence explanation as to why this tool is being used, "
    "and how it contributes to the goal."
)
POST_ACTION_WAIT_DESCRIPTION = (
    "Delay in seconds before automatic post-action screenshot capture."
)


def explanation_field():
    """Required explanation field used by tool argument schemas."""
    return Field(
        ...,
        description=EXPLANATION_FIELD_DESCRIPTION,
    )


def post_action_wait_field(default: float = 0.0):
    """Optional pre-capture delay field used by interactive tools."""
    return Field(
        default,
        description=POST_ACTION_WAIT_DESCRIPTION,
    )
