# Dynamic Appearance Editor and Message Color Plan

## Goal

Fix the remaining light-appearance inconsistency so every WindieOS-controlled
text and button foreground in light mode resolves to the same readable
appearance foreground, then simplify Appearance settings to one dynamic editor
section. Add first-class controls for the user message pill background and user
message pill text color.

This plan intentionally does not implement code changes.

## Current Findings

### Screenshot Warning

Symptom:

- DevTools shows `Warning: Maximum update depth exceeded` under
  `desktopResolvedMessageScreenshotsRuntime.js`, with the stack flowing through
  `ImageAttachment`, `AttachmentRendererRegistry`, `AttachmentList`,
  `UserMessage`, `MessageContent`, `MessageItem`, and `MessageList`.

Owner runtime:

- `frontend/src/renderer/app/runtime/desktopResolvedMessageScreenshotsRuntime.js`

Relevant tests:

- `tests/frontend/DesktopResolvedMessageScreenshotsRuntime.test.jsx`

Current local source already includes the likely loop guard:

- `sourceListsEqual(...)`
- `setResolvedSourcesIfChanged(...)`
- a regression named `does not loop state updates when equivalent artifact messages are recreated`

Implication:

- The running app in the screenshot may be using an older Vite/Electron bundle
  than the current local source. If the warning persists after a clean reload,
  the remaining risk is unstable effect dependencies from recreated
  `attachments` / `initialSources` arrays.

### Appearance Settings

Current behavior:

- `AppearanceSettingsTab.jsx` renders one card per
  `getAppearanceThemeSectionDescriptors()` result.
- `desktopAppearanceThemeRuntime.js` returns two sections:
  `light` and `dark`.
- Config persists as:
  `appearance_theme: { light: {...}, dark: {...} }`.

Current owner files:

- `frontend/src/renderer/app/skin/appearanceSettings.js`
- `frontend/src/renderer/app/runtime/desktopAppearanceThemeRuntime.js`
- `frontend/src/renderer/features/dashboard/components/sections/settings/AppearanceSettingsTab.jsx`
- `frontend/src/renderer/styles/SettingsSurface.css`
- `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js`

Existing docs:

- `docs/frontend/renderer/settings/sections/settings_section_tabs_and_wakeword_toggle_runtime_reference.md`
- `docs/frontend/renderer/styles/global_theme_accessibility_utility_and_main_layout_visual_contract_reference.md`

### User Message Pill

Current behavior:

- `.message-user .message-content` in
  `frontend/src/renderer/styles/ChatInterface.css` uses:
  `background: linear-gradient(180deg, var(--agent-accent) 0%, var(--agent-accent-hover) 100%)`
- User message text uses `color: var(--ui-on-accent)`.
- The user message pill is therefore tied to accent blue and white-on-accent,
  not a configurable message-specific color pair.

Owner files:

- `frontend/src/renderer/styles/theme.css`
- `frontend/src/renderer/styles/ChatInterface.css`
- `frontend/src/renderer/app/runtime/desktopAppearanceThemeRuntime.js`
- `frontend/src/renderer/app/skin/appearanceSettings.js`

## Product Invariants

1. Light appearance foreground:
   Every WindieOS-controlled text/button/icon foreground in light mode should
   resolve to the active appearance foreground unless the element is a semantic
   state color, destructive color, or intentionally inverted on a custom
   surface.

2. Appearance editor:
   Settings should show one editable theme section. The section dynamically
   targets the currently selected/effective theme:
   - Light mode edits `appearance_theme.light`.
   - Dark mode edits `appearance_theme.dark`.
   - System mode edits the effective system theme section and labels which
     section is currently active.

3. User message pill:
   User message pill background and foreground are first-class appearance theme
   fields, independent from global accent and send-button colors.

4. Config compatibility:
   Keep the persisted `appearance_theme.light` / `appearance_theme.dark` shape.
   Missing new fields are filled by normalization defaults. No migration should
   be required.

## Implementation Plan

### 1. Confirm Screenshot Warning State

1. Run the owner regression:

   ```bash
   ./bin/windie.sh test frontend -- DesktopResolvedMessageScreenshotsRuntime.test.jsx
   ```

2. Run the core-loop pack because image projection is user-visible:

   ```bash
   ./bin/windie.sh test core-loop
   ```

3. Restart or hard reload the dev renderer before rechecking DevTools:

   ```bash
   ./bin/windie.sh restart desktop
   ```

4. If the warning persists, update
   `desktopResolvedMessageScreenshotsRuntime.js` to stop using array identity
   as an effect trigger:
   - derive a stable `attachmentsSignature` from ordered attachment refs, URLs,
     inline-data presence, and content types
   - derive a stable `initialSourcesSignature`
   - keep actual arrays as values, but depend effects on signatures
   - keep `setResolvedSourcesIfChanged(...)`
   - add a test that repeatedly rerenders with freshly allocated but equivalent
     message and attachment objects and asserts no repeated fetch/state warning

5. Add or update the Core Loop Regression Pack row if the owner test changes.

### 2. Add Theme Fields for User Message Colors

Extend each theme section defaults in
`frontend/src/renderer/app/skin/appearanceSettings.js`:

- `user_message_background`
- `user_message_foreground`

Suggested defaults:

- light:
  - `user_message_background: '#339CFF'`
  - `user_message_foreground: '#FFFFFF'`
- dark:
  - `user_message_background: '#339CFF'`
  - `user_message_foreground: '#FFFFFF'`

Update `desktopAppearanceThemeRuntime.js`:

- normalize both fields with `normalizeHexColor`
- include both fields in the field descriptors
- apply both as CSS variables:
  - `--user-message-background`
  - `--user-message-foreground`

Update `frontend/src/renderer/styles/ChatInterface.css`:

- change `.message-user .message-content` to use
  `background: var(--user-message-background)`
- change user message text, links, and inline code to use
  `var(--user-message-foreground)`
- keep hover/shadow/border derived from the pill background or existing accent
  only where it remains visually necessary

### 3. Collapse Appearance Settings to One Dynamic Section

Add runtime helper(s) to `desktopAppearanceThemeRuntime.js`:

- `resolveEditableAppearanceThemeId(mode, matchMediaImpl?)`
  - returns `light` or `dark`
  - uses `resolveEffectiveAppearanceTheme(...)`
- optional presentation helper:
  `getEditableAppearanceThemeDescriptor(mode, matchMediaImpl?)`
  - title examples:
    - `Light theme`
    - `Dark theme`
    - `System theme (currently Light)`

Update `AppearanceSettingsTab.jsx`:

- stop mapping over both `THEME_SECTIONS`
- compute `editableThemeId`
- render one `settings-surface-theme-card`
- update `updateThemeValue(editableThemeId, key, value)`
- keep the existing segmented Light/Dark/System mode control
- make each field aria-label use the visible/effective section label
- keep writing the same nested `appearance_theme` object so dark/light values
  remain independently preserved

Update `SettingsSurface.css` only if needed for spacing after removing the
second card.

Update tests:

- `tests/frontend/DesktopAppearanceThemeRuntime.test.js`
  - normalize new fields
  - resolve editable theme id for light/dark/system
- `tests/frontend/SettingsSection.test.jsx`
  - assert only one theme card renders
  - switching mode changes the editable section
  - changing a color updates the active section only
  - new user message background/text fields emit config patches
- `tests/frontend/RendererSkinConfigBoundary.test.cjs`
  - update descriptor expectations and default ownership checks

### 4. Enforce Unified Light Foreground

Audit the CSS for hardcoded or semi-transparent light-mode text colors that
still affect WindieOS-controlled app text/buttons/icons:

```bash
rg -n "rgba\\(|#[0-9A-Fa-f]{3,6}|color-mix\\(|color:" frontend/src/renderer/styles frontend/src/renderer/features -g '*.css'
```

Focus on these files:

- `frontend/src/renderer/styles/theme.css`
- `frontend/src/renderer/styles/ChatInterface.css`
- `frontend/src/renderer/styles/DashboardShell.css`
- `frontend/src/renderer/styles/DashboardPanelSurfaces.css`
- `frontend/src/renderer/styles/SettingsSurface.css`
- `frontend/src/renderer/styles/ChatBox.css`
- `frontend/src/renderer/styles/ChatBoxResponseOverlay.css`

Rules:

- light-mode primary, secondary, muted, label, icon, button, and chip text
  should use `var(--appearance-foreground)` unless semantic or inverted
- semantic exceptions must stay explicit:
  - error/destructive
  - success/warning
  - text on user message pill
  - text on send/stop buttons
  - text inside previews/images where contrast requires inversion

Add CSS-focused tests:

- extend `tests/frontend/ThemeCss.test.js`
- extend `tests/frontend/ChatHeaderAppearanceCss.test.cjs`
- extend `tests/frontend/ToolCallRenderingCss.test.js`
- add a new CSS test if Dashboard/Settings-specific hardcoded text paths need
  coverage

### 5. Docs and Regression Pack

Update:

- `docs/frontend/renderer/settings/sections/settings_section_tabs_and_wakeword_toggle_runtime_reference.md`
  - one dynamic appearance editor section
  - new user message color fields
- `docs/frontend/renderer/styles/global_theme_accessibility_utility_and_main_layout_visual_contract_reference.md`
  - unified light foreground invariant
  - user message pill variables
- `docs/frontend/renderer/styles/chat_interface_thinking_stream_and_token_count_style_contract_reference.md`
  - user message pill background/text owner tokens
- `docs/debug/user_facing_regression_pack.md`
  - include the focused CSS/settings tests for the light appearance invariant
- `docs/debug/core_loop_regression_pack.md`
  - only if screenshot resolver tests change

Update `CHANGELOG.md` with "No migration required" unless the final code
actually changes persisted field names. Adding fields with defaults does not
require a migration.

## Validation Plan

Focused tests while implementing:

```bash
./bin/windie.sh test frontend -- DesktopAppearanceThemeRuntime.test.js SettingsSection.test.jsx RendererSkinConfigBoundary.test.cjs ThemeCss.test.js ChatHeaderAppearanceCss.test.cjs ToolCallRenderingCss.test.js DesktopResolvedMessageScreenshotsRuntime.test.jsx
```

Core-loop validation if the screenshot warning path changes:

```bash
./bin/windie.sh test core-loop
```

Frontend lint:

```bash
cd frontend && npm run lint
```

Manual visual validation:

1. Start/restart the desktop dev loop.
2. Open Appearance settings.
3. Confirm only one theme editor section appears.
4. Toggle Light/Dark/System and confirm the editor changes to the active theme.
5. Set foreground to the requested Notes-like text color and verify all
   WindieOS-controlled light-mode app text/buttons/icons match.
6. Change user message pill background and foreground colors.
7. Send a message and verify the user bubble uses the configured colors.
8. Attach images and verify DevTools no longer shows maximum update depth
   warnings after a hard reload.

## Risks and Decisions

- System mode editing needs clear ownership. The recommended behavior is to edit
  the current effective system theme, because it matches the user's request for
  one dynamic section.
- Keep `appearance_theme.light` and `appearance_theme.dark` in storage to avoid
  deleting user customization for the inactive theme.
- Do not make OS menu bar text part of this invariant. The macOS menu bar in the
  screenshot is outside WindieOS renderer CSS control.
- Avoid repurposing global `accent`; user message color should not implicitly
  recolor every accent control.

