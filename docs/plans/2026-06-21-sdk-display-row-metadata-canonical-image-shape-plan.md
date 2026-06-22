# SDK Display Row Metadata Canonical Image Shape Plan

## Context

The chat-pill image bug exposed a duplication boundary in the display pipeline:

1. Runtime events persist canonical backend/local-runtime screenshot fields such
   as `screenshot_ref`, `screenshot_url`, and `screenshot_refs`.
2. SDK `buildDisplayRows(...)` projects those event payloads into
   `SdkDisplayRow.metadata`.
3. Renderer `sdkDisplayChatMessageProjection.ts` projects SDK display rows into
   renderer `ChatMessage` state.
4. Dashboard and diagnostics render/count image state from the renderer
   projection.

The current SDK display metadata exposes multiple equivalent image fields at
the same time:

- `screenshotRef`
- `screenshot_ref`
- `screenshotUrl`
- `screenshot_url`
- `screenshotRefs`
- `screenshot_refs`
- `screenshot`
- `screenshotContentType`

That duplication made the previous bug easier to create: later metadata replay
could overwrite one alias family while another layer tried to recover from a
different alias family. The immediate fix preserves existing screenshot fields
when a later same-turn metadata event has no screenshot keys, but it leaves the
display contract broader than necessary.

## Goal

Make SDK display row metadata expose one canonical display image shape, and make
the renderer consume only that shape.

Target display contract:

```ts
export type SdkDisplayImageAttachment = {
  kind: 'screenshot';
  ref: string | null;
  url: string | null;
  inlineBase64: string | null;
  contentType: string | null;
};

export type SdkDisplayRowMetadata = {
  // existing non-image metadata...
  imageAttachments?: SdkDisplayImageAttachment[] | null;
  raw?: JsonRecord | null;
};
```

Rules:

- SDK projection accepts event payload variants at the event boundary:
  `screenshot_ref`, `screenshot_url`, `screenshot_refs`, legacy
  `screenshotRef`, `screenshotUrl`, `screenshotRefs`, inline `screenshot`, and
  legacy `image`.
- SDK display metadata emits image display state only through
  `metadata.imageAttachments`.
- Renderer SDK display row projection reads only `metadata.imageAttachments` for
  SDK rows.
- `metadata.raw` may still contain original event payload fields for diagnostics
  and replay debugging, but renderer display code must not use `raw` as an image
  fallback.
- Backend/local-runtime transport contracts remain snake_case. This plan does
  not change persisted event payloads or backend provider history.

## Non-Goals

- Do not change `conversation_events.event_payload` storage.
- Do not change backend/local-runtime query or tool-output screenshot contracts.
- Do not remove renderer `ChatMessage.screenshot*` fields in this migration;
  they are broader renderer UI state used by optimistic messages, replay, and
  tool-output rendering.
- Do not remove inline/base64 screenshot support where tool-output or older
  event payloads still use it.

## Owner-Correct Migration

### Phase 1: SDK Projection Contract

Owner: `packages/windie-sdk-js/src/projections/conversationProjections.ts`

Add a helper that normalizes display image attachments from a conversation
event payload:

- `screenshot_refs[]` or `screenshotRefs[]` creates ordered remote screenshot
  attachments.
- `screenshot_ref` or `screenshotRef` creates a single remote screenshot
  attachment when no multi-ref list exists.
- `screenshot_url` or `screenshotUrl` fills the first attachment URL or creates
  a URL-only attachment.
- `screenshot` or legacy `image` creates an inline attachment only when no
  remote ref/url is present, preserving the current rule that artifact refs are
  preferred over inline bytes.
- `screenshot_content_type` or `screenshotContentType` populates
  `contentType`.

Then update `displayRowMetadata(...)` to emit:

- `imageAttachments`
- existing non-image metadata fields
- `raw`

Do not emit top-level `screenshotRef`, `screenshot_ref`, `screenshotUrl`,
`screenshot_url`, `screenshotRefs`, `screenshot_refs`, `screenshot`, or
`screenshotContentType` from SDK display metadata after the renderer migration
is complete.

Update `mergeUserMessageMetadata(...)` so sparse same-turn metadata replay
preserves `imageAttachments` unless the incoming event explicitly carries one
of the screenshot input keys.

Mirror the generated CommonJS projection under
`packages/windie-sdk-js/cjs/projections/conversationProjections.js`.

### Phase 2: Renderer SDK Row Consumer

Owner:
`frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts`

Replace alias-reading helpers in the SDK row adapter:

- Delete SDK-row reads of `metadata.screenshotRef`.
- Delete SDK-row reads of `metadata.screenshot_ref`.
- Delete SDK-row reads of `metadata.screenshotUrl`.
- Delete SDK-row reads of `metadata.screenshot_url`.
- Delete SDK-row reads of `metadata.screenshotRefs`.
- Delete SDK-row reads of `metadata.screenshot_refs`.
- Delete SDK-row reads of `metadata.screenshot`.

Instead, convert `metadata.imageAttachments` to renderer `ChatMessage` fields:

- `screenshots[]` is the primary renderer output for image messages.
- The first remote/inline image may continue to fill top-level
  `screenshotRef`, `screenshotUrl`, `screenshot`, and `screenshotContentType`
  while renderer UI components still expect those fields.

Keep `screenshotMessageState.js` as the renderer UI normalization helper for
`ChatMessage`, but stop using it to recover SDK metadata aliases.

### Phase 3: Diagnostics And Counts

Owner:
`frontend/src/renderer/app/runtime/desktopConversationDisplayProjection.ts`

Update `countSdkRowImages(...)` to count only
`metadata.imageAttachments.length` for SDK rows.

Keep `countMessageImages(...)` unchanged until `ChatMessage` itself is
canonicalized, because renderer state still accepts optimistic and replay
messages outside SDK display rows.

Update durable `renderer.display_projection` summaries to ensure the SDK-row
image count comes from the canonical SDK shape.

### Phase 4: Tests And Regression Pack

Owner tests:

- `tests/frontend/AgentSdkConversationRuntime.test.ts`
- `tests/frontend/SdkDisplayChatMessageProjection.test.ts`
- `tests/frontend/DesktopConversationDisplayProjection.test.ts`
- `tests/frontend/AgentConversationStoreApi.test.ts`

Required assertions:

- SDK display rows expose `metadata.imageAttachments` for single-ref,
  multi-ref, URL-only, and inline image payloads.
- SDK display rows no longer expose top-level screenshot alias fields after the
  renderer migration.
- Later same-turn metadata without screenshot keys preserves
  `metadata.imageAttachments`.
- Renderer SDK row projection renders images from `metadata.imageAttachments`
  only.
- Renderer SDK row projection does not recover images from
  `metadata.screenshot_ref`, `metadata.screenshotRefs`, or `metadata.raw`.
- Dashboard display projection image-count diagnostics count SDK row images from
  `metadata.imageAttachments`.

Keep the behavior registered in the Core Loop Regression Pack:

- Chat-pill query screenshot metadata survives dashboard display load and later
  same-turn metadata replay.

If the canonical-shape tests create a new test file, add that file to
`CORE_LOOP_REGRESSION_PACK_TESTS` in `scripts/windie/commands.cjs`.

### Phase 5: Documentation

Update:

- `docs/sdk/conversation_runtime.md`: document
  `metadata.imageAttachments` as the SDK display-row image contract and clarify
  that snake_case screenshot fields remain event/backend payload contracts only.
- `docs/debug/core_loop_regression_pack.md`: keep the protected behavior entry
  tied to the canonical SDK metadata shape.
- `CHANGELOG.md`: note the SDK display metadata contract cleanup and migration
  status.

## Deletion Targets

Delete after renderer consumers are migrated and tests prove no active reader
depends on them:

- `screenshotRef`, `screenshotUrl`, and `screenshotRefs` from
  `SdkDisplayRowMetadata`.
- `screenshot_ref`, `screenshot_url`, and `screenshot_refs` from
  `SdkDisplayRowMetadata`.
- `screenshot` and `screenshotContentType` from SDK display metadata as
  top-level display fields, replacing them with inline entries in
  `imageAttachments`.
- SDK-row alias lookup code in
  `frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts`.
- SDK-row alias image counting in
  `frontend/src/renderer/app/runtime/desktopConversationDisplayProjection.ts`.
- Tests whose only purpose is proving renderer recovery from SDK metadata
  snake_case aliases.

Do not delete:

- Backend/local-runtime snake_case payload fields.
- Query/replay snake_case transport fields.
- Tool-output screenshot payload support.
- Renderer `ChatMessage` screenshot fields used outside SDK display rows.

## Validation

Run:

```bash
./bin/windie.sh test frontend -- AgentSdkConversationRuntime.test.ts SdkDisplayChatMessageProjection.test.ts DesktopConversationDisplayProjection.test.ts AgentConversationStoreApi.test.ts
./bin/windie.sh test core-loop
git diff --check
```

For an implementation PR touching generated SDK output, also verify the checked
in CommonJS projection is updated with the TypeScript source.

## Migration And Security Notes

No persisted-data migration should be required. Existing event payload rows keep
their current screenshot fields and are normalized during SDK projection replay.

This is a display-contract cleanup. It must not log image bytes, prompts,
credentials, arbitrary local paths, or raw screenshots in diagnostics. Durable
diagnostics should continue to report counts and ids only.
