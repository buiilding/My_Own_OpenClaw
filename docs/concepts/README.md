---
summary: "Concepts hub for WindieOS runtime model, agent loop, tools, memory, and safety boundaries."
read_when:
  - When onboarding to WindieOS concepts before implementation work.
  - When deciding whether a change belongs in architecture, backend, frontend, sidecar, or operations docs.
title: "Concepts Hub"
---

# Concepts Hub

WindieOS concepts are product and system explanations that sit above implementation references. Use this section when you need the mental model first, then jump into backend/frontend deep docs for exact files.

## Core Concepts

- [Runtime Model](runtime_model.md) explains the hosted backend, Electron frontend, and Python sidecar split.
- [Agent Loop](agent_loop.md) explains query ingress, prompt construction, model streaming, tool turns, and completion.
- [Context and Memory](context_and_memory.md) explains transcript state, local memory, semantic memory, artifacts, screenshots, and prompt context.
- [Safety Boundaries](safety_boundaries.md) explains trust boundaries, permissions, provider health, and why schema parity is tested instead of imported across layers.

## Related Implementation Docs

- [System Architecture](../architecture/architecture.md)
- [Backend Functionality Map](../backend/README.md)
- [Frontend Functionality Map](../frontend/README.md)
- [Tool System](../architecture/tool_system.md)
- [Memory System](../architecture/memory_system.md)
- [Configuration](../operations/configuration.md)
