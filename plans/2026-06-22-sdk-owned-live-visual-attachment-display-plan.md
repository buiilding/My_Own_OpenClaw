---
summary: "Implementation plan for moving live user visual attachment display projection into the SDK while keeping renderer code a simple display-row consumer."
title: "SDK-Owned Live Visual Attachment Display Plan"
---

# SDK-Owned Live Visual Attachment Display Plan

Date: 2026-06-22

## Goal

Move live visual attachment display continuity into the SDK display projection
so renderer chat surfaces can render one ordered attachment list instead of
merging screenshot aliases, optimistic inline image state, and later artifact
metadata.

The user-visible invariant is:

- user-included images render immediately because the image already exists
- multiple user-included images preserve order and render independently
- camera-button screenshots are represented as requested screenshots until
  capture/materialization completes
- mixed sends, such as two included images plus camera enabled, show included
  images immediately in composer order and add the captured screenshot after
  the included images when it is ready
- repeated SDK display projections must be monotonic: a same-turn user row must
  not downgrade from image-bearing to text-only while resources materialize

This plan is the display-projection complement to
`plans/2026-06-18-shared-image-resource-materialization-plan.md`.
The durable ownership decision is ADR 007:
`docs/adr/007-sdk-owned-live-visual-attachment-display.md`.

## Current Problem

The current implementation has the right behavior after the renderer-side
guard, but ownership is still split:

1. Renderer creates an optimistic user row with inline screenshot attachments.
2. SDK emits an early text-only `user_message` row.
3. Renderer merges optimistic image metadata into the SDK row.
4. SDK emits repeated text-only display projections while resource resolution,
   memory, prompt, trace, and backend stream setup continue.
5. SDK later emits `user_message_metadata` with artifact refs.
6. Renderer swaps to artifact-backed display once refs resolve.

That protects the UI, but the frontend has to know too much about partial SDK
event ordering. The target architecture is that the SDK owns the live display
attachment state for the turn, and the renderer renders a normalized ordered
display attachment list.

## Source Semantics

Visual inputs are not all the same. The display contract should preserve their
source semantics instead of collapsing them into one legacy `screenshot` slot.

| Source | Exists at send time? | Initial display | Owner of capture/materialization |
| --- | --- | --- | --- |
| User-included pasted/selected image | Yes | Image descriptor with volatile preview source | SDK/main materializes to artifact |
| Multiple user-included images | Yes | Ordered image descriptors with volatile preview sources | SDK/main materializes each image |
| Camera button / auto screenshot | No | Screenshot request descriptor; dashboard shows a placeholder, compact pill omits it | SDK/main captures and materializes |
| Included images plus camera enabled | Mixed | Included images immediately; camera screenshot added or resolved later | SDK/main owns capture/materialization |
| Tool-result visual attachment | Artifact result exists after tool execution | Ready artifact-backed descriptor only; no preview state | SDK/main/backend materialize tool output |
| Replay/history | Artifact refs exist or not | Artifact-backed descriptors only, no live preview bytes | SDK/local store/backend |

Mixed visual sends use this display order:

```text
user-included images in composer order -> camera screenshot request
```

## Proposed Display Contract

SDK display rows should expose an ordered live attachment list for user rows.
The exact exported type can be refined during implementation, but the contract
should be structurally close to:

```ts
type SdkDisplayAttachment =
  | {
      id: string;
      kind: 'image';
      source: 'user_included';
      status: 'materializing';
      filename?: string | null;
      contentType?: string | null;
      previewSrc: string; // volatile live projection only; never durable history
    }
  | {
      id: string;
      kind: 'screenshot_request';
      source: 'camera_button';
      status: 'pending_capture' | 'materializing';
      filename?: string | null;
    }
  | {
      id: string;
      kind: 'image';
      source: 'user_included' | 'camera_button' | 'tool_result' | 'replay';
      status: 'ready';
      filename?: string | null;
      contentType?: string | null;
      screenshotRef: string;
      screenshotUrl?: string | null;
    }
  | {
      id: string;
      kind: 'image' | 'screenshot_request';
      source: 'user_included' | 'camera_button' | 'tool_result' | 'replay';
      status: 'failed';
      filename?: string | null;
      errorCode?: string | null;
    };
```

The renderer should consume this list as rendering data:

- render `image/materializing` with `previewSrc`
- render `screenshot_request/pending_capture` as a small pending attachment
  placeholder in dashboard
- omit `screenshot_request/pending_capture` in the compact pill because the pill
  is space-constrained
- render `image/ready` through the existing authenticated artifact image
  resolver
- render `failed` as a compact nonblocking attachment failure state where the
  surface has room; compact surfaces may omit it or expose it through existing
  turn error details
- preserve list order from the SDK

Renderer components should not merge `screenshotRef`, `screenshotRefs`,
`screenshotUrl`, `screenshot`, and `attachmentFilenames` aliases themselves in
the completed implementation. Legacy aliases may exist only as a short-lived
parity gate while SDK `attachments[]` coverage is being proven. They are not
part of the target architecture.

## Persistence Contract

`previewSrc` is live display state only. It must not be stored in durable
conversation history, diagnostics, logs, or backend payloads.

Durable history may store:

- attachment id
- source
- status
- filename
- content type
- artifact refs and URLs
- capture metadata when needed

Durable history must not store inline image bytes for this feature. Replay
should reconstruct display attachments from artifact refs and lightweight
metadata.

## Runtime Ownership

| Layer | Target responsibility |
| --- | --- |
| Renderer composer | Collects pasted/selected image bytes for send, generates stable local attachment ids when needed, and shows pre-send composer previews. |
| Renderer send preparation | Converts composer inputs and camera state into typed SDK turn resources. It does not upload artifacts or own durable screenshot aliases. |
| Electron main | Owns OS-sensitive capture, overlay protection/hide/restore, trusted screenshot temp-path handling, and artifact upload bridge calls. |
| SDK conversation runtime | Owns live turn resource state, ordered display attachment projection, monotonic display rows, and replacement from preview/pending descriptors to artifact-backed descriptors. |
| SDK materializer | Converts user images, screenshot requests, and other visual resources into artifact refs. |
| Backend | Owns artifact storage, provider/model payload construction, and artifact serving. |
| Renderer display surfaces | Render SDK display attachments and authenticated artifact images. They do not infer remote artifact identity from legacy screenshot fields. |

## Frontend Component Target

The frontend target is a small, pluggable component tree over the SDK display
contract:

```text
MessageRow
  -> MessageText
  -> AttachmentList
       -> AttachmentRendererRegistry
            -> ImageAttachment
            -> PendingScreenshotAttachment
            -> FileAttachment
            -> future attachment renderers
```

`AttachmentRendererRegistry` should dispatch by SDK attachment `kind`, `status`,
and, when needed, `source`. Adding a new visual attachment type should mean:

1. SDK emits a typed attachment descriptor.
2. Renderer adds or swaps one attachment renderer component.
3. No global message merge, screenshot alias inference, or dashboard-specific
   display fallback changes are required.

The registry is not a second state authority. It is only a presentation router
for the SDK-owned `attachments[]` display contract.

## Non-Goals

- Do not move camera screenshot capture into renderer code.
- Do not pre-upload user images from renderer before the SDK turn exists.
- Do not persist `previewSrc` or inline base64 in history.
- Do not make the backend own live optimistic display state.
- Do not collapse user-included images and camera screenshot requests into one
  ambiguous `screenshot` field.
- Do not leave the current renderer monotonic guard, dashboard-open screenshot
  merge, or screenshot alias rendering paths in place after SDK-owned projection
  coverage proves the new ordered attachment contract.
- Do not keep compatibility code without a named dependency, owner, and
  deletion condition.

## Implementation Slices

### 1. ADR

Create `docs/adr/007-sdk-owned-live-visual-attachment-display.md` with
accepted-target status. It should decide:

- SDK display projection owns live user visual attachment state.
- User-included images get immediate live image descriptors.
- Camera-button screenshots get request descriptors until captured.
- Mixed sends order user-included images first, then the camera screenshot
  request.
- Dashboard renders pending camera placeholders; compact pill omits them.
- Stable attachment ids survive materializing, ready, and failed transitions.
- Tool-result visual attachments are ready artifact-backed descriptors only,
  with no preview state.
- Durable history stores artifact refs and metadata, not live preview bytes.
- Renderer remains a display-row consumer.

Update `docs/adr/README.md` to include ADR 007.

### 2. SDK Attachment Identity And Resource Preview Metadata

Extend SDK turn input resource handling so user-included images and screenshot
requests carry stable display attachment ids.

Expected behavior:

- each pasted/selected image maps to a stable ordered attachment id
- camera screenshot request maps to a distinct stable attachment id
- mixed sends keep user-included image ids in composer order before the camera
  request id
- resource tracing logs counts, kinds, and status only, not preview bytes

Owner candidates:

- `packages/windie-sdk-js/src/conversation/types.ts`
- `packages/windie-sdk-js/src/runtime/TurnInputPipeline.ts`
- `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts`
- `frontend/src/renderer/app/runtime/desktopChatSendPayloadRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts`

### 3. SDK Live Attachment Projection Store

Add SDK conversation-runtime state keyed by `conversationRef + turnRef` that can
project display attachments before artifact materialization is complete.

The state should support:

- materializing user-included image preview descriptors
- pending camera screenshot request descriptors
- ready artifact-backed image descriptors
- failed descriptors for capture/materialization failures
- replacement by stable attachment id
- monotonic merge when display rows are rebuilt after trace/progress events

Owner candidates:

- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `packages/windie-sdk-js/src/projections/conversationProjections.ts`
- `packages/windie-sdk-js/src/runtime/VisualResourceMaterializer.ts`

### 4. Display Row Projection Contract

Extend SDK display user rows with `attachments[]` while retaining legacy
screenshot fields during migration.

Expected row behavior:

- first user row after send includes materializing user-included image
  attachments when present
- camera-only sends include a pending screenshot request descriptor; dashboard
  renders it as a placeholder and compact pill omits it
- mixed sends include user images immediately and later include/replace the
  camera request with a ready screenshot image after the included images
- repeated display projections caused by trace/progress events never drop
  same-turn visual attachment descriptors unless a terminal failure explicitly
  marks the resource failed
- failed capture/materialization is represented as `status: 'failed'` rather
  than inferred from missing attachments

### 5. Renderer Consumer Switch

Teach renderer message projection and presentation to consume SDK display
`attachments[]` as the live visual display contract.

Migration approach:

1. Add renderer support for `attachments[]` behind focused projection and UI
   tests.
2. Switch live user-message rendering to `attachments[]`.
3. Keep legacy `screenshots[]` and screenshot alias support only for the
   smallest parity window needed to compare old and new behavior.
4. Delete renderer-only same-turn screenshot merge compatibility after the SDK
   projection tests cover repeated text-only rebuilds, dashboard open, replay,
   and mixed visual-resource sends.
5. Route message attachment rendering through `AttachmentList` and
   `AttachmentRendererRegistry` so per-kind renderers are replaceable without
   changing the message projection pipeline.

Owner candidates:

- `frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts`
- `frontend/src/renderer/app/runtime/desktopMessageScreenshotRuntime.js`
- `frontend/src/renderer/app/runtime/desktopResolvedMessageScreenshotsRuntime.js`
- user-message presentation components under
  `frontend/src/renderer/features/chat/components/message/content/`
- new or existing attachment presentation components under the renderer chat
  component tree

### 6. Diagnostics

Extend sanitized display projection diagnostics so failures can be inspected
without storing image data:

- row count
- user attachment count
- attachment sources
- attachment statuses
- ready artifact count
- materializing preview count
- pending screenshot request count
- failed attachment count and sanitized failure code buckets
- monotonic downgrade detection count, if practical

Do not log text, preview bytes, screenshot URLs, screenshot paths, or filenames
unless a filename has already been sanitized elsewhere.

### 7. Deletion Sweep

After SDK-owned `attachments[]` projection is live and covered, remove old
implementations instead of layering the new contract on top of them.

Deletion targets:

- renderer same-turn screenshot preservation/merge guard in
  `frontend/src/renderer/app/runtime/desktopConversationDisplayProjection.ts`
- dashboard-open screenshot annotation merge path in
  `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
  once dashboard receives SDK display rows that are already monotonic
- primary renderer projection from legacy `screenshotRef`, `screenshotRefs`,
  `screenshotUrl`, `screenshot`, `screenshot_ref`, `screenshot_refs`, and
  `screenshot_url` aliases when `attachments[]` covers the same cases
- UI branches that treat user-included images and camera screenshots as one
  ambiguous screenshot slot
- ad hoc screenshot conditionals inside message components once
  `AttachmentList` and `AttachmentRendererRegistry` own attachment
  presentation
- compatibility tests whose only purpose was protecting the retired renderer
  fallback, after equivalent SDK-owned tests exist
- duplicate SDK display-row metadata alias writers once all consumers read the
  ordered attachment list
- any tool-result preview branch if one appears during implementation; tool
  results should enter display projection only as ready artifact-backed
  descriptors for this ADR

Allowed remaining compatibility must be narrow:

- old persisted conversations may be adapted in one SDK/local-store replay
  adapter that converts legacy screenshot metadata into `attachments[]`
- backend/provider payload compatibility may keep artifact ref aliases where
  external or persisted contracts still require them
- any remaining alias path must name its dependency and deletion condition in
  code comments or owner docs

## Regression Tests

Add or extend tests in the owner-correct layer before simplifying frontend
compatibility.

SDK/runtime tests:

- user-included single image projects a materializing image descriptor before
  artifact refs exist
- multiple user-included images project ordered materializing descriptors
- camera-only request projects a pending screenshot request descriptor
- mixed included images plus camera request projects included images
  immediately and adds/replaces the camera descriptor when ready
- mixed included images plus camera request preserves the order:
  included images in composer order, then camera screenshot
- capture/materialization failure projects `status: 'failed'`
- repeated trace/progress display rebuilds do not downgrade image-bearing rows
  to text-only
- replay/history projection emits artifact-backed descriptors without preview
  bytes
- persistence/replay tests assert `previewSrc` is never written to durable
  history, diagnostics, logs, or backend payloads
- tool-result visual attachments project ready artifact-backed descriptors
  without preview state

Renderer tests:

- message projection prefers SDK `attachments[]`
- user message presentation renders multiple ordered display attachments
- dashboard renders pending camera screenshot placeholders
- compact pill omits pending camera screenshot placeholders
- failed attachments render nonblocking failure state where the surface supports
  it
- attachment renderer registry dispatches image, pending screenshot, and ready
  artifact image descriptors to the expected components
- new attachment types can be added without touching the global message merge
  path
- renderer compatibility guard remains only during the parity gate
- renderer fallback deletion is covered by boundary tests that reject the old
  merge/alias implementation after SDK contract coverage is complete

Regression pack:

- keep the existing Core Loop Regression Pack invariant for user-included
  images until SDK-owned display attachment projection replaces the renderer
  guard
- add the new SDK tests to the core-loop route if they protect the desktop send
  flow directly

## Migration And Compatibility

No user-data migration should be required for introducing live
`attachments[]`. Existing history can continue replaying through legacy
screenshot metadata until new artifact-backed attachment descriptors are
available.

Compatibility should be temporary and explicit:

- SDK display rows may emit both `attachments[]` and legacy screenshot alias
  fields only during the parity gate
- renderer should switch from preferring `attachments[]` to requiring
  `attachments[]` for live visual display before the migration is complete
- remove legacy renderer merge and alias fallback after local history, replay,
  dashboard open, live stream, retry/edit-resend, and scripted-provider image
  tests pass through `attachments[]`
- isolate old persisted-row adaptation in SDK/local-store replay code rather
  than renderer UI code
- document every remaining compatibility path with a deletion condition

## Security And Privacy Checks

- Do not persist or log `previewSrc`.
- Do not trust renderer-provided filesystem paths.
- Keep screenshot capture and overlay protection in Electron main/local
  runtime.
- Keep artifact upload/auth headers in SDK/main/backend-owned paths.
- Keep diagnostics count-only and source/status-only.
- Preserve backend model payload policy: provider-visible images come from
  materialized artifact refs or explicitly allowed visual resources, not from
  renderer display preview state.

## Completion Criteria

- ADR 007 exists and is linked from ADR README.
- SDK display rows have one ordered attachment contract covering user-included
  images, multiple images, camera screenshots, and mixed sends.
- Repeated SDK display projection rebuilds are monotonic for same-turn visual
  attachments.
- Renderer surfaces render the SDK display attachment list without screenshot
  alias merging.
- Renderer message attachment UI routes through `AttachmentList` and
  `AttachmentRendererRegistry`, with typed per-kind components instead of ad
  hoc screenshot branches.
- Renderer same-turn screenshot merge compatibility and dashboard-open
  screenshot annotation merge are deleted after SDK projection owns monotonic
  display rows.
- Legacy screenshot aliases are not primary renderer display inputs. Any
  remaining alias handling is isolated to SDK/local-store replay or
  backend/provider compatibility with a named dependency and deletion condition.
- Core-loop and focused SDK/frontend tests cover single image, multi-image,
  camera-only, mixed image plus camera, replay, and repeated projection cases.
