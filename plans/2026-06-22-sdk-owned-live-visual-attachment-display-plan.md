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
  images immediately and add the captured screenshot when it is ready
- repeated SDK display projections must be monotonic: a same-turn user row must
  not downgrade from image-bearing to text-only while resources materialize

This plan is the display-projection complement to
`plans/2026-06-18-shared-image-resource-materialization-plan.md`.

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
| Camera button / auto screenshot | No | Screenshot request descriptor, optionally pending placeholder | SDK/main captures and materializes |
| Included images plus camera enabled | Mixed | Included images immediately; camera screenshot added or resolved later | SDK/main owns capture/materialization |
| Replay/history | Artifact refs exist or not | Artifact-backed descriptors only | SDK/local store/backend |

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
    };
```

The renderer should consume this list as rendering data:

- render `image/materializing` with `previewSrc`
- render `screenshot_request/pending_capture` as a small pending attachment
  placeholder or omit it where product design chooses no placeholder
- render `image/ready` through the existing authenticated artifact image
  resolver
- preserve list order from the SDK

Long term, renderer components should not merge `screenshotRef`,
`screenshotRefs`, `screenshotUrl`, `screenshot`, and `attachmentFilenames`
aliases themselves. Those aliases can remain compatibility fields during the
migration.

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

## Non-Goals

- Do not move camera screenshot capture into renderer code.
- Do not pre-upload user images from renderer before the SDK turn exists.
- Do not persist `previewSrc` or inline base64 in history.
- Do not make the backend own live optimistic display state.
- Do not collapse user-included images and camera screenshot requests into one
  ambiguous `screenshot` field.
- Do not delete the current renderer monotonic guard until SDK-owned projection
  coverage proves the SDK cannot emit a same-turn text-only downgrade.

## Implementation Slices

### 1. ADR

Create `docs/adr/007-sdk-owned-live-visual-attachment-display.md` with proposed
or accepted-target status. It should decide:

- SDK display projection owns live user visual attachment state.
- User-included images get immediate live image descriptors.
- Camera-button screenshots get request descriptors until captured.
- Durable history stores artifact refs and metadata, not live preview bytes.
- Renderer remains a display-row consumer.

Update `docs/adr/README.md` to include ADR 007.

### 2. SDK Attachment Identity And Resource Preview Metadata

Extend SDK turn input resource handling so user-included images and screenshot
requests carry stable display attachment ids.

Expected behavior:

- each pasted/selected image maps to a stable ordered attachment id
- camera screenshot request maps to a distinct stable attachment id
- mixed sends keep user-included image ids before or around camera request ids
  according to product display order
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
- camera-only sends include a pending screenshot request descriptor or no visual
  descriptor until captured, depending on final product design
- mixed sends include user images immediately and later include/replace the
  camera request with a ready screenshot image
- repeated display projections caused by trace/progress events never drop
  same-turn visual attachment descriptors unless a terminal failure explicitly
  marks the resource failed

### 5. Renderer Consumer Simplification

Teach renderer message projection and presentation to prefer SDK display
`attachments[]`.

Migration approach:

1. Prefer `attachments[]` when present.
2. Keep legacy `screenshots[]` and screenshot alias support as compatibility.
3. Once SDK projection owns all live visual attachment cases and replay paths,
   remove renderer-only same-turn screenshot merge compatibility.

Owner candidates:

- `frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts`
- `frontend/src/renderer/app/runtime/desktopMessageScreenshotRuntime.js`
- `frontend/src/renderer/app/runtime/desktopResolvedMessageScreenshotsRuntime.js`
- user-message presentation components under
  `frontend/src/renderer/features/chat/components/message/content/`

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
- monotonic downgrade detection count, if practical

Do not log text, preview bytes, screenshot URLs, screenshot paths, or filenames
unless a filename has already been sanitized elsewhere.

## Regression Tests

Add or extend tests in the owner-correct layer before simplifying frontend
compatibility.

SDK/runtime tests:

- user-included single image projects a materializing image descriptor before
  artifact refs exist
- multiple user-included images project ordered materializing descriptors
- camera-only request projects pending screenshot request or waits until ready,
  according to final design
- mixed included images plus camera request projects included images
  immediately and adds/replaces the camera descriptor when ready
- repeated trace/progress display rebuilds do not downgrade image-bearing rows
  to text-only
- replay/history projection emits artifact-backed descriptors without preview
  bytes

Renderer tests:

- message projection prefers SDK `attachments[]`
- user message presentation renders multiple ordered display attachments
- renderer compatibility guard remains until SDK contract coverage is complete

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
  fields during migration
- renderer should prefer `attachments[]`
- remove legacy renderer merge and alias fallback only after local history,
  replay, dashboard open, live stream, retry/edit-resend, and scripted-provider
  image tests pass through `attachments[]`

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
  alias merging for the primary path.
- Legacy screenshot aliases and renderer merge compatibility have named
  remaining dependencies or are deleted.
- Core-loop and focused SDK/frontend tests cover single image, multi-image,
  camera-only, mixed image plus camera, replay, and repeated projection cases.
