---
summary: "Deep reference for chat visual contracts: message/tool/transparency card styling, input and window-control affordances, thinking-stream overflow gradient behavior, and token-count badge states."
read_when:
  - When changing chat message presentation classes or input/header control styling.
  - When debugging thinking-stream overflow indicators or token-count cache-hit visual states.
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

- `.chat-container` establishes vertical flex column with fixed inner padding
- `.chat-header` is draggable (`-webkit-app-region: drag`) and split into title/meta zones
- `.chat-meta` sets `no-drag` area so buttons remain clickable

Window controls:

- `ChatInterface.jsx` uses dedicated class variants:
  - `.chat-window-control-minimize`
  - `.chat-window-control-maximize`
  - `.chat-window-control-close`
- each variant defines persistent color-coding and hover/focus behavior
- focus-visible ring uses accent-toned box shadow for keyboard accessibility

Mode and action badges:

- `.chat-mode-badge` base + `.chat-mode-agent` variant
- `.chat-new-chat-button` and `.chat-stop-button` expose separate danger/neutral action tones
- stop button includes disabled state opacity/cursor contract

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

- `.message-input-form` is pill-shaped with focus-within accent ring
- `.message-input` is borderless transparent input that inherits theme tokens
- `.send-button` uses accent token, hover lift, and disabled lockout visuals

## Thinking Stream Overflow Contract (`ThinkingDisplay.css` + component)

Class coupling:

- `ThinkingDisplay.jsx` toggles `has-overflow-above` on `.thinking-display-stream`

Visual behavior:

- pseudo-element gradient (`::before`) only appears when overflow exists above current viewport
- thinking text uses mono font, low-contrast tone, and subtle glow to keep it secondary to main assistant output
- max height and internal scroll preserve overall chat layout stability

## Token Count Badge Contract (`TokenCountDisplay.css` + component)

Layout behavior:

- `.token-count-display` wraps item badges in mono, pill-style container
- responsive rule at `max-width: 720px` expands to full width and spaces items evenly

State variant:

- `buildTokenCountItems(...)` may add `token-count-cache-hit` class
- `.token-count-item.token-count-cache-hit .token-value` recolors value with accent token

## Responsive and Motion Guarantees

`ChatInterface.css` breakpoints:

- `max-width: 920px` reduces outer padding and allows full-width messages
- `max-width: 720px` stacks header/meta alignment for narrow views

Reduced motion:

- message enter animation (`messageIn`) is disabled when `prefers-reduced-motion: reduce`

## Related Docs

- [Frontend Renderer Styles Docs Hub](README.md)
- [Renderer Chat Presentation Docs Hub](../chat/presentation/README.md)
- [Thinking Display Overflow, Message List Class Assembly, and Token Count Formatting Reference](../chat/presentation/thinking_display_overflow_message_list_class_assembly_and_token_count_formatting_reference.md)
