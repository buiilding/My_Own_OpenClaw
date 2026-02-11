"""API contract seams for message and formatter registries.

This package is intentionally API-owned today. It provides a narrow adapter
surface that can later resolve contracts from a core-owned registry without
touching API handlers/routes/formatters.
"""

