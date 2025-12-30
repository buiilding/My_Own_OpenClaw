#!/usr/bin/env python3
import subprocess
import time
import sys
from datetime import datetime

def get_active_window_title():
    """
    Retrieves the title of the currently active window using xdotool.
    Returns 'No Active Window' if no window is focused or an error occurs.
    """
    try:
        # xdotool getactivewindow returns the window ID
        # xdotool getwindowname <id> returns the name
        # We can chain them: xdotool getactivewindow getwindowname
        result = subprocess.check_output(
            ["xdotool", "getactivewindow", "getwindowname"], 
            stderr=subprocess.DEVNULL
        ).decode("utf-8").strip()
        return result
    except subprocess.CalledProcessError:
        # This happens when no window is active or xdotool fails to find one
        return "No Active Window"
    except FileNotFoundError:
        print("Error: 'xdotool' command not found. Please install it using 'sudo apt install xdotool'.")
        sys.exit(1)
    except Exception as e:
        return f"Error: {str(e)}"

def main():
    print("Starting Active Window Tracker...", flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    print("-" * 40, flush=True)

    last_window = None

    try:
        while True:
            current_window = get_active_window_title()

            if current_window != last_window:
                timestamp = datetime.now().strftime("%H:%M:%S")
                # Clear line and print new status or just append. 
                # Appending is better for history.
                if last_window is not None:
                    print(f"[{timestamp}] Focused: {current_window}", flush=True)
                else:
                    # Initial print
                    print(f"[{timestamp}] Initial Focus: {current_window}", flush=True)
                
                last_window = current_window
            
            # Poll frequently for responsiveness
            time.sleep(0.1) 

    except KeyboardInterrupt:
        print("\nTracker stopped.", flush=True)
    except Exception as e:
        print(f"\nCritical Error: {e}", file=sys.stderr, flush=True)

if __name__ == "__main__":
    main()

