import { useCallback } from 'react';
import { recordToolMessage } from '../../../infrastructure/transcript/TranscriptWriter';
import { type ChatMessage } from '../stores/chatStore';
import {
  type BackendEventType,
  type ToolBundleEvent,
  type ToolCallEvent,
  type ToolOutputEvent,
} from '../../../types/backendEvents';
import {
  formatToolBundlePayload,
  formatToolCallPayload,
  formatToolOutputText,
  resolveModelFacingToolCall,
} from '../utils/chatStreamFormatting';
import {
  buildToolBundleMessage,
  buildToolCallMessage,
  buildToolOutputMessage,
} from '../utils/chatStreamToolMessages';
import {
  buildScreenshotAttachment,
  resolveToolCallCorrelationId,
  resolveToolOutputCorrelationId,
} from '../utils/chatStreamEventUtils';

type MinimalModelContext = {
  modelId: string | null;
  modelProvider: string | null;
};

type TrackEventFn = (
  eventType: BackendEventType,
  turnRef: string | null | undefined,
  options?: Record<string, unknown>,
  conversationRef?: string | null,
) => void;

type UseChatStreamToolHandlersDeps = {
  enableTranscript: boolean;
  addMessage: (message: ChatMessage, conversationRef?: string | null) => void;
  setThinkingStatus: (value: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (value: string | null, conversationRef?: string | null) => void;
  modelContextRef: { current: MinimalModelContext };
  recordTrackingEvent: TrackEventFn;
};

export function useChatStreamToolHandlers({
  enableTranscript,
  addMessage,
  setThinkingStatus,
  setThinkingSourceEventType,
  modelContextRef,
  recordTrackingEvent,
}: UseChatStreamToolHandlersDeps) {
  const recordToolCallTranscript = useCallback((
    text: string,
    event: ToolCallEvent | ToolBundleEvent,
    toolName: string,
    correlationId: string | null | undefined,
  ) => {
    if (!enableTranscript) {
      return;
    }
    const modelContext = modelContextRef.current;
    recordToolMessage(text, {
      messageType: 'tool-call',
      toolName,
      correlationId,
      conversationRef: event.conversation_ref,
      userId: event.user_id,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    });
  }, [enableTranscript, modelContextRef]);

  const handleToolCall = useCallback((event: ToolCallEvent, conversationRef?: string | null) => {
    setThinkingStatus(null, conversationRef);
    setThinkingSourceEventType(null, conversationRef);
    const modelFacingToolCall = resolveModelFacingToolCall(event.payload);
    const formattedText = formatToolCallPayload(event.payload);
    const modelContext = modelContextRef.current;
    addMessage(buildToolCallMessage(event, formattedText, modelContext, modelFacingToolCall), conversationRef);

    recordTrackingEvent('tool-call', event.turn_ref, { toolCall: true }, conversationRef);

    const correlationId = resolveToolCallCorrelationId(event.payload);

    recordToolCallTranscript(
      formattedText,
      event,
      event.payload?.tool_name || '',
      correlationId,
    );
  }, [
    addMessage,
    modelContextRef,
    recordToolCallTranscript,
    setThinkingSourceEventType,
    setThinkingStatus,
    recordTrackingEvent,
  ]);

  const handleToolOutput = useCallback((event: ToolOutputEvent, conversationRef?: string | null) => {
    setThinkingStatus(null, conversationRef);
    setThinkingSourceEventType(null, conversationRef);
    const outputText = formatToolOutputText(event.payload);
    const { screenshotRef, screenshotUrl } = buildScreenshotAttachment(event.payload?.screenshot_ref);
    const modelContext = modelContextRef.current;
    addMessage(buildToolOutputMessage(
      event,
      outputText,
      modelContext,
      screenshotRef,
      screenshotUrl,
    ), conversationRef);
    recordTrackingEvent('tool-output', event.turn_ref, { toolOutput: true }, conversationRef);

    const correlationId = resolveToolOutputCorrelationId(event.payload, event.id) || undefined;

    if (enableTranscript) {
      recordToolMessage(outputText, {
        messageType: 'tool-output',
        toolName: event.payload?.tool_name,
        correlationId,
        conversationRef: event.conversation_ref,
        userId: event.user_id,
        screenshotRef,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      });
    }
  }, [
    addMessage,
    enableTranscript,
    modelContextRef,
    setThinkingSourceEventType,
    setThinkingStatus,
    recordTrackingEvent,
  ]);

  const handleToolBundle = useCallback((event: ToolBundleEvent, conversationRef?: string | null) => {
    setThinkingStatus(null, conversationRef);
    setThinkingSourceEventType(null, conversationRef);
    const formattedText = formatToolBundlePayload(event.payload);
    const modelContext = modelContextRef.current;
    addMessage(buildToolBundleMessage(event, formattedText, modelContext), conversationRef);

    recordTrackingEvent(
      'tool-bundle',
      event.turn_ref,
      { phase: 'tool-call', toolCall: true },
      conversationRef,
    );
    // Internal bundle orchestration events are not executable tool names.
    // Keep them out of transcript tool-call rows to avoid rehydrate contamination.
  }, [
    addMessage,
    modelContextRef,
    setThinkingSourceEventType,
    setThinkingStatus,
    recordTrackingEvent,
  ]);

  return {
    handleToolCall,
    handleToolOutput,
    handleToolBundle,
  };
}
