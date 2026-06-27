---
summary: "Conceptual guide to WindieOS prompt compilation, prompt construction, repo instructions, memory/context injection, model-visible tool schemas, and transparency events."
read_when:
  - When changing prompt compilation, prompt construction, system prompt text, repo instruction forwarding, memory injection, tool-schema visibility, or prompt transparency events.
  - When debugging why the model saw or did not see a tool, screenshot, memory entry, workspace instruction, or full user-message context.
title: "Prompt and Tool Context"
---

# Prompt and Tool Context

The hosted backend owns model-facing prompt construction. The desktop app contributes context, but it should not decide the final prompt or model-visible tool schema.

Use this page with [Agent-Visible Data Pipeline](../architecture/agent_visible_data_pipeline.md) when tracing what the model saw versus what the renderer displayed, what Electron main forwarded, or what local execution ran.

## Prompt Inputs

| Input | Producer | Purpose |
| --- | --- | --- |
| backend system prompt | backend prompt templates/config | base agent behavior and safety/tool-use instructions |
| conversation history | backend session history, rehydrate payloads | model-facing prior messages and valid tool-call/tool-output pairs |
| current user content | Electron main query payload builder | `<user_query>` plus optional memory and attachment context |
| repo instructions | Electron main local discovery and backend fallback discovery | applicable `AGENTS.md` guidance when working in local repos |
| memory sections | local-runtime memory search via Electron main | episodic and semantic context, excluding active conversation when possible |
| screenshots/artifacts | renderer capture/upload and backend artifact store | visual/multimodal context and durable replay refs |
| tool schemas | backend tool registry, policy, provider projection | model-visible capabilities for the current session |
| capability/provider health | backend policy/config | hides unavailable tools or coordinate methods before prompting |

## Model-Visible Assembly Order

`PromptConstructor.build_provider_prompt()` returns one provider prompt object
whose messages, model-visible tool schemas, and prompt metadata stay aligned.

The model-visible message list is assembled in this order:

1. effective system prompt
2. legacy injected repo instruction messages or backend workspace discovery
3. client-defined prompt layers, sorted by numeric `priority`
4. stored backend conversation history, including the current user query content and prior provider-safe tool rows

Do not assume renderer message rows are the prompt. Renderer rows are display
projections; backend history plus prompt constructor output are what the model
can actually see.

| Stage | Model-visible shape | Owner files | Drift check |
| --- | --- | --- | --- |
| system prompt | rendered system prompt text after OS/coordinate-method filtering | private backend implementation | If prompt text mentions a capability, prove the tool/policy/provider path supports it. |
| repo instructions | `agent_definition.agents_md` entries resolved by the client, or backend lookup fallback | `frontend/src/main/app/repo_instruction_runtime.cjs`, private backend implementation | Do not reconstruct local `AGENTS.md` in renderer UI as if that were backend truth. |
| client prompt layers | user-role messages wrapped in `<CLIENT_PROMPT_LAYER type="...">` after priority sort | private backend implementation, session config runtime | Do not add a layer unless it needs priority, provenance, and transparency metadata. |
| stored history | backend-rendered message history from `ConversationHistory.get_history()` | private backend implementation | Visible transcript can differ, but backend history must remain provider-replay-safe. |
| current user content | XML-like memory, attachment, system-state, and `<user_query>` sections inside the latest user message | `frontend/src/main/ipc/ipc_query_runtime.cjs`, backend query execution inputs | Hidden context should be intentional and visible through transparency metadata. |

## Tool Visibility Rule

The model should only see tools and capability fields that the current runtime can execute.

That means tool schema visibility is narrowed by:

- backend tool registry contents,
- active tool policy/profile,
- client-provided available tools and coordinate methods,
- provider/inference health,
- provider-specific schema projection.

The local-runtime executable registry is intentionally separate. Parity is enforced through contracts and tests, not imports from backend into frontend or sidecar.

## Tool Schema Projection Path

Tool schemas are not copied directly from the registry into the model request. The backend pipeline is:

1. read registry model tool names or declarations
2. remove disabled, interaction-disallowed, and dev-selection-pruned tools
3. merge valid client tool schemas while avoiding duplicate tool names
4. apply centralized tool policy filtering
5. project schemas for the active provider
6. reapply selection pruning after provider projection so provider-native non-function tools can survive while disabled helper fields do not leak

| Boundary | Shape | Owner files | Question before adding another adapter |
| --- | --- | --- | --- |
| registry -> policy | canonical backend tool declarations | private backend implementation | Is this a model-facing capability, or only a local-runtime executable helper? |
| policy -> provider projection | policy-filtered function/computer schemas; direct projection calls reapply `ToolPolicy.from_config(...)` so config availability and disabled-tool gates are still enforced | private backend implementation, provider adapters | Does the provider require this dialect, or are we working around a local parser bug? |
| provider request -> parser | provider-native tool call chunks | private backend implementation | Can the parser preserve the original model intent and IDs? |
| backend event -> SDK/main execution | executable tool event payload | private backend implementation, `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, `packages/windie-sdk-js/src/runtime/Agent.ts` | Are model-facing args and executable args being confused? |
| SDK/main -> local runtime | IPC/JSON-RPC executable params | `frontend/src/main/sidecar/local_runtime*.cjs`, `frontend/src/main/python/tools` | Is this the single JS/Python boundary mapper, or duplicated fallback logic? |

## Transparency Events

On the first interaction-loop iteration, backend prompt metadata can be streamed to the renderer:

1. `system-prompt`
2. `user-message-full`
3. `tool-schemas`

These are diagnostic UI events. They should reflect what the backend prepared, not a renderer reconstruction.

`ConversationContext` caches tool schemas and prompt metadata from the first
iteration. Later loop iterations rebuild prompt messages through
`PromptConstructor.build_prompt_messages(...)` and reuse the cached schema and
metadata objects, so system/repo/client prompt layers remain present after tool
calls while the tool surface stays stable for the turn.

| Transparency event | Source metadata | Must match |
| --- | --- | --- |
| `system-prompt` | `PromptMetadata.system_prompt` plus client prompt layer metadata | rendered backend system prompt and accepted prompt layers |
| `user-message-full` | `UserMessageMetadata.full_content` and extracted context metadata | backend-built user content, not the visible chat row |
| `tool-schemas` | validated `PromptMetadata.tool_schemas` | model-visible tool schemas after policy and provider projection |

## Repo Instruction Rule

Hosted backend processes cannot assume they can read the user's local workspace.
Electron main may forward pre-resolved repo instruction messages on query
payloads through `agent_definition.agents_md`. Backend prompt construction can
also discover `AGENTS.md` when it has filesystem access to the workspace.

Keep ordering broad-to-specific so nested repo instructions can override parent guidance.

## Change Rules

- Do not hand-edit generated prompt/schema snapshots when a live generation path exists.
- Do not put hidden attachment context into transcript-visible user text unless that is the intended user-facing behavior.
- Do not expose a provider-native tool field unless the provider and parser path support it.
- Do not let renderer settings broaden backend model-visible tools without backend validation.
- When prompt metadata field names change, update backend event schemas and frontend transparency consumers together.
- Do not add prompt layers that only duplicate repo instructions, visible transcript text, or backend history. Add a layer only when it has a distinct producer, priority, and removal condition.
- Do not patch missing model context by adding renderer-only display state. Fix the query payload, backend prompt constructor, or backend history source.

## Layer Removal Checks

Question the design when:

- the same context is present in both a client prompt layer and stored conversation history
- renderer transparency UI contains data that backend metadata did not emit
- a provider projection rewrites schema semantics instead of only changing provider dialect
- a tool schema is visible but no sidecar or remote executor can satisfy it
- memory context is embedded in user content and also injected by a backend prompt path
- repo instructions are forwarded by Electron main and rediscovered by backend without deterministic precedence
- generated prompt/schema artifacts differ from the live prompt constructor output

## Debug Routing

| Symptom | Start here |
| --- | --- |
| model did not see repo instructions | Electron repo instruction runtime and backend prompt constructor fallback discovery |
| tool missing from prompt | backend tool policy, provider health gates, `agent_definition.tools` availability, provider projection |
| tool visible but local runtime cannot execute it | backend/local-runtime parity tests and local-runtime exposed-tool registry backed by local-runtime Python modules |
| transparency panel missing tool schemas | backend prompt metadata event emission and frontend transparency handlers |
| screenshot shown in UI but not useful to model | artifact upload refs, query payload screenshot context, backend artifact fetch path |
| model saw stale or duplicate context | `PromptConstructor._build_prompt_messages`, client prompt layers, and backend history rendering |
| transparency differs from model behavior | first-iteration `ConversationContext` metadata cache and `EventPresenter.present_prompt_metadata` |

## Deep Docs

- [Agent Loop](agent_loop.md)
- [Context and Memory](context_and_memory.md)
- [Agent-Visible Data Pipeline](../architecture/agent_visible_data_pipeline.md)
- [Safety Boundaries](safety_boundaries.md)
- Backend Prompt Context Change Workflow (private backend docs)
- Backend Prompt Constructor and Transparency Metadata Reference (private backend docs)
- Backend LLM Prompt Docs Hub (private backend docs)
- [Tool Contracts](../tools/tool_contracts.md)
- [Tool Policy Profiles and Capabilities](../tools/tool_policy_profiles_and_capabilities.md)
- [Frontend Message Send Surface Policy and Screenshot Capture](../frontend/renderer/chat/message_send_surface_policy_and_screenshot_capture_reference.md)

## Evidence Notes

- Prompt-context changes need evidence from prompt construction, provider input,
  and transparency output when those surfaces differ.
- Tool-context changes need separate proof for model-visible schema exposure
  and local-runtime executable argument preparation.
