---
summary: "Concepts hub for WindieOS runtime model, agent loop, tools, memory, and safety boundaries."
read_when:
  - When onboarding to WindieOS concepts before implementation work.
  - When deciding whether a change belongs in architecture, backend, frontend, sidecar, or operations docs.
title: "Concepts Hub"
---

# Concepts Hub

WindieOS concepts are product and system explanations that sit above implementation references. Use this section when you need the mental model first, then jump into backend, renderer, or sidecar deep docs for exact files.

## Core Concepts

- [Runtime Model](runtime_model.md) explains the hosted backend, Electron main host, renderer, and local-runtime Python split.
- [Sessions and Conversations](sessions_and_conversations.md) explains `user_id`, `session_id`, `conversation_ref`, transcript replay, backend rehydrate, and conversation-scoped routing.
- [Agent Loop](agent_loop.md) explains query ingress, prompt construction, model streaming, tool turns, and completion.
- [Streaming and Events](streaming_and_events.md) explains websocket event families, renderer consumers, correlation fields, and tool/audio event routing.
- [Context and Memory](context_and_memory.md) explains transcript state, local memory, semantic memory, artifacts, screenshots, and prompt context.
- [Prompt and Tool Context](prompt_and_tool_context.md) explains prompt inputs, repo instruction forwarding, tool-schema visibility, and transparency events.
- [Model Provider Selection](model_provider_selection.md) explains provider runtime selection, catalog metadata, availability gates, and current failover boundaries.
- [Usage and Token Accounting](usage_and_token_accounting.md) explains token-count events, provider usage diagnostics, estimates, cache metrics, and billing boundaries.
- [Safety Boundaries](safety_boundaries.md) explains trust boundaries, permissions, provider health, and why schema parity is tested instead of imported across layers.

## Related Implementation Docs

- [System Architecture](../architecture/architecture.md)
- Backend Functionality Map (private backend docs)
- [Frontend Functionality Map](../frontend/README.md)
- Backend Tool System (private backend docs)
- [Memory System](../architecture/memory_system.md)
- Configuration (private backend docs)
