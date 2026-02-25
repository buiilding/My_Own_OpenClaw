---
summary: "Deep reference for chat visual contracts: clone-style header/composer presentation, message/tool/transparency card styling, and thinking-stream overflow behavior."
read_when:
  - When changing chat message presentation classes or input/header control styling.
  - When debugging thinking-stream overflow indicators or clone-style composer/header regressions.
title: "Chat Interface, Thinking Stream, and Token Count Style Contract Reference"
---

# Chat Interface, Thinking Stream, and Token Count Style Contract Reference

This page documents:

- `frontend/src/renderer/styles/ChatInterface.css`
- `frontend/src/renderer/styles/ThinkingDisplay.css`
- `frontend/src/renderer/styles/TokenCountDisplay.css`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/ThinkingDisplay.jsx`
- `frontend/src/renderer/features/chat/components/TokenCountDisplay.jsx`

## Chat Header and Control Surface Contract (`ChatInterface.css`)

Header composition:

- `.chat-container` is full-height with no interior padding; shell spacing is handled by dashboard chrome
- `.chat-header` is draggable (`-webkit-app-region: drag`) with clone-style compact top bar spacing and bottom divider
- `.chat-title-block` exposes a clone-style model selector button (`.chat-model-selector`)
- `.chat-model-dropdown` renders clone-style model option menu with `.chat-model-menu` / `.chat-model-menu-item` surface styling
- when sidebar is collapsed, `ChatInterface` receives `sidebarOpen={false}` and renders `.chat-header-brand-dot` before the selector to match clone header behavior
- `.chat-meta` stays `no-drag` so top-right utility controls remain clickable

Utility controls:

- `ChatInterface.jsx` uses clone-style utility icon controls:
  - `.chat-top-icon-btn` (`Share`, `More options`)
- hover behavior mirrors clone dark-hover affordances (`#2F2F2F` background with brightened icon color)

Action placement:

- legacy header action chips (`new chat` / `stop`) are replaced by composer-level actions
- stop action now lives in `MessageInput` as `.message-stop-btn`
- new chat action is triggered from dashboard sidebar (`windie:new-chat` event), not header

## Message Stream and Bubble Contract

Message list:

- `.message-list` is the primary vertical scroller with stable scrollbar gutter
- `.message` width rules are role/type sensitive

Role-based message surface:

- `.message-user` aligns to end and uses accent-tinted bubble
- `.message-assistant` stretches full-width with transparent shell so nested specialized blocks render naturally

Markdown content styling:

- `.message-content-markdown` defines spacing and styles for paragraphs/lists/code/tables/blockquote/hr
- code and pre blocks rely on mono font token and darkened panel backgrounds

## Tool/Transparency Card Contract

Tool cards:

- `.tool-output-container` and `.tool-call-container` share mono-card base with colored left border variants
- `.tool-card-header-row`, `.tool-details-btn`, `.tool-details-panel` define expandable metadata pattern

Screenshot sections:

- `.tool-screenshot-*` and `.user-screenshot-*` classes define image framing/labels
- images use `object-fit: contain` with capped height and bordered surface

Transparency sections:

- `.transparency-section` family defines collapsible metadata+payload cards
- `.transparency-copy-btn` provides explicit copy-action CTA styling
- `.transparency-content` caps payload panel height and enables internal scroll

## Input Composer Contract

Input row:

- `MessageInput` mirrors clone composer structure:
  - top text row (`.message-input-top-row` + multiline `.message-input`)
  - bottom action row (`.message-input-bottom-row`) with left utility controls and right send/stop controls
- composer utility controls now include clone-style dropdown menus (`.message-dropdown-menu`) for the plus action list and thinking-mode selection
- non-empty composer width is constrained to clone-like `max-w-3xl` behavior, while centered empty-state composer uses the wider clone-style `800px` treatment with minimum pill height parity.
- send control uses `.message-send-btn`; while sending it switches to `.message-stop-btn`
- empty conversation state renders centered composer variant via `.message-input-centered`
- non-empty state renders bottom composer with footer disclaimer (`.message-input-disclaimer`)

Empty state:

- `.chat-empty-state` renders clone-parity welcome layout
- `.chat-empty-title` displays the greeting above centered composer

## Thinking Stream Overflow Contract (`ThinkingDisplay.css` + component)

Class coupling:

- `ThinkingDisplay.jsx` toggles `has-overflow-above` on `.thinking-display-stream`

Visual behavior:

- pseudo-element gradient (`::before`) only appears when overflow exists above current viewport
- thinking text uses mono font, low-contrast tone, and subtle glow to keep it secondary to main assistant output
- max height and internal scroll preserve overall chat layout stability

## Token Count Note

`TokenCountDisplay` styling remains defined in `TokenCountDisplay.css` for compatibility, but clone-parity main-window chat header no longer renders token badges.

## Responsive and Motion Guarantees

`ChatInterface.css` breakpoints:

- `max-width: 920px` reduces empty-state headline size and allows full-width messages
- `max-width: 720px` compacts header spacing and centered composer sizing for narrow widths

Reduced motion:

- message enter animation (`messageIn`) is disabled when `prefers-reduced-motion: reduce`

## Related Docs

- [Frontend Renderer Styles Docs Hub](README.md)
- [Renderer Chat Presentation Docs Hub](../chat/presentation/README.md)
- [Thinking Display Overflow, Message List Class Assembly, and Token Count Formatting Reference](../chat/presentation/thinking_display_overflow_message_list_class_assembly_and_token_count_formatting_reference.md)
