---
summary: "SDK query planning and tracing guide covering prompt previews, query-plan endpoint, websocket event collection, and debugging."
read_when:
  - When changing SDK query plan or trace helpers.
  - When debugging model prompt/tool transparency without using the desktop UI.
title: "Query Planning and Trace"
---

# Query Planning and Trace

WindieOS exposes SDK routes and clients that let developer tools inspect backend prompt/tool behavior without going through the Electron UI.

## Capabilities

- Build a planned websocket query payload.
- Preview prompt/system/tool transparency metadata.
- List debug models.
- Inspect tool schemas and capabilities.
- Run a query trace and collect streamed backend events until completion.

## Owners

- Backend route: `backend/src/api/routes/sdk/router.py`
- Backend service helpers: `backend/src/api/routes/sdk/service.py`
- TypeScript trace helper: `frontend/src/renderer/infrastructure/api/windieSdkClient.ts`
- Python trace helper: `frontend/src/main/python/core/windie_sdk_client.py`

## Debugging Use

Use query planning when the issue is prompt/tool selection or model metadata. Use full trace collection when the issue is event ordering, completion behavior, or stream payload shape.

## Related Docs

- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)
- [Backend Prompt Constructor and Transparency Metadata Reference](../backend/llm/prompts/prompt_constructor_and_transparency_metadata_reference.md)
