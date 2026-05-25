import pytest
from pydantic import ValidationError

from backend.src.tools.filesystem.schemas import ReplaceArgs


EXPLANATION = "Update the requested file content."


def test_replace_args_accepts_legacy_single_operation_mode():
    args = ReplaceArgs(
        file_path="/tmp/example.txt",
        old_string="before",
        new_string="after",
        explanation=EXPLANATION,
    )

    assert args.old_string == "before"
    assert args.new_string == "after"


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
            "old_string and new_string are both required",
        ),
        (
            {"new_string": "after"},
            "old_string and new_string are both required",
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
            "exactly one edit mode",
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
            "exactly one edit mode",
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
