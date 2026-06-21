"""Covers local-runtime tool output contract behavior."""

from __future__ import annotations

import re
from pathlib import Path


LEGACY_MODEL_TEXT_FIELD_RE = re.compile(
    r"""["'](?:llm_content|return_display|display_content|model_llm_content)["']\s*:"""
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _iter_contract_sources() -> list[Path]:
    root = _repo_root()
    source_roots = [
        root / "backend" / "src" / "tools",
        root / "frontend" / "src" / "main" / "python" / "tools",
        root / "packages" / "windie-sdk-js" / "src" / "tools",
        root / "examples" / "local-tool-extension",
        root / "examples" / "repo-agent-extension",
    ]
    source_files = [
        root / "frontend" / "src" / "main" / "mcp_runtime.cjs",
        root / "frontend" / "src" / "main" / "python" / "sidecar_daemon.py",
        root / "frontend" / "src" / "main" / "python" / "windie" / "sdk.py",
        root / "scripts" / "create-windie-extension.cjs",
    ]

    files: list[Path] = []
    for source_root in source_roots:
        files.extend(
            path
            for path in source_root.rglob("*")
            if path.suffix in {".py", ".js", ".mjs", ".cjs", ".ts"}
            and "__pycache__" not in path.parts
        )
    files.extend(source_files)
    return sorted(path for path in files if path.exists())


def test_first_party_tool_producers_do_not_emit_legacy_model_text_fields():
    offenders: list[str] = []
    for path in _iter_contract_sources():
        text = path.read_text(encoding="utf-8")
        for match in LEGACY_MODEL_TEXT_FIELD_RE.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            offenders.append(f"{path.relative_to(_repo_root())}:{line}")

    assert offenders == [], (
        "Tool producers must write model-facing text to data.output. "
        "Do not reintroduce legacy model text fields: "
        + ", ".join(offenders)
    )
