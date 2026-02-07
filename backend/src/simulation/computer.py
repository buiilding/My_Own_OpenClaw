"""
Simulation Backend Entry Point (Computer Tools).

Alias for the default simulation app that uses MockLLMClient.
Run with: python -m backend.src.simulation.computer
"""

from __future__ import annotations

import os

from backend.src.simulation.main import app


def run() -> None:
    import uvicorn

    access_log = os.getenv("WINDIEOS_LOG_PROFILE", "important").lower() == "verbose"
    uvicorn.run(
        "backend.src.simulation.main:app",
        host="0.0.0.0",
        port=8765,
        access_log=access_log,
        reload=True,
        reload_dirs=["backend/src"],
    )


if __name__ == "__main__":
    run()
