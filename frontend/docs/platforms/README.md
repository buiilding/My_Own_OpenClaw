---
summary: "Platform hub for WindieOS macOS, Windows, and Linux desktop behavior, permissions, screenshot/overlay policy, window/input control, packaging, and runtime differences."
read_when:
  - When changing platform-specific desktop behavior.
  - When debugging OS-specific permissions, screenshots, packaging, or window handling.
title: "Platforms Hub"
---

# Platforms Hub

WindieOS platform docs cover behavior that differs across macOS, Windows, and Linux. Most platform differences live in Electron main, local-runtime platform adapters, permission services, and packaging scripts.

## Platform Pages

- [macOS](macos.md)
- [Windows](windows.md)
- [Linux](linux.md)
- [Platform Permission Matrix](permission_matrix.md)
- [Platform Change Workflow](platform_change_workflow.md)
- [Platform Validation Matrix](platform_validation_matrix.md)
- [Screenshot and Overlay Policy](screenshot_overlay_policy.md)
- [Window and Input Matrix](window_input_matrix.md)
- [Packaging Runtime Matrix](packaging_runtime_matrix.md)

## Shared Platform Code

- Electron main platform/window policy: `frontend/src/main/surfaces/window_platform_policy.cjs`
- Permission services: `frontend/src/main/permissions/permission_service*.cjs`
- Local-runtime platform adapters: `frontend/src/main/python/core/platform/*`
- Computer tools: `frontend/src/main/python/tools/computer/*`
- Packaging scripts: `<windie> reinstall mac`, `<windie> reinstall linux`, `<windie> reinstall win`
- CI smoke helpers: `scripts/ci/*`

## Cross-Platform Rule

Do not implement platform behavior in the renderer when the decision belongs in Electron main or local-runtime platform adapters. Renderer code should consume normalized state and events.

## Platform Change Checklist

1. Read [Platform Change Workflow](platform_change_workflow.md) and identify whether the owner is Electron main, renderer presentation, local-runtime platform code, permission services, or packaging scripts.
2. Read the matching matrix above before editing.
3. Keep macOS, Windows, and Linux behavior explicit in tests when policy differs.
4. Use [Platform Validation Matrix](platform_validation_matrix.md) to choose focused tests and manual OS smoke checks.
5. Update the OS page and matrix together when behavior changes.
