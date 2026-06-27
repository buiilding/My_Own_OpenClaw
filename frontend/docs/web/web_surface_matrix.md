---
summary: "Public web-facing surface matrix for WindieOS landing page, hosted API contracts, websocket clients, SDK routes, artifacts, and future dashboard surfaces."
read_when:
  - When deciding whether a change belongs to the landing page, hosted API
    contract docs, websocket protocol, SDK client, Electron renderer, or future
    dashboard surface.
  - When adding public web/API docs or exposing a public backend contract to
    non-Electron clients.
title: "Web Surface Matrix"
---

# Web Surface Matrix

WindieOS is desktop-first. Public web-facing surfaces are either the landing page
or stable API/SDK contracts consumed by the desktop app and SDK clients. Backend
implementation, hosted operations, auth internals, and VM-runs control-plane
docs live in private backend docs.

## Surface Map

| Surface | Current state | Owner | Public contract |
| --- | --- | --- | --- |
| landing page | implemented | `frontend/landing.html`, `frontend/src/landing/*` | static/product web surface |
| main agent websocket | implemented | private backend route owner | `/ws` stream protocol |
| transcription websocket | implemented | private backend route owner | `/ws/transcription` audio transcription gateway |
| install registration | implemented | private backend route owner | `POST /api/install/register` |
| artifacts API | implemented | private backend route owner | upload/fetch artifact files |
| SDK/introspection API | implemented | private backend route owner plus public SDK clients | OCR, vision, prompt preview, query plan, debug introspection |
| memory/inference API | implemented | private backend route owner | embeddings, semantic summarize/title, health contracts |
| hosted web dashboard | future/planned | not a standalone web app today | do not document as current product behavior |

## Change Routing

| Change | Start docs | Code roots |
| --- | --- | --- |
| update public landing copy/sections | [Landing Page Change Workflow](landing_page_change_workflow.md), [Landing Page](landing_page.md) | `frontend/src/landing/*` |
| add/change public hosted API contract docs | [HTTP and WebSocket API Surface](../reference/http_api_surface.md), [WebSocket Event Reference](../reference/websocket_event_reference.md) | public SDK/client docs plus private backend implementation docs |
| add/change websocket event consumer behavior | [HTTP and WebSocket API Surface](../reference/http_api_surface.md), [WebSocket Event Reference](../reference/websocket_event_reference.md) | SDK event guards, renderer event consumers |
| expose SDK/client helper | [Web Client Integration](web_client_integration.md), [SDK Hub](../sdk/README.md) | `packages/windie-sdk-js`, `frontend/src/main/python/core` |
| make a browser-hosted dashboard | planning first | identify Electron IPC, local runtime, auth, and filesystem assumptions before implementation |

## Rules

- Public hosted API docs describe contracts, not private route implementation or
  operator runbooks.
- SDK consumers should not need Electron IPC or local-runtime Python for hosted
  API calls.
- Local desktop tools remain local-runtime executed; do not expose local
  filesystem/shell/computer control as generic hosted web endpoints.
- New public routes need auth, CORS, payload, client, and test coverage
  decisions in private backend docs before being advertised publicly.

## Related Docs

- [Web Surfaces Hub](README.md)
- [Web Client Integration](web_client_integration.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)
