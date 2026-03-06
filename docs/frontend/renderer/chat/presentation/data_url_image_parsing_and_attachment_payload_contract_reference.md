---
summary: "Deep reference for renderer chat attachment parsing primitives: shared FileReader data-URL helpers, base64/content-type normalization, clipboard/file attachment shaping, and outgoing payload contract coupling."
read_when:
  - When changing chat attachment parsing helpers under `frontend/src/renderer/features/chat/utils/*`.
  - When debugging missing image previews, wrong attachment filenames/content types, or attachment-only send payload regressions.
title: "Data-URL Image Parsing and Attachment Payload Contract Reference"
---

# Data-URL Image Parsing and Attachment Payload Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/utils/dataUrlImageUtils.js`
- `frontend/src/renderer/features/chat/utils/clipboardImageUtils.js`
- `frontend/src/renderer/features/chat/utils/fileAttachmentUtils.js`
- `frontend/src/renderer/features/chat/utils/message/messageInput.js`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `tests/frontend/ClipboardImageUtils.test.js`
- `tests/frontend/FileAttachmentUtils.test.js`
- `tests/frontend/MessageInput.test.jsx`

## Shared Data-URL Primitive Contract

`dataUrlImageUtils.js` provides shared parsing primitives used by clipboard and file-attachment flows.

### `readFileAsDataUrl(file, options)`

Behavior:

- reads browser `File`/`Blob` with `FileReader.readAsDataURL`
- resolves only when `reader.result` is a string data URL
- rejects with caller-provided error messages:
  - `loadErrorMessage`
  - `readErrorMessage`

### `parseBase64ImageDataUrl(dataUrl, fallbackContentType)`

Behavior:

- requires `data:<type>;base64,<payload>` format
- returns `null` when input does not match the expected data-URL base64 pattern
- normalizes content type through `ArtifactImageUtils.normalizeArtifactImageContentType`
- derives extension through `ArtifactImageUtils.resolveArtifactImageExtension`

Returned shape:

- `base64`
- `contentType`
- `extension`
- `previewUrl` (original data URL)

## Clipboard Image Flow Contract

`parseClipboardImageItems(clipboardItems)`:

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

`parseSelectedComposerFiles(fileList)` splits selected files into two buckets:

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

`buildOutgoingMessage(...)` consumes parsed image and readable-file collections:

- drops invalid clipboard/readable entries with normalization helpers
- blocks send when `isSending=true`
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

- clipboard paste path uses `parseClipboardImageItems`
- native file picker path uses `parseSelectedComposerFiles`
- send button is enabled when attachments exist (even with empty typed text)

`ChatBox` overlay:

- uses `parseClipboardImageItems` for pasted image previews
- does not use readable-file picker path
- screenshot-capture button creates preview payloads directly from `extractOSstate` output

## Test-Backed Invariants

`tests/frontend/ClipboardImageUtils.test.js`:

- non-image clipboard items are ignored
- parsed image payload includes base64/contentType/filename/previewUrl

`tests/frontend/FileAttachmentUtils.test.js`:

- separates image attachments from readable files
- ignores non-image files without usable file path

`tests/frontend/MessageInput.test.jsx`:

- pasted images append (not replace) previews
- selected readable files appear in outgoing payload
- attachment-only messages can be sent

## Drift Hotspots

1. Changing data-URL regex contract can silently break both clipboard and file-picker image ingestion.
2. Diverging `contentType` normalization from `ArtifactImageUtils` causes extension/content-type mismatch in artifact upload paths.
3. Removing readable-file path resolution fallback (`path|filepath|webkitRelativePath`) can drop file attachments without user-visible errors.
4. Changing attachment-only fallback text without sender-doc alignment can break downstream prompt expectations/tests.

## Related Docs

- [MessageInput Clipboard Image and Voice Submit Reference](message_input_clipboard_image_and_voice_submit_reference.md)
- [Message Send Surface Policy and Screenshot Capture Reference](../message_send_surface_policy_and_screenshot_capture_reference.md)
- [Capture, Artifact Upload, and Payload Normalization Reference](../../infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
