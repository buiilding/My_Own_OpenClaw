import { useCallback } from 'react';
import { recordToolMessage } from '../../../../infrastructure/transcript/TranscriptWriter';
import { recordAssistantMessage } from '../../../../infrastructure/transcript/TranscriptWriter';
import { type ChatMessage } from '../../stores/chatStore';
import {
  type BackendEventType,
  type SearchSourceEvent,
  type ToolBundleEvent,
  type ToolCallEvent,
  type ToolOutputEvent,
} from '../../../../types/backendEvents';
import {
  formatToolOutputText,
} from '../../utils/chatStream/chatStreamFormatting';
import {
  buildToolBundleMessage,
  buildToolCallMessage,
  buildToolOutputMessage,
  buildSearchSourceMessage,
} from '../../utils/chatStream/chatStreamToolMessages';
import {
  buildToolBundleMessageState,
  buildToolCallMessageState,
} from '../../../../infrastructure/transcript/toolCallMessageState';
import {
  buildScreenshotAttachment,
  resolveToolCallCorrelationId,
  resolveToolOutputCorrelationId,
} from '../../utils/chatStream/chatStreamEventUtils';

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
  setIsSending: (value: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (value: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (value: string | null, conversationRef?: string | null) => void;
  modelContextRef: { current: MinimalModelContext };
  recordTrackingEvent: TrackEventFn;
};

export function useChatStreamToolHandlers({
  enableTranscript,
  addMessage,
  setIsSending,
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
    setIsSending(false, conversationRef);
    setThinkingStatus(null, conversationRef);
    setThinkingSourceEventType(null, conversationRef);
    const toolCallMessageState = buildToolCallMessageState({
      rawToolCall: event.payload?.metadata?.model_facing_tool_call || null,
      fallbackToolName: event.payload?.tool_name || null,
      fallbackToolCallId: event.payload?.request_id || null,
      fallbackArguments: event.payload?.parameters || null,
      metadata: event.payload?.metadata || null,
      toolCallDetails: event.payload || null,
      correlationId: resolveToolCallCorrelationId(event.payload),
    });
    const modelContext = modelContextRef.current;
    addMessage(buildToolCallMessage(event, toolCallMessageState, modelContext), conversationRef);

    recordTrackingEvent('tool-call', event.turn_ref, { toolCall: true }, conversationRef);

    recordToolCallTranscript(
      toolCallMessageState.text,
      event,
      event.payload?.tool_name || '',
      toolCallMessageState.correlationId,
    );
  }, [
    addMessage,
    modelContextRef,
    recordToolCallTranscript,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
    recordTrackingEvent,
  ]);

  const handleToolOutput = useCallback((event: ToolOutputEvent, conversationRef?: string | null) => {
    setIsSending(false, conversationRef);
    setThinkingStatus(null, conversationRef);
    setThinkingSourceEventType(null, conversationRef);
    const outputText = formatToolOutputText(event.payload);
    const { screenshotRef, screenshotUrl } = buildScreenshotAttachment(event.payload?.screenshot_ref);
    const modelContext = modelContextRef.current;
    addMessage(buildToolOutputMessage(
      event,
      outputText,
      modelContext,
      event.payload?.screenshot || null,
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
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
    recordTrackingEvent,
  ]);

  const handleToolBundle = useCallback((event: ToolBundleEvent, conversationRef?: string | null) => {
    setThinkingStatus(null, conversationRef);
    setThinkingSourceEventType(null, conversationRef);
    const toolBundleMessageState = buildToolBundleMessageState(event.payload);
    const modelContext = modelContextRef.current;
    addMessage(buildToolBundleMessage(event, toolBundleMessageState, modelContext), conversationRef);

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

  const handleSearchSource = useCallback((event: SearchSourceEvent, conversationRef?: string | null) => {
    const url = typeof event.payload?.url === 'string' ? event.payload.url.trim() : '';
    if (!url) {
      return;
    }
    const modelContext = modelContextRef.current;
    const message = buildSearchSourceMessage(event, modelContext);
    addMessage(message, conversationRef);
    recordTrackingEvent('search-source', event.turn_ref, { phase: 'tool-output' }, conversationRef);

    if (enableTranscript) {
      recordAssistantMessage(message.text, {
        messageType: 'search-source',
        conversationRef: event.conversation_ref,
        userId: event.user_id,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      });
    }
  }, [
    addMessage,
    enableTranscript,
    modelContextRef,
    recordTrackingEvent,
  ]);

  return {
    handleToolCall,
    handleToolOutput,
    handleToolBundle,
    handleSearchSource,
  };
}
