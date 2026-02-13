import sys
from pathlib import Path

import pytest


frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

from tools.filesystem.read_file_tool import read_file  # noqa: E402


@pytest.mark.asyncio
async def test_read_file_uses_default_limit_when_not_provided(tmp_path: Path):
    target = tmp_path / "many-lines.txt"
    target.write_text(
        "".join(f"line-{idx:04d}\n" for idx in range(1, 2106)),
        encoding="utf-8",
    )

    result = await read_file({"file_path": str(target)})

    assert result.success is True
    assert result.data["total_lines"] == 2105
    assert result.data["read_lines"] == 2000
    assert result.data["is_truncated"] is True
    assert result.data["content"].splitlines()[0] == "line-0001"
    assert result.data["content"].splitlines()[-1] == "line-2000"
    assert f"File path: {target}" in result.data["llm_content"]
    assert "offset: 2000" in result.data["llm_content"]


@pytest.mark.asyncio
async def test_read_file_respects_offset_and_limit_window(tmp_path: Path):
    target = tmp_path / "window.txt"
    target.write_text("alpha\nbeta\ngamma\ndelta\n", encoding="utf-8")

    result = await read_file(
        {
            "file_path": str(target),
            "offset": 1,
            "limit": 2,
        }
    )

    assert result.success is True
    assert result.data["total_lines"] == 4
    assert result.data["read_lines"] == 2
    assert result.data["is_truncated"] is True
    assert result.data["content"] == "beta\ngamma\n"
    assert f"File path: {target}" in result.data["llm_content"]


@pytest.mark.asyncio
async def test_read_file_truncates_very_long_lines(tmp_path: Path):
    target = tmp_path / "long-lines.txt"
    target.write_text(("x" * 550) + "\nshort\n", encoding="utf-8")

    result = await read_file({"file_path": str(target), "limit": 2})

    assert result.success is True
    lines = result.data["content"].splitlines()
    assert len(lines[0]) == 500
    assert lines[1] == "short"
    assert result.data["truncated_line_count"] == 1
    assert result.data["line_truncation_limit"] == 500
    assert f"File path: {target}" in result.data["llm_content"]
    assert "truncated to 500 characters" in result.data["llm_content"]


@pytest.mark.asyncio
async def test_read_file_offset_past_eof_returns_empty_window(tmp_path: Path):
    target = tmp_path / "past-eof.txt"
    target.write_text("one\ntwo\n", encoding="utf-8")

    result = await read_file(
        {
            "file_path": str(target),
            "offset": 10,
            "limit": 5,
        }
    )

    assert result.success is True
    assert result.data["content"] == ""
    assert result.data["total_lines"] == 2
    assert result.data["read_lines"] == 0
    assert result.data["is_truncated"] is True
    assert f"File path: {target}" in result.data["llm_content"]
    assert "Showing 0 lines" in result.data["llm_content"]


@pytest.mark.asyncio
async def test_read_file_empty_file_returns_empty_message(tmp_path: Path):
    target = tmp_path / "empty.txt"
    target.write_text("", encoding="utf-8")

    result = await read_file({"file_path": str(target)})

    assert result.success is True
    assert result.data["content"] == ""
    assert result.data["total_lines"] == 0
    assert result.data["read_lines"] == 0
    assert result.data["is_truncated"] is False
    assert result.data["llm_content"] == f"File path: {target}\n\nFile is empty."


@pytest.mark.asyncio
async def test_read_file_allows_large_files_with_paging(tmp_path: Path):
    target = tmp_path / "large.txt"
    target.write_text(("a" * 1024 + "\n") * 11000, encoding="utf-8")

    result = await read_file({"file_path": str(target), "limit": 1})

    assert result.success is True
    assert result.data["total_lines"] == 11000
    assert result.data["read_lines"] == 1
    assert result.data["is_truncated"] is True
    assert f"File path: {target}" in result.data["llm_content"]
