---
summary: "Deep reference for renderer chat attachment parsing primitives: shared FileReader data-URL helpers, base64/content-type normalization, clipboard/file attachment shaping, and outgoing payload contract coupling."
read_when:
  - When changing chat attachment parsing helpers under `frontend/src/renderer/app/runtime/desktopComposerAttachmentRuntime.js`.
  - When debugging missing image previews, wrong attachment filenames/content types, or attachment-only send payload regressions.
title: "Data-URL Image Parsing and Attachment Payload Contract Reference"
---

# Data-URL Image Parsing and Attachment Payload Contract Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopComposerAttachmentRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMessageInputRuntime.js`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- `tests/frontend/DesktopComposerAttachmentRuntime.test.js`
- `tests/frontend/MessageInput.test.jsx`

## Shared Data-URL Primitive Contract

`DesktopComposerAttachmentRuntime` in `desktopComposerAttachmentRuntime.js`
provides shared parsing primitives used by clipboard and file-attachment
flows. Consumers should import the runtime facade rather than standalone helper
exports.

### `DesktopComposerAttachmentRuntime.readFileAsDataUrl(file, options)`

Behavior:

- reads browser `File`/`Blob` with `FileReader.readAsDataURL`
- resolves only when `reader.result` is a string data URL
- rejects with caller-provided error messages:
  - `loadErrorMessage`
  - `readErrorMessage`

### `DesktopComposerAttachmentRuntime.parseBase64ImageDataUrl(dataUrl, fallbackContentType)`

Behavior:

- requires `data:<type>;base64,<payload>` format
- returns `null` when input does not match the expected data-URL base64 pattern
- normalizes content type through `DesktopArtifactRuntimeClient.normalizeArtifactImageContentType`
- derives extension through `DesktopArtifactRuntimeClient.resolveArtifactImageExtension`

Returned shape:

- `base64`
- `contentType`
- `extension`
- `previewUrl` (original data URL)

## Clipboard Image Flow Contract

`DesktopComposerAttachmentRuntime.parseClipboardImagePasteEvent(event)`:

1. reads `event.clipboardData.items` at the app-runtime boundary
2. reports `hasImageItems: false` with an empty image list for text-only paste
   events so composer hooks can delegate to normal transcription/text paste
   handling
3. when image items are present, returns `hasImageItems: true` plus parsed
   image preview payloads from the shared clipboard-item parser

`DesktopComposerAttachmentRuntime.parseClipboardImageItems(clipboardItems)`:

1. filters clipboard items to `image/*` MIME types
2. reads each image with `readFileAsDataUrl(...)`
3. parses data URL through `parseBase64ImageDataUrl(...)`
4. emits preview payload objects:
  - `id` (`Date.now + random` string)
  - `base64`
  - `contentType`
  - `filename` (`clipboard-image.<ext>`)
  - `previewUrl`

Non-image clipboard items are ignored.

## File Picker Attachment Flow Contract

`DesktopComposerAttachmentRuntime.parseSelectedComposerFiles(fileList)` splits
selected files into two buckets:

- `imageAttachments[]`
- `readableFiles[]`

Image detection:

- MIME starts with `image/`, or
- filename extension in allowlist (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.tif`, `.tiff`, `.ico`, `.svg`)

Image attachments:

- read via `readFileAsDataUrl(...)`
- parse via `parseBase64ImageDataUrl(...)`
- preserve normalized filename where possible
- include same preview fields as clipboard images

Readable files (non-image):

- only included when a file path can be resolved from:
  - `file.path`
  - `file.filepath`
  - `file.webkitRelativePath`
- normalized shape:
  - `id`
  - `filename`
  - `filePath`

## Outgoing Message Payload Coupling

`DesktopMessageInputRuntime.buildOutgoingMessage(...)` consumes parsed image
and readable-file collections:

- drops invalid clipboard/readable entries with normalization helpers
- blocks send when the caller passes `isSubmitBlocked=true`
- returns `null` when both text and attachments are absent
- text-only -> returns trimmed string
- attachment-bearing -> returns object:
  - `text`
  - `clipboardImages`
  - `readableFiles`

Attachment-only fallback text:

- when no non-empty text is present but attachments exist, payload uses:
  - `"Please review the attached files."`

## MessageInput and ChatBox Integration Notes

`MessageInput`:

- clipboard paste path uses `parseClipboardImagePasteEvent`
- native file picker path uses `parseSelectedComposerFiles`
- catches paste and picker parse failures at the component boundary and logs scoped warnings
- send button is enabled when attachments exist (even with empty typed text)

`ChatBox` overlay:

- uses `parseClipboardImagePasteEvent` for pasted image previews through the
  shared composer draft hook
- does not use readable-file picker path
- screenshot-capture button creates preview payloads directly from `extractOSstate` output

## Test-Backed Invariants

`tests/frontend/DesktopComposerAttachmentRuntime.test.js`:

- data URL parsing and FileReader error behavior stay stable
- paste-event adapter detects text-only versus image paste events
- non-image clipboard items are ignored
- parsed image payload includes base64/contentType/filename/previewUrl
- separates image attachments from readable files
- ignores non-image files without usable file path

`tests/frontend/MessageInput.test.jsx`:

- pasted images append (not replace) previews
- selected readable files appear in outgoing payload
- pasted-image and picker parse failures are caught and logged
- attachment-only messages can be sent

## Drift Hotspots

1. Changing data-URL regex contract can silently break both clipboard and file-picker image ingestion.
2. Diverging `contentType` normalization from `DesktopArtifactRuntimeClient` causes extension/content-type mismatch in artifact upload paths.
3. Removing readable-file path resolution fallback (`path|filepath|webkitRelativePath`) can drop file attachments without user-visible errors.
4. Changing attachment-only fallback text without sender-doc alignment can break downstream prompt expectations/tests.

## Related Docs

- [MessageInput Clipboard Image and Voice Submit Reference](message_input_clipboard_image_and_voice_submit_reference.md)
- [Message Send Surface Policy and Screenshot Capture Reference](../message_send_surface_policy_and_screenshot_capture_reference.md)
- [Capture, Artifact URL, and Payload Normalization Reference](../../infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
