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
- `backend/src/core/services/agent_factory.py`
- `tests/backend/test_prompt_manager.py`
- `tests/backend/test_session_initializer.py`

## Prompt Manager Contract

`PromptManager` is a singleton with explicit startup initialization.

Key rules:

- prompt file template load is deferred to `initialize(...)` (no import-time read)
- `system_prompt` property raises until initialized
- callers render through `PromptManager.render_system_prompt(...)`, which uses the cached template and accepts optional client-provided operating-system/workspace overrides
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
- caches the raw template and renders `{os}` at access time
- strips dev-tool-selection-gated OCR/prediction sections after render so disabled coordinate methods do not remain in the runtime prompt
- default render path still falls back to runtime `platform.system()` when no frontend override is provided

Failure behavior (all raise `RuntimeError`):

- missing prompt file
- permission errors
- OS read errors
- invalid UTF-8 decode errors

Initialization is effectively idempotent after first successful load.

## Runtime Use in Prompt Constructor

`PromptConstructor.__init__` behavior:

- optional injected `system_prompt` overrides manager value
- default path renders through the initialized `PromptManager`
- constructor requires non-null config for security limits/tool policy setup

Current session behavior:

- Electron main includes `agent_definition.runtime.operating_system` in the websocket handshake once per connection
- websocket router forwards that value into `SessionManager`
- `SessionManager` applies the rendered prompt to `prompt_builder.system_prompt` and `history.system_prompt` when the user session is created (or immediately if the session already exists)

This is the main bridge from prompt manager into LLM interaction runtime.

## Session Initialization Wiring

During session setup (`init_prompt_and_history`):

- constructs `PromptConstructor`
- creates `ConversationHistory(system_prompt=prompt_builder.system_prompt)`

Result:

- session history stores same system prompt used for LLM prompt construction
- history serialization paths include system prompt as leading system message when available

## Sub-Agent Prompt Overrides

Sub-agent builders can override prompt at runtime:

- `core/services/agent_factory.AgentFactory.create_agent(...)`

That path sets:

- `sub_session.prompt_builder.system_prompt = <custom system_prompt>`

This enables persona-specific agents while keeping shared parent resources.

## `system_prompt.txt` Directive Surface

Current prompt template defines:

- runtime assistant identity string: `You are Windie, a computer-native AI companion.`
- computer-environment framing around desktop, screen, apps, files, browser, terminal, workspace, conversation history, and memory
- capability guidance for screen observation, GUI control, dedicated chrome browser profile, file edits, shell processes, local memory, hosted services, plugins, skills, MCP servers, and custom local tools
- safety and authority rules that avoid unlimited-power claims and require confirmation for high-impact actions
- work-mode sections for everyday, computer-use, browser, file/shell, coding, and WindieOS repository tasks
- WindieOS repository orientation that points model behavior toward local docs first: `docs/docs.json`, `docs/getting-started/docs_directory.md`, and `bin/windie docs list`
- concise communication guidance that makes coding one task mode rather than the default identity

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
