---
summary: "Workflow for changing WindieOS backend prompt construction, system prompt text, repo instruction injection, memory and attachment context, model-visible tool schemas, prompt metadata, and generated prompt/schema snapshots."
read_when:
  - When changing backend prompt construction, `system_prompt.txt`, repo instruction handling, prompt metadata events, model-visible tool-schema inclusion, memory/attachment context, prompt transparency payloads, or generated prompt/schema artifacts.
  - When debugging why the model saw or did not see repo instructions, memory, screenshots, tool schemas, full user-message metadata, provider capability gates, or prompt transparency events.
title: "Prompt Context Change Workflow"
---

# Prompt Context Change Workflow

Use this workflow for model-facing context. The backend owns final prompt construction, system prompt loading, model-visible tool schemas, prompt metadata, and transparency events. Desktop frontend can contribute context through query payloads; sidecar can contribute local memory results; backend decides what reaches the model.

Do not patch prompt problems in renderer display code or sidecar runtime argument models. Fix the producer of the model-facing context, then update transparency events and tests so future agents can prove what the model saw.

## Fast Owner Map

| Symptom or request | Prompt owner | First source roots | First tests | First docs |
| --- | --- | --- | --- | --- |
| System prompt text or base instruction behavior changes | Prompt manager and system prompt asset | `backend/src/llm/prompts/system_prompt.txt`, `backend/src/llm/prompts/prompts.py` | `tests/backend/test_prompt_manager.py` | [Prompt Manager and System Prompt Lifecycle](prompt_manager_and_system_prompt_lifecycle_reference.md) |
| Prompt message assembly, user content, history, memory, screenshots, or tool inclusion changes | Prompt constructor | `backend/src/llm/prompts/prompt_constructor.py`, `backend/src/llm/prompts/prompt_metadata.py` | `tests/backend/test_prompt_constructor_utils.py`, query/context tests | [Prompt Constructor and Transparency Metadata](prompt_constructor_and_transparency_metadata_reference.md), [Prompt and Tool Context](../../../concepts/prompt_and_tool_context.md) |
| Repo instructions are missing, duplicated, or in wrong order | Repo instruction discovery/injection | `backend/src/llm/prompts/repo_instructions.py`, Electron repo instruction runtime when forwarded from desktop | `tests/backend/test_repo_instructions.py`, frontend repo instruction tests when forwarding changes | [Prompt and Tool Context](../../../concepts/prompt_and_tool_context.md), [Main Process Change Workflow](../../../frontend/main/main_process_change_workflow.md) |
| Tool schema missing, too broad, malformed, or different from capability policy | Backend tool registry, policy, prompt constructor, formatter metadata | `backend/src/tools`, `backend/src/tools/tool_selection.py`, `backend/src/llm/prompts/prompt_constructor.py`, `backend/src/api/processing/formatters/tool_schemas.py` | schema/policy tests, `tests/backend/test_system_tool_schema_contract.py`, `tests/backend/test_outgoing_schema_contract.py` | [Tool Policy Profiles and Capabilities](../../../tools/tool_policy_profiles_and_capabilities.md), [Tool Contracts](../../../tools/tool_contracts.md) |
| Prompt metadata panel misses system prompt, full user message, or tool schemas | Conversation context and event presenter | `backend/src/agent/llm/conversation_context.py`, `backend/src/agent/llm/event_presenter.py`, `backend/src/core/events/streaming_events.py` | interaction-loop/presenter/formatter tests | [Conversation Context and Event Presenter Reference](../../agent/llm/conversation_context_and_event_presenter_prompt_metadata_reference.md) |
| Generated `prompts/schema.txt` or prompt artifact is stale | Live prompt generation path and checked-in generated artifact | live prompt constructor path, `prompts/schema.txt`, prompt tests | prompt/schema snapshot tests or regeneration verification | [Prompt and Tool Context](../../../concepts/prompt_and_tool_context.md) |
| Memory context injected into prompt is wrong or includes active conversation | Local-runtime memory retrieval plus backend prompt constructor | local-runtime memory search, Electron query payload, prompt constructor | local-runtime memory tests, backend prompt constructor tests | [Memory Change Workflow](../../../memory/memory_change_workflow.md), [Context and Memory](../../../concepts/context_and_memory.md) |
| Screenshot/attachment context appears in UI but not prompt | Renderer artifact upload, Electron query payload, backend artifact/context path | renderer screenshot pipeline, `backend/src/api/routes/artifacts`, prompt constructor | frontend artifact tests, backend artifact/prompt tests | [Artifact Change Workflow](../../../desktop/artifact_change_workflow.md), [Prompt and Tool Context](../../../concepts/prompt_and_tool_context.md) |
| Sub-agent or SDK-authored session prompt differs from normal desktop prompt | SDK/session prompt builder | `backend/src/core/services/agent_factory.py`, prompt modules | SDK/context/session initializer tests | [Tool Authoring](../../../sdk/tool_authoring.md), [Backend SDK Sub-Agent Helper Runtime](../../sdk/subagent_session_helper_runtime_reference.md) |

## Boundary Rules

- Backend prompt construction is the source of truth for what the model sees.
- Renderer transparency panels should display backend-emitted prompt metadata, not reconstruct prompt state locally.
- Sidecar executable tool schemas are not model-facing prompt schemas. Keep parity through tests, not imports.
- Do not expose a tool/capability field unless the active backend policy, provider projection, parser path, and SDK/main local execution path support it.
- Repo instruction order must stay broad-to-specific so nested instructions can override parent guidance.
- Do not hand-edit generated prompt/schema artifacts when a live generation path exists; regenerate them from the prompt path and document the command used.
- Prompt metadata events should stay deterministic and first-iteration-only unless the interaction-loop contract intentionally changes.
- Prompt messages, tool schemas, and prompt metadata are one contract. If one changes, check the other two for drift.
- Client prompt layers need a distinct producer, priority, and reason to exist. Do not use them as a generic place to duplicate transcript text, repo instructions, or settings state.
- Provider projection may change schema dialect, but it must not silently change the model-facing tool semantics.

## Change Sequence

1. **Classify the prompt input.** Decide whether the owner is system prompt text, prompt constructor assembly, repo instructions, tool schema visibility, memory/attachment context, metadata event emission, or generated artifact refresh.
2. **Trace the producer.** Identify whether context came from backend session history, Electron query payload, local-runtime memory, artifact store, backend tool registry, provider health, or SDK session builder.
3. **Update the backend prompt owner.** Change prompt modules or tool policy first; avoid patching renderer transparency or sidecar schemas to mask backend prompt drift.
4. **Update transparency events if visible metadata changes.** Keep `system-prompt`, `user-message-full`, and `tool-schemas` payloads aligned with actual prompt inputs.
5. **Regenerate generated artifacts when necessary.** Refresh `prompts/schema.txt` from the live prompt path instead of editing it by hand.
6. **Update tests at each changed boundary.** Prompt constructor tests for message assembly, tool schema tests for visibility, event/formatter tests for metadata, frontend tests only when consumer rendering changes.
7. **Update docs and changelog.** Prompt changes affect agent behavior, so leave an explicit trail.

## Prompt Data Shape Walkthrough

When debugging prompt drift, inspect the shapes in this order:

| Shape | Producer | Consumer | Drift check |
| --- | --- | --- | --- |
| rendered system prompt | `PromptManager.render_system_prompt()` | provider request path and `system-prompt` transparency event | OS and coordinate-method filtering should match active config. |
| repo instruction layers | Electron `agent_definition.agents_md` or `resolve_workspace_repo_instruction_messages()` fallback | `PromptConstructor._get_client_prompt_layer_messages()` / `_build_prompt_messages()` | Broad-to-specific order should be deterministic and not duplicated. |
| client prompt layers | session runtime config | `PromptConstructor._get_client_prompt_layer_messages()` | Layers sort by `priority` and become user-role messages with explicit layer tags. |
| stored history | `ConversationHistory.get_history()` | first and later provider prompt iterations | History must keep provider-safe tool-call/tool-output structure. |
| current user content | Electron query payload builder and backend query inputs | stored history and `user-message-full` transparency | Hidden memory/attachment sections should match backend metadata. |
| tool schemas | registry, client schemas, tool policy, provider projection | provider request and `tool-schemas` transparency | Tool visibility must match policy, provider support, and executable runtime support. |
| prompt metadata | `PromptMetadata` and `UserMessageMetadata` | `EventPresenter.present_prompt_metadata()` | Metadata should describe actual prompt constructor output, not renderer display state. |

If the bad shape appears first in a consumer, keep tracing backward until the producer that first created that shape. Most unnecessary layers are adapters that copy a bad shape forward instead of fixing the producer.

## System Prompt Checklist

When changing `system_prompt.txt` or prompt manager behavior:

- Keep behavioral rules precise and current with implemented tools.
- Avoid documenting future capabilities as current model instructions.
- Update prompt manager tests and focused direct-module import checks when
  changing prompt helper module boundaries.
- Regenerate prompt/schema snapshots if the generated artifact includes changed instructions.
- Update concept/tool docs when model-facing instruction semantics change.

## Tool Schema Checklist

When changing model-visible tools:

- Update backend canonical schema owner and policy gates.
- Check whether the tool is a registry tool, a client tool schema, a provider-native projection, or a sidecar-only executable helper before choosing the owner.
- Check provider-specific projection and parser compatibility.
- Check capability/provider health gates so unavailable tools stay hidden.
- Update transparency formatter/schema tests for `tool-schemas`.
- Update sidecar parity docs/tests only when the executable sidecar surface changes.
- Regenerate `prompts/schema.txt` when it is meant to reflect the current live schema.

## Context Injection Checklist

When changing memory, repo instructions, screenshots, files, or attachments:

- Preserve user-visible text vs hidden context boundaries.
- Keep repo instructions ordered broad-to-specific.
- Keep active conversation exclusions for memory retrieval where expected.
- Preserve artifact references needed for replay and multimodal model access.
- Add tests for omitted, single, multiple, malformed, and unavailable context cases.

## Transparency Event Checklist

When changing prompt metadata events:

- Keep event order deterministic: `system-prompt`, then `user-message-full`, then `tool-schemas`.
- Validate tool-schema payload shape before emitting.
- Avoid emitting duplicate first-turn metadata on later loop iterations.
- Update frontend transparency consumers only if payload fields or event names change.
- Update [WebSocket Event Reference](../../../reference/websocket_event_reference.md) when event contracts change.
- If a later tool turn appears to use stale transparency metadata, distinguish cached first-iteration metadata from live backend history before changing event emission.

## Redundant Layer Checks

Before adding a mapper, layer, or fallback:

- Does this context already exist in stored history, repo instructions, memory sections, or a client prompt layer?
- Is the renderer displaying backend-emitted metadata, or reconstructing a local approximation?
- Is the provider projection only adapting dialect, or changing semantics that should belong in canonical schema/policy?
- Does the sidecar executable payload need different fields because of the JS/Python boundary, or because upstream schema is vague?
- Can a test prove the exact model-visible prompt/tool shape instead of relying on UI output?

## Validation Matrix

| Changed surface | Focused validation |
| --- | --- |
| System prompt/prompt manager | `./scripts/python-in-env backend pytest tests/backend/test_prompt_manager.py` |
| Prompt constructor/metadata | `./scripts/python-in-env backend pytest tests/backend/test_prompt_constructor_utils.py` plus focused interaction-loop tests |
| Repo instructions | `./scripts/python-in-env backend pytest tests/backend/test_repo_instructions.py` plus frontend repo-instruction tests if desktop forwarding changes |
| Tool schema visibility | backend schema/policy tests plus `tests/backend/test_outgoing_schema_contract.py` when transparency changes |
| Prompt metadata events | interaction-loop/event presenter/formatter tests and frontend transparency tests if consumer shape changes |
| Generated prompt/schema artifact | regenerate from live prompt path, then run prompt/schema tests and `git diff --check` |
| Docs-only prompt workflow updates | `<windie> docs list`, `git diff --check`, focused Markdown link checks |

## Review Checklist

Before committing prompt/context work:

- Did the change update the real backend prompt producer?
- Did tool visibility match backend policy, provider capability, and executable runtime support?
- Did repo instruction and memory/attachment context boundaries stay explicit?
- Did transparency events still reflect actual backend prompt state?
- Were generated artifacts regenerated instead of hand-edited?
- Did tests prove what the model sees?
- Did docs and `CHANGELOG.md` move with the prompt behavior change?

## Related Docs

- [Backend LLM Prompt Docs Hub](README.md)
- [Prompt and Tool Context](../../../concepts/prompt_and_tool_context.md)
- [Agent-Visible Data Pipeline](../../../architecture/agent_visible_data_pipeline.md)
- [Prompt Constructor and Transparency Metadata Reference](prompt_constructor_and_transparency_metadata_reference.md)
- [Conversation Context and Event Presenter Reference](../../agent/llm/conversation_context_and_event_presenter_prompt_metadata_reference.md)
- [Tool Policy Profiles and Capabilities](../../../tools/tool_policy_profiles_and_capabilities.md)
- [Memory Change Workflow](../../../memory/memory_change_workflow.md)
