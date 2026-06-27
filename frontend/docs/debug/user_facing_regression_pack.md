---
summary: "User-Facing Regression Pack for product-visible bugs, preserving owner-specific tests while providing one focused validation route for discovered behavior invariants."
read_when:
  - When fixing any user-visible bug and deciding whether its regression proof should join the product-level pack.
  - When a bug affects chat, dashboard, overlays, tools, providers, persistence, permissions, startup, install, or another product-visible behavior.
  - When choosing between owner-specific tests and the user-facing regression pack.
title: "User-Facing Regression Pack"
---

# User-Facing Regression Pack

The User-Facing Regression Pack is the product-level umbrella for bugs a user
can hit through normal WindieOS behavior. It does not own the tests themselves:
each regression stays in the smallest owner-correct test file, and this pack
only curates the focused command routes that should run together.

Run it with:

```bash
<windie> test user-facing
```

Use this pack after fixing a user-visible regression when the behavior could
reappear through normal product use. Use narrower owner tests while iterating.

## Current Categories

| Category | Route | Purpose |
| --- | --- | --- |
| Core loop UI | `<windie> test core-loop` | Chat pill, dashboard, dashboard background refresh/no-flash behavior, dashboard/transcript display loading from `ConversationView.displayRows` and dashboard live rows from `ConversationView.liveTurn.entries` without legacy `snapshot.displayRows` or stale raw current-turn fallback, response overlay active-conversation/native responsebox ownership from `ConversationView` without Electron-main raw overlay-intent fallback, renderer-owned visible turn lifecycle, screenshot metadata display load, SDK projection and ConversationView authority including action metadata, stable row targets, renderer-window hydration from cached ConversationView instead of raw current-turn-only sync, dashboard and minimal live-surface selector view authority without a renderer-store global raw latest-current-turn fallback, Electron-main Stop shortcut view authority without raw current-turn or idle conversation-ref fallback, SDK-owned edit/resend/Try again execution commands without renderer display-timeline reload, SDK revision listing/checkout/fork UI with selected-revision live-turn/overlay authority, whole-revision fork without renderer display-timeline prefetch, and revision-scoped view diagnostics, typed user/tool visual attachments, conversation runtime, edit/resend superseded live-lane handoff, IPC, replay, local-runtime display revision storage, stop, tool-row, and surface-lease invariants. |
| Dashboard chat find | `<windie> test frontend -- ChatInterfaceWiring.test.jsx -t find --runInBand` | Dashboard conversation find opens from keyboard and button, keeps match navigation stable, closes from Escape/close affordance, and clears state when the active header search button is clicked again. |
| Startup CLI | `<windie> test frontend -- WindieCli.test.cjs` | Source checkout startup commands keep Vite, Electron dev mode, and Electron customer mode routed through the expected wrappers so local-runtime Python inherits the frontend/local-runtime environment. |
| Desktop shell package boundary | `<windie> test frontend -- FrontendPackageBoundary.test.cjs` | The Electron desktop package stays private, packaged main-process SDK runtime resources are included, and Electron remains pinned to the macOS native-menu warning fix without floating past the repo's Node baseline. |
| Settings startup | `<windie> test frontend -- tests/frontend/AppConfigProvider.storageAndIpc.test.tsx tests/frontend/IpcChatQueryHandlers.test.cjs tests/frontend/IpcSettingsSyncRuntime.test.cjs tests/frontend/IpcAgentDefinitionContext.test.cjs tests/frontend/IpcDesktopUiConfigStore.test.cjs tests/frontend/IpcAgentSdkRuntimeCommands.test.cjs` | Persisted renderer settings, localStorage/disk startup merge, initial settings sync, live desktop UI config store authority, Electron main SDK query mapping, and Agent settings agent-definition context remain ordered so the first post-restart or just-edited chat turn uses the saved system prompt and tool policy. |
| Model send selection | `<windie> test frontend -- tests/frontend/DesktopSettingsRuntimeClient.test.ts tests/frontend/ChatMessageSender.test.tsx tests/frontend/DesktopManualCompactionRuntime.test.js tests/frontend/IpcAgentSdkRuntimeCommands.test.cjs` | Chat sends, manual compaction, retry/edit replay, and Electron main SDK forwarding apply the selected provider/model before inference instead of racing with the previous backend model. |
| Provider credential persistence | `<windie> test frontend -- tests/frontend/AppConfigPersistence.test.js tests/frontend/IpcDesktopUiConfigStore.test.cjs tests/frontend/IpcProviderCredentialPersistence.test.cjs` | Renderer-managed provider API keys survive desktop restart through Electron main encrypted storage while renderer localStorage, `frontend-config.json`, and the live desktop UI config store stay redacted. |
| Renderer light appearance | `<windie> test frontend -- DesktopAppearanceThemeRuntime.test.js SettingsSection.test.jsx RendererSkinConfigBoundary.test.cjs ThemeCss.test.js ChatHeaderAppearanceCss.test.cjs ChatMarkdownAppearanceCss.test.cjs ChatBoxAppearanceCss.test.cjs ChatBoxResponseAppearanceCss.test.cjs ToolCallRenderingCss.test.js SettingsSurfaceCss.test.js` | Light appearance defaults keep primary readable text aligned with native desktop content text, the Appearance tab edits one active theme section, user-message pill colors are first-class, settings toggles/destructive controls remain readable instead of washed-out, markdown code blocks keep explicit light text on dark panels, the header find active icon and find panel stay on light utility surfaces, the minimal chat pill close badge remains visible on the light close bump, compact pill side caps stay rounded through a real body layer instead of a whole-shell polygon, and typing/awaiting dots remain readable instead of white-on-light. |
| Scripted provider tool loop | private backend tests | Dev-visible scripted model behavior, including the invariant that completed scripted tool calls do not replay forever after tool output enters model history. |

## Adding A User-Visible Bug

For every user-visible bug:

1. Name the symptom, invariant, owner runtime, smallest replay or reproduction
   timeline, regression proof, and owner-correct fix.
2. Add or extend the test at the owning layer: backend, local-runtime, SDK,
   Electron main, renderer, or docs/CLI.
3. Add that test file or focused route to this pack only when the behavior is
   product-visible and likely to be relevant across future changes.
4. Keep narrow subsets, such as [Core Loop Regression Pack](core_loop_regression_pack.md),
   for high-churn areas where agents need a fast preflight.

Do not move tests into an umbrella-only file just to make the pack easy to run.
The pack is a route over owner tests, not a replacement for owner tests.

## Scope

Belongs here:

- Chat pill, dashboard, overlay, conversation runtime, SDK projection, and IPC
  behavior a user can see.
- Tool execution, tool-result, provider, and model behavior that changes the
  user's turn outcome.
- Persistence, replay, stop/cancel, permissions, startup, and install behavior
  that can regress normal product use.

Does not belong here:

- Pure internal refactors with no product-visible behavior.
- Exhaustive low-level parity checks that are already covered by a runtime's
  normal suite and do not protect a discovered user-facing bug.
- One-off environment failures unless WindieOS should expose a durable
  diagnostic or product behavior for that failure.
