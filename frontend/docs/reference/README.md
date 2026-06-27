---
summary: "Reference hub for WindieOS stable API, websocket, event, configuration, session, transcript, OpenClaw-structure, and validation lookup docs."
read_when:
  - When looking up a stable WindieOS interface, payload family, identifier contract, environment variable, or docs-organization policy.
  - When adding or changing reference docs that should be linked from the main docs hub.
title: "Reference Hub"
---

# Reference Hub

Use this section for stable lookup material: route maps, event vocabularies, config matrices, identifier contracts, and docs-organization policy. Concept docs explain the mental model. Backend/frontend deep docs explain implementation internals. Reference docs should help an agent answer "what is the exact contract and where is it owned?"

## Start Here

| Need | Read |
| --- | --- |
| Hosted REST/websocket routes and route owners | [HTTP and WebSocket API Surface](http_api_surface.md) |
| Longer API payload examples | [API Reference](api_reference.md) |
| Backend stream event names and renderer consumers | [WebSocket Event Reference](websocket_event_reference.md) |
| Environment variables and runtime config ownership | [Configuration Reference](configuration_reference.md) |
| User/session/conversation/transcript identifiers | [Session and Transcript Reference](session_and_transcript_reference.md) |
| Model-visible data versus transport/execution/replay payloads | [Agent-Visible Data Pipeline](../architecture/agent_visible_data_pipeline.md) |
| Concrete feature request to source roots, tests, and docs | [Code Change Surface Index](code_change_surface_index.md) |
| Canonical docs navigation | [`docs/docs.json`](../docs.json) |
| Compact docs directory | [Docs Directory](../getting-started/docs_directory.md) |
| OpenClaw docs structure benchmark | [OpenClaw Docs Structure Reference](openclaw_docs_structure_reference.md) |

## Reference Rules

- Keep tables current with the owning implementation and the focused deep docs.
- Prefer linking to a canonical deep reference instead of duplicating implementation internals.
- Mark planned or future behavior explicitly; do not present future API families as active routes.
- Update the main docs hub and `docs/README.md` when adding a new top-level reference page.
- Update `docs/docs.json` when a page belongs in canonical navigation.
- Update [Docs Directory](../getting-started/docs_directory.md) when a page should be easy to discover without scanning the full index.
- Keep examples credential-free and machine-path-free.

## Related Hubs

- [Documentation Hub](../getting-started/docs_hub.md)
- [Concepts Hub](../concepts/README.md)
- Gateway Hub (private backend docs)
- [Channels Hub](../channels/README.md)
- [Development Hub](../development/README.md)
