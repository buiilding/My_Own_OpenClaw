"""
Compatibility shim for browser simulation entry point.

Run with: python -m backend.src_simulation.browser
"""

from backend.src.simulation.browser import app, run


if __name__ == "__main__":
    run()
