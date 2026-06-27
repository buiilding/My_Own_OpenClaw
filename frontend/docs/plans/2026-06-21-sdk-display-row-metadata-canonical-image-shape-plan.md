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

## Current Code Inventory

SDK display row producers:

- `packages/windie-sdk-js/src/conversation/types.ts`
  - `SdkDisplayRowMetadata` currently publishes both camelCase and snake_case
    screenshot fields plus inline `screenshot`.
  - The type is exported from `packages/windie-sdk-js/src/index.ts`, so this is
    a public SDK display-contract cleanup, not an internal-only refactor.
- `packages/windie-sdk-js/src/projections/conversationProjections.ts`
  - `displayRowMetadata(...)` reads both camelCase and snake_case screenshot
    payload fields and emits both alias families.
  - `SCREENSHOT_METADATA_KEYS` and `hasScreenshotMetadata(...)` decide whether
    a later same-turn metadata event is an explicit image patch.
  - `preserveExistingScreenshotMetadata(...)` currently preserves old top-level
    screenshot aliases during sparse metadata replay.
  - `currentTurnToolEventFrom(...)` and `buildLiveTurnPresentation(...)` expose
    screenshot fields for live tool output entries. Those are separate current
    turn/tool contracts and are out of scope for this display-row migration.
- `packages/windie-sdk-js/cjs/projections/conversationProjections.js`
  - Checked-in CommonJS mirror used by Electron/main packaging and CJS tests.
    It must be regenerated or manually kept byte-for-byte behavior-compatible
    with the TypeScript projection.
- `packages/windie-sdk-js/src/stores/{InMemoryConversationStore,FileConversationStore,LocalRuntimeConversationStore}.ts`
  - `loadDisplayRows(...)` delegates to `buildDisplayRows(...)`.
  - Store adapters should stay dumb; do not canonicalize display images in
    store adapters.
- `packages/windie-sdk-js/src/stores/LocalRuntimeConversationStore.ts`
  - `eventPayloadWriteParams(...)` writes local-runtime search/list metadata,
    including a flattened `metadata.screenshot` value. That is persistence
    indexing metadata and should not become the display contract.
- `buildDisplayConversation(...)` / `DisplayMessage`
  - This older display projection returns raw event payloads as
    `DisplayMessage.metadata` and does not merge `user_message_metadata`.
    Keep it out of scope unless a caller still uses it for screenshot display.

Renderer display row consumers:

- `frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts`
  - `recordPayloadFromRow(...)` copies SDK display metadata into a
    `DisplayMessage.metadata` compatibility payload.
  - `screenshotFieldsFromPayload(...)` reads both alias families and inline
    screenshot fields from that payload.
  - `displayMessageFromSdkDisplayRow(...)` is the main adapter to update so SDK
    rows become renderer `ChatMessage` objects from `metadata.imageAttachments`.
- `frontend/src/renderer/app/runtime/desktopConversationDisplayProjection.ts`
  - `countSdkRowImages(...)` currently counts `metadata.screenshotRefs`,
    `metadata.screenshot`, `metadata.screenshotRef`, and `metadata.screenshotUrl`.
  - `countMessageImages(...)` counts renderer `ChatMessage` images and should
    remain unchanged for optimistic/replay/tool-output messages.
- `frontend/src/renderer/infrastructure/services/ArtifactImageUtils.ts`
  - Own artifact image content-type helpers and artifact URL ref inference. It
    should not recover SDK display metadata aliases.
- `packages/windie-sdk-js/src/projections/legacyVisualAttachmentReplayAdapter.ts`
  - Keep as the UI screenshot attachment resolver for renderer messages.
- `frontend/src/renderer/app/runtime/desktopCurrentTurnMessageRuntime.js`
  - Live current-turn/tool output screenshot handling is separate and should not
    be changed by this plan.

Docs and diagnostics:

- `docs/sdk/conversation_runtime.md` owns the SDK projection contract.
- `docs/frontend/renderer/transcript/screenshot_message_state_and_sdk_projection_reference.md`
  currently documents renderer SDK projection recovery from screenshot aliases;
  this page must be updated to describe `metadata.imageAttachments`.
- `docs/debug/runtime_traces.md` and `docs/debug/logging.md` describe
  `renderer.display_projection`; keep the count names, but update their source
  semantics from “screenshot metadata fields” to “SDK image attachments”.
- `frontend/src/main/diagnostics/app_diagnostics_store.cjs` already sanitizes
  image diagnostics to counts only. No diagnostic schema expansion is needed.

## Non-Goals

- Do not change `conversation_events.event_payload` storage.
- Do not change backend/local-runtime query or tool-output screenshot contracts.
- Do not remove renderer `ChatMessage.screenshot*` fields in this migration;
  they are broader renderer UI state used by optimistic messages, replay, and
  tool-output rendering.
- Do not remove inline/base64 screenshot support where tool-output or older
  event payloads still use it.
- Do not canonicalize `CurrentTurnToolEvent` or `LiveTurnPresentationEntry`
  screenshot fields in this migration. Live tool/current-turn rendering is a
  different SDK presentation contract.
- Do not change `DisplayConversation.messages` or `DisplayMessage.metadata`
  unless implementation evidence proves an active display-row caller still
  depends on that older projection for screenshots.

## Owner-Correct Migration

### Phase 0: Add Failing Tests First

Add or adjust tests before changing implementation:

- In `tests/frontend/AgentSdkConversationRuntime.test.ts`, assert
  `buildDisplayRows(...)` emits `metadata.imageAttachments` for:
  - `screenshot_ref` + `screenshot_url`
  - `screenshot_refs` with multiple artifact ids
  - URL-only screenshot metadata
  - inline `screenshot`
  - legacy `image`
- Extend the same-turn replay invariant so:
  - SDK metadata event with image fields creates `imageAttachments`
  - later backend metadata without image fields preserves `imageAttachments`
  - later backend metadata with explicit image keys replaces or clears
    `imageAttachments`, depending on the explicit value
- In `tests/frontend/SdkDisplayChatMessageProjection.test.ts`, add a canonical
  `metadata.imageAttachments` input case and a negative alias case proving the
  renderer SDK-row projection does not recover images from
  `metadata.screenshot_ref`, `metadata.screenshotRefs`, or `metadata.raw`.
- In `tests/frontend/DesktopConversationDisplayProjection.test.ts`, assert
  `sdkUserImageCount` comes from `metadata.imageAttachments`.
- In `tests/frontend/AgentConversationStoreApi.test.ts`, update the persisted
  local-runtime display-row replay fixture to assert `imageAttachments` after
  `LocalRuntimeConversationStore.loadDisplayRows(...)`.

Keep the existing user-visible bug invariant active throughout the migration:

- `user_message`
- SDK `user_message_metadata` with screenshot fields
- backend `user_message_metadata` without screenshot fields
- `assistant_message`
- final display row still has image attachments

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

Recommended helper shape:

```ts
function imageAttachmentsFromPayload(payload: JsonRecord): SdkDisplayImageAttachment[] | null
```

Keep the helper private to `conversationProjections.ts` unless another SDK
projection needs the exact same display contract in the same change. The helper
should return `null` instead of `[]` when no image exists so absence stays
distinct from an explicit empty patch.

Suggested normalization behavior:

- Trim strings and discard empty strings.
- Normalize `screenshot_refs`/`screenshotRefs` first; if present, each ref
  becomes one `{ kind: 'screenshot', ref, url, inlineBase64: null, contentType }`
  entry.
- Apply a single URL to the first attachment only, matching current renderer
  behavior.
- If there are no refs but a URL exists, create one URL-only attachment with
  `ref: null`.
- If there are no remote refs or URLs and inline image data exists, create one
  inline attachment.
- Treat `artifact://`, `http://`, and `https://` values in inline fields as not
  inline image data, preserving the current no-artifact-inference rule for
  `screenshot`.

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

Implementation detail:

- Add `export type SdkDisplayImageAttachment` in
  `packages/windie-sdk-js/src/conversation/types.ts`.
- Replace the screenshot fields in `SdkDisplayRowMetadata` with
  `imageAttachments?: SdkDisplayImageAttachment[] | null`.
- Update TypeScript first, then run or mirror the CJS build. Preferred command
  when dependency state allows it:

```bash
npm --prefix packages/windie-sdk-js run build:cjs
```

If the build cannot be run in the local environment, manually mirror the CJS
projection and document that limitation in the implementation summary.

### Phase 2: Renderer SDK Row Consumer

Owner:
`frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts`

Replace alias-reading helpers only for SDK display rows:

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

This plan is superseded: the renderer `screenshotMessageState.js` helper was
removed after SDK `attachments[]` became the display contract. Artifact URL
inference now lives in `ArtifactImageUtils`, and legacy screenshot alias
recovery stays in SDK display-row compatibility adapters.

Implementation detail:

- `recordPayloadFromRow(...)` should copy `imageAttachments` and non-image
  metadata only. It should not copy SDK screenshot aliases.
- `screenshotFieldsFromPayload(...)` can remain for legacy `DisplayMessage`
  conversion if still needed, but SDK-row conversion should use a new helper
  like:

```ts
function screenshotFieldsFromImageAttachments(
  attachments: unknown,
): Partial<ChatMessage>
```

- `displayMessageFromSdkDisplayRow(...)` may bypass the old
  `DisplayMessage.metadata` compatibility payload for user/tool image fields if
  that removes alias copying. Keep the change local to
  `sdkDisplayChatMessageProjection.ts`; feature code should continue using
  `DesktopConversationDisplayProjection`.
- Do not read `metadata.raw` for display recovery. Existing boundary tests
  already assert this file does not contain `metadata.raw`.

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

Implementation detail:

- Replace `stringArrayFromUnknown(metadata.screenshotRefs)` and top-level
  screenshot field checks with an `imageAttachments` count.
- Count only attachment objects that contain `ref`, `url`, or `inlineBase64`.
- Preserve existing diagnostic field names:
  - `sdkUserImageCount`
  - `sdkUserRowsWithImages`
  - `sdkProjectedUserImageCount`
  - `mergedUserImageCount`
- Do not add screenshot refs, URLs, inline bytes, prompts, or message text to
  diagnostic payloads.

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
- Renderer boundary tests continue to prove feature code routes through the app
  runtime facade, not the infrastructure SDK-row adapter directly:
  `tests/frontend/RendererChatRuntimeBoundary.test.ts` and
  `tests/frontend/RendererAppRuntimeBoundary.test.ts`.
- SDK package boundary tests still prove source and CJS projection boundaries:
  `tests/frontend/AgentSdkPackageBoundary.test.ts`.

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
- `docs/frontend/renderer/transcript/screenshot_message_state_and_sdk_projection_reference.md`:
  replace the current “SDK display projection reads screenshot aliases” section
  with “SDK display projection consumes `metadata.imageAttachments`; event
  aliases are normalized inside SDK projection.”
- `docs/debug/runtime_traces.md` and `docs/debug/logging.md`: update the
  `sdkUserImageCount` explanation to say the SDK row carried canonical image
  attachments.
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
- Current-turn/tool presentation screenshot fields.
- `DisplayMessage.metadata` raw event payload behavior unless a separate
  migration proves it is unused for display or rehydrate callers.

## Post-Implementation Search Gates

After implementation, these searches should prove the SDK-row display path no
longer depends on alias fields:

```bash
rg -n "metadata\\.(screenshotRef|screenshot_ref|screenshotUrl|screenshot_url|screenshotRefs|screenshot_refs|screenshotContentType|screenshot)" \
  frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts \
  frontend/src/renderer/app/runtime/desktopConversationDisplayProjection.ts

rg -n "'screenshotRef'|'screenshot_ref'|'screenshotUrl'|'screenshot_url'|'screenshotRefs'|'screenshot_refs'|'screenshotContentType'|'screenshot'" \
  frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts
```

Expected result: no SDK-row display alias reads remain. If
`screenshotFieldsFromPayload(...)` remains for non-SDK `DisplayMessage`
compatibility, document why and keep tests proving SDK rows do not use it.

SDK type and projection searches should show:

```bash
rg -n "imageAttachments|SdkDisplayImageAttachment" packages/windie-sdk-js/src packages/windie-sdk-js/cjs
rg -n "screenshot_ref|screenshotRefs|screenshot_refs|screenshotRef" packages/windie-sdk-js/src/projections/conversationProjections.ts
```

Expected result: screenshot alias reads remain only in event-payload
normalization helpers and current-turn/tool projection code, not as emitted
`SdkDisplayRowMetadata` top-level fields.

## Validation

Run:

```bash
./bin/windie.sh test frontend -- AgentSdkConversationRuntime.test.ts SdkDisplayChatMessageProjection.test.ts DesktopConversationDisplayProjection.test.ts AgentConversationStoreApi.test.ts
./bin/windie.sh test frontend -- RendererChatRuntimeBoundary.test.ts RendererAppRuntimeBoundary.test.ts AgentSdkPackageBoundary.test.ts AppDiagnosticsStore.test.cjs DesktopRendererTraceRuntime.test.ts
./bin/windie.sh test core-loop
npm --prefix packages/windie-sdk-js run build:cjs
cd frontend && npm run typecheck
git diff --check
```

For an implementation PR touching generated SDK output, also verify the checked
in CommonJS projection is updated with the TypeScript source.

If `npm --prefix packages/windie-sdk-js run build:cjs` or
`cd frontend && npm run typecheck` cannot run in the local environment, state
the blocker and run the focused Jest tests plus `git diff --check`.

## Migration And Security Notes

No persisted-data migration should be required. Existing event payload rows keep
their current screenshot fields and are normalized during SDK projection replay.
This is a public SDK display type cleanup, so release notes should call out that
`SdkDisplayRowMetadata` no longer exposes screenshot aliases after migration;
callers should read `metadata.imageAttachments`.

This is a display-contract cleanup. It must not log image bytes, prompts,
credentials, arbitrary local paths, or raw screenshots in diagnostics. Durable
diagnostics should continue to report counts and ids only.
