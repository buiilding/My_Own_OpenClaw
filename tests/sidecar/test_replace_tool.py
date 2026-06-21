"""Covers local-runtime replace tool behavior."""

import json
from pathlib import Path

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.filesystem.replace_tool import replace  # noqa: E402


def _single_replace_payload(file_path: str, **operation):
    return {"file_path": file_path, "replacements": [operation]}


def _write_workspace_permission_state(path: Path, workspace: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "version": 1,
                "permissions": {
                    "filesystem_workspace_access": {
                        "granted": True,
                        "selected_paths": [str(workspace)],
                    }
                },
            }
        ),
        encoding="utf-8",
    )


@pytest.mark.asyncio
async def test_replace_resolves_relative_path_from_selected_workspace(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    workspace_dir = tmp_path / "workspace"
    nested_dir = workspace_dir / "frontend" / "src" / "main"
    nested_dir.mkdir(parents=True)
    target = nested_dir / "index.cjs"
    target.write_text("console.log('before');\n", encoding="utf-8")
    permission_state_path = tmp_path / "permission-state.json"
    _write_workspace_permission_state(permission_state_path, workspace_dir)
    monkeypatch.setenv("WINDIE_PERMISSION_STATE_PATH", str(permission_state_path))

    result = await replace(
        _single_replace_payload(
            "frontend/src/main/index.cjs",
            old_string="before",
            new_string="after",
        )
    )

    assert result.success is True
    assert target.read_text(encoding="utf-8") == "console.log('after');\n"
    assert "Successfully modified file:" in result.data["output"]
    assert str(target) in result.data["output"]


@pytest.mark.asyncio
async def test_replace_reports_original_relative_path_when_missing(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    workspace_dir = tmp_path / "workspace"
    workspace_dir.mkdir()
    permission_state_path = tmp_path / "permission-state.json"
    _write_workspace_permission_state(permission_state_path, workspace_dir)
    monkeypatch.setenv("WINDIE_PERMISSION_STATE_PATH", str(permission_state_path))

    result = await replace(
        _single_replace_payload(
            "frontend/src/main/missing.cjs",
            old_string="before",
            new_string="after",
        )
    )

    assert result.success is False
    assert result.error == (
        f"File does not exist: frontend/src/main/missing.cjs "
        f"(resolved to {workspace_dir / 'frontend' / 'src' / 'main' / 'missing.cjs'}). "
        "To create a file, provide exactly one replacement with old_string='' and no context constraints."
    )


@pytest.mark.asyncio
async def test_replace_single_unique_match(tmp_path: Path):
    target = tmp_path / "example.txt"
    target.write_text("line1\nline2\nline3\n", encoding="utf-8")

    result = await replace(
        _single_replace_payload(
            str(target),
            old_string="line2",
            new_string="changed",
            replace_all=False,
        )
    )

    assert result.success is True
    assert result.data["replacements"] == 1
    assert target.read_text(encoding="utf-8") == "line1\nchanged\nline3\n"
    assert isinstance(result.data.get("unified_diff"), str)
    assert result.data.get("matched_spans")


@pytest.mark.asyncio
async def test_replace_rejects_oversized_new_string_payload(tmp_path: Path):
    target = tmp_path / "oversized.txt"
    target.write_text("hello\n", encoding="utf-8")

    result = await replace(
        _single_replace_payload(
            str(target),
            old_string="hello",
            new_string="x" * (16 * 1024 + 1),
        )
    )

    assert result.success is False
    assert result.error == (
        "Payload too large for one replace call; split into multiple "
        "replace/apply_patch calls."
    )
    assert target.read_text(encoding="utf-8") == "hello\n"


@pytest.mark.asyncio
async def test_replace_rejects_multiple_matches_without_replace_all(tmp_path: Path):
    target = tmp_path / "duplicate.txt"
    target.write_text("dup\nx\ndup\n", encoding="utf-8")

    result = await replace(
        _single_replace_payload(
            str(target),
            old_string="dup",
            new_string="new",
            replace_all=False,
        )
    )

    assert result.success is False
    assert "Multiple matches found" in (result.error or "")
    assert target.read_text(encoding="utf-8") == "dup\nx\ndup\n"


@pytest.mark.asyncio
async def test_replace_all_replaces_all_matches(tmp_path: Path):
    target = tmp_path / "duplicate.txt"
    target.write_text("dup\nx\ndup\n", encoding="utf-8")

    result = await replace(
        _single_replace_payload(
            str(target),
            old_string="dup",
            new_string="new",
            replace_all=True,
        )
    )

    assert result.success is True
    assert result.data["replacements"] == 2
    assert target.read_text(encoding="utf-8") == "new\nx\nnew\n"


@pytest.mark.asyncio
async def test_replace_uses_line_fallback_for_trailing_whitespace_mismatch(
    tmp_path: Path,
):
    target = tmp_path / "whitespace.txt"
    target.write_text("alpha\ntarget value\nomega\n", encoding="utf-8")

    result = await replace(
        _single_replace_payload(
            str(target),
            old_string="target value   ",
            new_string="updated",
            replace_all=False,
        )
    )

    assert result.success is True
    assert result.data["replacements"] == 1
    assert target.read_text(encoding="utf-8") == "alpha\nupdated\nomega\n"


@pytest.mark.asyncio
async def test_replace_strict_mode_disables_lenient_line_fallback(tmp_path: Path):
    target = tmp_path / "strict.txt"
    target.write_text("alpha\ntarget value\nomega\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "match_mode": "strict",
            "replacements": [
                {"old_string": "target value   ", "new_string": "updated"}
            ],
        }
    )

    assert result.success is False
    assert "could not find the string" in (result.error or "").lower()
    assert target.read_text(encoding="utf-8") == "alpha\ntarget value\nomega\n"


@pytest.mark.asyncio
async def test_replace_uses_line_fallback_for_unicode_dash_mismatch(tmp_path: Path):
    target = tmp_path / "unicode.txt"
    target.write_text(
        "import asyncio  # local import \u2013 avoids top\u2011level dep\n",
        encoding="utf-8",
    )

    result = await replace(
        _single_replace_payload(
            str(target),
            old_string="import asyncio  # local import - avoids top-level dep",
            new_string="import asyncio  # HELLO",
            replace_all=False,
        )
    )

    assert result.success is True
    assert result.data["replacements"] == 1
    assert target.read_text(encoding="utf-8") == "import asyncio  # HELLO\n"


@pytest.mark.asyncio
async def test_replace_before_after_context_disambiguates_matches(tmp_path: Path):
    target = tmp_path / "context.txt"
    target.write_text(
        "before-A target after\nbefore-B target after\n", encoding="utf-8"
    )

    result = await replace(
        _single_replace_payload(
            str(target),
            old_string="target",
            new_string="UPDATED",
            before_context="before-B ",
            after_context=" after",
        )
    )

    assert result.success is True
    assert result.data["replacements"] == 1
    assert (
        target.read_text(encoding="utf-8")
        == "before-A target after\nbefore-B UPDATED after\n"
    )


@pytest.mark.asyncio
async def test_replace_lenient_before_context_allows_whitespace_and_unicode_variants(
    tmp_path: Path,
):
    target = tmp_path / "context-lenient-before.txt"
    target.write_text(
        "header \u2013 one\nheader two   \ntarget\ntail\n", encoding="utf-8"
    )

    result = await replace(
        _single_replace_payload(
            str(target),
            old_string="target\n",
            new_string="TARGET\n",
            before_context="header - one\nheader two\n",
        )
    )

    assert result.success is True
    assert result.data["replacements"] == 1
    assert (
        target.read_text(encoding="utf-8")
        == "header \u2013 one\nheader two   \nTARGET\ntail\n"
    )


@pytest.mark.asyncio
async def test_replace_lenient_after_context_allows_whitespace_variants(tmp_path: Path):
    target = tmp_path / "context-lenient-after.txt"
    target.write_text("start\ntarget\nafter line   \nfinish\n", encoding="utf-8")

    result = await replace(
        _single_replace_payload(
            str(target),
            old_string="target\n",
            new_string="UPDATED\n",
            after_context="after line\nfinish\n",
        )
    )

    assert result.success is True
    assert result.data["replacements"] == 1
    assert (
        target.read_text(encoding="utf-8") == "start\nUPDATED\nafter line   \nfinish\n"
    )


@pytest.mark.asyncio
async def test_replace_occurrence_index_targets_specific_match(tmp_path: Path):
    target = tmp_path / "occurrence.txt"
    target.write_text("x\ny\nx\n", encoding="utf-8")

    result = await replace(
        _single_replace_payload(
            str(target),
            old_string="x",
            new_string="z",
            occurrence_index=2,
        )
    )

    assert result.success is True
    assert result.data["replacements"] == 1
    assert target.read_text(encoding="utf-8") == "x\ny\nz\n"


@pytest.mark.asyncio
async def test_replace_require_eof_targets_tail_match_only(tmp_path: Path):
    target = tmp_path / "eof.txt"
    target.write_text("tail\nmiddle\ntail\n", encoding="utf-8")

    result = await replace(
        _single_replace_payload(
            str(target),
            old_string="tail",
            new_string="tail-updated",
            require_eof=True,
        )
    )

    assert result.success is True
    assert result.data["replacements"] == 1
    assert target.read_text(encoding="utf-8") == "tail\nmiddle\ntail-updated\n"


@pytest.mark.asyncio
async def test_replace_disallows_empty_old_string_for_existing_file(tmp_path: Path):
    target = tmp_path / "existing.txt"
    target.write_text("existing content\n", encoding="utf-8")

    result = await replace(
        _single_replace_payload(
            str(target),
            old_string="",
            new_string="new content",
            replace_all=False,
        )
    )

    assert result.success is False
    assert "old_string cannot be empty" in (result.error or "")
    assert target.read_text(encoding="utf-8") == "existing content\n"


@pytest.mark.asyncio
async def test_replace_batch_applies_atomically_with_structured_output(tmp_path: Path):
    target = tmp_path / "batch.txt"
    target.write_text("alpha\nbeta\ngamma\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "replacements": [
                {
                    "old_string": "alpha",
                    "new_string": "ALPHA",
                },
                {
                    "old_string": "gamma",
                    "new_string": "GAMMA",
                },
            ],
            "match_mode": "strict",
        }
    )

    assert result.success is True
    assert result.data["replacements"] == 2
    assert len(result.data["operations"]) == 2
    assert isinstance(result.data["unified_diff"], str)
    assert target.read_text(encoding="utf-8") == "ALPHA\nbeta\nGAMMA\n"


@pytest.mark.asyncio
async def test_replace_batch_failure_does_not_write_partial_changes(tmp_path: Path):
    target = tmp_path / "batch-fail.txt"
    original = "one\ntwo\nthree\n"
    target.write_text(original, encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "replacements": [
                {
                    "old_string": "one",
                    "new_string": "ONE",
                },
                {
                    "old_string": "missing",
                    "new_string": "MISSING",
                },
            ],
        }
    )

    assert result.success is False
    assert "Operation 2" in (result.error or "")
    assert target.read_text(encoding="utf-8") == original


@pytest.mark.asyncio
async def test_replace_creates_new_file_when_old_string_empty(tmp_path: Path):
    target = tmp_path / "new-file.txt"
    assert not target.exists()

    result = await replace(
        _single_replace_payload(
            str(target),
            old_string="",
            new_string="fresh file",
            replace_all=False,
        )
    )

    assert result.success is True
    assert result.data["is_new_file"] is True
    assert target.read_text(encoding="utf-8") == "fresh file"


@pytest.mark.asyncio
async def test_replace_patch_chunks_update_file_hunk_modifies_content(tmp_path: Path):
    target = tmp_path / "update.txt"
    target.write_text("foo\nbar\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "patch_chunks": [
                {
                    "old_lines": ["foo", "bar"],
                    "new_lines": ["foo", "baz"],
                }
            ],
        }
    )

    assert result.success is True
    assert result.data["replacements"] == 1
    assert target.read_text(encoding="utf-8") == "foo\nbaz\n"


@pytest.mark.asyncio
async def test_replace_patch_chunks_multiple_update_chunks_apply_to_single_file(
    tmp_path: Path,
):
    target = tmp_path / "multi.txt"
    target.write_text("foo\nbar\nbaz\nqux\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "patch_chunks": [
                {
                    "old_lines": ["foo", "bar"],
                    "new_lines": ["foo", "BAR"],
                },
                {
                    "old_lines": ["baz", "qux"],
                    "new_lines": ["baz", "QUX"],
                },
            ],
        }
    )

    assert result.success is True
    assert result.data["replacements"] == 2
    assert target.read_text(encoding="utf-8") == "foo\nBAR\nbaz\nQUX\n"


@pytest.mark.asyncio
async def test_replace_patch_chunks_interleaved_changes(tmp_path: Path):
    target = tmp_path / "interleaved.txt"
    target.write_text("a\nb\nc\nd\ne\nf\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "patch_chunks": [
                {
                    "old_lines": ["a", "b"],
                    "new_lines": ["a", "B"],
                },
                {
                    "old_lines": ["c", "d", "e"],
                    "new_lines": ["c", "d", "E"],
                },
                {
                    "old_lines": ["f"],
                    "new_lines": ["f", "g"],
                    "is_end_of_file": True,
                },
            ],
        }
    )

    assert result.success is True
    assert result.data["replacements"] == 3
    assert target.read_text(encoding="utf-8") == "a\nB\nc\nd\nE\nf\ng\n"


@pytest.mark.asyncio
async def test_replace_patch_chunks_pure_addition_followed_by_removal(tmp_path: Path):
    target = tmp_path / "panic.txt"
    target.write_text("line1\nline2\nline3\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "patch_chunks": [
                {
                    "old_lines": [],
                    "new_lines": ["after-context", "second-line"],
                },
                {
                    "old_lines": ["line1", "line2", "line3"],
                    "new_lines": ["line1", "line2-replacement"],
                },
            ],
        }
    )

    assert result.success is True
    assert result.data["replacements"] == 2
    assert (
        target.read_text(encoding="utf-8")
        == "line1\nline2-replacement\nafter-context\nsecond-line\n"
    )


@pytest.mark.asyncio
async def test_replace_patch_chunks_unicode_dash_line_match(tmp_path: Path):
    target = tmp_path / "unicode.py"
    target.write_text(
        "import asyncio  # local import \u2013 avoids top\u2011level dep\n",
        encoding="utf-8",
    )

    result = await replace(
        {
            "file_path": str(target),
            "patch_chunks": [
                {
                    "old_lines": [
                        "import asyncio  # local import - avoids top-level dep"
                    ],
                    "new_lines": ["import asyncio  # HELLO"],
                }
            ],
        }
    )

    assert result.success is True
    assert result.data["replacements"] == 1
    assert target.read_text(encoding="utf-8") == "import asyncio  # HELLO\n"


@pytest.mark.asyncio
async def test_replace_patch_chunks_first_line_replacement(tmp_path: Path):
    target = tmp_path / "first.txt"
    target.write_text("foo\nbar\nbaz\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "patch_chunks": [
                {
                    "old_lines": ["foo", "bar"],
                    "new_lines": ["FOO", "bar"],
                }
            ],
        }
    )

    assert result.success is True
    assert target.read_text(encoding="utf-8") == "FOO\nbar\nbaz\n"


@pytest.mark.asyncio
async def test_replace_patch_chunks_last_line_replacement(tmp_path: Path):
    target = tmp_path / "last.txt"
    target.write_text("foo\nbar\nbaz\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "patch_chunks": [
                {
                    "old_lines": ["bar", "baz"],
                    "new_lines": ["bar", "BAZ"],
                }
            ],
        }
    )

    assert result.success is True
    assert target.read_text(encoding="utf-8") == "foo\nbar\nBAZ\n"


@pytest.mark.asyncio
async def test_replace_patch_chunks_insert_at_eof(tmp_path: Path):
    target = tmp_path / "insert.txt"
    target.write_text("foo\nbar\nbaz\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "patch_chunks": [
                {
                    "old_lines": [],
                    "new_lines": ["quux"],
                    "is_end_of_file": True,
                }
            ],
        }
    )

    assert result.success is True
    assert target.read_text(encoding="utf-8") == "foo\nbar\nbaz\nquux\n"


@pytest.mark.asyncio
async def test_replace_patch_chunks_uses_change_context_anchor(tmp_path: Path):
    target = tmp_path / "context-anchor.txt"
    target.write_text("marker\nx\nmarker\nx\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "patch_chunks": [
                {
                    "change_context": "marker",
                    "old_lines": ["x"],
                    "new_lines": ["X"],
                },
                {
                    "change_context": "marker",
                    "old_lines": ["x"],
                    "new_lines": ["Y"],
                },
            ],
        }
    )

    assert result.success is True
    assert target.read_text(encoding="utf-8") == "marker\nX\nmarker\nY\n"
