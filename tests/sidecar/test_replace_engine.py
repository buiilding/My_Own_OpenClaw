from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.filesystem.replace_engine import (
    apply_operations,
    build_operations,
    build_patch_chunks,
)


def test_build_operations_uses_lenient_default_match_mode():
    operations, error = build_operations({"old_string": "alpha", "new_string": "beta"})

    assert error is None
    assert operations is not None
    assert len(operations) == 1
    assert operations[0].match_mode == "lenient"


def test_build_operations_propagates_top_level_match_mode_to_nested_replacements():
    operations, error = build_operations(
        {
            "match_mode": "strict",
            "replacements": [
                {"old_string": "alpha", "new_string": "ALPHA"},
                {"old_string": "beta", "new_string": "BETA"},
            ],
        }
    )

    assert error is None
    assert operations is not None
    assert [op.match_mode for op in operations] == ["strict", "strict"]


def test_build_operations_rejects_replace_all_with_occurrence_index():
    operations, error = build_operations(
        {
            "old_string": "x",
            "new_string": "y",
            "replace_all": True,
            "occurrence_index": 1,
        }
    )

    assert operations is None
    assert error == "occurrence_index cannot be combined with replace_all=true"


def test_build_patch_chunks_validates_non_empty_and_line_shapes():
    chunks, error = build_patch_chunks({"patch_chunks": []})
    assert chunks is None
    assert error == "patch_chunks must be a non-empty list when provided"

    chunks, error = build_patch_chunks(
        {
            "patch_chunks": [
                {"old_lines": ["a\nb"], "new_lines": ["c"]},
            ]
        }
    )
    assert chunks is None
    assert "must contain exactly one line" in (error or "")


def test_apply_operations_errors_when_multiple_matches_without_disambiguation():
    operations, error = build_operations({"old_string": "dup", "new_string": "new"})
    assert error is None
    assert operations is not None

    updated, replacements, spans, operation_payloads, apply_error = apply_operations(
        "dup\nx\ndup\n",
        operations,
    )

    assert updated == "dup\nx\ndup\n"
    assert replacements == 0
    assert spans == []
    assert operation_payloads == []
    assert "Multiple matches found" in (apply_error or "")


def test_apply_operations_occurrence_index_out_of_range_error():
    operations, error = build_operations(
        {"old_string": "x", "new_string": "z", "occurrence_index": 3}
    )
    assert error is None
    assert operations is not None

    _updated, _replacements, _spans, _operation_payloads, apply_error = apply_operations(
        "x\ny\nx\n",
        operations,
    )

    assert apply_error is not None
    assert "occurrence_index=3 is out of range for 2 match(es)." in apply_error
