"""Compatibility exports for sidecar unicode sanitization helpers."""

from windie import _unicode_sanitizer

__all__ = [
    "find_surrogate_paths",
    "has_lone_surrogates",
    "repair_common_mojibake",
    "sanitize_surrogates",
    "sanitize_surrogates_in_text",
]

find_surrogate_paths = _unicode_sanitizer.find_surrogate_paths
has_lone_surrogates = _unicode_sanitizer.has_lone_surrogates
repair_common_mojibake = _unicode_sanitizer.repair_common_mojibake
sanitize_surrogates = _unicode_sanitizer.sanitize_surrogates
sanitize_surrogates_in_text = _unicode_sanitizer.sanitize_surrogates_in_text
