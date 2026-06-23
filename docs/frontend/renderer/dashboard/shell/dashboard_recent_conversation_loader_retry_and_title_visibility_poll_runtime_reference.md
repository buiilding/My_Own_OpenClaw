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
- `frontend/src/renderer/app/runtime/desktopDashboardConversationLoadRuntime.js`
- `frontend/src/renderer/app/runtime/desktopDashboardConversationGroupRuntime.js`
- `frontend/src/renderer/app/runtime/desktopConversationRuntimeEventClient.ts`
- `frontend/src/renderer/app/runtime/desktopLocalRuntimeStatusRuntimeClient.ts`
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

`DesktopDashboardConversationLoadRuntime.metadataListToDashboardConversations(...)`
owns SDK conversation metadata to dashboard row projection for both recent and
search surfaces. The hook should not spell out `conversation_id`,
`workspace_path`, or search-snippet field mapping itself.

`DesktopDashboardConversationLoadRuntime.getDashboardConversationRef(...)`,
`getDashboardConversationRenamePromptValue(...)`,
`renameDashboardConversationInList(...)`,
`removeDashboardConversationFromList(...)`, `togglePinnedConversationRef(...)`,
and `removePinnedConversationRef(...)` own dashboard row identity, title prompt
fallbacks, and in-memory row/pin updates. The hook owns user prompts,
confirmation, SDK delete calls, workspace-binding cleanup, and active-session
reset side effects, but it should not inspect raw row ids or map/filter row
lists itself for rename, delete, or pin actions. Internal title extraction and
row-id match helpers stay private behind those exported list-update helpers.

`DesktopDashboardConversationLoadRuntime.resolveRecentConversationEventAction(...)`
owns SDK conversation event type classification for recent-list refresh and
title-visibility polling. The hook owns the resulting side effects: reload the
recent list, schedule the per-conversation title poll, or ignore the event.

`DesktopDashboardConversationLoadRuntime.getTitleVisibilityPollSchedule(...)`
and `shouldContinueTitleVisibilityPoll(...)` own the poll interval, maximum
attempt count, dashboard-row visibility predicate, and browser timer
scheduling/cleanup adapters for title polling. The hook owns the pending timer
map, list reload side effects, and polling callback, but it should not hard-code
the poll numbers, call browser timers directly, or inspect raw row ids to decide
whether a generated title is visible.

`DesktopLocalRuntimeStatusRuntimeClient.onReady(...)` owns local-runtime status
snapshot readiness projection. The dashboard hook owns the reload side effect
when the runtime becomes ready, but it should not read raw `snapshot.ready`
fields from the shared status store.

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

Blocking loading state is only for the initial empty-list load. Once recent
conversations have rendered, event-driven refreshes keep the current list on
screen, run as background metadata reloads, and swap in the fresh list only
after the SDK command returns. This prevents edit/resend, retry, and title
generation bursts from blanking the dashboard or showing a loading flash while
the user already has chat rows visible.

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
The timeout adapter lives in
`DesktopDashboardConversationLoadRuntime.scheduleRecentConversationsRetryTimer(...)`
and `clearRecentConversationsRetryTimer(...)`; the hook supplies the reload
callback and current retry delay.

## Title Visibility Poll After Transcript Writes

Hook subscribes through `DesktopConversationRuntimeEventClient.onConversationEvent`
and delegates event classification to
`resolveRecentConversationEventAction(...)`:

- user message action -> immediate `loadRecentConversations()`
- assistant message action -> title visibility handling

Trigger condition:

- no `conversationRef` in an assistant event -> immediate `loadRecentConversations()`
- with `conversationRef` -> schedule visibility poll for that conversation id

Behavior:

- `windie:conversation-metadata-invalidated` with `reason = conversation-title-updated` -> background recent-list refresh
- conversation-event reload actions after a list has rendered are debounced
  briefly before loading so close `replaceRows`/`send`/title events coalesce
  into one visible metadata update

Poll contract:

- interval `1250ms`, provided by `getTitleVisibilityPollSchedule(...)`
- max attempts `240`, enforced by `shouldContinueTitleVisibilityPoll(...)`
- checks if target conversation is visible in latest recent list
- per-conversation timer is replaced through
  `scheduleTitleVisibilityPollTimer(...)` when a new poll starts
- cleanup clears pending timers through
  `clearTitleVisibilityPollTimer(...)` and
  `clearAllTitleVisibilityPollTimers(...)`

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
- removes row from recent/searched lists and pin set through
  `desktopDashboardConversationLoadRuntime` list-update helpers
- when deleting currently active session conversation:
  - clears active conversation refs
  - resets transcript session
  - clears chat workspace rows + sending/thinking state

## Search Flow Contract

Search behavior when modal is open:

- input is trimmed
- minimum query length is `2`
- debounce delay `180ms`, owned by
  `DesktopDashboardConversationLoadRuntime.scheduleConversationSearchDebounce(...)`
- invokes SDK-shaped `conversations.search` with `limit: 60`
- cancellation flag prevents stale async search results from mutating state after query changes or unmount
- cleanup routes through `clearConversationSearchDebounce(...)`

## Grouping and Pin State

Grouping uses `DesktopDashboardConversationGroupRuntime.buildConversationGroups(...)`
for both recent and search lists.

Pin behavior:

- pin ids are in-memory (`pinnedConversationRefs`)
- load refresh prunes pins for conversations no longer in recent list

## Test-Backed Invariants

`tests/frontend/DashboardShell.test.jsx` verifies:

- stale/default-user list load cannot overwrite active user list
- assistant transcript-store event reloads recent chats
- startup transient backend-not-ready errors trigger retry + eventual recovery

`tests/frontend/UseDashboardConversations.test.jsx` verifies:

- resend-shaped SDK conversation events keep already-rendered recent chats
  visible while the background refresh is pending

## Drift Hotspots

1. Removing request-id stale suppression can reintroduce overwritten recent-list races.
2. Broadening transient-error matching can create noisy retry storms on non-retryable failures.
3. Dropping transcript-entry poll logic can hide newly generated titles until manual refresh.
4. Forgetting timer cleanup on unmount can leak poll loops and duplicate `conversations.list` calls.

## Related Docs

- [Dashboard Conversation Hook Search, Polling, and Group Bucket Contract Reference](dashboard_conversation_hook_search_polling_and_group_bucket_contract_reference.md)
- [Sidebar Search, Profile Menu, and Recent Conversation Resume Reference](sidebar_search_profile_menu_and_recent_conversation_resume_reference.md)
- [Dashboard Memory Management and Resume Reference](../../dashboard_memory_management_and_resume_reference.md)
