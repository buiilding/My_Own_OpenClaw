---
summary: "Compact quick cards for routing common WindieOS changes to the correct owner docs, checks, and safety notes."
read_when:
  - When you need a short owner-first route for a common WindieOS change before reading deeper docs.
  - When a change touches more than one runtime and you want the first docs, validation, and no-go checks.
title: "Agent Routing Quick Cards"
---

# Agent Routing Quick Cards

Use these cards after `docs/docs.json`, [Docs Directory](../getting-started/docs_directory.md), and [Agent Runtime Ownership and Change Routing](agent_runtime_ownership_and_change_routing.md). Each card names the likely owner, the first docs to read, the minimum validation shape, and the mistake to avoid.

These cards do not replace the deeper workflow docs. They are a fast map for choosing where to start.

## Backend API Route

Owner: backend.

Start with [Backend API Hub](../backend/api/README.md), [API Route Change Workflow](../backend/api/api_route_change_workflow.md), and [HTTP and WebSocket API Surface](../reference/http_api_surface.md).

Validate route models, auth behavior, service tests, and any SDK/client examples that call the route. Keep route contracts in backend docs and do not make frontend or sidecar code import backend objects for parity.

Avoid: adding a renderer-side fallback for malformed route payloads before fixing the backend producer.
