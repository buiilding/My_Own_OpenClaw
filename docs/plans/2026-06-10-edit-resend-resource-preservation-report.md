# Edit Resend Resource Preservation Report

Plan:
`docs/plans/2026-06-10-edit-resend-resource-preservation-plan.md`

## Status

Complete.

## Checklist

- [x] Inspect SDK replay and renderer replay paths.
- [x] Preserve same-turn metadata in SDK edit/resend preparation.
- [x] Preserve same-turn metadata in SDK retry preparation.
- [x] Remove renderer `screenshot_refs: null` override.
- [x] Add focused regression tests.
- [x] Run validation.
- [x] Reinspect touched paths.

## Findings

- Normal send records a base `user_message`, then writes resolved resource and
  enrichment data through `user_message_metadata`.
- Display projection merges metadata back into the visible row, so the visible
  transcript can show multi-image refs even when the base user event is sparse.
- Replay preparation currently uses only the selected base `user_message`
  payload plus renderer-provided payload overrides.
- Renderer replay currently sends `screenshot_refs: null`, which can erase
  preserved refs during payload merge.

## Decisions

- Keep the two-phase replay flow: prepare rewrite and rehydrate, then dispatch
  the prepared turn through the existing live-turn send path.
- Make the SDK reconstruct the prior resolved user turn from canonical events.
- Treat absent renderer payload fields as preserve-by-default.

## Validation Log

- `cd frontend && npm test -- ConversationReplayActions.test.jsx` passed.
- `cd frontend && npm test -- WindieSdkConversationRuntime.test.ts` passed.
- `npm run build:cjs` passed in `packages/windie-sdk-js`.
- `node -e "const sdk = require('./packages/windie-sdk-js/cjs/index.js'); console.log(typeof sdk.SdkConversationRuntime)"` passed.
- `git diff --check` passed.
- `bin/windie docs list` passed.

## Inspection Log

Initial inspection found the replay metadata loss in SDK preparation and the
renderer null override.

Implementation slice:

- `ConversationRuntime` now reconstructs replay payloads from the selected base
  `user_message` plus same-turn `user_message_metadata`.
- Replay payload merge ignores null and undefined overrides, preserving stored
  resolved resources until an explicit removal operation exists.
- Renderer replay payloads now include only present screenshot fields and pass
  prepared attachment filenames through the normal live-turn send path.
- `npm run build:cjs` regenerated the Electron-consumed SDK CJS runtime. It
  also synchronized the CJS display projection with the existing source
  multi-image display metadata behavior.

Final inspection:

- No remaining replay preparation path merges only `events[userIndex].payload`.
- Renderer replay no longer sends `screenshot_refs: null`.
- Remaining `screenshot_refs: null` matches are regression tests proving null
  replay overrides do not erase stored refs.
- Remaining `attachmentFilenames: null` matches are outside this replay path.

## Completion

All in-scope success criteria are satisfied.

## Commits

Pending.
