"""Covers browser file store behavior in the sidecar test suite."""

from pathlib import Path

import pytest
from tools.browser import file_store


def test_default_browser_files_root_preserves_windie_profile() -> None:
    assert file_store.DEFAULT_BROWSER_FILES_DIR.parts[-2:] == (
        ".windieos",
        "browser",
    )
    assert f".desktop-{'agent'}" not in file_store.DEFAULT_BROWSER_FILES_DIR.parts


def test_resolve_browser_path_uses_browser_root(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(file_store.ENV_AGENT_BROWSER_FILES_DIR, str(tmp_path))

    resolved = file_store.resolve_browser_path("notes/page.txt")

    assert resolved == tmp_path / "notes" / "page.txt"


def test_resolve_browser_path_preserves_windie_browser_root_alias(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(file_store.ENV_BROWSER_FILES_DIR, str(tmp_path))

    resolved = file_store.resolve_browser_path("notes/page.txt")

    assert resolved == tmp_path / "notes" / "page.txt"


def test_resolve_browser_path_prefers_generic_browser_root_alias(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    generic_root = tmp_path / "generic"
    windie_root = tmp_path / "windie"
    monkeypatch.setenv(file_store.ENV_AGENT_BROWSER_FILES_DIR, str(generic_root))
    monkeypatch.setenv(file_store.ENV_BROWSER_FILES_DIR, str(windie_root))

    resolved = file_store.resolve_browser_path("notes/page.txt")

    assert resolved == generic_root / "notes" / "page.txt"


def test_resolve_browser_path_rejects_absolute_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(file_store.ENV_AGENT_BROWSER_FILES_DIR, str(tmp_path))
    outside_path = tmp_path.parent / "outside.txt"

    with pytest.raises(ValueError, match="relative to the browser file root"):
        file_store.resolve_browser_path(str(outside_path))


def test_resolve_browser_path_rejects_parent_escape(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(file_store.ENV_AGENT_BROWSER_FILES_DIR, str(tmp_path))

    with pytest.raises(ValueError, match="under the browser file root"):
        file_store.resolve_browser_path("../outside.txt")


def test_write_text_creates_browser_root_parent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(file_store.ENV_AGENT_BROWSER_FILES_DIR, str(tmp_path))

    resolved, written_chars = file_store.write_text("nested/file.txt", "hello")

    assert resolved == tmp_path / "nested" / "file.txt"
    assert written_chars == 5
    assert resolved.read_text(encoding="utf-8") == "hello"
