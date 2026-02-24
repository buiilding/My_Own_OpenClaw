#!/usr/bin/env python3
"""
Manual real-screen click test for ghost-click debugging.

Hard-coded for a 1920x1080 screen:
- start near top-center
- move to lower-center
- click at destination
"""

from __future__ import annotations

import argparse
import sys
import time


SCREEN_WIDTH = 1920
SCREEN_HEIGHT = 1080
START_X = SCREEN_WIDTH // 2
START_Y = 32
END_X = SCREEN_WIDTH // 2
END_Y = SCREEN_HEIGHT - 80
START_HOLD_SECONDS = 1.0
MOVE_SECONDS = 1.8
END_HOLD_SECONDS = 1.0
COUNTDOWN_SECONDS = 5


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run manual top->down real cursor movement/click test on 1920x1080.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned actions only; do not move/click cursor.",
    )
    return parser.parse_args()


def _print_plan() -> None:
    print("[ghost-screen-test] Plan")
    print(f"  screen: {SCREEN_WIDTH}x{SCREEN_HEIGHT}")
    print(f"  start: ({START_X}, {START_Y})")
    print(f"  end:   ({END_X}, {END_Y})")
    print(f"  hold-start: {START_HOLD_SECONDS:.1f}s")
    print(f"  move:       {MOVE_SECONDS:.1f}s")
    print(f"  hold-end:   {END_HOLD_SECONDS:.1f}s")


def main() -> int:
    args = _parse_args()
    _print_plan()

    if args.dry_run:
        print("[ghost-screen-test] Dry run complete; no cursor actions executed.")
        return 0

    try:
        import pyautogui
    except ImportError:
        print(
            "[ghost-screen-test] ERROR: pyautogui not installed in current env.",
            file=sys.stderr,
        )
        return 2

    print(
        f"[ghost-screen-test] Starting in {COUNTDOWN_SECONDS}s. "
        "Move mouse to top-left corner to trigger failsafe abort."
    )
    for remaining in range(COUNTDOWN_SECONDS, 0, -1):
        print(f"  {remaining}...")
        time.sleep(1)

    pyautogui.FAILSAFE = True

    pyautogui.moveTo(START_X, START_Y, duration=0.4, tween=pyautogui.easeInOutQuad)
    time.sleep(START_HOLD_SECONDS)
    pyautogui.moveTo(END_X, END_Y, duration=MOVE_SECONDS, tween=pyautogui.easeInOutQuad)
    time.sleep(END_HOLD_SECONDS)
    pyautogui.click(END_X, END_Y)

    print("[ghost-screen-test] Complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
