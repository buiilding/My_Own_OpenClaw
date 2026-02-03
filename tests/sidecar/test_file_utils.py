import sys
from pathlib import Path

frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

from tools.filesystem import file_utils, gitignore_utils  # noqa: E402


def test_is_binary_file_detects_signature(tmp_path: Path):
    binary_file = tmp_path / "image.png"
    binary_file.write_bytes(b"\x89PNG\r\n\x1a\nrest")

    assert file_utils.is_binary_file(str(binary_file)) is True


def test_is_binary_file_text(tmp_path: Path):
    text_file = tmp_path / "note.txt"
    text_file.write_text("hello world")

    assert file_utils.is_binary_file(str(text_file)) is False


def test_is_binary_file_null_bytes(tmp_path: Path):
    binary_file = tmp_path / "data.bin"
    binary_file.write_bytes(b"\x00\x01\x02")

    assert file_utils.is_binary_file(str(binary_file)) is True


def test_gitignore_utils_without_pathspec(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(gitignore_utils, "pathspec", None)

    assert gitignore_utils.load_gitignore(str(tmp_path)) is None
    assert gitignore_utils.find_gitignore_specs(str(tmp_path)) == []
    assert gitignore_utils.is_ignored("foo.txt", None) is False
    assert gitignore_utils.is_ignored_by_any("foo.txt", []) is False


def test_is_ignored_by_any_uses_specs():
    class DummySpec:
        def __init__(self, match):
            self.match = match

        def match_file(self, path):
            return path == self.match

    specs = [("/root", DummySpec("a.txt"))]
    assert gitignore_utils.is_ignored_by_any("/root/a.txt", specs) is True
    assert gitignore_utils.is_ignored_by_any("/root/b.txt", specs) is False
