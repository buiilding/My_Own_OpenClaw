---
summary: "WindieOS troubleshooting FAQ for common source, packaged, endpoint, provider, permission, browser, tool, and memory questions."
read_when:
  - When a recurring WindieOS issue can be answered with a short route to the right subsystem and docs.
  - When adding or updating user-visible troubleshooting guidance without changing runtime behavior.
title: "FAQ"
---

# FAQ

## Why does the app connect to the hosted backend during development?

WindieOS defaults to `https://api.windieos.com` and `wss://api.windieos.com/ws` when no endpoint override is set. Local backend mode is explicit.

Set:

```bash
BACKEND_HTTP_URL=http://127.0.0.1:8765
BACKEND_WS_URL=ws://127.0.0.1:8765/ws
```

Read Backend Endpoint Setup (private backend docs).

## Why does source mode work but the packaged app fails?

Source mode can use local dependencies, dev servers, and the checkout path. Packaged mode uses installed app paths and `resources/python-runtime`.

Read [Install Troubleshooting](../install/install_troubleshooting.md) and [Packaging Runtime Matrix](../platforms/packaging_runtime_matrix.md).

## Why is a tool visible to the model but no local action happens?

The backend may have emitted a tool call that did not pass through the SDK runtime tool router, Electron main bridge, or local-runtime execution.

Read [Tool Troubleshooting](../tools/tool_troubleshooting.md).

## Why is a provider or model missing?

Check provider registration, model catalog metadata, credential environment variables, and provider health/capability gates.

Read [Models and LLM Providers](../providers/models.md) and Provider Credentials (private backend docs).

## Why does a screenshot include the chat pill or response overlay?

This is platform-specific. Linux uses hide/restore for clean screenshots. macOS
and Windows use content protection only during SDK screenshot-capture leases and
should not add capture-time hide/show.

Read [Screenshot and Overlay Policy](../platforms/screenshot_overlay_policy.md).

## Why does macOS still show permission as missing after opening System Settings?

Opening System Settings is not a grant. The probe must verify the real OS permission or capability after the user enables WindieOS.

Read [Platform Permission Matrix](../platforms/permission_matrix.md).

## Why does browser automation ask to install Chromium?

Packaged WindieOS does not prebundle Playwright Chromium. Browser automation checks installed Chrome/Chromium-family browsers first, then can install Chromium after user consent if needed.

Read [Browser Troubleshooting](../browser/browser_troubleshooting.md).

## Why does memory or transcript state look stale?

Visible transcript, renderer replay, local-runtime memory, backend history, and semantic memory routes are different layers. Identify which layer is stale first.

Read [Memory Troubleshooting](../memory/memory_troubleshooting.md) and [Session and Transcript Reference](../reference/session_and_transcript_reference.md).

## Related Docs

- [Diagnostics](diagnostics.md)
- [Triage Routes](triage_routes.md)
- Doctor Checklist (private backend docs)
- [Evidence Packet](evidence_packet.md)
