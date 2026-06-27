---
summary: "Plan to fix chat-pill query screenshots that reach SDK user_message_metadata but disappear from dashboard display rows."
title: "Screenshot Metadata Display Row Plan"
---

# Screenshot Metadata Display Row Plan

Date: 2026-06-21

## Goal

Make query screenshots sent from the minimal chat pill render in dashboard user
messages after the SDK emits `user_message_metadata`.

The observed failing turn is:

- conversation: `conv_dad7c3b0-dcaf-4bd2-9cfc-b30dbdaa6caa`
- turn: `269a1de5-d2b4-4dfb-8d47-11cad34d1492`
- send diagnostic: `ipc.bridge query.send` had `resourceCount: 1`
- SDK event payload contained `screenshotRef`, `screenshotUrl`,
  `screenshot_ref`, and `screenshot_refs`
- local history `metadata` column exposed only legacy
  `{"screenshot":"bf015f71520640b988091803c41b4e6c.jpg"}`
- `conversation_display_messages` returned only the base text
  `user_message`, so the dashboard had no image-bearing user row to render

The bug is not that the SDK failed to resolve the screenshot. The SDK event
payload is correct. The display/history load path drops the image metadata
before the renderer receives the dashboard row.

## Invariant

When a turn has a base `user_message` followed by `user_message_metadata` for
the same `conversationRef` and `turnRef`, display-row loading must merge the
metadata into the original user row before renderer projection.

For remote images, the merged row must expose explicit artifact metadata:

- `screenshotRef` / `screenshot_ref`
- `screenshotUrl` / `screenshot_url`
- `screenshotRefs` / `screenshot_refs`

The renderer must not infer artifact ids from the legacy `screenshot` field.
That field remains inline-image data only.

## Owner Map

| Layer | Role |
| --- | --- |
| SDK conversation runtime | Emits base user rows and `user_message_metadata` with artifact refs. Already correct for the observed turn. |
| Local runtime conversation store | Owns persisted event replay, display-row loading, and metadata merge from raw events. Primary fix owner. |
| Electron main IPC | Hosts SDK/runtime commands and forwards display rows to renderer. Should stay a transport boundary. |
| Renderer display projection | Converts normalized SDK display rows into `ChatMessage` image state. Should stay a consumer, not a compatibility shim. |
| Dashboard user-message UI | Renders `screenshots[]`, `screenshotRef`, or `screenshotUrl` when present. Not the owner of the missing metadata. |

## Non-Goals

- Do not reintroduce the retired compatibility path that treats
  `metadata.screenshot` or payload `screenshot` as a remote artifact id.
- Do not add dashboard-only fallback state.
- Do not change the chat pill camera UX.
- Do not change backend/provider schemas unless the display-row fix proves a
  backend contract violation.
- Do not make renderer parse local-history SQL metadata columns directly.

## Proposed Fix

Fix the local display-row load path so it builds rows from canonical event
payloads, not from the lossy display SQL view alone.

The owner-correct implementation should be in or near:

- `packages/windie-sdk-js/src/stores/LocalRuntimeConversationStore.ts`
- the local-runtime RPC command that serves `conversation.loadDisplay`
- any shared projection helper used by `buildDisplayRows(...)`

Expected behavior:

1. Load raw events for the target conversation.
2. Preserve each event's canonical `event_payload`.
3. Feed `user_message` and `user_message_metadata` events through the SDK
   display-row projection/merge path.
4. Return one visible user row for the turn, with screenshot refs attached.
5. Keep `conversation_display_messages` as a legacy/simple SQL view if still
   needed, but do not use it as the only dashboard display authority when
   metadata merge is required.

## Implementation Slices

### 1. Reproduce With a Store-Level Fixture

Create a focused fixture with:

- a base `user_message` event:
  - content: `hey`
  - turn ref: `turn-1`
- a later `user_message_metadata` event:
  - same turn ref
  - payload has `screenshot_ref`, `screenshot_refs`, `screenshotRef`, and
    `screenshotUrl`
  - metadata column only has legacy `screenshot`
- an assistant message

Assert the display-load API returns:

- one user display row for `turn-1`
- user row has `screenshotRef`
- user row has `screenshotRefs` or renderer-projectable `screenshots[]`
- no duplicate user-message row
- assistant row still appears normally

### 2. Fix Display Load to Use Raw Events

Inspect the current `loadDisplayRows` implementation and any local-runtime RPC
adapter that calls it.

If the path uses `conversation_display_messages`, switch it to raw event replay
or update it to include enough event payload data for `buildDisplayRows(...)` to
merge `user_message_metadata`.

Keep the normalization centralized. The store should return SDK display rows
with explicit screenshot fields; renderer code should not know about the local
SQL schema.

### 3. Preserve Legacy View Behavior Deliberately

Decide whether `conversation_display_messages` should remain a simple text-only
view or be widened.

Preferred default:

- leave the SQL view simple if other call sites depend on it
- route dashboard display loading through the SDK projection path instead

If the SQL view is widened, document the compatibility note because it changes
the meaning of local display persistence.

### 4. Strengthen Diagnostics

Make the already-added `renderer.display_rows.projected` trace easier to use
with this class of bug:

- ensure debug start commands produce the trace in persisted renderer/main logs
  or add a durable diagnostics path for display-row projection summaries
- keep payloads count-only and id-only
- never log message text or image bytes

The durable diagnostic should distinguish:

- SDK rows lack image metadata
- SDK-to-renderer projection drops image metadata
- optimistic renderer row replacement drops image metadata
- final user-message rendering drops image metadata

Implemented diagnostic path:

- `renderer.display_projection`, emitted by the renderer display projection
  runtime through `diagnostics.append`
- inspect with
  `<windie> diagnostics list --path renderer.display_projection --limit 50`
- persisted data includes projection counts such as `sdkUserImageCount`,
  `sdkProjectedUserImageCount`, `currentOptimisticUserCount`, and
  `mergedUserImageCount`
- persisted data excludes chat text, screenshot URLs, screenshot refs, and image
  bytes

### 5. Register the Regression

Add the store/display-load test to the Core Loop Regression Pack and the broader
User-Facing Regression Pack once the CLI route exists for this exact subset.

The named invariant should be similar to:

`chat_pill_query_screenshot_metadata_survives_dashboard_display_load`

## Validation

Minimum validation for the fix:

- focused SDK/store test for `user_message_metadata` merge into display rows
- existing renderer projection tests:
  - `DesktopConversationDisplayProjection.test.ts`
  - `ConversationRuntimeProjectionStream.test.ts`
  - `DesktopRendererTraceRuntime.test.ts`
- relevant local-runtime conversation RPC test if the RPC adapter changes
- relevant renderer/dashboard boundary test if display command payloads change
- `git diff --check`
- targeted eslint or frontend test route for touched renderer files

Manual replay:

1. Start dev with display-row tracing enabled.
2. Send a minimal chat pill message with camera enabled.
3. Open the dashboard conversation.
4. Confirm the user row shows the image.
5. Confirm display-row diagnostics report image count preserved through SDK
   row, renderer projection, and merged visible row.

## Migration And Security Notes

No persisted-data migration should be required if the fix replays raw
`event_payload` that is already stored.

If the SQL view or stored metadata shape changes, add a compatibility note and
verify older rows with only `metadata.screenshot` do not become trusted remote
artifacts implicitly.

Security boundary:

- do not trust arbitrary local paths from renderer or history
- do not expose screenshot pixels in diagnostics
- do not log full user text, prompt content, artifact bytes, credentials, or
  provider payloads
- only explicit artifact refs/URLs produced by SDK/runtime materialization may
  become remote screenshot display state
