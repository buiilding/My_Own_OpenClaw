---
summary: "Deep reference for chat visual contracts: header/composer/message/tool/transparency surfaces and thinking-stream overflow behavior."
read_when:
  - When changing chat message presentation classes or input/header control styling.
  - When debugging thinking-stream overflow indicators or chat composer/header regressions.
title: "Chat Interface and Thinking Stream Style Contract Reference"
---

# Chat Interface and Thinking Stream Style Contract Reference

This page documents:

- `frontend/src/renderer/styles/ChatInterface.css`
- `frontend/src/renderer/styles/ThinkingDisplay.css`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `frontend/src/renderer/features/chat/components/message/ThinkingDisplay.jsx`

## Chat Header and Control Surface Contract (`ChatInterface.css`)

Header composition:

- `.chat-container` is full-height; dashboard shell controls outer spacing.
- `.chat-header` is draggable with compact top-bar spacing and divider.
- `.chat-provider-selector` / `.chat-provider-menu*` classes own provider dropdown visuals.
- `.chat-model-selector` and `.chat-model-menu*` classes own model dropdown visuals.
- collapsed sidebar mode renders `.chat-header-brand-dot` before selector.
- `.chat-meta` remains non-draggable for interactive controls.

Selector behavior contract:

- Provider selector is rendered left of the model selector.
- Model options are filtered by selected provider.
- Changing provider can auto-switch selected model when the current model is not available under the new provider.

Control placement:

- stop/new chat actions are composer/sidebar-driven, not header chips.
- speech toggle uses `.chat-top-icon-btn` style contract.
- `electron:dev` (`dev_ui=1`) adds a header `Run auto compaction` icon control using the same `.chat-top-icon-btn` styling and dispatching backend `compact-history`.
- light appearance routes browser, workspace, selector chevrons, search, and
  speech header controls through the active appearance foreground so the top bar
  matches native desktop body text rather than pale slate or accent-blue labels.
- light appearance keeps the conversation-find active icon and find panel on
  appearance-derived light utility surfaces instead of the accent-heavy active
  fill or dark panel gradient used by the dark theme.

## Message Stream and Bubble Contract

Message list:

- `.message-list` is primary vertical scroller with stable gutter behavior.
- `.message-list-compaction-status` renders a compaction lifecycle row under history for `context-compaction-started|completed|failed`.
- in-progress compaction keeps animated `.message-list-compaction-indicator` and `.message-list-compaction-text`; completed/failed states disable animation and use success/failure accents.
- `.message` lane style is role/type-sensitive.

Role-based surface:

- `.message-user` right-aligned bubble lane.
- `.message-user .message-content` reads `--user-message-background` and
  `--user-message-foreground` from `DesktopAppearanceThemeRuntime`, keeping the
  user pill background/text pair first-class and independent from the global
  accent/send-button tokens.
- `.user-message-editor` uses chat-local editor variables, with light
  appearance overriding the editor surface, border, text, and secondary action
  button to foreground/background appearance tokens so inline edit/resend stays
  readable against white dashboard surfaces.
- `.message-assistant` full-width transparent lane for nested tool/transparency sections.

Markdown surface:

- `.message-content-markdown` controls spacing for paragraph/list/code/table/blockquote.
- fenced markdown code blocks use chat-local `--chat-markdown-code-block-*`
  variables so their dark panel keeps a light foreground in both dark and light
  appearance.

## Tool and Transparency Card Contract

Tool cards:

- `.tool-output-container` and `.tool-call-container` share mono-card base + typed accents.
- `.tool-details-*` classes define expandable metadata sections.

Screenshot cards:

- `.tool-screenshot-*` and `.user-screenshot-*` classes handle framing/labels.
- media uses bounded contain behavior and bordered cards.

Transparency cards:

- `.transparency-section*` classes define collapsible debug payload cards.
- `.transparency-content` enforces capped panel height + internal scroll.

## Input Composer Contract

Composer structure:

- top text row: `.message-input-top-row` + multiline `.message-input`
- bottom action row: `.message-input-bottom-row` with utility + send/stop controls
- dropdown menus use `.message-dropdown-menu` classes
- non-empty width constrained to the dashboard chat max width; empty-state composer is centered variant

## Thinking Stream Overflow Contract (`ThinkingDisplay.css` + component)

Class coupling:

- `ThinkingDisplay.jsx` toggles `has-overflow-above` on `.thinking-display-stream`.

Visual behavior:

- overflow gradient indicator only shown when content exists above viewport.
- thinking stream stays visually secondary to assistant main content.
- max-height + internal scroll preserves overall layout stability.

## Token Count Note

Current chat styles do not include a dedicated `TokenCountDisplay.css` surface.
Token usage remains stream telemetry in state (`chatStore.tokenCounts`) and can be surfaced by future UI consumers.

## Responsive and Motion Guarantees

Breakpoints:

- narrow viewport breakpoints adjust header spacing and composer widths.

Motion:

- message enter animations disable under `prefers-reduced-motion: reduce`.

## Related Docs

- [Frontend Renderer Styles Docs Hub](README.md)
- [Renderer Chat Presentation Docs Hub](../chat/presentation/README.md)
- [Thinking Display Overflow, Message List Class Assembly, and Stream Token Tracking Reference](../chat/presentation/thinking_display_overflow_message_list_class_assembly_and_token_count_formatting_reference.md)
