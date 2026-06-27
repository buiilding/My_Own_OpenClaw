---
summary: "Frontend renderer chat docs sub-hub for message-send policy, stream/update flow, SDK tool display handling, and transcript projection contracts."
read_when:
  - When changing `frontend/src/renderer/features/chat/*` hooks/components/store contracts.
  - When debugging send-stream-tool state differences between dashboard and overlay chat surfaces.
title: "Frontend Renderer Chat Docs Hub"
---

# Frontend Renderer Chat Docs Hub

## Deep Pages

- [Chat Attachment Change Workflow](chat_attachment_change_workflow.md)
- [Message Send Surface Policy and Screenshot Capture Reference](message_send_surface_policy_and_screenshot_capture_reference.md)
- [Renderer State Change Workflow](../renderer_state_change_workflow.md)
- [Chat Interface Header Controls, Model Selection, and Compaction Rehydrate Reference](chat_interface_header_controls_model_selection_and_compaction_rehydrate_reference.md)
- [Chat Store State and New Session Rotation Reference](chat_store_state_and_new_session_rotation_reference.md)
- [Chat Loop UI State Disconnect Recovery and Surface Projection Reference](loop_ui_state_disconnect_recovery_and_surface_projection_reference.md)
- [Renderer Chat Stream Docs Hub](stream/README.md)
- [Conversation Gate and Active-Turn Filtering Reference](stream/conversation_gate_and_active_turn_filtering_reference.md)
- [Tracking, Formatting, and Message-Update Utility Reference](stream/tracking_formatting_and_message_update_utility_reference.md)
- [Stream Message Updater Selector Contract Reference](stream/stream_message_updater_selector_contract_reference.md)
- [Renderer Chat Payload Docs Hub](payloads/README.md)
- [Tool Call/Output and Transparency Section Rendering Reference](payloads/tool_call_output_and_transparency_section_rendering_reference.md)
- [Renderer Chat Presentation Docs Hub](presentation/README.md)
- [Chatbox Component Split and Overlay Pill Runtime Reference](presentation/chatbox_component_split_and_overlay_pill_runtime_reference.md)
- [Chat Stream Store Adapter Boundary and Message-Input Send Guard Reference](presentation/chat_common_actions_selector_boundary_and_message_input_send_guard_reference.md)
- [MessageInput Clipboard Image and Voice Submit Reference](presentation/message_input_clipboard_image_and_voice_submit_reference.md)
- [Data-URL Image Parsing and Attachment Payload Contract Reference](presentation/data_url_image_parsing_and_attachment_payload_contract_reference.md)
- [Thinking Display Overflow, Message List Class Assembly, and Stream Token Tracking Reference](presentation/thinking_display_overflow_message_list_class_assembly_and_token_count_formatting_reference.md)
- [Message Action Controls, Source Badge, and Dev-UI Tagging Reference](presentation/message_action_controls_source_badge_and_dev_ui_tagging_reference.md)
- [Latest Visible Assistant Reply Turn-Boundary and Allowed-Type Contract Reference](presentation/latest_visible_assistant_reply_turn_boundary_and_allowed_type_contract_reference.md)
- [Renderer Chat Response-Overlay Presentation Docs Hub](presentation/response_overlay/README.md)
- [Fixed Response-Pill Height, Scroll Anchor, and Overlay Visibility Re-Report Contract Reference](presentation/response_overlay/fixed_response_pill_height_scroll_and_visibility_rereport_contract_reference.md)
- [Tool Ghost Cursor Markup and Label A11y Contract Reference](presentation/response_overlay/tool_ghost_cursor_markup_and_label_a11y_contract_reference.md)

## Related Pages

- [Frontend Renderer Docs Hub](../README.md)
- [Artifact Change Workflow](../../../desktop/artifact_change_workflow.md)
- [Chat Stream and Tool Execution Reference](../chat_stream_and_tool_execution_reference.md)
- [Chatbox Overlay Input, Drag, and Click-Through Reference](../overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Transcript Session and Rehydrate Reference](../transcript_session_and_rehydrate_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useChatSurfaceController.js`
- `frontend/src/renderer/features/chat/hooks/useChatLoopUiState.js`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useStreamMessageUpdaters.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/app/runtime/desktopChatSendPayloadRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatSendStateRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts`
- `packages/windie-sdk-js/src/runtime/TurnInputPipeline.ts`
- `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts`
- `frontend/src/renderer/app/runtime/desktopChatLoopUiRuntime.js`
- `frontend/src/renderer/app/runtime/desktopStreamPhaseRuntime.js`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatModelOptionsRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatStreamTurnGuardRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTrackingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamEventPayloadRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamThinkingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopSdkLiveTurnEffectsRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopRendererTraceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopMarkdownMessageRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMessageContentRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMessageListRuntime.js`
- `frontend/src/renderer/app/runtime/desktopThreadFindRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMessageTransparencyRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatStreamMessageUpdateRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopNewChatSessionRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopConversationSessionRuntime.ts`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `frontend/src/renderer/features/chat/components/message/ThinkingDisplay.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `frontend/src/renderer/features/chat/components/ToolGhostCursor.jsx`
- `frontend/src/renderer/features/chat/components/MessageContent.jsx`
- `frontend/src/renderer/features/chat/components/message/MessageTransparencySections.jsx`
- `frontend/src/renderer/features/chat/components/message/TransparencySection.jsx`
- `frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts`
- `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js`
- `tests/frontend/ChatMessageSender.test.tsx`
- `tests/frontend/ChatLoopUiState.test.js`
- `tests/frontend/ChatLoopUiStateHook.test.jsx`
- `tests/frontend/ChatStore.test.ts`
- `tests/frontend/DesktopChatSendPayloadRuntime.test.ts`
- `tests/frontend/DesktopChatSendStateRuntime.test.ts`
- `tests/frontend/DesktopChatModelOptionsRuntime.test.js`
- `tests/frontend/DesktopChatStreamTrackingRuntime.test.ts`
- `tests/frontend/DesktopChatStreamEventPayloadRuntime.test.ts`
- `tests/frontend/DesktopChatStreamMessageUpdateRuntime.test.ts`
- `tests/frontend/DesktopChatStreamThinkingRuntime.test.ts`
- `tests/frontend/DesktopSdkLiveTurnEffectsRuntime.test.ts`
- `tests/frontend/DesktopRendererTraceRuntime.test.ts`
- `tests/frontend/MessageListThinkingDisplay.test.jsx`
- `tests/frontend/DesktopMessageContentRuntime.test.js`
- `tests/frontend/DesktopMessageListRuntime.test.js`
- `tests/frontend/DesktopMessageClassRuntime.test.js`
- `tests/frontend/DesktopThreadFindRuntime.test.js`
- `tests/frontend/ThinkingDisplay.test.jsx`
