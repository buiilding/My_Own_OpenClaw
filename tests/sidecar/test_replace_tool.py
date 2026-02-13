import sys
from pathlib import Path

import pytest


frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

from tools.filesystem.replace_tool import replace  # noqa: E402


@pytest.mark.asyncio
async def test_replace_single_unique_match(tmp_path: Path):
    target = tmp_path / "example.txt"
    target.write_text("line1\nline2\nline3\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "old_string": "line2",
            "new_string": "changed",
            "replace_all": False,
        }
    )

    assert result.success is True
    assert result.data["replacements"] == 1
    assert target.read_text(encoding="utf-8") == "line1\nchanged\nline3\n"
    assert isinstance(result.data.get("unified_diff"), str)
    assert result.data.get("matched_spans")


@pytest.mark.asyncio
async def test_replace_rejects_multiple_matches_without_replace_all(tmp_path: Path):
    target = tmp_path / "duplicate.txt"
    target.write_text("dup\nx\ndup\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "old_string": "dup",
            "new_string": "new",
            "replace_all": False,
        }
    )

    assert result.success is False
    assert "Multiple matches found" in (result.error or "")
    assert target.read_text(encoding="utf-8") == "dup\nx\ndup\n"


@pytest.mark.asyncio
async def test_replace_all_replaces_all_matches(tmp_path: Path):
    target = tmp_path / "duplicate.txt"
    target.write_text("dup\nx\ndup\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "old_string": "dup",
            "new_string": "new",
            "replace_all": True,
        }
    )

    assert result.success is True
    assert result.data["replacements"] == 2
    assert target.read_text(encoding="utf-8") == "new\nx\nnew\n"


@pytest.mark.asyncio
async def test_replace_uses_line_fallback_for_trailing_whitespace_mismatch(tmp_path: Path):
    target = tmp_path / "whitespace.txt"
    target.write_text("alpha\ntarget value\nomega\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "old_string": "target value   ",
            "new_string": "updated",
            "replace_all": False,
        }
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
            "old_string": "target value   ",
            "new_string": "updated",
            "match_mode": "strict",
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
        {
            "file_path": str(target),
            "old_string": "import asyncio  # local import - avoids top-level dep",
            "new_string": "import asyncio  # HELLO",
            "replace_all": False,
        }
    )

    assert result.success is True
    assert result.data["replacements"] == 1
    assert target.read_text(encoding="utf-8") == "import asyncio  # HELLO\n"


@pytest.mark.asyncio
async def test_replace_before_after_context_disambiguates_matches(tmp_path: Path):
    target = tmp_path / "context.txt"
    target.write_text("before-A target after\nbefore-B target after\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "old_string": "target",
            "new_string": "UPDATED",
            "before_context": "before-B ",
            "after_context": " after",
        }
    )

    assert result.success is True
    assert result.data["replacements"] == 1
    assert target.read_text(encoding="utf-8") == "before-A target after\nbefore-B UPDATED after\n"


@pytest.mark.asyncio
async def test_replace_occurrence_index_targets_specific_match(tmp_path: Path):
    target = tmp_path / "occurrence.txt"
    target.write_text("x\ny\nx\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "old_string": "x",
            "new_string": "z",
            "occurrence_index": 2,
        }
    )

    assert result.success is True
    assert result.data["replacements"] == 1
    assert target.read_text(encoding="utf-8") == "x\ny\nz\n"


@pytest.mark.asyncio
async def test_replace_require_eof_targets_tail_match_only(tmp_path: Path):
    target = tmp_path / "eof.txt"
    target.write_text("tail\nmiddle\ntail\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "old_string": "tail",
            "new_string": "tail-updated",
            "require_eof": True,
        }
    )

    assert result.success is True
    assert result.data["replacements"] == 1
    assert target.read_text(encoding="utf-8") == "tail\nmiddle\ntail-updated\n"


@pytest.mark.asyncio
async def test_replace_disallows_empty_old_string_for_existing_file(tmp_path: Path):
    target = tmp_path / "existing.txt"
    target.write_text("existing content\n", encoding="utf-8")

    result = await replace(
        {
            "file_path": str(target),
            "old_string": "",
            "new_string": "new content",
            "replace_all": False,
        }
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
        {
            "file_path": str(target),
            "old_string": "",
            "new_string": "fresh file",
            "replace_all": False,
        }
    )

    assert result.success is True
    assert result.data["is_new_file"] is True
    assert target.read_text(encoding="utf-8") == "fresh file"
