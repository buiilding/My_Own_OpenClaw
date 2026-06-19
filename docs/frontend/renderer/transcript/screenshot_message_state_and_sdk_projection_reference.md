---
summary: "Renderer screenshot message state and SDK display projection reference for explicit screenshotRef/screenshotUrl metadata, screenshot_refs attachments, inline screenshot payloads, and removed screenshot-field artifact inference."
read_when:
  - When changing `screenshotMessageState.js`, SDK display screenshot projection, message screenshot resolution, or replay screenshot metadata.
  - When debugging missing renderer screenshot attachments, `screenshotRef`/`screenshotUrl` display, `screenshot_refs` multi-image projection, or stale screenshot artifact inference behavior.
title: "Screenshot Message State and SDK Projection Reference"
---

# Screenshot Message State and SDK Projection Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/services/screenshotMessageState.js`
- `frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopMessageScreenshotRuntime.js`
- `frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts`
- `frontend/src/renderer/features/chat/utils/message/useResolvedMessageScreenshots.js`
- `tests/frontend/ScreenshotMessageState.test.js`
- `tests/frontend/SdkDisplayChatMessageProjection.test.ts`
- `tests/frontend/DesktopMessageScreenshotRuntime.test.js`
- `tests/frontend/ConversationReplayActions.test.jsx`

## Current Contract

Renderer chat rows separate inline screenshot bytes from remote artifact
metadata.

- `screenshot`: inline image payload only. It may be a `data:image/*;base64,...`
  URL or bare base64 image data.
- `screenshotRef` / `screenshot_ref`: durable artifact id.
- `screenshotUrl` / `screenshot_url`: display URL for a remote artifact image.
- `screenshotRefs` / `screenshot_refs`: ordered multi-image artifact ids, mapped
  into the renderer `screenshots[]` attachment array.

Do not reintroduce the retired compatibility path that treats a non-inline
`screenshot` string as an artifact id. Remote screenshots require explicit
`screenshotRef`, `screenshotUrl`, or `screenshot_refs` metadata.

The only inference still allowed is URL-to-ref extraction from backend artifact
URLs such as `/api/artifacts/<id>`. That lets replay preserve a canonical
`screenshotRef` when a row carries a trusted artifact URL but no explicit ref.

## Runtime Behavior

`resolveScreenshotAttachmentState(...)`:

1. parses inline screenshot data
2. rejects `artifact://`, `http://`, and `https://` values as inline payloads
3. builds remote state from explicit `screenshotRef` or artifact URL-derived ref
4. derives `screenshotUrl` from the supplied artifact URL builder when a ref
   exists and no URL was provided
5. optionally drops inline screenshot bytes when remote metadata exists

`screenshotMessageState.js` keeps the low-level normalization rules and defaults
to the runtime endpoint store for owner-level infrastructure tests. Renderer
feature code should call screenshot presentation helpers through
`desktopMessageScreenshotRuntime.js`, which delegates artifact URL and
attachment-state work to `DesktopArtifactRuntimeClient`. That client injects
the app runtime artifact URL builder and keeps endpoint-derived URLs behind the
renderer runtime boundary.

`buildMessageScreenshotState(...)` uses
`preserveInlineScreenshotWithRemote: false`, so renderer chat rows prefer the
remote artifact path and avoid keeping duplicate inline bytes next to
`screenshotRef`/`screenshotUrl`.

`resolveReplayScreenshotState(...)` follows the same remote preference while
preserving content type metadata for inline fallback rows.

## SDK Display Projection

`sdkDisplayChatMessageProjection.ts` reads screenshot metadata from SDK display
row payloads and raw metadata:

- single-image fields: `screenshotRef`, `screenshot_ref`, `screenshotUrl`,
  `screenshot_url`
- multi-image fields: `screenshotRefs`, `screenshot_refs`
- inline fallback fields: `screenshot`, `image`
- content type fields: `screenshotContentType`, `screenshot_content_type`

Projection rules:

- Remote metadata wins over inline screenshot bytes.
- `screenshot_refs` becomes `screenshots[]` with one attachment per ref.
- The first explicit `screenshotUrl` applies to the first attachment only;
  remaining refs derive URLs from the active runtime artifact URL builder.
- SDK display projection must not infer artifact ids from the old
  `screenshot` field.

## Debug Checklist

If a replayed or resumed image is missing:

1. inspect the SDK display row raw metadata for `screenshotRef`,
   `screenshotUrl`, or `screenshot_refs`
2. verify `DesktopArtifactRuntimeClient` has the active runtime HTTP URL before
   deriving artifact URLs
3. confirm `screenshot` is actual inline image data, not an artifact id
4. check `desktopMessageScreenshotRuntime.js` for attachment descriptor state
5. check `useResolvedMessageScreenshots.js` fetch/cache behavior for remote
   artifact URLs

If a row shows one image instead of multiple:

1. confirm SDK display metadata has `screenshot_refs` with all artifact ids
2. inspect `buildRemoteScreenshotAttachments(...)` output
3. verify downstream message rendering consumes `screenshots[]`, not just the
   compatibility `screenshotRef`

## Related Pages

- [Frontend Renderer Transcript Docs Hub](README.md)
- [Transcript Session and Rehydrate Reference](../transcript_session_and_rehydrate_reference.md)
- [Chat Attachment Change Workflow](../chat/chat_attachment_change_workflow.md)
- [Artifacts and Attachments](../../../desktop/artifacts_and_attachments.md)
- [Frontend Capture, Artifact URL, and Payload Normalization Reference](../infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
