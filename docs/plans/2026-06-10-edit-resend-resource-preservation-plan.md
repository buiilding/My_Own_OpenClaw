# Edit Resend Resource Preservation Plan

## User Intent

Fix edit/resend and retry so a prior user turn with multiple resolved image
attachments resends with the same attachment set unless the user explicitly
removes attachments. The current bug is that replay can collapse a two-image
turn to one image because it rebuilds payloads from a lossy source.

## Architecture Change

The SDK conversation runtime remains the owner of replay and revision
semantics. Renderer code expresses replay intent only. The SDK reconstructs the
prior user turn from canonical stored events, including same-turn
`user_message_metadata`, before rewriting history and preparing the replacement
turn.

This change does not introduce a new runtime. It removes renderer-owned
attachment reconstruction from the resend path and aligns replay with the
SDK-owned turn input pipeline.

## In Scope

- Preserve same-turn resolved resource metadata during edit/resend.
- Preserve same-turn resolved resource metadata during retry.
- Prevent renderer replay payloads from clearing `screenshot_refs` by sending
  nullable screenshot fields.
- Add focused tests for multi-image replay metadata preservation.
- Update docs/report/changelog for the behavior change.

## Out of Scope

- New attachment removal UI.
- Reworking backend provider history.
- Changing artifact upload or resource resolver behavior.
- Migrating historical rows that never recorded metadata.

## Workflow

1. Inspect the SDK replay path, renderer replay hook, and existing replay tests.
2. Add an SDK helper that reconstructs a prior user turn payload by merging the
   base `user_message` payload with later same-turn `user_message_metadata`.
3. Use that helper in edit/resend and retry preparation.
4. Narrow renderer replay payload construction so absent values stay absent
   instead of overwriting SDK-preserved data with `null`.
5. Add focused SDK and renderer regression tests.
6. Run focused validation and `git diff --check`.
7. Reinspect the touched replay paths for remaining renderer-owned attachment
   reconstruction or metadata loss.

## Success Criteria

- Editing and resending a turn with two image refs prepares a replacement turn
  with both refs.
- Retrying a turn with two image refs prepares a replacement turn with both
  refs.
- Metadata-only attachment refs are preserved.
- Renderer replay no longer sends `screenshot_refs: null`.
- Existing single-image replay behavior remains supported.

## Validation

- `cd frontend && npm test -- ConversationReplayActions.test.jsx`
- `cd frontend && npm test -- WindieSdkConversationRuntime.test.ts`
- `git diff --check`

## Reread Anchors

- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js`
- `tests/frontend/WindieSdkConversationRuntime.test.ts`
- `tests/frontend/ConversationReplayActions.test.jsx`
- `docs/sdk/conversation_runtime.md`
