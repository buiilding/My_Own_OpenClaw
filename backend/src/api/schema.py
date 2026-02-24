"""Backward-compatible API schema re-exports.

New code should import from ``backend.src.api.schemas`` modules.
This module remains as the stable import path for existing call-sites.
"""

from backend.src.api import schemas as _schemas

for _schema_name in _schemas.__all__:
    globals()[_schema_name] = getattr(_schemas, _schema_name)

__all__ = _schemas.__all__
