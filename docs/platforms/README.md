---
summary: "Platform hub for WindieOS macOS, Windows, and Linux desktop behavior, permissions, screenshot/overlay policy, window/input control, packaging, and runtime differences."
read_when:
  - When changing platform-specific desktop behavior.
  - When debugging OS-specific permissions, screenshots, packaging, or window handling.
title: "Platforms Hub"
---

# Platforms Hub

WindieOS platform docs cover behavior that differs across macOS, Windows, and Linux. Most platform differences live in Electron main, sidecar platform adapters, permission services, and packaging scripts.

## Platform Pages

- [macOS](macos.md)
- [Windows](windows.md)
- [Linux](linux.md)
- [Platform Permission Matrix](permission_matrix.md)
- [Screenshot and Overlay Policy](screenshot_overlay_policy.md)
- [Window and Input Matrix](window_input_matrix.md)
- [Packaging Runtime Matrix](packaging_runtime_matrix.md)

## Shared Platform Code

- Electron main platform/window policy: `frontend/src/main/window_platform_policy.cjs`
- Permission services: `frontend/src/main/permission_service*.cjs`
- Sidecar platform adapters: `frontend/src/main/python/core/platform/*`
- Packaging scripts: `scripts/reinstall-windieos-*.sh`, `scripts/reinstall-windieos-windows.ps1`
- CI smoke helpers: `scripts/ci/*`

## Cross-Platform Rule

Do not implement platform behavior in the renderer when the decision belongs in Electron main or sidecar platform adapters. Renderer code should consume normalized state and events.

## Platform Change Checklist

1. Identify whether the owner is Electron main, sidecar platform code, packaging scripts, or renderer presentation.
2. Read the matching matrix above before editing.
3. Keep macOS, Windows, and Linux behavior explicit in tests when policy differs.
4. Update the OS page and matrix together when behavior changes.
