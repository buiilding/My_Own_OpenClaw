# System Dependencies Guide

This document outlines the system-level dependencies required for the OS-Layer Assistant to function correctly across different operating systems.

## 🐧 Linux (Ubuntu/Debian)

To ensure full functionality of system monitoring, clipboard access, and window management, install the following packages:

```bash
sudo apt update && sudo apt install -y xclip xsel wmctrl xdotool
```

### Why these are needed:
- **`xclip` / `xsel`**: Required by the `pyperclip` library to read and write to the system clipboard. Without these, the agent cannot see or modify your clipboard content.
- **`wmctrl`**: Essential for the `get_open_windows` tool. It allows the agent to list all currently open application windows, preventing it from launching duplicate instances of apps.
- **`xdotool`**: Used to detect the currently active (focused) window title and perform window manipulation tasks.

## 🍎 macOS

Most dependencies on macOS are handled natively or via Python packages, but ensuring you have `xcode-select` installed is recommended.

```bash
xcode-select --install
```

### Automation Permissions:
When running the assistant for the first time, macOS will prompt you to grant **Accessibility** and **Screen Recording** permissions to your terminal (e.g., iTerm, Terminal) or IDE (e.g., VS Code). **You must grant these permissions** for the agent to:
- See window titles
- Control the mouse and keyboard
- Take screenshots

## 🪟 Windows

Windows support is largely built-in via the Python libraries (`pyautogui`, `psutil`, `pyperclip`).

### Requirements:
- **PowerShell**: Ensure you have a modern version of PowerShell installed.
- **Administrator Privileges**: Some system monitoring tasks may require running your terminal as Administrator.

---

## 🐍 Python Dependencies

After installing the system-level packages above, ensure your Python environment is set up:

```bash
pip install -r backend/requirements.txt
```

