"""Tests for shared backend string normalization helpers."""

from backend.src.core.utils.string_normalization import normalize_non_empty_string


def test_normalize_non_empty_string_trims_and_rejects_empty_values():
    assert normalize_non_empty_string("  value  ") == "value"
    assert normalize_non_empty_string("   ") is None
    assert normalize_non_empty_string(None) is None
    assert normalize_non_empty_string(123) is None
