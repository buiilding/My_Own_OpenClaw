---
summary: "Frontend sidecar browser chrome docs sub-hub for executable detection, dedicated CDP launch policy, BrowserController session lifecycle, and enhanced CDP snapshot pipeline internals."
read_when:
  - When changing `tools/browser/chrome_detection.py`, `chrome_launcher.py`, `controller.py`, or `enhanced_cdp_pipeline.py`.
  - When debugging Windie browser auto-launch/connect behavior, CDP attach failures, or snapshot ref generation drift.
title: "Frontend Sidecar Browser Chrome Docs Hub"
---

# Frontend Sidecar Browser Chrome Docs Hub

## Deep Pages

- [Chrome Detection, Launcher, and CDP Session Reference](chrome_detection_launcher_and_cdp_session_reference.md)
- [Browser Controller Lifecycle, Snapshot, and Action Runtime Reference](browser_controller_lifecycle_snapshot_and_action_runtime_reference.md)
- [Enhanced CDP DOM Snapshot Pipeline Runtime Reference](enhanced_cdp_dom_snapshot_pipeline_runtime_reference.md)

## Related Pages

- [Frontend Sidecar Browser Docs Hub](../README.md)
- [Browser Automation Stack](../../browser_automation_stack.md)
- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](../browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](../browser_adapter_action_routing_and_compatibility_semantics_reference.md)

## Code Scope

- `frontend/src/main/python/tools/browser/chrome_detection.py`
- `frontend/src/main/python/tools/browser/chrome_launcher.py`
- `frontend/src/main/python/tools/browser/controller.py`
- `frontend/src/main/python/tools/browser/enhanced_cdp_pipeline.py`
- `tests/sidecar/tools/test_chrome_detection.py`
- `tests/sidecar/tools/test_chrome_launcher.py`
- `tests/sidecar/tools/test_browser_controller.py`
- `tests/sidecar/tools/test_browser_enhanced_cdp_pipeline.py`
