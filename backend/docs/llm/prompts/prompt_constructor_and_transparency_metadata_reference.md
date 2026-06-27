---
summary: "Prompt-constructor deep reference: tool-schema policy filtering, user-message metadata extraction, XML tag parsing limits, and first-turn transparency event emission flow."
read_when:
  - When changing `PromptConstructor.build_provider_prompt(...)` output shape or trust-boundary extraction logic.
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

`PromptConstructor.build_provider_prompt(stored_messages, include_tools)` returns
one `ProviderPrompt` object:

1. `messages`: list of LLM messages consisting of:
   - the effective `system` message
   - optional contextual `user` messages from applicable `AGENTS.md` files
   - optional client prompt layer `user` messages
   - history (`stored_messages.get_history()` when available)
2. `tool_schemas`: filtered canonical tool schema list (or `[]`)
3. `PromptMetadata`:
  - `system_prompt`
  - `tool_schemas`
  - optional `user_message_metadata`

`PromptMetadata` and `ProviderPrompt` are typed dataclasses, replacing
dict-shaped metadata plumbing.

Session-scoped system prompt context:

- the backend system prompt template now renders both `{os}` and `{workspace_path}`
- client OS remains user-scoped session context
- `workspace_path` is conversation-scoped context supplied on query/rehydrate payloads
- hosted Electron runtimes supply pre-resolved `agent_definition.agents_md`
  layers on query payloads so prompt construction does not depend on backend
  filesystem access to the user's local workspace
- prompt rendering happens when the active session is prepared for a conversation request, so two sessions for the same user can carry different workspace bindings without mutating each other
- when no injected repo-instruction messages are present, backend `AGENTS.md` discovery walks from the active workspace directory up to the enclosing repo root
- broader repo guidance is emitted before more specific nested-directory guidance so later blocks can override earlier ones

## Tool Schema Policy Boundary

When `include_tools=True`:

- constructor pulls canonical declarations from `ToolRegistry.get_function_declarations()` or `get_function_declarations_filtered(...)`
- applies `ToolPolicy.from_config(config).filter_tool_schemas(...)` to both registry and client-provided tool schemas
- re-applies structural policy pruning after provider projection so projected grounded helper schemas do not leak disabled OCR/prediction fields
- provider projection receives the already-filtered schema list and active config
- returns filtered schemas for:
  - native LLM tools parameter
  - transparency event emission

This keeps model-visible tool surface policy-driven instead of callsite-driven.

Important boundary:

- `ToolSelection` only performs structural filtering; it does not rewrite descriptions or author alternate schema prose.
- Canonical wording must come from the original tool schema sources (`schemas.py`, remote tool descriptions, and shared schema helpers).
- Provider transports may still reshape schemas, so transport-specific drift risk remains separate from prompt-time policy pruning.

OpenAI desktop tool note:

- tool schemas are rebuilt per new user query, not once for the whole conversation
- OpenAI now receives the same direct desktop function tools as the canonical registry on every query
- prompt image count no longer changes desktop tool visibility for OpenAI

## User Message Metadata Extraction

`_build_user_message_metadata(...)` only emits metadata when:

- history object has `last_user_query`
- last user query exists and has non-null raw query

Metadata fields:

- `original_query`: raw user query text
- `full_content`: latest user message content containing `<user_query>`
- `context_type`: `initial` or `sequential`
- `injected_context`: extracted `<system_context>...</system_context>` block, or empty string when current renderer query content does not include one
- `active_window`: extracted `<active_window>` tag content when present (fallback `Unknown`)

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

`format_user_message_content(message_content, is_first_message)`:

- requires backend-prepared model-visible `message_content`
- raises when the query ingress path fails to provide content
- does not embed tool schemas into user content
- `is_first_message` is intentionally ignored in current implementation

Renderer memory/context block handling:

- constructor treats renderer-provided `<episodic_memory>` and `<semantic_memory>` blocks as opaque pass-through content.
- transparency extraction only parses specific tags used for UI metadata (`system_context`, `active_window`, `user_query`); current renderer query content typically provides only `<user_query>` plus memory sections, so `system_context` / `active_window` metadata are usually empty-or-unknown unless older history is being replayed.

## First-Turn Prompt/Event Flow

`ConversationContext.get_prompt(iteration)` behavior:

- iteration `1`:
  - calls `build_provider_prompt(...)`
  - caches tool schemas + metadata
- later iterations:
  - rebuilds messages through `build_prompt_messages(...)`
  - returns cached metadata/schemas

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
