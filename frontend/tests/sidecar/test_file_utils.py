"""Covers local-runtime filesystem utility behavior."""

import sys
import builtins
from pathlib import Path

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

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


def test_is_binary_file_recognizes_binary_extension(tmp_path: Path):
    image_file = tmp_path / "photo.jpg"
    image_file.write_text("plain text but binary extension")

    assert file_utils.is_binary_file(str(image_file)) is True


def test_is_binary_file_nonexistent_path_returns_false(tmp_path: Path):
    missing = tmp_path / "missing.txt"

    assert file_utils.is_binary_file(str(missing)) is False


def test_is_binary_file_empty_file_returns_false(tmp_path: Path):
    empty = tmp_path / "empty.txt"
    empty.write_bytes(b"")

    assert file_utils.is_binary_file(str(empty)) is False


def test_is_binary_file_low_printable_ratio_detects_binary(tmp_path: Path):
    suspicious = tmp_path / "payload.dat"
    suspicious.write_bytes(b"\x01\x02\x03\x04abc")

    assert file_utils.is_binary_file(str(suspicious)) is True


def test_is_text_file_is_inverse_of_binary_detection(tmp_path: Path):
    text_file = tmp_path / "notes.md"
    text_file.write_text("# hello")

    assert file_utils.is_text_file(str(text_file)) is True


def test_detect_encoding_returns_detector_value(monkeypatch, tmp_path: Path):
    text_file = tmp_path / "encoded.txt"
    text_file.write_bytes(b"dummy-bytes")

    class DummyChardet:
        @staticmethod
        def detect(_raw):
            return {"encoding": "utf-16"}

    monkeypatch.setitem(sys.modules, "chardet", DummyChardet)

    assert file_utils.detect_encoding(str(text_file)) == "utf-16"


def test_detect_encoding_falls_back_to_utf8_on_import_error(monkeypatch, tmp_path: Path):
    text_file = tmp_path / "encoded.txt"
    text_file.write_bytes(b"dummy-bytes")

    original_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "chardet":
            raise ImportError("missing")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    assert file_utils.detect_encoding(str(text_file)) == "utf-8"


def test_detect_encoding_falls_back_to_utf8_on_runtime_error(monkeypatch, tmp_path: Path):
    text_file = tmp_path / "encoded.txt"
    text_file.write_bytes(b"dummy-bytes")

    class BrokenChardet:
        @staticmethod
        def detect(_raw):
            raise RuntimeError("boom")

    monkeypatch.setitem(sys.modules, "chardet", BrokenChardet)

    assert file_utils.detect_encoding(str(text_file)) == "utf-8"


def test_detect_encoding_falls_back_to_utf8_when_detector_returns_no_encoding(
    monkeypatch,
    tmp_path: Path,
):
    text_file = tmp_path / "encoded.txt"
    text_file.write_bytes(b"dummy-bytes")

    class NoEncodingChardet:
        @staticmethod
        def detect(_raw):
            return {"confidence": 0.1}

    monkeypatch.setitem(sys.modules, "chardet", NoEncodingChardet)

    assert file_utils.detect_encoding(str(text_file)) == "utf-8"


def test_is_binary_file_returns_false_when_file_read_raises(monkeypatch, tmp_path: Path):
    text_file = tmp_path / "note.txt"
    text_file.write_text("hello")

    original_open = builtins.open

    def fake_open(path, mode="r", *args, **kwargs):
        if str(path) == str(text_file) and "rb" in mode:
            raise OSError("boom")
        return original_open(path, mode, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", fake_open)

    assert file_utils.is_binary_file(str(text_file)) is False


def test_gitignore_utils_without_pathspec(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(gitignore_utils, "pathspec", None)

    assert gitignore_utils.load_gitignore(str(tmp_path)) is None
    assert gitignore_utils.find_gitignore_specs(str(tmp_path)) == []
    assert gitignore_utils.is_ignored("foo.txt", None) is False
    assert gitignore_utils.is_ignored_by_any("foo.txt", []) is False


def test_load_gitignore_returns_compiled_spec(monkeypatch, tmp_path: Path):
    (tmp_path / ".gitignore").write_text("*.log\n", encoding="utf-8")

    class _DummyPathSpecModule:
        class PathSpec:
            @staticmethod
            def from_lines(pattern_kind, lines):
                return {
                    "pattern_kind": pattern_kind,
                    "lines": [line.rstrip("\n") for line in lines],
                }

    monkeypatch.setattr(gitignore_utils, "pathspec", _DummyPathSpecModule)

    spec = gitignore_utils.load_gitignore(str(tmp_path))

    assert spec == {"pattern_kind": "gitwildmatch", "lines": ["*.log"]}


def test_load_gitignore_returns_none_when_file_missing(monkeypatch, tmp_path: Path):
    class _DummyPathSpecModule:
        class PathSpec:
            @staticmethod
            def from_lines(_pattern_kind, _lines):
                raise AssertionError("from_lines should not be called without .gitignore")

    monkeypatch.setattr(gitignore_utils, "pathspec", _DummyPathSpecModule)

    assert gitignore_utils.load_gitignore(str(tmp_path)) is None


def test_load_gitignore_returns_none_when_pathspec_raises(monkeypatch, tmp_path: Path):
    (tmp_path / ".gitignore").write_text("*.log\n", encoding="utf-8")

    class _BrokenPathSpecModule:
        class PathSpec:
            @staticmethod
            def from_lines(_pattern_kind, _lines):
                raise RuntimeError("boom")

    monkeypatch.setattr(gitignore_utils, "pathspec", _BrokenPathSpecModule)

    assert gitignore_utils.load_gitignore(str(tmp_path)) is None


def test_find_gitignore_specs_walks_parent_directories(monkeypatch, tmp_path: Path):
    parent = tmp_path / "parent"
    child = parent / "child"
    child.mkdir(parents=True)
    (parent / ".gitignore").write_text("*.tmp\n", encoding="utf-8")
    (child / ".gitignore").write_text("build/\n", encoding="utf-8")

    class _DummyPathSpecModule:
        class PathSpec:
            @staticmethod
            def from_lines(_pattern_kind, lines):
                return tuple(line.rstrip("\n") for line in lines)

    monkeypatch.setattr(gitignore_utils, "pathspec", _DummyPathSpecModule)

    specs = gitignore_utils.find_gitignore_specs(str(child))
    spec_map = {directory: spec for directory, spec in specs}

    assert str(child.resolve()) in spec_map
    assert str(parent.resolve()) in spec_map
    assert spec_map[str(child.resolve())] == ("build/",)
    assert spec_map[str(parent.resolve())] == ("*.tmp",)


def test_find_gitignore_specs_returns_empty_list_when_resolution_fails(monkeypatch):
    monkeypatch.setattr(gitignore_utils, "pathspec", object())

    class _BrokenPath:
        def resolve(self):
            raise RuntimeError("boom")

    monkeypatch.setattr(gitignore_utils, "Path", lambda _path: _BrokenPath())

    assert gitignore_utils.find_gitignore_specs("/tmp/does-not-matter") == []


def test_is_ignored_by_any_uses_specs():
    class DummySpec:
        def __init__(self, match):
            self.match = match

        def match_file(self, path):
            return path == self.match

    specs = [("/root", DummySpec("a.txt"))]
    assert gitignore_utils.is_ignored_by_any("/root/a.txt", specs) is True
    assert gitignore_utils.is_ignored_by_any("/root/b.txt", specs) is False


def test_is_ignored_by_any_skips_broken_spec_and_continues():
    class BrokenSpec:
        def match_file(self, _path):
            raise RuntimeError("boom")

    class MatchingSpec:
        def match_file(self, path):
            return path == "keep.txt"

    specs = [("/root", BrokenSpec()), ("/root", MatchingSpec())]

    assert gitignore_utils.is_ignored_by_any("/root/keep.txt", specs) is True


def test_is_ignored_by_any_requires_directory_boundary_for_prefix_match():
    class MatchingSpec:
        def match_file(self, path):
            return path == "ed/file.txt"

    specs = [("/root", MatchingSpec())]

    # "/rooted/..." is not inside "/root/..."
    assert gitignore_utils.is_ignored_by_any("/rooted/file.txt", specs) is False


def test_is_ignored_by_any_handles_exact_directory_path_without_crashing():
    class EmptyPathSpec:
        def __init__(self):
            self.seen = None

        def match_file(self, path):
            self.seen = path
            return False

    spec = EmptyPathSpec()
    assert gitignore_utils.is_ignored_by_any("/root", [("/root", spec)]) is False
    assert spec.seen == ""


def test_is_ignored_normalizes_windows_separators(monkeypatch):
    class DummySpec:
        def __init__(self):
            self.last_path = None

        def match_file(self, path):
            self.last_path = path
            return path == "folder/file.txt"

    monkeypatch.setattr(gitignore_utils, "pathspec", object())
    spec = DummySpec()
    assert gitignore_utils.is_ignored("folder\\file.txt", spec) is True
    assert spec.last_path == "folder/file.txt"


def test_is_ignored_returns_false_when_spec_raises(monkeypatch):
    class BrokenSpec:
        def match_file(self, _path):
            raise RuntimeError("boom")

    monkeypatch.setattr(gitignore_utils, "pathspec", object())
    assert gitignore_utils.is_ignored("folder/file.txt", BrokenSpec()) is False
