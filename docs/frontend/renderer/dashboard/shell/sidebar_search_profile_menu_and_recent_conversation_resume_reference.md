---
summary: "Deep reference for dashboard sidebar/search/profile components: split sidebar module ownership, collapsed/expanded nav behavior, profile and conversation action menus, and search-modal result rendering semantics."
read_when:
  - When changing `DashboardSidebar*`/`SearchChatsModal` rendering-state behavior or sidebar module split boundaries.
  - When debugging missing recent chats, incorrect search snippet labels, or outside-dismiss menu close edge cases.
title: "Dashboard Sidebar, Search, and Profile Menu Runtime Reference"
---

# Dashboard Sidebar, Search, and Profile Menu Runtime Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/DashboardSidebar.jsx`
- `frontend/src/renderer/features/dashboard/components/sidebar/DashboardSidebarNavigation.jsx`
- `frontend/src/renderer/features/dashboard/components/sidebar/DashboardSidebarUserMenu.jsx`
- `frontend/src/renderer/features/dashboard/components/sidebar/useDismissOnOutside.js`
- `frontend/src/renderer/features/dashboard/components/SearchChatsModal.jsx`
- `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/features/dashboard/utils/conversationGroups.js`
- `frontend/src/renderer/styles/ChatGptDashboardShell.css`
- `tests/frontend/ChatGptDashboardShell.test.jsx`
- `tests/frontend/ConversationGroups.test.js`
- `tests/frontend/DashboardSidebar.test.jsx`

## Sidebar Navigation Model

Two primary nav groups:

- primary: `new-chat`, `search`
- product: `memory`, `usage`, `models`

Every nav item has:

- stable id
- text label
- lucide icon component
- active-state predicate from shell state booleans

Expanded sidebar additionally renders:

- recent chat list section (`Your chats`)
- loading/error/empty fallback states
- per-row active conversation highlighting by `activeConversationRef`

Collapsed sidebar keeps:

- same action surface
- icon-only controls with `title`/`aria-label` fallback
- `new-chat` is intentionally removed from primary nav list and rendered as a dedicated collapsed-header action button
- profile menu trigger in footer

Module split ownership:

- `DashboardSidebarNavigation` owns static nav item lists and collapsed filtering logic.
- `DashboardSidebarUserMenu` owns profile menu state/rendering.
- `DashboardSidebar` owns conversation row rendering and per-row action menu state.
- `useDismissOnOutside` is shared by both profile menu and conversation kebab menu.

Collapse/expand motion contract:

- sidebar width/min-width transitions animate in both directions (expanded `260px` <-> collapsed `56px`) using CSS motion tokens in `ChatGptDashboardShell.css`
- nav/user/header/footer controls animate positional/spacing changes with the same motion timing so collapse/expand feels continuous instead of snap-only
- main-content surface applies a subtle counter-shift while collapsed to reinforce sidebar state change
- reduced-motion users get static transitions disabled via `@media (prefers-reduced-motion: reduce)`

## Profile Menu Contract

`SidebarUserMenu` owns local `menuOpen` state with document-level dismiss handlers:

- outside click closes menu
- `Escape` closes menu

Menu action contract:

- `Settings` -> `onOpenSettings("general")`
- `Help` / `Log out` currently UI-only buttons (no side effects wired)

Accessibility contract:

- trigger uses `aria-expanded`
- popover uses `role="menu"`
- actions use `role="menuitem"`

## Recent Chat List Rendering Rules

Source input shape from shell:

- grouped arrays `today`, `yesterday`, `previous7Days`, `older`
- each row carries `{ key, title, conversation }`

Render order:

1. today
2. yesterday
3. previous 7 days
4. older

Click behavior:

- row click calls `onOpenConversation(row.conversation)`.
- active row class toggles when `row.key === activeConversationRef`.

Per-row kebab action menu:

- `Rename` -> `onRenameConversation(conversation)`
- `Pin chat` / `Unpin chat` -> `onTogglePinConversation(conversation)` (label derives from `isPinned`)
- `Delete` -> `onDeleteConversation(conversation)`
- open menu key is tracked in sidebar-local state and closed on outside click/escape via `useDismissOnOutside`

Fallback behavior:

- loading: `Loading chats...`
- load failure: `Unable to load chats.`
- no groups populated: `No chats yet.`

## Search Modal Runtime Contract

### Open/close lifecycle

- modal is mounted only when `isOpen=true`.
- opens with delayed input focus (`20ms` timeout).
- closes on:
  - overlay backdrop click
  - close icon click
  - `Escape` key

### Result source switching

Mode switch by query length:

- query length `< 2`: show grouped recent conversations.
- query length `>= 2`: show grouped search results.

The modal does not perform network fetch itself; shell passes precomputed groups and loading/error booleans.

Search fetch policy (owned by `useDashboardConversations`):

- search executes only when modal is open and trimmed query length is at least `2`
- backend search call is debounced (`180ms`) and cancel-safe on query/modal changes
- search limit is `60` rows per request

### Search groups and labels

Group order is fixed:

1. `today`
2. `yesterday`
3. `previous7Days`
4. `older`

Group display labels:

- `Today`
- `Yesterday`
- `Previous 7 days`
- `Older`

### Search row rendering

Each row expects:

- `title`
- optional `snippet`
- optional `matchedRole`
- active key comparison against `activeConversationRef`

Snippet prefix rule:

- when `matchedRole` exists, prefix label is shown only if snippet does not already start with same role text.

Row click behavior:

- closes modal
- routes selected row to `onOpenConversation(row.conversation || row)`

### Search status fallbacks

- searching (`isSearching=true`): `Searching chats...`
- search error: render `searchError`
- no results:
  - with query: `No matching chats found.`
  - without query: `No chats yet.`

## Action Hand-off Boundaries

Sidebar/search components are presentation + user-intent handlers only.

They do not own:

- IPC calls
- chat store writes
- transcript session updates
- backend rehydrate calls

Those side effects are owned by `useDashboardConversations` (consumed by `ChatGptDashboardShell`).

Recent-chat title visibility sync details:

- hook listens for `transcript-entry-stored` events
- when assistant `llm-text` entries land, hook triggers recent-conversation refresh/poll
- per-conversation title visibility polling:
  - delay: `1250ms`
  - max attempts: `240`
  - clears timers on unmount

## Drift Hotspots

1. Changing group key names without updating both shell grouping logic and modal/sidebar render loops.
2. Breaking `row.conversation || row` fallback can fail opening search results built from normalized result rows.
3. Removing document listeners in shared outside-dismiss hook without cleanup causes leaked handlers and stale close behavior for both profile and conversation menus.
4. Changing collapsed nav filtering (new-chat removal) without keeping collapsed header new-chat action can create duplicate/missing new-chat controls.
5. Changing product nav ids (`memory/usage/models`) without matching shell predicates can break active-state highlighting.

## Related Pages

- [Dashboard Shell Docs Hub](README.md)
- [Dashboard Shell Modal Routing Contract Reference](dashboard_section_router_and_placeholder_panel_contract_reference.md)
- [Dashboard Conversation Hook Search, Polling, and Group Bucket Contract Reference](dashboard_conversation_hook_search_polling_and_group_bucket_contract_reference.md)
- [Renderer Dashboard Docs Hub](../README.md)
- [Dashboard Memory Management and Resume Reference](../../dashboard_memory_management_and_resume_reference.md)
- [Usage Section Placeholder Panel and Modal Contract Reference](../sections/usage_section_placeholder_panel_and_modal_contract_reference.md)
