---
summary: "Deep reference for MessageInput runtime: text/voice submit paths, clipboard/file attachment parsing and preview contracts, plus/thinking menu behavior, and visible lifecycle loop-lock guards."
read_when:
  - When changing `MessageInput.jsx` input/submit behavior, pasted image UX, file-attachment parsing, or voice-mode handoff.
  - When debugging why submit is blocked, attachment payload is missing, or microphone dictation session behavior differs from form submit.
title: "MessageInput Clipboard Image and Voice Submit Reference"
---

# MessageInput Clipboard Image and Voice Submit Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/hooks/useMessageInputUiBindings.js`
- `frontend/src/renderer/app/runtime/desktopDismissOnOutsideRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMessageInputRuntime.js`
- `frontend/src/renderer/app/runtime/desktopComposerAttachmentRuntime.js`
- `frontend/src/renderer/features/chat/hooks/useTranscription.ts`
- `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
- `frontend/src/renderer/features/voice/components/VoiceStatus.jsx`
- `tests/frontend/MessageInput.test.jsx`
- `tests/frontend/DesktopMessageInputRuntime.test.js`
- `tests/frontend/DesktopComposerAttachmentRuntime.test.js`

## Input State Surface

Component-owned state:

- UI menu: `plusMenuOpen`
- clipboard previews: `clipboardImages[]`
- readable file previews: `selectedReadableFiles[]`

UI-effect bindings (`useMessageInputUiBindings`) own:

- textarea auto-resize on input changes via `useLayoutEffect`, so multiline `Shift+Enter` growth updates the composer height before paint instead of showing a one-frame row hop
- plus-menu outside-click dismissal through
  `DesktopDismissOnOutsideRuntime.subscribeToDismissOnOutside(...)`
- automatic plus-menu close when the visible lifecycle loop lock begins (`isLoopActive=true`)
- focus-request token handling for composer autofocus; the actual textarea
  focus and caret placement route through
  `DesktopMessageInputRuntime.focusTextInputAtEnd(...)`

Hook-owned text/transcription state (`useTranscription`):

- `inputValue`
- `setInputValue`
- `updateTranscription`
- `resetTranscription`
- `handleInputChange`
- `handlePaste` fallback

## Submit Contract

Submit entry points:

- form submit
- Enter key (without Shift)
- voice utterance-end callback

All submit paths call `submitMessageValue(...)`.

`submitMessageValue(...)` behavior:

1. build outgoing payload through
   `DesktopMessageInputRuntime.buildOutgoingMessage(input, isSubmitBlocked, clipboardImages, selectedReadableFiles)`.
2. if payload is null, abort.
3. call `onSendMessage(payload)`.
4. clear input/transcription.
5. clear clipboard and readable-file previews.
6. reset textarea height to auto baseline.

Outgoing payload variants:

- text-only: trimmed string
- text + attachments: object payload
- attachment-only: object payload with fallback text (`Please review the attached files.`)

## Clipboard Image Paste Flow

Paste handler logic:

1. delegate paste-event clipboard item inspection to
   `DesktopComposerAttachmentRuntime.parseClipboardImagePasteEvent(...)`.
2. if the runtime reports no `image/*` item -> delegate to `handlePaste`.
3. if one or more image items exist:
 - prevent default paste behavior
 - append images parsed by the shared runtime facade
 - append new preview payload(s) into `clipboardImages[]` (do not replace previous pasted images)
  - catch parse failures at the composer boundary and log a scoped warning instead of leaving an unhandled promise rejection

Parsed payload shape:

- `id`
- `base64`
- `contentType`
- `filename` (`clipboard-image.<ext>`)
- `previewUrl` (data URL for in-composer preview)

The helper path uses shared data-URL parse/normalization primitives:

- `DesktopComposerAttachmentRuntime.parseClipboardImagePasteEvent(...)`
- `DesktopComposerAttachmentRuntime.readFileAsDataUrl(...)`
- `DesktopComposerAttachmentRuntime.parseBase64ImageDataUrl(...)`

## File Attachment Picker Flow

The hidden file input calls
`DesktopComposerAttachmentRuntime.parseSelectedComposerFiles(...)` through the
shared composer draft hook. `MessageInput` catches rejected parsing promises and
logs a scoped warning so picker failures do not escape as unhandled promise
rejections.

File-picker handler (`Add photos & files`) delegates to
`DesktopComposerAttachmentRuntime.parseSelectedComposerFiles(...)`.

Result buckets:

- `imageAttachments[]` -> merged into `clipboardImages[]`
- `readableFiles[]` -> merged into `selectedReadableFiles[]`

Readable-file entries require both:

- `filename`
- resolved `filePath` (`path`/`filepath`/`webkitRelativePath`)

Preview UI:

- thumbnail image row above composer textarea
- multiple cards render when multiple images are pasted
- per-card remove buttons clear one attachment by the stable `id` assigned by
  the paste/file-picker parser boundary

## Voice Mode Handoff

`MessageInput` owns a transient microphone session state separate from persisted app config.

Microphone button behavior:

- click `Start voice input` -> enable `useVoiceMode(...)` for one dictation session
- click `Stop voice input` -> disable live capture but keep any transcribed text in the composer
- sending a message also ends the active voice session before submit

`useVoiceMode(...)` callbacks:

- transcription updates call `updateTranscription`
- utterance-end ends the temporary microphone session without auto-submitting

Result:

- dictated text lands in the same composer state used by typed input and can be edited before send.

Voice status component:

- rendered only while the temporary dictation session is active, or when it ends in an error
- reflects connection/recording/error state from voice hook

## Button and Guard Semantics

Send button behavior:

- shown only when `isLoopActive=false`
- disabled only when all are empty:
 - `inputValue.trim()`
 - `clipboardImages[]`
 - `selectedReadableFiles[]`

Stop button behavior:

- shown when `isLoopActive=true`
- invokes optional `onStopResponse`

Loop-lock side controls:

- plus/attachment button is disabled when `isLoopActive=true`
- voice button is disabled when `isLoopActive=true`
- open attachment menu is forcibly closed when loop lock begins

Hard send guard:

- if `isSubmitBlocked=true`, `DesktopMessageInputRuntime.buildOutgoingMessage(...)`
  returns null.

## Menu Runtime Notes

Plus menu:

- toggles add-on action list for `Add photos & files`
- click outside closes menu; the browser listener subscription lives in
  `DesktopDismissOnOutsideRuntime`, while `MessageInput` keeps menu state local

The menu does not alter outbound query payload; it only opens the native file-picker path.

## Test-Backed Invariants

- trimmed send text and whitespace block behavior.
- focus requests move the composer caret to the end through
  `DesktopMessageInputRuntime.focusTextInputAtEnd(...)`.
- `isLoopActive` submit block + stop-button rendering.
- voice button starts and stops a temporary dictation session.
- utterance-end keeps the latest transcription in the composer without auto-send.
- pasted-image preview render.
- pasted-image payload shape passed to `onSendMessage` as `clipboardImages[]`.
- selected readable-file payload shape passed to `onSendMessage` as `readableFiles[]`.
- attachment-only send path is allowed.
- remove-preview behavior before send.

## Drift Hotspots

1. Changing data-URL parse helpers without updating clipboard/file attachment utilities can break preview/base64 payload shaping.
2. Re-introducing config-driven microphone enablement can make the button look live while doing nothing.
3. Removing preview reset after submit can leak stale image/file payloads across messages.
4. Reading `event.clipboardData.items` directly in composer hooks can split
   paste-event browser mechanics away from `DesktopComposerAttachmentRuntime`.
5. Calling textarea focus or `setSelectionRange(...)` directly from
   `MessageInput` can split composer focus mechanics away from
   `DesktopMessageInputRuntime`.
6. Replacing `DesktopMessageInputRuntime.buildOutgoingMessage(...)` with ad-hoc payload construction can desync sender hook payload union.

## Related Pages

- [Renderer Chat Presentation Docs Hub](README.md)
- [Data-URL Image Parsing and Attachment Payload Contract Reference](data_url_image_parsing_and_attachment_payload_contract_reference.md)
- [Message Send Surface Policy and Screenshot Capture Reference](../message_send_surface_policy_and_screenshot_capture_reference.md)
- [Voice Mode Gateway Connection and Transcription Region Reference](../../voice/voice_mode_gateway_connection_and_transcription_region_reference.md)
