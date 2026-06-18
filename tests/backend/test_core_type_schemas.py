"""Tests for backend core TypedDict schema surface."""

from backend.src.core.types import schemas


def test_core_type_schemas_do_not_expose_removed_generic_dict_aliases():
    removed_names = {
        "ToolResultDict",
        "ProviderConfigDict",
        "MemoryItem",
        "EpisodicMemory",
        "WebSocketMessage",
        "ToolParameterSchema",
    }

    assert removed_names.isdisjoint(dir(schemas))
