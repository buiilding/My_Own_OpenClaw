---
summary: "System-prompt lifecycle reference: prompt manager singleton initialization, startup failure modes, conversation-history wiring, and sub-agent prompt override behavior."
read_when:
  - When changing prompt file loading/formatting, startup initialization, or prompt-manager concurrency behavior.
  - When changing how system prompts are propagated into conversation history or overridden for restricted sub-agent sessions.
title: "Prompt Manager and System Prompt Lifecycle Reference"
---

# Prompt Manager and System Prompt Lifecycle Reference

## Canonical Modules

- `backend/src/llm/prompts/prompts.py`
- `backend/src/llm/prompts/system_prompt.txt`
- `backend/src/agent/session/initializer.py`
- `backend/src/sdk/agents/session_builder.py`
- `backend/src/core/services/agent_factory.py`
- `tests/backend/test_prompt_manager.py`
- `tests/backend/test_session_initializer.py`

## Prompt Manager Contract

`PromptManager` is a singleton with explicit startup initialization.

Key rules:

- prompt file load is deferred to `initialize(...)` (no import-time read)
- `system_prompt` property raises until initialized
- `get_system_prompt()` delegates to `PromptManager().system_prompt`
- module intentionally avoids a global `SYSTEM_PROMPT` constant

Thread safety:

- singleton creation guarded by lock + double-check pattern
- `initialize(...)` lock ensures concurrent calls do not duplicate file reads

## Prompt File Resolution and Formatting

Default file path:

- `backend/src/llm/prompts/system_prompt.txt`

Load behavior:

- reads UTF-8 text
- rejects empty/whitespace-only prompt file
- replaces `{os}` placeholder with runtime `platform.system()`

Failure behavior (all raise `RuntimeError`):

- missing prompt file
- permission errors
- OS read errors
- invalid UTF-8 decode errors

Initialization is effectively idempotent after first successful load.

## Runtime Use in Prompt Constructor

`PromptConstructor.__init__` behavior:

- optional injected `system_prompt` overrides manager value
- default path loads via `get_system_prompt()`
- constructor requires non-null config for security limits/tool policy setup

This is the main bridge from prompt manager into LLM interaction runtime.

## Session Initialization Wiring

During session setup (`init_prompt_and_history`):

- constructs `PromptConstructor`
- creates `ConversationHistory(max_length, system_prompt=prompt_builder.system_prompt)`

Result:

- session history stores same system prompt used for LLM prompt construction
- history serialization paths include system prompt as leading system message when available

## Sub-Agent Prompt Overrides

Sub-agent builders can override prompt at runtime:

- `sdk/agents/session_builder.build_session(...)`
- `core/services/agent_factory.AgentFactory.create_agent(...)`

Both paths set:

- `sub_session.prompt_builder.system_prompt = <custom system_prompt>`

This enables persona-specific agents while keeping shared parent resources.

## `system_prompt.txt` Directive Surface

Current prompt template defines:

- OS-aware command/keybind requirement (`{os}` substitution)
- autonomous loop policy (continue until task complete)
- context-awareness policy around `<system_context>`
- coding standards and frontend aesthetics constraints
- tool chaining, verification, and desktop-control strategy guidance

Because this file is runtime-loaded, prompt changes apply without Python code edits.

## Test-Backed Invariants

`tests/backend/test_prompt_manager.py` verifies:

- `{os}` substitution behavior
- missing file / permission / decode / empty-file failure semantics
- uninitialized access raises
- concurrent initialize calls read file once
- successful first initialization is preserved on later initialize calls
- global accessor returns initialized value

`tests/backend/test_session_initializer.py` verifies:

- prompt constructor + conversation history receive aligned system prompt values
- session initializer wiring propagates prompt constructor dependencies correctly

## Drift Hotspots

1. Reintroducing import-time prompt loading can crash startup paths before DI/bootstrap finishes.
2. Removing initialization lock can cause duplicate file reads or racey partial initialization.
3. Breaking prompt/history system-prompt alignment can create transparency drift between stored history and emitted system prompt event.
4. Sub-agent prompt overrides bypassing prompt builder field will silently keep parent prompt persona.
