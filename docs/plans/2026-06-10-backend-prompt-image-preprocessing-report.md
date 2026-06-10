# Backend Prompt Image Preprocessing Report

Date: 2026-06-10

## Status

Complete.

## Changes

- Query input normalization now preserves artifact-backed `screenshot_refs` as image refs instead of loading artifact base64 into `image_data`.
- Stored user messages can carry `image_refs` and `image_owner_user_id` through session history and compaction.
- Prompt construction resolves image refs at the provider projection boundary, decodes them, resizes/compresses oversized images, and emits bounded data URLs.
- Prompt validation now treats multimodal text content separately from image payloads for the per-message content limit while retaining the aggregate prompt-size check.
- Backend prompt image limits are explicit config values: image count per message, max projected image bytes, and max projected image dimension.
- Documentation and changelog now describe the prompt-image projection contract.

## Validation

- `./scripts/python-in-env backend python -m black backend/src/core/messages/structures.py backend/src/agent/session/message_builders.py backend/src/agent/session/state.py backend/src/api/services/query_execution_support/query_execution_runtime.py backend/src/api/services/query_execution_support/query_execution_inputs.py backend/src/api/services/query_execution.py backend/src/agent/session/session.py backend/src/agent/execution/executor.py backend/src/core/config/models.py backend/src/llm/prompts/prompt_images.py backend/src/llm/prompts/prompt_constructor.py backend/src/agent/compaction/engine.py backend/src/agent/compaction/prompt.py tests/backend/test_prompt_constructor_utils.py tests/backend/test_query_execution_inputs.py tests/backend/test_api_handlers.py`
- `./scripts/python-in-env backend pytest tests/backend/test_prompt_constructor_utils.py tests/backend/test_query_execution_inputs.py tests/backend/test_query_execution_service_helpers.py tests/backend/test_api_handlers.py tests/backend/test_conversation_history.py tests/backend/test_messages_and_converters.py tests/backend/test_compaction_prompt.py tests/backend/test_history_compaction_engine.py tests/backend/test_config_models.py -q`
- `bin/windie docs list`
- `git diff --check -- <touched files>`

## Decisions

- Keep SDK/renderer transport unchanged; backend prompt projection owns image hydration.
- Keep missing artifact refs non-fatal in prompt construction, matching the previous best-effort attachment behavior.
- Preserve inline `image_data` support for compatibility, but route artifact-backed images through refs for live query execution.

## Blockers

- None.

## Remaining Risk

- Aggregate prompt size can still fail if many bounded images plus history exceed the provider prompt budget; that failure should now be an aggregate-context problem, not a per-message text-content false positive.
