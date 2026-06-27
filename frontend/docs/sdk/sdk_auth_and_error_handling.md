---
summary: "Auth, endpoint, and error-handling guide for hosted SDK routes, artifacts, websocket query transport, TypeScript client, and Python client."
read_when:
  - When changing SDK client auth headers, endpoint selection, error surfaces, artifact access, or websocket query transport.
  - When debugging SDK 401/422/503 failures, artifact fetch failures, or hosted client websocket connection issues.
title: "SDK Auth and Error Handling"
---

# SDK Auth and Error Handling

SDK clients use hosted backend auth rules. They do not bypass install auth, provider availability, route validation, or websocket handshake requirements.

## Auth by Route Family

| Route family | Auth | Notes |
| --- | --- | --- |
| `POST /api/install/register` | None | Issues install token and server-owned identity. |
| `/api/sdk/*` | `Authorization: Bearer <install_token>` when install auth is enabled | Includes OCR, vision, debug, and prompt-preview routes. `POST /api/sdk/ocr/run`, `POST /api/sdk/ocr/find-text`, `POST /api/sdk/ocr/overlay`, and `POST /api/sdk/vision/locate-all` reject missing authenticated identity before image resolution/provider work. Models, system-prompt, prompt-preview, and query-plan debug routes require authenticated identity and reject cross-user context; query-plan also rejects payload-selected workspace context. Debug helpers ignore payload or query `user_id` for session lookup unless an authenticated install identity is present. |
| `/api/artifacts/*` | Install bearer token | Artifact owner derives from authenticated identity; anonymous artifact access is rejected. |
| `/ws` | Bearer token in websocket headers plus handshake message | Authenticated identity overrides claimed `user_id`. |

## Endpoint Rules

| Client | Endpoint source |
| --- | --- |
| TypeScript hosted client | Constructor/base URL options in `packages/windie-sdk-js`. |
| Python hosted client | Python SDK/developer client configuration in `frontend/src/main/python/windie/sdk.py`. |
| Electron agent-host runtime facades | App-internal IPC into the SDK runtime adapter; not the same as hosted SDK HTTP client. |
| Local-runtime remote clients | Electron-injected backend URL and install token where hosted auth applies. |

Keep HTTP and websocket base URLs paired. A client using hosted HTTP and local websocket, or the inverse, will produce confusing identity and artifact behavior.

## Error Surfaces

| Status/signal | Meaning | First owner |
| --- | --- | --- |
| HTTP `401` | Missing or invalid install bearer token | Client auth header or backend auth middleware |
| HTTP `404` | Route path mismatch, missing artifact, missing tool/candidate, or router not registered | Route family owner |
| HTTP `422` | Pydantic request validation, invalid image base64, invalid region, or payload shape mismatch | SDK route models/service validation |
| HTTP `503` | Provider/service unavailable, install auth service unavailable, OCR/vision disabled/unhealthy | Backend provider/router/container readiness |
| Websocket close `1008` | Handshake/auth/schema policy failure | Websocket lifecycle owner |
| Client timeout | Network, endpoint selection, provider latency, or missing event completion | Client transport or backend route/service |

Do not collapse all SDK failures into `Error: request failed`. Preserve status, route, and response detail in client errors so agents can route failures correctly.

## Client Error-Handling Rules

- Include method, path, status, and parsed response detail when possible.
- Preserve structured provider errors from backend `503` responses.
- Treat `422` as caller payload/schema error, not provider failure.
- Treat `401` as credential/token failure before debugging provider code.
- For websocket query transport, report close code and reason.
- For artifact URLs, distinguish upload failure from fetch/display failure.

## Tests

| Behavior | Tests |
| --- | --- |
| Backend SDK route validation and provider errors | private backend tests |
| Artifact route auth/fetch/upload | private backend tests |
| TypeScript client request/error behavior | `tests/frontend/AgentSdkClient.test.ts` |
| Python SDK package client behavior | `tests/sidecar/test_windie_sdk_client.py` |
| Python SDK remote auth/error wrappers | `tests/sidecar/test_remote_api_client_base.py`, `tests/sidecar/test_remote_semantic_client.py` |

## Related Docs

- [Hosted Backend Clients](hosted_backend_clients.md)
- [SDK Route Change Workflow](sdk_route_change_workflow.md)
- Hosted API and Auth (private backend docs)
- Credentials and Tokens Matrix (private backend docs)
- REST Route Auth Matrix (private backend docs)
