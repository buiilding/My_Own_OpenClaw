---
summary: "Prompt-constructor deep reference: tool-schema policy filtering, user-message metadata extraction, XML tag parsing limits, and first-turn transparency event emission flow."
read_when:
  - When changing `PromptConstructor.build_prompt(...)` output shape or trust-boundary extraction logic.
  - When debugging missing/incorrect `system-prompt`, `user-message-full`, or `tool-schemas` frontend transparency events.
title: "Prompt Constructor and Transparency Metadata Reference"
---

# Prompt Constructor and Transparency Metadata Reference

## Canonical Modules

- `backend/src/llm/prompts/prompt_constructor.py`
- `backend/src/llm/prompts/prompt_metadata.py`
- `backend/src/agent/llm/conversation_context.py`
- `backend/src/agent/llm/event_presenter.py`
- `backend/src/agent/execution/interaction_loop.py`
- `tests/backend/test_prompt_constructor_utils.py`

## Core Prompt Build Contract

`PromptConstructor.build_prompt(stored_messages, include_tools)` returns:

1. `prompt_messages`: list of LLM messages from history (`stored_messages.get_history()` when available)
2. `tool_schemas`: filtered canonical tool schema list (or `[]`)
3. `PromptMetadata`:
  - `system_prompt`
  - `tool_schemas`
  - optional `user_message_metadata`

`PromptMetadata` is a typed dataclass, replacing dict-shaped metadata plumbing.

## Tool Schema Policy Boundary

When `include_tools=True`:

- constructor pulls declarations from `ToolRegistry.get_function_declarations()`
- applies `ToolPolicy.from_config(config).filter_tool_schemas(...)`
- returns filtered schemas for:
  - native LLM tools parameter
  - transparency event emission

This keeps model-visible tool surface policy-driven instead of callsite-driven.

## User Message Metadata Extraction

`_build_user_message_metadata(...)` only emits metadata when:

- history object has `last_user_query`
- last user query exists and has non-null raw query

Metadata fields:

- `original_query`: raw user query text
- `full_content`: latest user message content containing `<user_query>`
- `context_type`: `initial` or `sequential`
- `injected_context`: extracted `<system_context>...</system_context>` block
- `active_window`: extracted `<active_window>` tag content (fallback `Unknown`)

`context_type` logic:

- counts stored entries with `message_type == USER_QUERY`
- count `1` -> `initial`
- count `>1` -> `sequential`

## XML Context Extraction Boundary

Prompt constructor uses cached regex tag extraction helpers:

- `_extract_xml_tag(...)`
- `_extract_xml_tag_content(...)`
- `_search_xml_tag(...)`

Key behaviors:

- supports tag attributes containing `>` characters
- limits search to bounded content window (`max_message_content_size`)
- rejects oversized extracted payloads
- returns empty fallback instead of propagating malformed extraction

This avoids naive delimiter parsing bugs and constrains extraction work on large strings.

## User Message Formatting

`format_user_message_content(message_content, query, is_first_message)`:

- uses frontend-provided `message_content` when available
- fallback path emits `<user_query>...</user_query>` wrapper around raw query
- does not embed tool schemas into user content
- `is_first_message` is intentionally ignored in current implementation

## First-Turn Prompt/Event Flow

`ConversationContext.get_prompt(iteration)` behavior:

- iteration `1`:
  - calls `build_prompt(...)`
  - caches tool schemas + metadata
- later iterations:
  - returns cached metadata/schemas
  - prompt messages from history directly

`InteractionLoop` behavior:

- on first iteration with metadata:
  - streams metadata via `EventPresenter.present_prompt_metadata(...)`

`EventPresenter` emits in order:

1. `SystemPromptEvent`
2. `UserMessageFullEvent` (if user metadata exists)
3. `ToolSchemasEvent` (validated canonical schema list)

Tool schema transparency validation enforces canonical function-tool shape before emission.

## Frontend-Visible Consequences

These backend metadata events are consumed by renderer stream handlers for:

- system prompt transparency panel
- enriched user-message metadata panel
- tool schema transparency panel

If constructor metadata is absent or malformed, frontend transparency sections may silently degrade.

## Test-Backed Invariants

`tests/backend/test_prompt_constructor_utils.py` verifies:

- XML extraction correctness for attributes containing `>`
- stripped inner content extraction for tags
- allowlist-based tool schema filtering
- coordinate-method schema filtering for `mouse_control`
- user metadata extraction for `initial` and `sequential` contexts
- empty fallback behavior when no store/history is provided

## Drift Hotspots

1. Changing metadata field names breaks renderer transparency payload mapping.
2. Removing tool policy filtering from constructor reopens hidden/dev tool leakage to models.
3. Replacing regex extraction with naive string scanning can reintroduce attribute parsing bugs.
4. Emitting non-canonical tool schema shapes from metadata path will fail event validation in presenter.
