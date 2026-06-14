"""Covers filesystem tool schemas behavior in the backend test suite."""

import pytest
from pydantic import ValidationError

from backend.src.tools.filesystem.schemas import ReplaceArgs

EXPLANATION = "Update the requested file content."


def test_replace_args_accepts_single_replacement_operation():
    args = ReplaceArgs(
        file_path="/tmp/example.txt",
        replacements=[{"old_string": "before", "new_string": "after"}],
        explanation=EXPLANATION,
    )

    assert len(args.replacements or []) == 1
    assert args.replacements[0].old_string == "before"
    assert args.replacements[0].new_string == "after"


def test_replace_args_accepts_batched_replacements_mode():
    args = ReplaceArgs(
        file_path="/tmp/example.txt",
        replacements=[
            {
                "old_string": "before",
                "new_string": "after",
            }
        ],
        explanation=EXPLANATION,
    )

    assert len(args.replacements or []) == 1


def test_replace_args_accepts_patch_chunks_mode():
    args = ReplaceArgs(
        file_path="/tmp/example.txt",
        patch_chunks=[
            {
                "old_lines": ["before"],
                "new_lines": ["after"],
            }
        ],
        explanation=EXPLANATION,
    )

    assert len(args.patch_chunks or []) == 1


@pytest.mark.parametrize(
    "payload, expected_error",
    [
        (
            {"old_string": "before"},
            "Extra inputs are not permitted",
        ),
        (
            {"new_string": "after"},
            "Extra inputs are not permitted",
        ),
        (
            {
                "patch_chunks": [{"old_lines": ["before"], "new_lines": ["after"]}],
                "replacements": [{"old_string": "before", "new_string": "after"}],
            },
            "exactly one edit mode",
        ),
        (
            {
                "patch_chunks": [{"old_lines": ["before"], "new_lines": ["after"]}],
                "old_string": "before",
                "new_string": "after",
            },
            "Extra inputs are not permitted",
        ),
        (
            {"replacements": []},
            "replacements must be a non-empty list",
        ),
        (
            {"patch_chunks": []},
            "patch_chunks must be a non-empty list",
        ),
        (
            {},
            "replace requires exactly one edit mode",
        ),
    ],
)
def test_replace_args_rejects_ambiguous_or_missing_edit_modes(
    payload,
    expected_error,
):
    with pytest.raises(ValidationError, match=expected_error):
        ReplaceArgs(
            file_path="/tmp/example.txt",
            explanation=EXPLANATION,
            **payload,
        )
