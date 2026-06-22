---
summary: "Plan for migrating replay, tool-output visuals, backend payloads, and renderer helpers to one typed visual attachment contract before deleting legacy screenshot compatibility."
title: "Typed Visual Attachments Full Cleanup Plan"
---

# Typed Visual Attachments Full Cleanup Plan

Date: 2026-06-22

## Goal

Finish the visual attachment architecture by moving every display and replay
surface that still depends on legacy screenshot alias fields to the typed SDK
`attachments[]` contract, then delete the old screenshot helper and alias
fallback paths without causing old conversations to lose screenshot display.

This plan intentionally does not implement runtime changes.

## Product Invariant

Screenshot and image display must be preserved for:

- new user-included images
- new camera-button screenshots
- new tool-result screenshots
- old persisted conversations that only have `screenshot_ref`,
  `screenshot_refs`, `screenshotUrl`, `screenshot`, or equivalent stored
  metadata
- replay and rehydrate flows after app restart
- active live-turn tool output rows

The target invariant is:

```text
all visible visual attachments -> ordered typed attachment descriptors
legacy screenshot aliases -> migration/replay input only, never primary display input
```

## Non-Regression Matrix

This cleanup is not complete unless every behavior below is protected by an
owner-correct regression test before the matching legacy path is deleted.

| Behavior that must not regress | Owner layer | Required proof before deletion |
| --- | --- | --- |
| Old persisted user screenshots still display after restart/replay when rows only contain legacy screenshot metadata. | SDK display/replay projection | Feed legacy `user_message` / `user_message_metadata` events into display projection and assert ordered `attachments[]` are emitted and rendered. |
| Old persisted tool-output screenshots still display after restart/replay when rows only contain `screenshot_ref` / `screenshot_refs`. | SDK display/replay projection plus renderer tool UI | Feed legacy `tool_output` and `tool_bundle_output` events into SDK projection, then renderer projection, and assert tool rows render typed image attachments. |
| Backend rehydrate keeps old screenshots model-visible, not only UI-visible. | SDK rehydrate projection and backend rehydrate service | Rehydrate legacy rows with `screenshot_ref` and assert backend resolves artifact bytes/refs exactly as before. |
| New user-included images render optimistically and stay visible while artifact-backed ready descriptors replace previews. | SDK live projection plus renderer attachment UI | Existing/extended `AttachmentDisplayComponents` and SDK runtime tests assert no blank state during `materializing -> ready`. |
| New camera-button screenshots start as pending requests and become ready image attachments after capture/materialization. | SDK turn resource resolution and display projection | SDK runtime tests assert `screenshot_request/pending_capture` transitions to `image/ready` with stable id. |
| Mixed sends preserve order: included images first, camera screenshot after. | Chat send preparation and SDK projection | `ChatMessageSender` and SDK projection tests assert resource and attachment ordering. |
| Multi-image sends preserve every image and order. | Chat send preparation and SDK projection | Tests assert all image descriptors survive send, projection, replay, and renderer mapping. |
| Active live-turn tool-output screenshots still render while the turn is running. | SDK current-turn projection and renderer message content | Current-turn/tool-output tests assert live presentation entries carry typed attachments and render them. |
| Tool-bundle screenshots still render. | Backend tool-bundle result handling, SDK projection, renderer tool UI | Backend handler plus SDK/renderer projection tests assert bundle screenshot descriptors are preserved. |
| Failed capture/materialization is explicit, not silently dropped. | SDK resource resolution and renderer attachment UI | Tests assert `status: "failed"` descriptors render or expose a failure state according to surface rules. |
| Inline preview bytes are never persisted to durable history, diagnostics, logs, or backend payloads. | SDK runtime/store, renderer diagnostics, backend transport | Snapshot/store/trace tests assert `previewSrc` and data URLs are absent outside live display projection. |
| Screenshot URLs, local temp paths, and preview bytes are not logged. | SDK/main/backend diagnostics | Diagnostic tests or reviewed trace payload assertions cover counts/statuses only. |
| Renderer components do not infer primary visuals from legacy screenshot aliases. | Renderer message components | Component tests assert legacy user screenshot aliases alone do not render primary user visuals. |

Deletion rule:

```text
if a behavior above is not protected, do not delete the old reader yet
```

## Current State

### Already Done

User-message visuals no longer use renderer-side screenshot alias display.

Current path:

```text
SDK display row metadata.attachments[]
-> sdkDisplayChatMessageProjection
-> ChatMessage.attachments
-> UserMessage
-> AttachmentList
-> AttachmentRendererRegistry
-> useResolvedArtifactImageSrc
```

Relevant files:

- `packages/windie-sdk-js/src/conversation/types.ts`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `packages/windie-sdk-js/src/projections/conversationProjections.ts`
- `frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts`
- `frontend/src/renderer/features/chat/components/message/content/UserMessage.jsx`
- `frontend/src/renderer/features/chat/components/message/content/AttachmentList.jsx`
- `frontend/src/renderer/features/chat/components/message/content/AttachmentRendererRegistry.jsx`

### Remaining Compatibility Zones

#### 1. SDK Replay Adapter

Current owner:

- `packages/windie-sdk-js/src/projections/conversationProjections.ts`

Current compatibility:

- `legacyScreenshotDisplayAttachments(...)` adapts old
  `screenshotRef`/`screenshot_ref`/`screenshotRefs`/`screenshot_refs` metadata
  into ordered `SdkDisplayAttachment[]`.

Why it cannot simply be deleted:

- old persisted conversations would lose screenshot display unless those rows
  are migrated or re-projected through a replacement adapter.

Target:

- move this into a named, test-covered legacy replay migration module with one
  responsibility:

```text
old persisted screenshot metadata -> ordered attachment descriptors
```

- delete it only after old stored rows are migrated or after all local replay
  paths run through the replacement adapter.

#### 2. Tool-Output Visual Display

Current owners:

- SDK projection:
  `packages/windie-sdk-js/src/projections/conversationProjections.ts`
- Renderer projection:
  `frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts`
- Renderer tool UI:
  `frontend/src/renderer/features/chat/components/message/content/ToolOutputMessage.jsx`
- Renderer helpers:
  `frontend/src/renderer/app/runtime/desktopMessageScreenshotRuntime.js`
  `frontend/src/renderer/app/runtime/desktopResolvedMessageScreenshotsRuntime.js`

Current compatibility:

- tool-output display still receives or derives screenshot fields such as
  `screenshot`, `screenshotRef`, `screenshotUrl`, and `screenshots`
- `ToolOutputMessage` calls
  `DesktopResolvedMessageScreenshotsRuntime.useResolvedMessageScreenshotSrc(message)`
- `desktopMessageScreenshotRuntime.js` normalizes legacy screenshot fields
  into image sources

Target:

```text
SDK tool_output/tool_bundle_output event
-> metadata.attachments[] with source: "tool_result"
-> renderer ChatMessage.attachments
-> ToolOutputMessage renders AttachmentList or a tool-specific AttachmentList variant
-> no tool-output UI reads screenshot aliases
```

Tool-output visuals should be ready artifact-backed descriptors only:

```ts
{
  id: "tool-output-event-id:attachment:000",
  kind: "image",
  source: "tool_result",
  status: "ready",
  screenshotRef: "artifact-id",
  screenshotUrl?: "...",
  contentType?: "image/png"
}
```

No tool-result preview state is needed.

#### 3. Backend And Provider Payload Contracts

Current owners:

- `backend/src/api/schemas/incoming.py`
- `backend/src/api/schemas/outgoing.py`
- `backend/src/api/processing/formatters/tool_output.py`
- `backend/src/api/handlers/tool_result.py`
- `backend/src/api/services/query_execution_support/query_execution_runtime.py`
- `backend/src/api/services/rehydrate_execution.py`
- `packages/windie-sdk-js/src/transport/backendPayloadContract.ts`
- `packages/windie-sdk-js/src/transport/backendEventNormalizer.ts`
- `packages/windie-sdk-js/src/runtime/VisualResourceMaterializer.ts`

Current compatibility:

- query, tool-result, tool-bundle-result, rehydrate, and outgoing tool-output
  schemas still use `screenshot_ref` / `screenshot_refs`
- backend rehydrate resolves `screenshot_ref`
- SDK transport normalizes backend `screenshot_ref` into camelCase display
  metadata

Why this cannot simply be deleted:

- backend/provider model history and artifact hydration still rely on these
  fields
- externally visible websocket payload contracts still allow them
- rehydrate must keep old screenshots model-visible

Target:

- introduce backend-safe typed visual attachment fields for display/replay,
  likely `display_attachments` or `attachments` depending on API boundary
  ownership
- keep model-history image refs separate from display attachments when needed
- use compatibility aliases only at ingress/egress boundaries during migration
- eventually make `screenshot_ref`/`screenshot_refs` a backend/provider
  compatibility layer instead of a renderer display contract

#### 4. `DesktopMessageScreenshotRuntime`

Current owner:

- `frontend/src/renderer/app/runtime/desktopMessageScreenshotRuntime.js`

Current responsibility:

- normalize legacy screenshot-like message fields
- support assistant/tool screenshot rendering through
  `DesktopResolvedMessageScreenshotsRuntime.useResolvedMessageScreenshotSrc`

Why it remains today:

- tool-output UI still consumes legacy screenshot fields
- assistant/tool screenshot tests still cover screenshot field normalization

Target:

- replace it with an attachment-first artifact image resolver:

```text
display attachment descriptor -> static src or authenticated artifact fetch
```

- after tool outputs move to `attachments[]`, delete
  `DesktopMessageScreenshotRuntime` and any `useResolvedMessageScreenshotSrc`
  path that accepts whole message objects

## Target Architecture

### Display Data Shape

Use one ordered display attachment list for all visible images:

```ts
type VisualDisplayAttachment = {
  id: string;
  kind: "image" | "screenshot_request";
  source: "user_included" | "camera_button" | "tool_result" | "replay";
  status: "materializing" | "pending_capture" | "ready" | "failed";
  filename?: string | null;
  contentType?: string | null;
  previewSrc?: string | null; // live-only, user-included images only
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  errorCode?: string | null;
};
```

Rules:

- `previewSrc` never persists.
- `tool_result` attachments are `ready` or `failed`; no preview state.
- replay adapters may produce `source: "replay"` for old rows.
- backend/provider payload aliases may exist during migration, but renderer
  message components must render typed attachments only.

### Layer Ownership

```text
backend/provider
-> owns model-visible screenshot refs and artifact hydration

SDK runtime/projection
-> owns typed display attachment projection and replay migration

renderer projection
-> maps SDK display attachment descriptors into ChatMessage.attachments

renderer components
-> render AttachmentList / AttachmentRendererRegistry
```

## Implementation Plan

### Phase 1. Inventory And Tests Before More Deletion

Add or update tests proving current behavior before migration:

- old persisted user screenshot replay still shows as attachment descriptors
- old persisted tool-output screenshot replay still shows
- live tool-output screenshot appears through `attachments[]`
- tool-bundle screenshot appears through `attachments[]`
- backend rehydrate still resolves old `screenshot_ref` rows
- query prompt construction still handles model-visible screenshots
- live tool-output screenshots still render before the active turn completes
- failed visual attachments stay explicit
- no preview bytes/data URLs/temp paths leak into durable stores or traces

Likely test files:

- `tests/frontend/AgentSdkConversationRuntime.test.ts`
- `tests/frontend/SdkDisplayChatMessageProjection.test.ts`
- `tests/frontend/MessageContent.test.jsx`
- `tests/frontend/DesktopResolvedMessageScreenshotsRuntime.test.jsx`
- `tests/frontend/DesktopMessageScreenshotRuntime.test.js`
- `tests/backend/test_rehydrate_execution_service.py`
- `tests/backend/test_tool_output_projection.py`
- `tests/backend/test_tool_result_handler.py`
- `tests/backend/test_websocket_message_handler.py`

### Phase 2. Extract A Named SDK Legacy Replay Adapter

Move legacy screenshot conversion out of generic display-row metadata assembly:

Current:

```text
displayRowMetadata(...)
-> legacyScreenshotDisplayAttachments(...)
```

Target:

```text
legacyVisualAttachmentReplayAdapter(event)
-> SdkDisplayAttachment[]
```

Requirements:

- explicit owner comment: old persisted conversation replay only
- stable attachment ids
- preserves multi-ref order
- distinguishes `tool_result` from generic `replay`
- no preview bytes
- tests cover old user and old tool rows

Deletion gate:

- delete the adapter only after stored rows are migrated or a durable local
  store migration rewrites old screenshot fields into typed attachments.
- keep this adapter, or its replacement migration adapter, until old
  conversations with only screenshot aliases have a replay test that proves
  screenshots still display after restart.

### Phase 3. Project Tool Outputs As Typed Attachments In SDK

Add typed attachments to SDK display metadata for:

- `tool_output`
- `tool_bundle_output`
- live current-turn presentation entries for tool output screenshots

Target flow:

```text
backend tool-output payload screenshot_ref/screenshot_refs
-> backendEventNormalizer
-> ConversationEvent payload.display_attachments or payload.attachments
-> conversationProjections display metadata.attachments
-> renderer ChatMessage.attachments
```

Requirements:

- use `source: "tool_result"`
- status is `ready` when artifact refs exist
- support single and multiple screenshots
- support inline screenshot data only as migration input; prefer materialized
  artifact refs
- preserve `toolOutputDetails` separately from visual attachments
- support live current-turn and persisted replay paths, not just completed
  dashboard rows
- support tool bundle output screenshots

Regression gates:

- old legacy `tool_output` rows still display through the typed adapter
- new backend-normalized `tool_output` rows expose `attachments[]` directly
- renderer receives the same ordered attachments for live current-turn rows and
  replayed rows

### Phase 4. Migrate Renderer Tool UI To Attachment Components

Refactor `ToolOutputMessage`:

Current:

```text
ToolOutputMessage
-> useResolvedMessageScreenshotSrc(message)
-> DesktopMessageScreenshotRuntime
```

Target:

```text
ToolOutputMessage
-> ToolOutputAttachmentList or AttachmentList with surface/tool variant
-> AttachmentRendererRegistry
-> useResolvedArtifactImageSrc(attachment)
```

Potential component target:

```text
MessageRow
-> MessageContent
-> ToolOutputMessage
-> AttachmentList
-> AttachmentRendererRegistry
-> ImageAttachment
```

Renderer components should not inspect `screenshot`, `screenshotRef`,
`screenshotUrl`, `screenshots`, or `screenshot_refs` after this phase.

Regression gates:

- `MessageContent` and `ToolOutputMessage` tests render tool-result
  screenshots through typed attachments
- tests assert legacy user screenshot aliases still do not render as primary
  user-message visuals
- context menu/image fetch behavior remains available for attachment-rendered
  tool screenshots

### Phase 5. Backend Contract Migration

Add typed visual attachment support at backend boundaries before deleting
legacy fields.

Candidate API shape:

```py
class DisplayAttachment(BaseModel):
    id: str
    kind: Literal["image", "screenshot_request"]
    source: Literal["tool_result", "replay", "user_included", "camera_button"]
    status: Literal["ready", "failed", "materializing", "pending_capture"]
    screenshot_ref: Optional[str] = None
    screenshot_url: Optional[str] = None
    content_type: Optional[str] = None
    error_code: Optional[str] = None
```

Add to:

- tool-result payload data, if backend should receive display descriptors
- tool-bundle-result payload
- outgoing tool-output payload
- rehydrate entries, if model-visible replay should carry typed refs
- backend formatter metadata passthrough

Compatibility period:

- accept both old `screenshot_ref` and new `attachments`/`display_attachments`
- emit both only when needed by downstream consumers
- trace counts, not bytes or URLs

Deletion gate:

- backend tests no longer rely on legacy screenshot fields except explicit
  compatibility tests
- SDK transport contract accepts typed attachments
- renderer no longer consumes legacy fields
- rehydrate tests prove old `screenshot_ref` rows still become model-visible
  screenshots
- query execution tests prove model-visible screenshot refs still hydrate
  correctly after the display contract changes

### Phase 6. Local Store Migration Or Permanent Replay Adapter Decision

Because old conversations must not lose screenshot display, choose one:

Option A: durable migration

- add a local-store migration/repair path that reads old event payload
  screenshot aliases and writes typed `attachments[]`
- keep a backup path for failed migration
- delete SDK legacy replay adapter after migration validation
- migration must be idempotent and preserve ordering for `screenshot_refs`
- migration must not persist inline preview bytes

Option B: permanent narrow replay adapter

- keep one small SDK/local replay adapter forever
- delete every other renderer/backend alias display reader
- document that this is not active architecture, only old-row compatibility
- adapter must remain covered by old-conversation replay tests

Preferred approach:

- Option A if local store migration is practical and testable.
- Option B if migration risk is higher than keeping one small isolated adapter.

### Phase 7. Delete Renderer Screenshot Helper Paths

Delete after phases 3 and 4 pass:

- `frontend/src/renderer/app/runtime/desktopMessageScreenshotRuntime.js`
- whole-message screenshot resolver APIs:
  - `useResolvedMessageScreenshotSrc`
  - `useResolvedMessageScreenshotSrcList`
- tests that exist only for legacy whole-message screenshot normalization
- `screenshotFieldsFromPayload(...)` from renderer SDK display projection
  once tool-output attachments are projected directly

Keep:

- direct attachment artifact resolver:
  `useResolvedArtifactImageSrc(attachment)` or a renamed attachment-first
  runtime

Do not delete this phase unless:

- tool-output screenshots render from typed attachments
- old tool-output screenshot rows are adapted before they reach renderer
  components
- no renderer component calls the whole-message screenshot resolver

### Phase 8. Delete SDK/Backend Alias Writers Where Safe

After typed attachments are accepted end to end:

- remove duplicate SDK display-row screenshot alias writers from
  `SdkDisplayRowMetadata` when no renderer consumer reads them
- remove renderer projection copying of `screenshotRef`, `screenshotUrl`,
  `screenshotRefs`, and `screenshot` for display
- remove backend outgoing display aliases after provider/history compatibility
  is explicitly handled elsewhere

Do not remove:

- backend model-visible screenshot refs until prompt construction and provider
  history are attachment-aware
- artifact store APIs keyed by artifact id

## Deletion Checklist

Only delete a legacy path when all are true:

- a typed attachment path exists at the owner runtime
- old persisted screenshots still display after restart
- active tool-output screenshots still display
- tool-bundle screenshots still display
- backend rehydrate still makes old screenshots model-visible
- mixed image plus camera sends preserve display order
- multi-image sends preserve display order
- failed visual attachment states are explicit
- preview bytes, screenshot URLs, and temp paths are absent from durable logs
  and stores
- core-loop and user-facing regression routes pass
- docs name any remaining compatibility owner and deletion condition

Specific deletion targets:

- `DesktopMessageScreenshotRuntime`
- `useResolvedMessageScreenshotSrc`
- `useResolvedMessageScreenshotSrcList`
- renderer `screenshotFieldsFromPayload(...)`
- renderer tests that validate primary display from legacy aliases
- SDK `legacyScreenshotDisplayAttachments(...)`, if durable migration replaces
  it
- backend websocket/schema legacy screenshot fields, only after typed
  attachment payloads are provider-safe and external compatibility is handled

## Validation

Focused frontend:

```bash
./bin/windie.sh test frontend -- \
  AttachmentDisplayComponents.test.jsx \
  DesktopResolvedMessageScreenshotsRuntime.test.jsx \
  DesktopMessageScreenshotRuntime.test.js \
  MessageContent.test.jsx \
  SdkDisplayChatMessageProjection.test.ts \
  AgentSdkConversationRuntime.test.ts \
  ConversationRuntimeProjectionStream.test.ts \
  DesktopConversationDisplayProjection.test.ts \
  UseDashboardConversations.test.jsx
```

Core loop:

```bash
./bin/windie.sh test core-loop
```

Backend:

```bash
./scripts/python-in-env.sh backend pytest \
  tests/backend/test_rehydrate_execution_service.py \
  tests/backend/test_tool_output_projection.py \
  tests/backend/test_tool_result_handler.py \
  tests/backend/test_websocket_message_handler.py \
  tests/backend/test_query_execution_service_helpers.py
```

Sidecar/local replay where touched:

```bash
./bin/windie.sh test sidecar
```

Lint:

```bash
cd frontend && npm run lint
```

## Docs To Update During Implementation

- `docs/adr/007-sdk-owned-live-visual-attachment-display.md`
- `docs/desktop/artifacts_and_attachments.md`
- `docs/desktop/artifact_change_workflow.md`
- `docs/memory/transcript_replay_change_workflow.md`
- `docs/frontend/renderer/chat/payloads/tool_call_output_and_transparency_section_rendering_reference.md`
- `docs/sdk/conversation_runtime.md`
- `docs/debug/core_loop_regression_pack.md`
- `docs/debug/user_facing_regression_pack.md`

## Migration And Security Notes

- No inline image bytes should be added to durable history as part of this
  migration.
- Do not log screenshot URLs, temp paths, or preview bytes.
- Artifact refs remain the durable identity.
- Backend/provider model-visible image hydration must continue to enforce
  owner/user scoping.
- Existing old conversations must keep screenshot display either through a
  tested migration or a deliberately retained narrow replay adapter.
