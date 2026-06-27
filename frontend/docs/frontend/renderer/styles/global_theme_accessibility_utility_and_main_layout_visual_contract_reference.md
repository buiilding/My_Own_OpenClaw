---
summary: "Deep reference for renderer-wide visual primitives: typography/color token variables, motion/global reset behavior, screen-reader utility class semantics, and dashboard shell layout contracts."
read_when:
  - When changing global style tokens, font imports, background gradients, or reduced-motion behavior.
  - When modifying dashboard shell/sidebar/modal markup or responsive breakpoints in `DashboardShell`.
  - When resolving stale references to removed `ChatGptDashboardShell.css` or `ChatGptDashboardShell.jsx`; the current owner is `DashboardShell.css` plus `DashboardShell.jsx`.
title: "Global Theme, Accessibility Utility, and Dashboard Shell Visual Contract Reference"
---

# Global Theme, Accessibility Utility, and Main Layout Visual Contract Reference

This page documents:

- `frontend/src/renderer/styles/theme.css`
- `frontend/src/renderer/styles/accessibility.css`
- `frontend/src/renderer/styles/ChatInterface.css`
- `frontend/src/renderer/styles/DashboardShell.css`
- `frontend/src/renderer/styles/DashboardPanelSurfaces.css`
- `frontend/src/renderer/styles/SettingsSurface.css`
- `frontend/src/renderer/styles/DesktopOnboarding.css`
- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/features/dashboard/components/DashboardShell.jsx`

## Global Theme Token Contract (`theme.css`)

Typography and base tokens:

- imports `Manrope` (UI) and `JetBrains Mono` (mono) from Google Fonts
- exposes shared CSS variables for:
  - typography (`--font-ui`, `--font-mono`)
  - surfaces/backgrounds (`--bg-base`, `--surface-*`)
  - text hierarchy (`--text-primary`, `--text-muted`, `--text-soft`)
  - semantic accents (`--accent`, `--warning`, `--danger`, `--success`)
  - borders, shadows, radii

Global resets:

- universal `box-sizing: border-box`
- full-height root chain (`html`, `body`, `#root`)
- input/button/select/textarea inherit renderer font stack

Background and viewport behavior:

- body uses layered radial+linear gradients
- `background-attachment: fixed`
- `overflow: hidden` enforces app-controlled internal scrollers

Global interaction affordances:

- custom text selection tint (`::selection`)
- themed WebKit scrollbar track/thumb styling
- dashboard chat header utility controls use chat-local utility tokens for
  browser, workspace, search, and speech buttons, with a light-mode override
  that keeps those controls visibly framed against white dashboard surfaces

Light-mode readability:

- the default light foreground is `#4C4C4C`, matching the dark gray body text
  tone used by native desktop content surfaces such as Notes
- primary and secondary light-mode UI text resolve to the foreground token
  instead of a transparent foreground mix, so labels do not wash out on white
  or translucent desktop surfaces
- chat header utility controls also route their light-mode text and labels
  through the same foreground token
- chat header conversation-find active icon and find panel use light
  appearance-derived surfaces, so opening search does not introduce a dark panel
  or an accent-heavy square button on the light dashboard
- the minimal chat pill close badge routes through the same foreground token in
  light appearance so the close affordance remains readable on the light close
  bump
- dashboard awaiting dots and response-overlay typing dots route through
  foreground-backed appearance tokens in light mode, avoiding white-on-light
  typing indicators
- dev-only source badges and transparency panels use the same foreground in
  light appearance so diagnostic metadata remains readable
- user message bubbles use `--user-message-background` and
  `--user-message-foreground`, applied from the active appearance theme section,
  so message pill colors are independent from global accent and send-button
  colors
- inline user edit/resend composers use light appearance foreground/background
  tokens for the editor panel, draft text, border, and secondary action button
  so edited text and Cancel remain readable on white dashboard surfaces
- settings toggles, primary/secondary buttons, and destructive buttons use
  shared state-control variables (`--ui-toggle-*`, `--ui-primary-button-*`,
  `--ui-secondary-button-*`, and `--ui-danger-*`) so checked, unchecked,
  disabled, hover, focus, and destructive states stay readable in light
  appearance
- settings schema/debug JSON blocks keep an explicit light foreground on their
  dark diagnostic panels, so MCP server and accepted-tool details remain
  readable in light appearance
- assistant markdown code blocks keep an explicit light foreground on their
  dark panels, so generated diagrams, repository trees, and other preformatted
  output remain readable in light appearance

Motion baseline:

- defines `fadeUp` and `floatSlow` keyframes used by layout/presentation modules
- `prefers-reduced-motion: reduce` disables all animation/transition globally

## Accessibility Utility Contract (`accessibility.css`)

`.visually-hidden` utility:

- keeps content available to assistive tech while visually removing it from layout
- uses clip/size/overflow pattern for screen-reader-only labels
- consumed by renderer surfaces where visible labels are replaced by iconography or condensed UI

## Dashboard Shell Layout Contract (`DashboardShell.css` + `DashboardShell.jsx`)

Structure coupling:

- `DashboardShell.jsx` emits fixed class surface:
  - `.cg-dashboard-shell`
  - `.cg-sidebar`, `.cg-sidebar-brand`, `.cg-sidebar-nav`
  - `.cg-nav-item`, `.cg-main-content`
  - `.cg-modal-overlay`, `.cg-modal`, `.cg-modal-header`, `.cg-modal-body`

Desktop layout behavior:

- split pane layout (`256px` left shell + flexible chat content)
- sidebar uses translucent backdrop styling; navigation buttons track active/selected modal state
- modal overlays center memory/models/settings panels over persistent chat content
- shell mount applies `cg-scroll-locked` on `html`, `body`, and `#root` so wheel/touchpad input cannot scroll the outer document instead of internal dashboard panes

Sidebar navigation state contract:

- active/selected nav buttons use `.active`/`.selected` class names
- hover/active styles rely on border/background transitions on `.cg-nav-item`
- removed provider-specific dashboard shell selectors such as `cg-gpt-*` and
  token names such as `--ui-gpt-dot-bg`; model/provider presentation belongs in
  dashboard panel surfaces and renderer skin config, not shell layout CSS

Responsive behavior:

- `@media (max-width: 980px)` collapses the sidebar footprint and reduces label density
- main chat/content padding reduces to preserve usable viewport space

## Import/Load Contract (`App.jsx`)

`App.jsx` imports `theme.css`, `ChatInterface.css`, `DashboardShell.css`,
`DashboardPanelSurfaces.css`, `DesktopOnboarding.css`, and `accessibility.css` at root.

`DashboardPanelSurfaces.css` owns shared dashboard panel visuals for:

- `MemorySection` (episodic/semantic/procedural tabs and memory cards)
- `ModelsSection` (hover-expanding model cards)
- `UsageSection` placeholder panels that reuse the dashboard panel visual language

`SettingsSurface.css` is section-scoped through `SettingsSection.jsx`, not a root
`App.jsx` import. It owns settings tab and control visuals while the dashboard
shell still owns modal framing and backdrop behavior.

`DesktopOnboarding.css` is a root import because onboarding can replace the
dashboard/chat surface before normal dashboard sections mount.

Implication:

- CSS is global, not CSS-module scoped
- class name collisions across renderer feature folders are possible and should be avoided via stable prefixing

## Related Docs

- [Frontend Renderer Styles Docs Hub](README.md)
- [Frontend Renderer Docs Hub](../README.md)
- [Renderer Chat Presentation Docs Hub](../chat/presentation/README.md)
