---
summary: "SDK query planning and tracing guide covering prompt previews, query-plan endpoint, websocket event collection, and debugging."
read_when:
  - When changing SDK query plan or trace helpers.
  - When debugging model prompt/tool transparency without using the desktop UI.
title: "Query Planning and Trace"
---

# Query Planning and Trace

Hosted SDK routes and clients let developer tools inspect backend prompt/tool behavior without going through the Electron UI.

## Capabilities

- Build a planned websocket query payload.
- Preview prompt/system/tool transparency metadata.
- List debug models.
- Inspect tool schemas and capabilities.
- Run a query trace and collect streamed backend events until completion.

## Owners

- Backend route: `backend/src/api/routes/sdk/router.py`
- Backend service helpers: `backend/src/api/routes/sdk/service.py`
- TypeScript trace helper: `packages/windie-sdk-js`
- Python trace helper: `frontend/src/main/python/windie/sdk.py`

## Debugging Use

Use query planning when the issue is prompt/tool selection or model metadata. Use full trace collection when the issue is event ordering, completion behavior, or stream payload shape.

The debug models route resolves the effective config for the returned snapshot,
but the catalog itself comes from the backend model service. Keep model listing
on that single service path instead of threading route config into catalog
loading.

Both `/api/sdk/prompt-preview` and `/api/sdk/query-plan` accept
`agent_definition`. Use that when debugging a custom UI, TUI, CLI, or SDK
client so the preview uses the same system prompt override, client tool
manifest, skills, AGENTS.md instructions, plugin prompt layers, and runtime
facts that the websocket handshake will use.

`/api/sdk/models`, `/api/sdk/system-prompt`, `/api/sdk/prompt-preview`, and
`/api/sdk/query-plan` are privileged debug routes. They require an
authenticated install identity and reject `user_id` values that do not match
that identity. Query-plan also does not accept payload-selected `workspace_path`
values. Use the normal authenticated desktop query path when workspace-local
prompt context is needed.

## Related Docs

- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)
- [Agent Definition Contract](agent_definition.md)
- [Backend Prompt Constructor and Transparency Metadata Reference](../backend/llm/prompts/prompt_constructor_and_transparency_metadata_reference.md)
