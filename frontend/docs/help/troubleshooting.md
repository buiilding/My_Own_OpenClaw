---
summary: "Troubleshooting guide for common WindieOS local development, provider, permission, tool, browser, memory, and packaging failures."
read_when:
  - When a WindieOS feature fails and you need a practical debugging route.
  - When adding a new recurring issue to the help docs.
title: "Troubleshooting"
---

# Troubleshooting

Use this page after [Diagnostics](diagnostics.md) identifies the likely runtime.

If the owner is still unclear, use [Triage Routes](triage_routes.md). If the issue is intermittent, packaged-only, hosted-only, or platform-specific, collect a short [Evidence Packet](evidence_packet.md) before editing code.

## Backend Does Not Respond

- Confirm the backend process is running.
- Check websocket connection and settings ACK logs in Electron main.
- Check backend `/ws` handshake and task-limit behavior.
- Read Backend API Docs Hub (private backend docs).

## Model or Provider Is Missing

- Check the relevant API key env var or frontend override.
- Check provider factory registration in `backend/src/llm/providers/factory.py`.
- Check model metadata in `backend/src/llm/models/models_config.py`.
- Read [Models and LLM Providers](../providers/models.md).

## Local Tool Fails

- Confirm backend tool schema parses.
- Confirm the SDK runtime tool router receives and claims the event.
- Confirm SDK/main local-runtime dispatch maps the request to the Python JSON-RPC handler.
- Confirm the tool is registered in `frontend/src/main/python/tools/registry.py`.
- Read [Tool Contracts](../tools/tool_contracts.md).

## Browser Tool Fails

- Check whether the dedicated browser is connected/running.
- Check backend action schema and local-runtime browser adapter compatibility.
- Check active page/session state before assuming a DOM snapshot issue.
- Read [Browser Tool](../tools/browser.md).

## Permission or Platform Issue

- Read [Platforms Hub](../platforms/README.md).
- Check permission services in Electron main and renderer onboarding state.
- On Linux screenshot issues, inspect overlay hide/restore behavior first.
- On macOS, distinguish opening System Settings from actual permission grant success.

## Memory or Transcript Issue

- Check whether the issue is visible transcript, replay state, backend history, or semantic memory.
- Check local-runtime memory store and backend semantic/title route separately.
- Read [Context and Memory](../concepts/context_and_memory.md).

## Related Help

- [Doctor Checklist](doctor_checklist.md)
- [FAQ](faq.md)
- [Symptom Playbooks](../debug/symptom_playbooks.md)
