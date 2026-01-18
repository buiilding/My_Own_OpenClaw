"""
API Layer Package.

This package contains the FastAPI application routes, dependencies, schema
definitions, and message handlers for the WebSocket-based API.

Architecture:
- routes/: FastAPI route definitions (WebSocket, REST endpoints)
- handlers/: Message handlers for WebSocket message types
- schema.py: Pydantic models for message validation
- deps.py: FastAPI dependency injection (app-lifespan-scoped container)

Message Flow:
1. Client connects via WebSocket → routes/websocket.py
2. Message validated via Pydantic → schema.py
3. Message routed to handler → handlers/base.py (MessageHandlerRegistry)
4. Handler processes → interacts with agent/core services
5. Response sent via transport → handlers/transport.py

Key Design Decisions:
- Container is app-lifespan-scoped (set once at startup, shared across requests)
- Handlers are stateless singletons (state lives in SessionManager/AgentSession)
- Transport abstraction exists for testing, not transport-agnostic architecture
- Error handling is standardized via handlers/error_utils.py
"""
