#!/usr/bin/env python3
"""Check file lengths against a max LOC threshold."""
from __future__ import annotations

import argparse
from pathlib import Path
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max", type=int, default=500, help="Max LOC threshold")
    parser.add_argument(
        "--fail",
        action="store_true",
        help="Exit non-zero if any files exceed the threshold",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    extensions = {".py", ".js", ".jsx", ".ts", ".tsx", ".cjs", ".mjs"}
    excluded = {
        ".git",
        "node_modules",
        "dist",
        "build",
        "__pycache__",
    }

    offenders = []

    for path in repo_root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in extensions:
            continue
        if any(part in excluded for part in path.parts):
            continue

        try:
            with path.open("r", encoding="utf-8", errors="ignore") as handle:
                line_count = sum(1 for _ in handle)
        except OSError:
            continue

        if line_count > args.max:
            offenders.append((line_count, path))

    if offenders:
        print(f"Files exceeding {args.max} LOC:")
        for line_count, path in sorted(offenders, key=lambda item: item[0], reverse=True):
            rel = path.relative_to(repo_root)
            print(f"- {rel} ({line_count} lines)")
    else:
        print(f"No files exceed {args.max} LOC.")

    if args.fail and offenders:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
