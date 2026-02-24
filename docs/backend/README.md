---
summary: "Backend documentation hub covering bootstrap, API transport, agent runtime, tool lifecycle, model stack, and runtime services."
read_when:
  - When making backend changes beyond a single module.
  - When tracing full query lifecycle from WebSocket ingress to streamed response.
title: "Backend Functionality Map"
---

# Backend Functionality Map

This hub is the implementation-level map for `backend/src`. Use this as the entrypoint when changing backend behavior.

## Scope

Covers:

- Startup and dependency graph initialization
- Config/runtime policy normalization
- WebSocket + REST transport contracts
- Agent runtime loop and session lifecycle
- Tool lifecycle (prepare, send, wait, process)
- LLM provider/model/prompt/parser stack
- Runtime services (OCR, vision, embeddings, artifacts)

## Deep Pages

- [Bootstrap and Config](BOOTSTRAP_AND_CONFIG.md)
- [API and Transport](API_AND_TRANSPORT.md)
- [Agent and Tool Runtime](AGENT_AND_TOOL_RUNTIME.md)
- [LLM Models and Parsing](LLM_MODELS_AND_PARSING.md)
- [Services and Storage](SERVICES_AND_STORAGE.md)

## Backend Layout (Code)

Primary folders under `backend/src`:

- `agent/`: session state, execution loop, tool lifecycle, history commit
- `api/`: routes, handlers, schemas, transport wrappers, response formatting
- `core/`: bootstrap, DI containers, config, events, interfaces, validation
- `llm/`: provider abstraction, model cataloging, prompt construction, parsing
- `tools/`: backend-visible tool schema registry and orchestration bridge
- `services/`: OCR, vision, artifacts, token counting
- `embeddings/`: sentence-transformer embedding provider

## End-to-End Query Path (Condensed)

1. `/ws` receives message and handshake-validates connection.
2. Incoming message is parsed and validated via discriminated Pydantic schemas.
3. Handler registry dispatches by `type` (for example `query`).
4. Query handler starts stream pipeline + TTS session and delegates to `AgentSession`.
5. Agent loop builds prompt, calls provider, parses response, may dispatch tools.
6. Tool results return from frontend (`tool-result` or `tool-bundle-result`).
7. Result processor commits tool outputs to history, loop continues or completes.
8. Streamed events are formatted and sent back to frontend with transport context.
