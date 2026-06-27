---
summary: "Retired renderer tool-result envelope reference explaining that tool-result payload construction now belongs to the Agent SDK runtime and backend/local-runtime contracts."
read_when:
  - When you find old references to renderer tool-result envelope builders or renderer backend payload gating.
  - When debugging `tool-result` or `tool-bundle-result` payload shape after the SDK/main local-runtime migration.
title: "Retired Renderer Tool Result Envelope Reference"
---

# Retired Renderer Tool Result Envelope Reference

The renderer-side backend envelope builder has been deleted with the renderer
tool runner. Renderer code no longer constructs or sends backend
`tool-result` / `tool-bundle-result` envelopes.

Current ownership:

- Agent SDK runtime preserves `request_id`, `bundle_id`, `tool_call_id`, and
  correlation metadata while coordinating local execution.
- Electron main and the local-runtime bridge normalize local executor output into the
  SDK local-runtime contract.
- Backend incoming schemas and tool-result handlers remain the authority for the
  websocket payload accepted by the hosted agent loop.
- Renderer display code receives projected tool events only and must not become
  the source of model-facing result payloads.

Debug payload shape from the boundary that owns it:

| Symptom | Inspect |
| --- | --- |
| backend never resumes after local tool success | SDK result delivery and backend tool-result ingress |
| bundle result loses per-step output | SDK bundle result normalization and backend bundle-result schema |
| screenshot/artifact metadata disappears | Electron main artifact upload path and SDK result payload mapping |
| renderer card looks wrong but backend continued | renderer chat-stream tool-output projection |

Read next:

- [Local Tool Channels](../../../channels/sidecar_and_tool_channels.md)
- [Tool Contracts](../../../tools/tool_contracts.md)
- [Tool Execution Lifecycle](../../../tools/tool_execution_lifecycle.md)
