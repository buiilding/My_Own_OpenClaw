---
summary: "Conceptual map of WindieOS context, transcript history, artifacts, screenshots, local memory, and semantic memory."
read_when:
  - When changing memory, transcript replay, screenshot context, or prompt context behavior.
  - When explaining what WindieOS remembers and how context reaches the model.
title: "Context and Memory"
---

# Context and Memory

WindieOS context is assembled from live UI state, stored transcript state, local memory, artifacts, screenshots, model/tool metadata, and optional workspace instructions. These sources are related but not interchangeable.

## Context Sources

| Source | Runtime owner | Purpose |
| --- | --- | --- |
| Chat transcript | Renderer and local-runtime memory store | Local visible conversation history, replay, resume, search, and dashboard lists |
| Backend conversation history | Backend session/history modules | Model-facing history and tool-call/tool-output linkage during active backend sessions |
| Semantic memory | Local-runtime memory plus backend semantic/title endpoints | Durable facts and summaries derived from completed interactions |
| Screenshots and artifacts | Renderer capture/upload, backend artifact store | Multimodal context for the model and durable refs for replay/tool output |
| System state | Sidecar system-state collectors and renderer/main payload builders | Active app/window/screen state for context and tool transparency |
| Repo instructions | Electron main and backend prompt construction | Local `AGENTS.md` instructions forwarded when the hosted backend cannot inspect local files directly |

## Practical Rules

- Do not treat visible chat transcript rows as backend model history unless the rehydrate path has normalized and sent them.
- Do not store semantic memory for low-signal turns that explicitly produce no durable facts.
- Preserve artifact refs when screenshots are needed for replay; inline screenshots are fallback context, not the preferred durable reference.
- Keep local memory writes non-fatal when embeddings are unavailable.
- Keep transcript replay rows and semantic memory rows separate so deleting one does not silently leave stale state in the other.

## Implementation Entry Points

- Renderer transcript queue: `frontend/src/renderer/infrastructure/transcript/*`
- Local-runtime memory store: `frontend/src/main/python/memory/*`
- Backend memory routes: `backend/src/api/routes/memory/*`
- Backend embedding/semantic services: `backend/src/services/*embedding*`, `backend/src/api/routes/memory/semantic/*`
- Artifact flow: `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts`, `frontend/src/main/sidecar/local_runtime_screenshot_attachment.cjs`, `backend/src/api/routes/artifacts/*`, `backend/src/services/artifacts/*`

## Deep Docs

- [Memory Hub](../memory/README.md)
- [Memory System](../architecture/memory_system.md)
- [Frontend Transcript Session + Rehydrate Reference](../frontend/renderer/transcript_session_and_rehydrate_reference.md)
- [Local Runtime Memory Docs Hub](../frontend/sidecar/memory/README.md)
- [Backend Embedding + Semantic Memory Runtime Reference](../backend/services/embedding_and_semantic_memory_runtime_reference.md)
- [Backend Artifact/Screenshot/System-State Flow Reference](../backend/services/artifact_screenshot_and_system_state_flow_reference.md)

## Evidence Notes

- Separate recall evidence from persistence evidence: a value appearing in a
  prompt does not prove it was durably stored.
- For memory regressions, inspect the write path, index/update path, retrieval
  query, and prompt-injection path before changing ranking or summaries.
