---
summary: "ADR 007 for SDK-owned live visual attachment display projection, keeping renderer attachment UI pluggable and simple while SDK/main/backend own image materialization."
read_when:
  - When changing user-included image attachments, multi-image sends, camera-button screenshot requests, SDK display rows, renderer message attachment components, or screenshot alias cleanup.
  - When debugging image attachment flicker, mixed image-plus-camera sends, pending screenshot display, replayed visual attachments, or frontend screenshot merge compatibility.
title: "ADR 007: SDK-Owned Live Visual Attachment Display"
---

# ADR 007: SDK-Owned Live Visual Attachment Display

## Status

Accepted target as of 2026-06-22. Implementation should proceed through the
SDK-owned live visual attachment display plan:
`plans/2026-06-22-sdk-owned-live-visual-attachment-display-plan.md`.

## Context

WindieOS supports visual user inputs with different lifecycles:

- user-included pasted/selected images already exist before send
- multiple user-included images should render in user-chosen order
- camera-button screenshots are requested before send but do not exist until
  SDK/main captures and materializes them
- mixed sends can include existing user images plus a requested current
  desktop screenshot
- replay/history should render artifact-backed visuals without inline preview
  bytes

The current renderer guard preserves visible images across repeated SDK
text-only display projections, but that pushes SDK event-ordering complexity
into frontend code. The frontend has to understand optimistic image rows,
SDK `user_message` versus `user_message_metadata`, screenshot aliases, and
same-turn merge rules.

That is the wrong long-term boundary for a pluggable, hackable frontend.

## Decision

The SDK display projection owns live visual attachment state for user display
rows. Renderer message UI consumes one ordered `attachments[]` display contract.

The runtime chain is:

```text
renderer composer/send intent
  -> typed SDK turn resources
  -> SDK live visual attachment projection
  -> SDK display row attachments[]
  -> renderer AttachmentList / AttachmentRendererRegistry
  -> backend artifact refs for durable/model-visible images
```

### Attachment Contract

SDK display user rows expose ordered visual attachments. The exact type may
evolve during implementation, but the contract is:

```ts
type SdkDisplayAttachment =
  | {
      id: string;
      kind: 'image';
      source: 'user_included';
      status: 'materializing';
      filename?: string | null;
      contentType?: string | null;
      previewSrc: string; // volatile live display only
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

### Source Semantics

User-included images are concrete inputs at send time. They should display
immediately as `image/materializing` with volatile `previewSrc`, then replace by
stable attachment id with `image/ready` artifact metadata.

Camera-button screenshots are requested resources. The renderer must not
fabricate screenshot pixels. SDK/main owns capture timing, overlay protection,
selected-display behavior, artifact materialization, and transition to
`image/ready`.

Mixed sends are ordered as:

```text
user-included images in composer order -> camera screenshot request
```

Dashboard renders `screenshot_request/pending_capture` as a pending attachment
placeholder. Compact pill rendering omits that placeholder because the pill is
space-constrained.

Tool-result visual attachments are ready artifact-backed descriptors only for
this ADR. There is no tool-result preview state. Renderer tool-output
components consume these descriptors through `AttachmentList`; they do not read
whole-message screenshot aliases as display input.

### Frontend Shape

Renderer message UI should become a pluggable presentation layer:

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

The registry dispatches by SDK attachment `kind`, `status`, and, where needed,
`source`. It is not a state authority and must not merge screenshot metadata.

## Persistence And Privacy

`previewSrc` is volatile live display state only. It must not be persisted in
history, diagnostics, logs, or backend payloads.

Durable state may store:

- attachment id
- source
- status
- filename
- content type
- artifact refs and URLs
- capture metadata when needed
- sanitized failure codes

Durable state must not store inline preview bytes for this feature. Replay
should reconstruct visual attachments from artifact refs and lightweight
metadata.

## Alternatives Considered

| Alternative | Reason not chosen |
| --- | --- |
| Keep renderer same-turn screenshot merge as the primary architecture | Preserves behavior, but frontend remains coupled to SDK event ordering and screenshot alias details. |
| Use one generic `screenshot` slot | Cannot truthfully model existing user images, multiple images, camera requests, mixed sends, and replay without special cases. |
| Show only a pending token for user-included images | The image already exists, so withholding the preview makes UX worse and keeps frontend optimism separate from SDK display projection. |
| Move screenshot capture into renderer | Breaks OS-sensitive capture, overlay protection, selected-display, and local-runtime trust boundaries. |
| Persist inline previews for replay | Increases storage/privacy risk and duplicates artifact ownership. |

## Consequences

- SDK conversation runtime must maintain live visual attachment projection state
  keyed by conversation/turn/attachment id.
- SDK display projection must be monotonic: repeated rebuilds cannot downgrade
  a same-turn image-bearing row to text-only.
- Renderer user-message UI becomes a typed attachment component tree over
  `attachments[]`.
- Old renderer screenshot merge guards and dashboard-open screenshot annotation
  merging become temporary compatibility only and must be deleted after SDK
  projection owns the behavior.
- Legacy screenshot aliases may remain only in SDK/local-store replay or
  backend/provider compatibility paths with named dependencies and deletion
  conditions.
- The retained `legacyVisualAttachmentReplayAdapter` is the named SDK replay
  compatibility owner for old rows until a durable store migration replaces it.

## Validation And Docs Impact

Implementation must update:

- SDK display-row and conversation runtime tests for single image, multi-image,
  camera-only, mixed image-plus-camera, failure state, repeated projection, and
  replay without preview bytes.
- Renderer tests for `AttachmentList`, `AttachmentRendererRegistry`, pending
  screenshot dashboard rendering, compact pill omission, and deletion of old
  screenshot merge/alias branches.
- Core Loop Regression Pack when the tests become the owner-correct protection.
- Desktop attachment/screenshot docs when the SDK contract ships.

No migration is required for this ADR by itself. Implementation changes must
state whether persisted transcript, SDK event payload, IPC, or backend payload
compatibility needs a migration or replay adapter.
