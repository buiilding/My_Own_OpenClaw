---
summary: "Deep reference for renderer-wide visual primitives: typography/color token variables, motion/global reset behavior, screen-reader utility class semantics, and main shell/sidebar responsive layout contracts."
read_when:
  - When changing global style tokens, font imports, background gradients, or reduced-motion behavior.
  - When modifying main layout shell/sidebar markup or responsive breakpoints in `MainLayout`.
title: "Global Theme, Accessibility Utility, and Main Layout Visual Contract Reference"
---

# Global Theme, Accessibility Utility, and Main Layout Visual Contract Reference

This page documents:

- `frontend/src/renderer/styles/theme.css`
- `frontend/src/renderer/styles/accessibility.css`
- `frontend/src/renderer/styles/MainLayout.css`
- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/components/MainLayout.jsx`

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

Motion baseline:

- defines `fadeUp` and `floatSlow` keyframes used by layout/presentation modules
- `prefers-reduced-motion: reduce` disables all animation/transition globally

## Accessibility Utility Contract (`accessibility.css`)

`.visually-hidden` utility:

- keeps content available to assistive tech while visually removing it from layout
- uses clip/size/overflow pattern for screen-reader-only labels
- consumed by renderer surfaces where visible labels are replaced by iconography or condensed UI

## Main Shell Layout Contract (`MainLayout.css` + `MainLayout.jsx`)

Structure coupling:

- `MainLayout.jsx` emits fixed class surface:
  - `.main-layout`
  - `.ambient-backdrop`
  - `.sidebar`, `.sidebar-header`, `.sidebar-nav`
  - `.brand-mark`, `.brand-text`, `.nav-label`
  - `.main-content`

Desktop layout behavior:

- two-column CSS grid (`256px` sidebar + flexible main)
- sidebar has blurred, high-opacity panel styling with drag region on `.sidebar-header`
- main surface uses gradient overlay and independent overflow handling

Sidebar navigation state contract:

- active nav item requires `.active` class on `<li>`
- hover/active styles rely on border/background transitions
- button remains transparent; container element owns selected-state visual framing

Responsive behavior:

- `@media (max-width: 1100px)` collapses to stacked layout (`sidebar` then `main`)
- nav list shifts to horizontal scroll strip on medium widths
- `@media (max-width: 720px)` allows wrapped nav items and reduced sidebar gap

Drag-region expectation:

- `.sidebar-header` sets `-webkit-app-region: drag`, so nested interactive controls in that region must explicitly opt out if added later

## Import/Load Contract (`App.jsx`)

`App.jsx` imports `theme.css`, `ChatInterface.css`, `MainLayout.css`, and `accessibility.css` at root.

Implication:

- CSS is global, not CSS-module scoped
- class name collisions across renderer feature folders are possible and should be avoided via stable prefixing

## Related Docs

- [Frontend Renderer Styles Docs Hub](README.md)
- [Frontend Renderer Docs Hub](../README.md)
- [Renderer Chat Presentation Docs Hub](../chat/presentation/README.md)
