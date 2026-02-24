---
summary: "Backend API docs sub-hub for HTTP/WebSocket routes, message-handler behavior, and transport lifecycle guarantees."
read_when:
  - When adding or changing backend API routes, handlers, or websocket limits.
  - When debugging incoming message dispatch and stream transport behavior.
title: "Backend API Docs Hub"
---

# Backend API Docs Hub

## Deep Pages

- [API and Transport](API_AND_TRANSPORT.md)
- [HTTP and WebSocket Endpoint Reference](HTTP_AND_WS_ENDPOINT_REFERENCE.md)
- [App Assembly and Container Dependency Reference](APP_ASSEMBLY_AND_CONTAINER_DEPENDENCY_REFERENCE.md)
- [Memory Route Validation and Fallback Reference](MEMORY_ROUTE_VALIDATION_AND_FALLBACK_REFERENCE.md)
- [WebSocket Connection and Task Lifecycle Reference](WEBSOCKET_CONNECTION_AND_TASK_LIFECYCLE_REFERENCE.md)
- [Handler Registry and Error Envelope Reference](HANDLER_REGISTRY_AND_ERROR_ENVELOPE_REFERENCE.md)
- [Handler Behavior Matrix](HANDLER_BEHAVIOR_MATRIX.md)
- [Non-Query Handler and Control Flow Reference](NON_QUERY_HANDLER_AND_CONTROL_FLOW_REFERENCE.md)

## Code Scope

- `backend/src/api/routes/*`
- `backend/src/api/handlers/*`
- `backend/src/api/transport/*`
