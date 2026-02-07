---
summary: "Frontend-Sourced Tool Schemas for Session Runtime"
read_when:
  - Planning tool schema ownership and synchronization.
  - Changing WebSocket handshake/session initialization.
  - Reducing backend/frontend schema drift.
---

# ADR 005: Frontend-Sourced Tool Schemas as Runtime Source of Truth

## Status

Proposed - Pending Implementation

## Date

2026-02-07

## Context

Today, backend and frontend both encode remote tool schema knowledge:
- Backend exposes remote tool stubs/schemas to the LLM (`backend/src/tools/remote.py` and `backend/src/tools/registry.py`).
- Frontend sidecar executes the real tools and has its own runtime/tool definitions.

This creates recurring alignment risk:
- Backend schema can drift from frontend runtime behavior.
- Frontend feature flags (enable/disable tools) are not the source-of-truth for what the LLM sees.
- New tool shipping requires backend schema updates even if execution lives fully in frontend.

Desired feature:
- On connect, frontend sends its current tool schemas to backend.
- Backend uses those session schemas for LLM prompt exposure and response parsing.
- Frontend can add/disable tools without backend hardcoding remote schemas.

## Decision

Adopt **session-scoped frontend-sourced tool schema catalogs**.

Core decision points:
1. Frontend sends a dedicated schema sync message after handshake.
2. Backend validates and stores schemas in a per-session catalog.
3. Prompt construction and parser validation use the session catalog.
4. Backend remote tool stubs become compatibility fallback during migration, then removed.

## Protocol Design (Planned)

## Connection Sequence

1. WebSocket connect.
2. Existing handshake (identity/session bootstrap).
3. New client message: `frontend-tool-schemas`.
4. Backend validates and stores session catalog.
5. Backend response: `frontend-tool-schemas-accepted` (with accepted/rejected info).
6. First `query` uses accepted session schemas.

## New Client Message

```json
{
  "id": "uuid-v4",
  "type": "frontend-tool-schemas",
  "payload": {
    "schema_version": "2026-02-07",
    "catalog_revision": 1,
    "client_build": "frontend@1.3.0",
    "tools": [
      {
        "name": "read_file",
        "description": "Read a UTF-8 text file from disk",
        "parameters": {
          "type": "object",
          "properties": {
            "path": { "type": "string" }
          },
          "required": ["path"]
        },
        "execution": {
          "surface": "frontend-sidecar",
          "enabled": true
        }
      }
    ]
  }
}
```

## New Server Response

```json
{
  "id": "uuid-v4",
  "type": "frontend-tool-schemas-accepted",
  "payload": {
    "catalog_revision": 1,
    "accepted_tools": ["read_file"],
    "rejected_tools": [
      { "name": "danger_tool", "reason": "policy_denied" }
    ]
  }
}
```

## Why separate message (not handshake)?

- Handshake stays small and stable.
- Schema payloads can be large and independently versioned.
- Easier retries and re-sync without reconnect.

## Backend Architecture Changes (Planned)

## New Session State

Introduce `SessionToolCatalog` (session-scoped):
- `tools_by_name: Dict[str, ToolSchema]`
- `catalog_revision: int`
- `client_build: str`
- `received_at: datetime`

## Prompt + Parser Integration

- Prompt constructor reads `SessionToolCatalog` for `<tool_schemas>`.
- Response parser validator checks tool names/args against session catalog.
- If no catalog yet, use compatibility fallback policy (see migration plan).

## Compatibility and Migration Plan

## Phase 0 (compat mode)
- Add schema sync message type and storage.
- Keep backend remote schemas as active source.
- Emit metrics for catalog receipt and validation outcomes.

## Phase 1 (dual-read mode)
- Prefer frontend catalog for prompt schemas.
- Keep backend registry fallback if catalog missing/invalid.
- Add explicit warnings when fallback is used.

## Phase 2 (frontend-primary mode)
- Parser validation uses session catalog.
- Backend remote schemas only for legacy clients.

## Phase 3 (cleanup)
- Remove backend remote schema stubs for frontend-executed tools.
- Keep backend-owned schemas only for truly backend-executed tools.

## Security and Trust Analysis

Important distinction:
- **Schema advertisement** is not execution authority.
- Frontend schema presence must not bypass policy/entitlement checks.

## Risks

1. Malicious client advertises unsafe tools.
2. Schema inflation (DoS via huge schema payload).
3. Inconsistent tool behavior across clients/builds.
4. Hosted multi-tenant trust model may not allow unrestricted client-defined tools.

## Mitigations

1. Validation and limits:
   - max tool count
   - max schema payload bytes
   - max JSON nesting/depth
   - strict required fields
2. Policy gate:
   - enforce allowlist/denylist by plan/tenant
   - reject tools not permitted by server policy
3. Execution gate:
   - sidecar registry still validates executable tool names/args
4. Observability:
   - log accepted/rejected tools and reasons
   - track fallback usage and parse failures by revision

## Trust Modes

- Local-only mode: can allow broader frontend control by user preference.
- Hosted mode: must enforce server-side policy and entitlements regardless of client catalog.

Conclusion:
- “Frontend total control” is acceptable for local/private mode.
- Hosted mode requires policy-constrained frontend control.

## Operational Analysis

## Benefits

- Eliminates backend/frontend schema drift for remote tools.
- Faster frontend iteration (add/disable tools without backend schema patch).
- Better feature-flag behavior (LLM sees exactly what frontend can execute now).
- Cleaner ownership boundary: frontend owns frontend-executed schemas.

## Costs

- Adds protocol and validation complexity.
- Requires migration for parser/prompt flows.
- Requires clear policy model for hosted security.

## Failure Modes and Fallbacks

1. Schema sync missing:
   - fallback to backend legacy schemas (during migration only).
2. Schema sync invalid:
   - reject invalid tools; continue with accepted subset.
3. Catalog update races with in-flight query:
   - use revision pinning per query turn.

## Implementation Guide (No Code Yet)

1. Add new WebSocket message types:
   - incoming: `frontend-tool-schemas`
   - outgoing: `frontend-tool-schemas-accepted`
2. Add pydantic schemas for tool catalog payload + validation limits.
3. Add session catalog storage + revision tracking.
4. Wire prompt constructor to session catalog (dual-read mode first).
5. Wire parser validator to session catalog (behind feature flag).
6. Add policy/entitlement filter before acceptance.
7. Add telemetry:
   - catalog received count
   - invalid schema rejects
   - fallback usage
   - parse failures by catalog revision
8. Remove backend remote stubs after legacy window closes.

## Test Strategy (Planned)

- Unit:
  - catalog schema validation limits
  - policy filtering (accepted vs rejected tools)
  - revision pinning behavior
- Integration:
  - connect -> schema sync -> query -> tool call path
  - missing/invalid catalog fallback
  - mid-session catalog update handling
- Security:
  - oversized payload rejection
  - forbidden tool rejection despite client advertisement

## Alternatives Considered

## A) Keep backend as schema source-of-truth

Pros:
- Simpler trust model.

Cons:
- Persistent drift/duplication burden.
- Slower frontend feature delivery.

## B) Bidirectional sync (backend + frontend merge)

Pros:
- Flexible.

Cons:
- Conflict complexity and ambiguous ownership.

## C) Embed full catalog in handshake

Pros:
- Fewer message types.

Cons:
- Large/fragile handshake.
- Harder re-sync/update semantics.

## Rationale

Chosen design (dedicated post-handshake schema sync) provides the best balance of:
- clear ownership,
- runtime flexibility,
- migration safety,
- and policy enforcement compatibility.

## Open Questions

1. Should catalog be mandatory before first query in hosted mode?
2. How long should backend maintain legacy fallback?
3. Should tool catalogs be signed by client build identity in hosted enterprise mode?
4. Should server expose an introspection endpoint for “effective accepted tool catalog”?
