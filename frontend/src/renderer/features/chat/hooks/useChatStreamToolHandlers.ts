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
  resolveToolBundleCorrelationId,
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
) => void;

type UseChatStreamToolHandlersDeps = {
  enableTranscript: boolean;
  addMessage: (message: ChatMessage) => void;
  setThinkingStatus: (value: string | null) => void;
  setThinkingSourceEventType: (value: string | null) => void;
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

  const handleToolCall = useCallback((event: ToolCallEvent) => {
    setThinkingStatus(null);
    setThinkingSourceEventType(null);
    const modelFacingToolCall = resolveModelFacingToolCall(event.payload);
    const formattedText = formatToolCallPayload(event.payload);
    const modelContext = modelContextRef.current;
    addMessage(buildToolCallMessage(event, formattedText, modelContext, modelFacingToolCall));

    recordTrackingEvent('tool-call', event.turn_ref, { toolCall: true });

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

  const handleToolOutput = useCallback((event: ToolOutputEvent) => {
    setThinkingStatus(null);
    setThinkingSourceEventType(null);
    const outputText = formatToolOutputText(event.payload);
    const { screenshotRef, screenshotUrl } = buildScreenshotAttachment(event.payload?.screenshot_ref);
    const modelContext = modelContextRef.current;
    addMessage(buildToolOutputMessage(
      event,
      outputText,
      modelContext,
      screenshotRef,
      screenshotUrl,
    ));
    recordTrackingEvent('tool-output', event.turn_ref, { toolOutput: true });

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

  const handleToolBundle = useCallback((event: ToolBundleEvent) => {
    setThinkingStatus(null);
    setThinkingSourceEventType(null);
    const formattedText = formatToolBundlePayload(event.payload);
    const modelContext = modelContextRef.current;
    addMessage(buildToolBundleMessage(event, formattedText, modelContext));

    recordTrackingEvent('tool-bundle', event.turn_ref, { phase: 'tool-call', toolCall: true });

    recordToolCallTranscript(
      formattedText,
      event,
      'tool-bundle',
      resolveToolBundleCorrelationId(event.payload),
    );
  }, [
    addMessage,
    modelContextRef,
    recordToolCallTranscript,
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
