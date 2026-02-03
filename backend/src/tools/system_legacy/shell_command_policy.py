"""
Shell command policy helpers for the legacy shell tool.
"""

import shlex
from typing import List, Tuple

DESTRUCTIVE_COMMANDS = {
    # File/directory deletion
    "rm",
    "del",
    "delete",
    "erase",
    "rd",
    "rmdir",
    "unlink",
    # Disk operations
    "format",
    "fdisk",
    "mkfs",
    "dd",
    "diskpart",
    # System operations
    "shutdown",
    "reboot",
    "halt",
    "poweroff",
    "init",
    "systemctl",
    # Network destructive
    "iptables",
    "firewall-cmd",
    "ufw",
    # Process killing (except specific safe ones)
    "killall",
    "pkill",
    "kill",
    # Package managers when used destructively (we can't check flags, so be conservative)
    "apt-get",
    "yum",
    "dnf",
    "pacman",
    "brew",
    "choco",
    "scoop",
}


def split_command_chain(command: str) -> List[str]:
    """Split chained commands (&&, ||, ;) into individual commands."""
    separators = ["&&", "||", ";"]
    parts = [command]

    for sep in separators:
        new_parts = []
        for part in parts:
            new_parts.extend(part.split(sep))
        parts = new_parts

    return [part.strip() for part in parts if part.strip()]


def get_command_roots(command: str) -> List[str]:
    """Extract root commands from a shell command."""
    try:
        parts = shlex.split(command)
        if not parts:
            return []

        roots = []
        for part in split_command_chain(command):
            part_parts = shlex.split(part.strip())
            if part_parts:
                roots.append(part_parts[0])

        return list(set(roots))
    except Exception:
        first_word = command.strip().split()[0] if command.strip() else ""
        return [first_word] if first_word else []


def is_command_allowed(
    command: str, allowlist: set[str]
) -> Tuple[bool, str]:
    """Check if a command is allowed to execute."""
    root_commands = get_command_roots(command)

    if not root_commands:
        return (
            False,
            "Could not identify command root to obtain permission from user",
        )

    for root_cmd in root_commands:
        if root_cmd in allowlist:
            continue
        if root_cmd in DESTRUCTIVE_COMMANDS:
            return (
                False,
                f"Command '{root_cmd}' is potentially destructive and not allowed",
            )

    return True, ""
