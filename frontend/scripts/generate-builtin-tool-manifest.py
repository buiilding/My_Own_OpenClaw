#!/usr/bin/env python3
# Runs the generate builtin tool manifest workflow for the developer CLI and automation tooling.

"""Generate the Electron-consumed built-in client tool manifest."""

from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_PYTHON = REPO_ROOT / "src" / "main" / "python"
OUTPUT_PATH = (
    REPO_ROOT
    / "src"
    / "main"
    / "generated"
    / "builtin_tool_manifest.json"
)


def main() -> int:
    sys.path.insert(0, str(FRONTEND_PYTHON))

    from tools.manifest import (
        LOCAL_RUNTIME_BUILTIN_TOOL_NAMES,
        build_local_runtime_tool_manifest,
    )

    manifest = build_local_runtime_tool_manifest(LOCAL_RUNTIME_BUILTIN_TOOL_NAMES)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
