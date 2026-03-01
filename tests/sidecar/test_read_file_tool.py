import base64
from pathlib import Path
import sys
import types

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.filesystem.read_file_tool import read_file  # noqa: E402


def _install_fake_pypdf(monkeypatch: pytest.MonkeyPatch, page_texts: list[str]) -> None:
    class _FakePage:
        def __init__(self, text: str) -> None:
            self._text = text

        def extract_text(self) -> str:
            return self._text

    class _FakePdfReader:
        def __init__(self, _file_path: str) -> None:
            self.pages = [_FakePage(text) for text in page_texts]

    fake_module = types.SimpleNamespace(PdfReader=_FakePdfReader)
    monkeypatch.setitem(sys.modules, "pypdf", fake_module)


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


@pytest.mark.asyncio
async def test_read_file_pdf_extracts_text_via_pypdf(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    target = tmp_path / "report.pdf"
    target.write_bytes(b"%PDF-1.4\n%fake-pdf")
    _install_fake_pypdf(
        monkeypatch,
        [
            "Executive summary page",
            "Findings and recommendations",
        ],
    )

    result = await read_file({"file_path": str(target)})

    assert result.success is True
    assert result.data["pdf_total_pages"] == 2
    assert result.data["pdf_pages_included"] == [1, 2]
    assert result.data["is_truncated"] is False
    assert "--- Page 1 ---" in result.data["content"]
    assert "Executive summary page" in result.data["content"]
    assert "PDF extracted text across 2 page(s)." in result.data["llm_content"]


@pytest.mark.asyncio
async def test_read_file_pdf_uses_relevance_selection_when_large(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    target = tmp_path / "policy.pdf"
    target.write_bytes(b"%PDF-1.4\n%large-fake-pdf")
    _install_fake_pypdf(
        monkeypatch,
        [
            "overview " + ("x" * 18000),
            "noise " + ("y" * 24000),
            ("compliance audit controls " * 1800),
            "appendix " + ("z" * 12000),
        ],
    )

    result = await read_file(
        {
            "file_path": str(target),
            "explanation": "Find compliance audit controls details in this policy PDF.",
        }
    )

    assert result.success is True
    assert result.data["is_truncated"] is True
    assert 1 in result.data["pdf_pages_included"]
    assert 3 in result.data["pdf_pages_included"]
    assert "size-aware page selection" in result.data["llm_content"]
    assert "Relevance terms used for page selection" in result.data["llm_content"]


@pytest.mark.asyncio
async def test_read_file_pdf_respects_offset_and_limit_as_page_window(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    target = tmp_path / "windowed.pdf"
    target.write_bytes(b"%PDF-1.4\n%window-fake-pdf")
    _install_fake_pypdf(
        monkeypatch,
        [
            "page one",
            "page two",
            "page three",
            "page four",
        ],
    )

    result = await read_file({"file_path": str(target), "offset": 1, "limit": 2})

    assert result.success is True
    assert result.data["is_truncated"] is True
    assert result.data["pdf_pages_included"] == [2, 3]
    assert "--- Page 2 ---" in result.data["content"]
    assert "--- Page 3 ---" in result.data["content"]
    assert "--- Page 1 ---" not in result.data["content"]
    assert "offset: 3" in result.data["llm_content"]


@pytest.mark.asyncio
async def test_read_file_image_returns_attachment_payload_without_ocr(tmp_path: Path):
    target = tmp_path / "diagram.png"
    target_bytes = b"\x89PNG\r\n\x1a\nfake-image-content"
    target.write_bytes(target_bytes)

    result = await read_file({"file_path": str(target)})

    assert result.success is True
    assert result.data["file_path"] == str(target)
    assert result.data["content"] == ""
    assert result.data["screenshot"] == base64.b64encode(target_bytes).decode("ascii")
    assert result.data["image_data"] == base64.b64encode(target_bytes).decode("ascii")
    assert result.data["screenshot_content_type"] == "image/png"
    assert result.data["image_content_type"] == "image/png"
    assert result.data["image_size_bytes"] == len(target_bytes)
    assert result.data["read_lines"] == 0
    assert result.data["total_lines"] == 0
    assert result.data["is_truncated"] is False
    assert "OCR/text extraction is not performed" in result.data["llm_content"]


@pytest.mark.asyncio
async def test_read_file_non_image_binary_remains_rejected(tmp_path: Path):
    target = tmp_path / "payload.bin"
    target.write_bytes(b"\x00\x01\x02binary")

    result = await read_file({"file_path": str(target)})

    assert result.success is False
    assert "appears to be binary and cannot be read as text" in (result.error or "")
