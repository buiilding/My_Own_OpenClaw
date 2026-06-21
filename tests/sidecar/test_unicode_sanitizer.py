"""Covers local-runtime Unicode sanitizer behavior."""

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from windie._unicode_sanitizer import (  # noqa: E402
    find_surrogate_paths,
    has_lone_surrogates,
    repair_common_mojibake,
    sanitize_surrogates,
)


def test_has_lone_surrogates_detects_invalid_codepoint():
    assert has_lone_surrogates("ok\udc9dtext") is True
    assert has_lone_surrogates("ok text") is False


def test_find_surrogate_paths_reports_nested_fields():
    paths = find_surrogate_paths(
        {
            "top": "clean",
            "nested": {
                "title": "bad\udc9dtitle",
                "items": ["ok", "bad\udc9ditem"],
            },
        },
        root="payload",
    )

    assert "payload.nested.title" in paths
    assert "payload.nested.items[1]" in paths


def test_sanitize_surrogates_recursively_replaces_invalid_codepoints():
    sanitized = sanitize_surrogates(
        {
            "title": "bad\udc9dtitle",
            "items": ["ok", "bad\udc9ditem"],
        }
    )

    assert sanitized == {
        "title": "bad�title",
        "items": ["ok", "bad�item"],
    }


def test_repair_common_mojibake_repairs_quotes_and_dash():
    repaired = repair_common_mojibake("Active: â€œProject Alpha â€” READMEâ€\u009d")
    assert repaired == "Active: “Project Alpha — README”"
