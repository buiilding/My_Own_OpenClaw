---
summary: "Conceptual guide to WindieOS prompt construction, repo instructions, memory/context injection, model-visible tool schemas, and transparency events."
read_when:
  - When changing prompt construction, system prompt text, repo instruction forwarding, memory injection, tool-schema visibility, or prompt transparency events.
  - When debugging why the model saw or did not see a tool, screenshot, memory entry, workspace instruction, or full user-message context.
title: "Prompt and Tool Context"
---

# Prompt and Tool Context

The hosted backend owns model-facing prompt construction. The desktop app contributes context, but it should not decide the final prompt or model-visible tool schema.

## Prompt Inputs

| Input | Producer | Purpose |
| --- | --- | --- |
| backend system prompt | backend prompt templates/config | base agent behavior and safety/tool-use instructions |
| conversation history | backend session history, rehydrate payloads | model-facing prior messages and valid tool-call/tool-output pairs |
| current user content | Electron main query payload builder | `<user_query>` plus optional memory and attachment context |
| repo instructions | Electron main local discovery and backend fallback discovery | applicable `AGENTS.md` guidance when working in local repos |
| memory sections | sidecar memory search via Electron main | episodic and semantic context, excluding active conversation when possible |
| screenshots/artifacts | renderer capture/upload and backend artifact store | visual/multimodal context and durable replay refs |
| tool schemas | backend tool registry, policy, provider projection | model-visible capabilities for the current session |
| capability/provider health | backend policy/config | hides unavailable tools or coordinate methods before prompting |

## Tool Visibility Rule

The model should only see tools and capability fields that the current runtime can execute.

That means tool schema visibility is narrowed by:

- backend tool registry contents,
- active tool policy/profile,
- frontend-provided available tools and coordinate methods,
- provider/inference health,
- provider-specific schema projection.

The sidecar executable registry is intentionally separate. Parity is enforced through contracts and tests, not imports from backend into frontend or sidecar.

## Transparency Events

On the first interaction-loop iteration, backend prompt metadata can be streamed to the renderer:

1. `system-prompt`
2. `user-message-full`
3. `tool-schemas`

These are diagnostic UI events. They should reflect what the backend prepared, not a renderer reconstruction.

## Repo Instruction Rule

Hosted backend processes cannot assume they can read the user's local workspace. Electron main may forward pre-resolved repo instruction messages on query/rehydrate payloads. Backend prompt construction can also discover `AGENTS.md` when it has filesystem access to the workspace.

Keep ordering broad-to-specific so nested repo instructions can override parent guidance.

## Change Rules

- Do not hand-edit generated prompt/schema snapshots when a live generation path exists.
- Do not put hidden attachment context into transcript-visible user text unless that is the intended user-facing behavior.
- Do not expose a provider-native tool field unless the provider and parser path support it.
- Do not let frontend settings broaden backend model-visible tools without backend validation.
- When prompt metadata field names change, update backend event schemas and frontend transparency consumers together.

## Debug Routing

| Symptom | Start here |
| --- | --- |
| model did not see repo instructions | Electron repo instruction runtime and backend prompt constructor fallback discovery |
| tool missing from prompt | backend tool policy, provider health gates, available-tool handshake, provider projection |
| tool visible but sidecar cannot execute it | backend-sidecar parity tests and sidecar exposed-tool registry |
| transparency panel missing tool schemas | backend prompt metadata event emission and frontend transparency handlers |
| screenshot shown in UI but not useful to model | artifact upload refs, query payload screenshot context, backend artifact fetch path |

## Deep Docs

- [Agent Loop](agent_loop.md)
- [Context and Memory](context_and_memory.md)
- [Safety Boundaries](safety_boundaries.md)
- [Backend Prompt Context Change Workflow](../backend/llm/prompts/prompt_context_change_workflow.md)
- [Backend Prompt Constructor and Transparency Metadata Reference](../backend/llm/prompts/prompt_constructor_and_transparency_metadata_reference.md)
- [Backend LLM Prompt Docs Hub](../backend/llm/prompts/README.md)
- [Tool Contracts](../tools/tool_contracts.md)
- [Tool Policy Profiles and Capabilities](../tools/tool_policy_profiles_and_capabilities.md)
- [Frontend Message Send Surface Policy and Screenshot Capture](../frontend/renderer/chat/message_send_surface_policy_and_screenshot_capture_reference.md)
