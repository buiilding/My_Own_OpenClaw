---
summary: "Deep reference for dashboard recent-conversation runtime in `useDashboardConversations`: in-flight request dedupe, stale-response suppression, startup retry backoff, transcript-triggered title visibility polling, and open/delete/search side effects."
read_when:
  - When changing recent conversation loading, startup retry behavior, or transcript-triggered sidebar refresh logic in `useDashboardConversations`.
  - When debugging missing new titles in the sidebar, stale conversation list overwrite races, or repeated `conversations.list` SDK command calls.
title: "Dashboard Recent Conversation Loader, Retry, and Title-Visibility Poll Runtime Reference"
---

# Dashboard Recent Conversation Loader, Retry, and Title-Visibility Poll Runtime Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/features/dashboard/utils/conversationGroups.js`
- `frontend/src/renderer/app/runtime/desktopConversationRuntimeEventClient.ts`
- `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js`
- `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js`
- `tests/frontend/DashboardShell.test.jsx`

## Hook Ownership Boundary

`useDashboardConversations` owns conversation-list runtime for dashboard surfaces:

- recent conversation list fetch + retries
- search query/debounce + result state
- pin state and grouped list derivation
- conversation open/rehydrate/selection flow
- conversation delete and active-session reset behavior
- transcript-driven title visibility polling

## Recent Conversation Load Concurrency and Stale-Response Guard

`loadRecentConversations()` uses two coordination layers:

1. in-flight dedupe by user
- if a load promise is already active for `resolvedUserId`, return the same promise

2. monotonic request-id suppression
- each call increments `recentConversationLoadRequestIdRef`
- late responses whose request id is no longer current are ignored
- missing or cleared `resolvedUserId` also increments the request id, drops the
  in-flight load marker, and clears recent/pinned conversation state

This prevents older async results from overwriting newer user/session state.

## Startup Retry Policy for Transient Local-Runtime Errors

Transient errors are currently recognized by normalized message substring match:

- `local runtime not ready`
- `local runtime request failed`
- `timed out waiting for local runtime`
- `request timed out`
- `failed to list stored conversations`
- `failed to fetch`
- `fetch failed`
- `econnrefused`

Retry behavior:

- max attempts: `8`
- base delay: `250ms`
- exponential backoff with cap: `min(2000ms, 250 * 2^attempt)`
- retry loop runs only when:
  - not currently loading
  - recent list is still empty
  - last error is transient

On successful load, retry counter resets to `0`.

## Title Visibility Poll After Transcript Writes

Hook subscribes through `DesktopConversationRuntimeEventClient.onConversationEvent`:

- event type: `user_message` -> immediate `loadRecentConversations()`
- event type: `assistant_message` -> title visibility handling

Trigger condition:

- no `conversationRef` in an assistant event -> immediate `loadRecentConversations()`
- with `conversationRef` -> schedule visibility poll for that conversation id

Behavior:

- `windie:conversation-metadata-invalidated` with `reason = conversation-title-updated` -> immediate `loadRecentConversations()`

Poll contract:

- interval `1250ms`
- max attempts `240`
- checks if target conversation is visible in latest recent list
- per-conversation timer is replaced when a new poll starts
- cleanup clears all pending timers on unmount

This path handles title generation lag between transcript persistence, the
SDK-owned generated-title enrichment write, and indexed conversation-list
visibility.

## Open Conversation Flow

`handleOpenConversation(conversation)`:

1. loads the SDK conversation snapshot through `conversation.load`
2. loads SDK `displayRows` and converts them to visible chat messages
3. resolves workspace binding from SDK snapshot metadata
4. updates transcript session + active conversation refs
5. writes projected rows into chat workspace and resets `isSending` /
   `thinkingStatus`

Failure is reported via `recentConversationsError`.

## Delete Conversation Flow

`handleDeleteConversation(conversation)`:

- confirms with blocking prompt
- delegates to the SDK-shaped `conversations.delete` command through the
  desktop conversation library facade
- removes row from recent/searched lists and pin set
- when deleting currently active session conversation:
  - clears active conversation refs
  - resets transcript session
  - clears chat workspace rows + sending/thinking state

## Search Flow Contract

Search behavior when modal is open:

- input is trimmed
- minimum query length is `2`
- debounce delay `180ms`
- invokes SDK-shaped `conversations.search` with `limit: 60`
- cancellation flag prevents stale async search results from mutating state after query changes or unmount

## Grouping and Pin State

Grouping uses `buildConversationGroups(...)` for both recent and search lists.

Pin behavior:

- pin ids are in-memory (`pinnedConversationRefs`)
- load refresh prunes pins for conversations no longer in recent list

## Test-Backed Invariants

`tests/frontend/DashboardShell.test.jsx` verifies:

- stale/default-user list load cannot overwrite active user list
- assistant transcript-store event reloads recent chats
- startup transient backend-not-ready errors trigger retry + eventual recovery

## Drift Hotspots

1. Removing request-id stale suppression can reintroduce overwritten recent-list races.
2. Broadening transient-error matching can create noisy retry storms on non-retryable failures.
3. Dropping transcript-entry poll logic can hide newly generated titles until manual refresh.
4. Forgetting timer cleanup on unmount can leak poll loops and duplicate `conversations.list` calls.

## Related Docs

- [Dashboard Conversation Hook Search, Polling, and Group Bucket Contract Reference](dashboard_conversation_hook_search_polling_and_group_bucket_contract_reference.md)
- [Sidebar Search, Profile Menu, and Recent Conversation Resume Reference](sidebar_search_profile_menu_and_recent_conversation_resume_reference.md)
- [Dashboard Memory Management and Resume Reference](../../dashboard_memory_management_and_resume_reference.md)
