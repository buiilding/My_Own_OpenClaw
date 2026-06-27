"""Provides the read repo snapshot module for the example application workspace."""

from __future__ import annotations

from pathlib import Path

from tools.result import ToolResult

SKIPPED_DIRS = {
    ".git",
    ".pytest_cache",
    "__pycache__",
    "dist",
    "node_modules",
    "python-runtime",
    "release",
}


def _is_skipped(path: Path, root: Path) -> bool:
    try:
        relative = path.relative_to(root)
    except ValueError:
        return True
    return any(part in SKIPPED_DIRS for part in relative.parts)


async def run(root: str, max_files: int = 20):
    repo_root = Path(root).expanduser().resolve()
    if not repo_root.exists() or not repo_root.is_dir():
        return ToolResult.error_result(f"repo root does not exist: {repo_root}")

    limit = max(1, min(int(max_files or 20), 50))
    files: list[str] = []
    for path in sorted(repo_root.rglob("*")):
        if len(files) >= limit:
            break
        if _is_skipped(path, repo_root) or not path.is_file():
            continue
        files.append(str(path.relative_to(repo_root)))

    preview = "\n".join(f"- {file_path}" for file_path in files)
    content = (
        f"Repo snapshot for {repo_root}\n"
        f"Included {len(files)} files:\n"
        f"{preview or '- no files found'}"
    )
    return ToolResult.success_result(
        {
            "output": content,
            "files": files,
            "root": str(repo_root),
        }
    )
