---
summary: "Dashboard surface guide covering shell layout, sidebar, chat history, search, settings, memory, models, and section routing."
read_when:
  - When changing dashboard navigation, chat history, settings sections, memory views, or model selection.
  - When debugging dashboard state that differs from the chat pill.
title: "Dashboard"
---

# Dashboard

The dashboard is the main WindieOS desktop workspace. It is renderer-owned, but it depends on Electron main for backend connection, config persistence, and SDK local-runtime-backed memory operations.

## Main Files

- Shell: `frontend/src/renderer/features/dashboard/components/DashboardShell.jsx`
- Sidebar: `frontend/src/renderer/features/dashboard/components/DashboardSidebar.jsx`
- Search: `frontend/src/renderer/features/dashboard/components/SearchChatsModal.jsx`
- Conversation hooks: `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`, `frontend/src/renderer/app/runtime/desktopTranscriptSessionInfoRuntimeClient.js`
- Section utilities: `frontend/src/renderer/features/dashboard/utils/*`
- Settings sections: `frontend/src/renderer/features/dashboard/components/sections/*`
- Chat surface: `frontend/src/renderer/features/chat/components/ChatInterface.jsx`

## Owned Behaviors

- Dashboard section routing
- Recent conversation listing and grouping
- Search modal behavior
- Memory section display and delete flows
- Model selection presentation
- Settings tabs and onboarding re-entry
- Main chat thread composition and controls

## Boundary Notes

- The dashboard should not directly own backend websocket protocol details.
- Memory sections should call renderer API/main bridge paths rather than sidecar files directly.
- Model/provider settings should round-trip through config sync and backend ACK flows.
- Chat replay must use transcript/session helpers instead of rebuilding backend history directly.

## Deep Docs

- [Dashboard Change Workflow](../frontend/renderer/dashboard/dashboard_change_workflow.md)
- [Frontend Dashboard Memory Management + Resume Runtime](../frontend/renderer/dashboard_memory_management_and_resume_reference.md)
- [Frontend Dashboard Sidebar, Search, and Profile Menu Runtime Reference](../frontend/renderer/dashboard/shell/sidebar_search_profile_menu_and_recent_conversation_resume_reference.md)
- [Frontend Renderer Dashboard Docs Hub](../frontend/renderer/dashboard/README.md)
