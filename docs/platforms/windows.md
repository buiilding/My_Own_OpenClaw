---
summary: "Windows WindieOS platform guide for packaging, reinstall, local-runtime platform behavior, window handling, and screenshot policy."
read_when:
  - When changing Windows packaging, permissions, screenshot behavior, or local-runtime platform adapters.
title: "Windows"
---

# Windows

Windows behavior is mostly implemented through Electron main window policy, local-runtime platform adapters, Electron Builder NSIS packaging, and the Windows reinstall helper.

## Key Areas

- Windows package target: `frontend/package.json` `package:win`
- Reinstall helper: `<windie> reinstall win`
- Local-runtime platform adapter: `frontend/src/main/python/core/platform/windows.py`
- Window/platform policy: `frontend/src/main/surfaces/window_platform_policy.cjs`
- CI smoke helper: `scripts/ci/smoke-windows-packages.ps1`

## Rules

- Do not add capture-time hide/show behavior for minimal chat pill or response overlay on Windows.
- Content protection should be active only during active loop phases and off during idle/terminal phases.
- PowerShell should not invoke `./scripts/committer.sh` directly; use Git Bash or plain `git add`/`git commit`.
- Keep Windows package checks separate from Linux/macOS package assumptions.
- Treat Developer Mode, PowerShell execution policy, and NSIS install behavior as packaging concerns before changing app runtime code.
- Host-window switching belongs in the local-runtime Win32 adapter; desktop overlay policy belongs in Electron main.

## Related Docs

- [Packaged Desktop Builds](../install/packaged_desktop.md)
- [Platform Permission Matrix](permission_matrix.md)
- [Screenshot and Overlay Policy](screenshot_overlay_policy.md)
- [Window and Input Matrix](window_input_matrix.md)
- [Packaging Runtime Matrix](packaging_runtime_matrix.md)
- [Frontend Runtime Invariants and PR Checklist](../frontend/runtime/frontend_runtime_invariants_checklist.md)
