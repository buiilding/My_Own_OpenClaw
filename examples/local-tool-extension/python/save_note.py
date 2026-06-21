"""Provides the save note module for the example application workspace."""

from __future__ import annotations

from pathlib import Path

from tools.result import ToolResult


def save_local_note(text: str, filename: str = "agent-note.txt"):
    safe_name = Path(filename or "agent-note.txt").name
    note_dir = Path(__file__).resolve().parents[1] / "out"
    note_dir.mkdir(parents=True, exist_ok=True)
    note_path = note_dir / safe_name
    note_path.write_text(text, encoding="utf-8")

    return ToolResult.success_result(
        {
            "output": f"Saved local note to {note_path}",
            "path": str(note_path),
            "bytes": note_path.stat().st_size,
        }
    )
