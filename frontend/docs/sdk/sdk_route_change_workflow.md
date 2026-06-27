---
summary: "Workflow for changing hosted SDK HTTP routes and hosted clients across backend route models, service helpers, TypeScript/Python clients, artifacts, OCR/vision, and tests."
read_when:
  - When adding or changing `/api/sdk/*` routes or hosted SDK client methods.
  - When changing SDK OCR, vision, prompt-preview, query-plan, models, tool-schema, or artifact behavior.
  - When deciding whether a hosted client feature belongs in SDK routes, websocket query transport, artifacts, or SDK local-runtime tools.
title: "SDK Route Change Workflow"
---

# SDK Route Change Workflow

SDK routes are hosted backend APIs. They are not Electron IPC, and they do not directly execute local desktop tools. Keep this boundary clear when adding client-facing features.

## Ownership Map

| Surface | Code roots | Owns |
| --- | --- | --- |
| Backend route registration | private backend implementation | `/api/sdk/*` endpoint paths, HTTP method, response model wiring, and concrete router import surface. |
| Backend request/response models | private backend implementation | Pydantic payload validation and typed response shapes. |
| Private hosted service helpers | private backend implementation | OCR/vision execution, artifact source resolution, overlay rendering, prompt preview, query plan. |
| Backend SDK helpers | private backend implementation | Tool/context helpers and sub-agent helper utilities. |
| TypeScript hosted client | `packages/windie-sdk-js` | Public TS route methods, request typing, artifact helpers, and `AgentClient.wakeUp` agent runtime. |
| Python SDK/developer client | `frontend/src/main/python/windie/sdk.py` | Python hosted client behavior. |

## Add or Change a Route

1. Add or update Pydantic request/response models in private backend implementation.
2. Add or update service behavior in private backend implementation.
3. Register the route in private backend implementation.
4. Keep route registration pointed at `backend.src.api.routes.sdk.router`.
5. Update [HTTP and WebSocket API Surface](../reference/http_api_surface.md) if the public route surface changes.
6. Add or update TypeScript client types and methods in `packages/windie-sdk-js`.
7. Update Python hosted client behavior when parity is expected.
8. Add backend route tests and client tests.

Do not add a hosted SDK route just to reach local machine state. Local screenshots, mouse/keyboard, shell/filesystem, and browser actions belong to the Electron/local-runtime tool path.

## Route Families

| Family | Backend owner | Client methods | Tests |
| --- | --- | --- | --- |
| OCR | `/api/sdk/ocr/*`, `run_ocr`, OCR ranking/overlay helpers | `client.ocr.*` | private backend tests, OCR service tests, `tests/frontend/AgentSdkClient.test.ts` |
| Vision | `/api/sdk/vision/*`, vision locate/describe/overlay helpers | `client.vision.*` | SDK route tests, vision provider/service tests, client tests |
| Prompt/debug | `/api/sdk/models`, `/tool-schemas`, `/tool-capabilities`, `/system-prompt`, `/prompt-preview`, `/query-plan` | `client.introspection.*`, `promptPreview`, `queryPlan` | SDK route tests, prompt/tool schema tests, client tests |
| Artifacts | `/api/artifacts/*`, artifact source resolution, overlay upload | `client.artifacts.*`, `artifactUrl`, `uploadArtifact` | private backend tests, `tests/frontend/RuntimeEndpointStore.test.ts`, client tests |
| Agent runtime | `/ws` and hosted event stream | `AgentClient.wakeUp`, `agent.ask`, `agent.run`, `agent.stream` | websocket backend tests and TS `AgentClient` runtime tests |

## Payload Rules

| Concern | Rule |
| --- | --- |
| Image input | SDK image request models should require exactly one of artifact id or inline base64 when that is the route contract. |
| Artifact ownership | Artifact-backed responses should use authenticated install identity when auth is enabled. |
| OCR and vision route auth | `POST /api/sdk/ocr/run`, `POST /api/sdk/ocr/find-text`, `POST /api/sdk/ocr/overlay`, and `POST /api/sdk/vision/locate-all` must require authenticated install identity before resolving images or invoking OCR/vision work. |
| Provider unavailability | OCR/vision provider failures should become structured `503` responses, not raw exceptions. |
| Region bounds | Region-based routes should reject out-of-bounds requests with validation-style errors. |
| Prompt preview | Debug prompt routes must not become a backdoor for local desktop state or secrets. |
| Models debug | `/api/sdk/models` must derive user context from the authenticated install identity and reject cross-user `user_id` overrides. |
| Query plan | Query-plan output is a planning/debug contract, not an executed tool path. |

## Validation Matrix

| Change | Minimum validation |
| --- | --- |
| SDK model/route/service change | private backend test runner |
| Artifact source or overlay change | Backend SDK route tests plus artifact route/store tests |
| OCR route behavior | SDK route tests plus focused OCR service/provider tests |
| Vision route behavior | SDK route tests plus focused vision service/provider tests |
| SDK/backend wire contract | private backend test runner; skips only when Node/npm or `packages/windie-sdk-js/node_modules` are unavailable |
| TypeScript client change | `<windie> test frontend -- AgentSdkClient` |
| Python SDK package client change | `<windie> test local-runtime -- tests/sidecar/test_windie_sdk_client.py -q` |
| Public route surface change | Docs-list plus focused Markdown link check for SDK/web/reference docs |

## Related Docs

- [SDK Hub](README.md)
- [Hosted Backend Clients](hosted_backend_clients.md)
- [SDK Auth and Error Handling](sdk_auth_and_error_handling.md)
- [OCR and Vision SDK](ocr_and_vision.md)
- [Query Planning and Trace](query_planning_and_trace.md)
- [Web Client Integration](../web/web_client_integration.md)
