---
summary: "Workflow for changing WindieOS backend HTTP routes, websocket routes, incoming message handlers, outgoing event formatters, auth gates, route models, and API package exports."
read_when:
  - When adding, changing, or debugging backend HTTP routes, websocket message types, handler dispatch, response formatters, route models, auth middleware, health checks, or API package exports.
  - When a hosted API, SDK client, renderer websocket, VM run, artifact upload, memory route, transcription stream, or websocket event fails and you need to route the owning backend API layer before editing.
title: "API Route Change Workflow"
---

# API Route Change Workflow

Use this workflow for backend API work. Backend API owns hosted HTTP routes, websocket handshakes, incoming message validation, message-handler dispatch, outgoing formatter contracts, route auth, route-level models, and transport error envelopes.

Do not treat API work as only a router edit. Most changes move through several layers: app assembly, router registration, request/response models, dependency/container lookup, auth, service helpers, formatter output, clients, tests, and docs.

## Fast Owner Map

| Symptom or request | Backend API owner | First source roots | First tests | First docs |
| --- | --- | --- | --- | --- |
| Add or change an HTTP route | Route package, models, service/helper, app assembly | `backend/src/api/routes`, `backend/src/api/app_assembly.py`, `backend/src/api/routes/__init__.py` | route-specific `tests/backend/test_*routes*.py`, `tests/backend/test_app_assembly.py` | [HTTP and WebSocket Endpoint Reference](http_and_ws_endpoint_reference.md), [App Assembly Reference](app_assembly_and_container_dependency_reference.md) |
| Add or change websocket incoming message type | Incoming schema, contract registry, handler registry | `backend/src/api/schemas/incoming.py`, `backend/src/api/contracts/message_types.py`, `backend/src/api/handlers`, `backend/src/core/bootstrap/handler_initializer.py` | `tests/backend/test_websocket_message_handler.py`, `tests/backend/test_message_handler_registry.py`, `tests/backend/test_typed_message_handler.py` | [Handler Behavior Matrix](handler_behavior_matrix.md), [Handler Registry and Error Envelope](handler_registry_and_error_envelope_reference.md) |
| Add or change outgoing websocket event payload | Event formatter and outgoing schema contract | `backend/src/api/processing/formatters`, `backend/src/api/schemas/outgoing.py`, `backend/src/api/contracts/formatter_specs.py` | `tests/backend/test_response_formatter.py`, `tests/backend/test_outgoing_schema_contract.py`, `tests/backend/test_formatter_specs_contract.py` | [Formatter Dispatch and Schema Alignment](processing/formatter_dispatch_and_schema_alignment_reference.md), [WebSocket Event Reference](../../reference/websocket_event_reference.md) |
| Main `/ws` handshake, auth close, task limit, or parse failure changes | Websocket route and connection runtime | `backend/src/api/routes/websocket/*`, `backend/src/api/auth/*`, `backend/src/api/transport/*` | `tests/backend/test_websocket_connection.py`, `tests/backend/test_websocket_task_manager.py`, `tests/backend/test_websocket_message_parse_runtime.py` | [WebSocket Connection Lifecycle](../../gateway/websocket_connection_lifecycle.md), [WebSocket Message Parse Runtime](websocket/websocket_message_parse_validation_guard_and_task_scheduling_reference.md) |
| Query, stop, settings, rehydrate, wakeword, compact-history, or tool-result control behavior changes | API handlers and execution services | `backend/src/api/handlers/*`, `backend/src/api/services/*`, `backend/src/agent` when query loop behavior changes | `tests/backend/test_api_handlers.py`, `tests/backend/test_websocket_loop_runtime.py`, focused handler tests | [API Handlers Hub](handlers/README.md), [Query Lifecycle Change Workflow](../runtime/query_lifecycle_change_workflow.md) |
| Artifact upload/fetch route changes | Artifact route package and artifact store | `backend/src/api/routes/artifacts/*`, `backend/src/services/artifacts` | `tests/backend/test_artifact_routes.py`, `tests/backend/test_artifacts_store.py` | [Artifacts Route Package Split](artifacts_route_package_split_reference.md), [Artifact Change Workflow](../../desktop/artifact_change_workflow.md) |
| Embedding, semantic summarize/title, or memory health route changes | Memory route packages and memory services | `backend/src/api/routes/memory/*`, `backend/src/services`, `backend/src/embeddings` | `tests/backend/test_memory_routes.py`, embedding/semantic route tests | [Memory Route Validation](memory_route_validation_and_fallback_reference.md), [Backend API Memory Hub](memory/README.md) |
| SDK route or hosted client method changes | SDK route package, service, models, clients | `backend/src/api/routes/sdk/*`, `backend/src/sdk`, hosted client wrappers | `tests/backend/test_sdk_routes.py`, SDK helper tests | [SDK Route Change Workflow](../../sdk/sdk_route_change_workflow.md), [Hosted Backend Clients](../../sdk/hosted_backend_clients.md) |
| VM run route, worker heartbeat, run events, or control API changes | Runs route package and VM control service | `backend/src/api/routes/runs/*`, `backend/src/services/vm_run_control*` | `tests/backend/test_run_control_routes.py`, `tests/backend/test_run_control_route_helpers.py` | [Runs API Runbook](../../automation/runs_api_runbook.md), [Runs Route and VM Control Service](runs_route_and_vm_control_service_reference.md) |
| Transcription websocket or audio frame protocol changes | Transcription route and service providers | `backend/src/api/routes/transcription`, `backend/src/api/services/transcription` | `tests/backend/test_transcription_gateway.py`, provider-specific transcription tests | [Voice Audio Change Workflow](../../channels/voice_audio_change_workflow.md), [HTTP and WebSocket Endpoint Reference](http_and_ws_endpoint_reference.md) |
| Install-token auth, runs API key, CORS, 401/403/1008 behavior changes | API auth and gateway app assembly | `backend/src/api/auth/*`, `backend/src/api/app_assembly.py`, route dependencies | `tests/backend/test_install_auth.py`, websocket auth tests | [Gateway Auth and Health Runbook](../../gateway/gateway_auth_and_health_runbook.md), [REST Route Auth Matrix](../../gateway/rest_route_auth_matrix.md) |
| Route package split breaks imports or tests monkeypatch package symbols | Route package exports and compatibility surface | `backend/src/api/routes/**/__init__.py`, package `router.py`, `models.py`, `service.py` | package import/route tests for affected route | package split references under this API hub |

## Boundary Rules

- Backend API owns hosted route contracts, validation, auth, message dispatch, and formatter output.
- Backend API does not own Electron window behavior, renderer presentation, or local-runtime Python local execution.
- Do not trust renderer-provided user identity on hosted auth paths; use installed auth context where required.
- Keep route request/response models close to the route package unless there is an established shared schema.
- Keep outgoing websocket payload changes aligned with formatter specs and SDK/renderer consumers.
- Preserve package export compatibility when a route package has tests or clients importing from the package root.
- Keep sanitized client-facing errors separate from server logs.

## Change Sequence

1. **Classify route family.** Decide whether this is HTTP route, main websocket message, transcription websocket, SDK route, VM runs route, memory/artifact route, formatter, or auth middleware.
2. **Read the route docs.** Start with this workflow, [HTTP and WebSocket Endpoint Reference](http_and_ws_endpoint_reference.md), and the route-family page in the owner map.
3. **Trace registration.** Confirm where the router/message handler/formatter is registered before editing implementation.
4. **Update models and validation first.** Keep request/response schemas precise and test invalid payloads.
5. **Update service logic separately.** Put business/service behavior in route service/helper modules or existing backend services, not huge route functions.
6. **Update clients and consumers.** Renderer, SDK clients, VM worker, or sidecar remote clients may depend on route fields and status codes.
7. **Update formatter and event docs if websocket output changed.**
8. **Add tests at every changed boundary.** Route tests for HTTP, websocket parse/handler tests for incoming messages, formatter/schema tests for outgoing events, auth tests for protected routes.

## HTTP Route Checklist

When adding or changing an HTTP route:

- Add or update route models for request and response payloads.
- Register the router through `backend/src/api/routes/__init__.py` and app assembly if needed.
- Add dependency/container lookup through established app dependency helpers.
- Decide auth behavior and update gateway auth docs when protected surface changes.
- Keep route handlers thin; move reusable behavior into service/helper modules.
- Test success, validation failure, auth failure, not-found/conflict cases, and sanitized unexpected errors.
- Update SDK/client docs when external clients can call the route.

## WebSocket Message Checklist

When adding or changing a main `/ws` message:

- Add or update incoming schema and canonical message type.
- Register handler in the handler initializer/registry path.
- Define whether the handler is query-like, control-like, settings-like, tool-result-like, or metadata-only.
- Preserve per-connection task limits and active-query cancellation semantics.
- Update renderer/event consumers if the response path changes.
- Add parse, schema, handler, and runtime-loop tests.

## Outgoing Formatter Checklist

When changing an emitted event:

- Update formatter class and formatter spec together.
- Update outgoing schema contract and event reference docs.
- Preserve canonical event names used by SDK/renderer consumers.
- Test typed event input and dict compatibility when both are supported.
- Add SDK or renderer consumer tests when renderer behavior depends on new/changed fields.

## Auth and Error Checklist

When changing auth or error behavior:

- Identify route identity source: install token, runs API key, unauthenticated local/dev route, or service dependency.
- Keep HTTP status codes stable unless the contract intentionally changes.
- Keep websocket policy-close behavior documented when close codes or handshake validation changes.
- Sanitize client-facing details while preserving server-side logs for triage.
- Update [REST Route Auth Matrix](../../gateway/rest_route_auth_matrix.md) and [Hosted API and Auth](../../web/hosted_api_and_auth.md) when public auth behavior changes.

## Validation Matrix

| Changed surface | Focused validation |
| --- | --- |
| Router registration/app assembly | `./scripts/python-in-env backend pytest tests/backend/test_app_assembly.py` plus route tests |
| HTTP artifact/memory/sdk/runs route | Focused `tests/backend/test_*routes*.py` for that route family |
| Websocket parse/handshake/task runtime | `./scripts/python-in-env backend pytest tests/backend/test_websocket_*.py` |
| Message handler dispatch | `./scripts/python-in-env backend pytest tests/backend/test_api_handlers.py tests/backend/test_message_handler_registry.py tests/backend/test_typed_message_handler.py` |
| Formatter/outgoing event | `./scripts/python-in-env backend pytest tests/backend/test_response_formatter.py tests/backend/test_outgoing_schema_contract.py tests/backend/test_formatter_specs_contract.py` |
| Auth changes | `./scripts/python-in-env backend pytest tests/backend/test_install_auth.py` plus affected route/websocket tests |
| Docs-only API workflow updates | `<windie> docs list`, `git diff --check`, focused Markdown link checks |

## Review Checklist

Before committing API work:

- Did router registration, route models, handler/service logic, auth, and docs all move together?
- Did tests cover success and realistic failure cases?
- Did outgoing websocket events preserve client-visible names and required fields?
- Did auth changes update gateway/security/client docs?
- Did package exports remain compatible where existing imports depend on package-level symbols?
- Did `CHANGELOG.md` mention the API behavior or docs change?

## Related Docs

- [Backend API Docs Hub](README.md)
- [HTTP and WebSocket Endpoint Reference](http_and_ws_endpoint_reference.md)
- [Handler Behavior Matrix](handler_behavior_matrix.md)
- [Handler Registry and Error Envelope](handler_registry_and_error_envelope_reference.md)
- [Gateway Hub](../../gateway/README.md)
- [HTTP and WebSocket API Surface](../../reference/http_api_surface.md)
- [WebSocket Event Reference](../../reference/websocket_event_reference.md)
