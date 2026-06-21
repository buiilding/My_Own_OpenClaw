"""Covers local-runtime read-file tool behavior."""

import base64
import json
from pathlib import Path
import sys
import types

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.filesystem.read_file_tool import read_file  # noqa: E402


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
    assert f"File path: {target}" in result.data["output"]
    assert "offset: 2000" in result.data["output"]


@pytest.mark.asyncio
async def test_read_file_resolves_relative_path_from_selected_workspace(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    workspace_dir = tmp_path / "workspace"
    nested_dir = workspace_dir / "frontend" / "src" / "main"
    nested_dir.mkdir(parents=True)
    target = nested_dir / "index.cjs"
    target.write_text("console.log('workspace');\n", encoding="utf-8")
    permission_state_path = tmp_path / "permission-state.json"
    _write_workspace_permission_state(permission_state_path, workspace_dir)
    monkeypatch.setenv("WINDIE_PERMISSION_STATE_PATH", str(permission_state_path))

    result = await read_file({"file_path": "frontend/src/main/index.cjs"})

    assert result.success is True
    assert result.data["file_path"] == str(target)
    assert result.data["content"].replace("\r\n", "\n") == "console.log('workspace');\n"
    assert f"File path: {target}" in result.data["output"]


@pytest.mark.asyncio
async def test_read_file_workspace_permission_state_prefers_agent_env(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    agent_workspace = tmp_path / "agent-workspace"
    legacy_workspace = tmp_path / "legacy-workspace"
    agent_workspace.mkdir()
    legacy_workspace.mkdir()
    agent_target = agent_workspace / "notes.txt"
    legacy_target = legacy_workspace / "notes.txt"
    agent_target.write_text("agent workspace\n", encoding="utf-8")
    legacy_target.write_text("legacy workspace\n", encoding="utf-8")

    agent_state_path = tmp_path / "agent-permission-state.json"
    legacy_state_path = tmp_path / "legacy-permission-state.json"
    _write_workspace_permission_state(agent_state_path, agent_workspace)
    _write_workspace_permission_state(legacy_state_path, legacy_workspace)
    monkeypatch.setenv("AGENT_PERMISSION_STATE_PATH", str(agent_state_path))
    monkeypatch.setenv("WINDIE_PERMISSION_STATE_PATH", str(legacy_state_path))

    result = await read_file({"file_path": "notes.txt"})

    assert result.success is True
    assert result.data["file_path"] == str(agent_target)
    assert result.data["content"].replace("\r\n", "\n") == "agent workspace\n"


@pytest.mark.asyncio
async def test_read_file_resolves_relative_path_from_home_when_workspace_missing(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    home_dir = tmp_path / "home"
    target = home_dir / "notes.txt"
    home_dir.mkdir()
    target.write_text("hello from home\n", encoding="utf-8")
    monkeypatch.delenv("AGENT_PERMISSION_STATE_PATH", raising=False)
    monkeypatch.delenv("WINDIE_PERMISSION_STATE_PATH", raising=False)
    monkeypatch.setattr(Path, "home", lambda: home_dir)

    result = await read_file({"file_path": "notes.txt"})

    assert result.success is True
    assert result.data["file_path"] == str(target)
    assert result.data["content"].replace("\r\n", "\n") == "hello from home\n"
    assert f"File path: {target}" in result.data["output"]


@pytest.mark.asyncio
async def test_read_file_reports_original_relative_path_when_missing(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    workspace_dir = tmp_path / "workspace"
    workspace_dir.mkdir()
    permission_state_path = tmp_path / "permission-state.json"
    _write_workspace_permission_state(permission_state_path, workspace_dir)
    monkeypatch.setenv("WINDIE_PERMISSION_STATE_PATH", str(permission_state_path))

    result = await read_file({"file_path": "frontend/src/main/missing.cjs"})

    assert result.success is False
    assert result.error == (
        f"File not found: frontend/src/main/missing.cjs "
        f"(resolved to {workspace_dir / 'frontend' / 'src' / 'main' / 'missing.cjs'})"
    )


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
    assert result.data["content"].replace("\r\n", "\n") == "beta\ngamma\n"
    assert f"File path: {target}" in result.data["output"]


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
    assert f"File path: {target}" in result.data["output"]
    assert "truncated to 500 characters" in result.data["output"]


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
    assert f"File path: {target}" in result.data["output"]
    assert "Showing 0 lines" in result.data["output"]


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
    assert result.data["output"] == f"File path: {target}\n\nFile is empty."


@pytest.mark.asyncio
async def test_read_file_allows_large_files_with_paging(tmp_path: Path):
    target = tmp_path / "large.txt"
    target.write_text(("a" * 1024 + "\n") * 11000, encoding="utf-8")

    result = await read_file({"file_path": str(target), "limit": 1})

    assert result.success is True
    assert result.data["total_lines"] == 11000
    assert result.data["read_lines"] == 1
    assert result.data["is_truncated"] is True
    assert f"File path: {target}" in result.data["output"]


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
    assert "PDF extracted text across 2 page(s)." in result.data["output"]


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
    assert "size-aware page selection" in result.data["output"]
    assert "Relevance terms used for page selection" in result.data["output"]


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
    assert "offset: 3" in result.data["output"]


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
    assert "OCR/text extraction is not performed" in result.data["output"]


@pytest.mark.asyncio
async def test_read_file_non_image_binary_remains_rejected(tmp_path: Path):
    target = tmp_path / "payload.bin"
    target.write_bytes(b"\x00\x01\x02binary")

    result = await read_file({"file_path": str(target)})

    assert result.success is False
    assert "appears to be binary and cannot be read as text" in (result.error or "")
