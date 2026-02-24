"""Shared snapshot scope field aliases for browser schemas."""

from typing import Annotated, Literal, Optional

from pydantic import Field

SnapshotRefsField = Annotated[
    Optional[Literal["role", "aria"]],
    Field(None, description="Reference mode for role snapshots."),
]
SnapshotInteractiveField = Annotated[
    Optional[bool],
    Field(None, description="Only include interactive roles in role snapshot output."),
]
SnapshotCompactField = Annotated[
    Optional[bool],
    Field(None, description="Prune structural noise from role snapshot output."),
]
SnapshotDepthField = Annotated[
    Optional[int],
    Field(
        None,
        description="Maximum role snapshot depth (0=root only).",
        ge=0,
        le=20,
    ),
]
SnapshotSelectorField = Annotated[
    Optional[str],
    Field(None, description="Optional CSS selector scope for role snapshots."),
]
SnapshotFrameField = Annotated[
    Optional[str],
    Field(None, description="Optional iframe selector scope for role snapshots."),
]
