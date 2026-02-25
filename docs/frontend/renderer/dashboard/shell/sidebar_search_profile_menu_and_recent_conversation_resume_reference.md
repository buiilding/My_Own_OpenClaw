---
summary: "Deep reference for dashboard sidebar/search/profile components: collapsed/expanded nav behavior, profile menu controls, grouped conversation lists, and search-modal result rendering semantics."
read_when:
  - When changing `DashboardSidebar.jsx` or `SearchChatsModal.jsx` rendering/state behavior.
  - When debugging missing recent chats, incorrect search snippet labels, or profile menu close/focus edge cases.
title: "Dashboard Sidebar, Search, and Profile Menu Runtime Reference"
---

# Dashboard Sidebar, Search, and Profile Menu Runtime Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/DashboardSidebar.jsx`
- `frontend/src/renderer/features/dashboard/components/SearchChatsModal.jsx`
- `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx`
- `frontend/src/renderer/styles/ChatGptDashboardShell.css`
- `tests/frontend/ChatGptDashboardShell.test.jsx`

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
- profile menu trigger in footer

## Profile Menu Contract

`SidebarUserMenu` owns local `menuOpen` state with document-level dismiss handlers:

- outside click closes menu
- `Escape` closes menu

Menu action contract:

- `Personalization` -> `onOpenSettings("personalization")`
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

All of those live in `ChatGptDashboardShell`.

## Drift Hotspots

1. Changing group key names without updating both shell grouping logic and modal/sidebar render loops.
2. Breaking `row.conversation || row` fallback can fail opening search results built from normalized result rows.
3. Removing document listeners in profile menu without cleanup causes leaked handlers and stale close behavior.
4. Changing product nav ids (`memory/usage/models`) without matching shell predicates can break active-state highlighting.

## Related Pages

- [Dashboard Shell Docs Hub](README.md)
- [Dashboard Shell Modal Routing Contract Reference](dashboard_section_router_and_placeholder_panel_contract_reference.md)
- [Renderer Dashboard Docs Hub](../README.md)
- [Dashboard Memory Management and Resume Reference](../../dashboard_memory_management_and_resume_reference.md)
- [Usage Section Placeholder Panel and Modal Contract Reference](../sections/usage_section_placeholder_panel_and_modal_contract_reference.md)
