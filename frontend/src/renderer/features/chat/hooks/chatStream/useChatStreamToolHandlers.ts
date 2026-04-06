import { useCallback } from 'react';
import { recordToolMessage } from '../../../../infrastructure/transcript/TranscriptWriter';
import { type ChatMessage } from '../../stores/chatStore';
import {
  type BackendEventType,
  type ToolBundleEvent,
  type ToolCallEvent,
  type ToolOutputEvent,
  type WebSearchProgressEvent,
} from '../../../../types/backendEvents';
import {
  formatToolOutputText,
} from '../../utils/chatStream/chatStreamFormatting';
import {
  buildToolBundleMessage,
  buildToolCallMessage,
  buildToolOutputMessage,
} from '../../utils/chatStream/chatStreamToolMessages';
import {
  buildToolBundleMessageState,
  buildToolCallMessageState,
} from '../../../../infrastructure/transcript/toolCallMessageState';
import {
  buildStructuredToolPayload,
} from '../../../../infrastructure/transcript/structuredToolPayload';
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
    structuredPayload: Record<string, unknown> | null,
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
      structuredPayload,
    });
  }, [enableTranscript, modelContextRef]);

  const handleToolCall = useCallback((event: ToolCallEvent, conversationRef?: string | null) => {
    const skipFrontendExecution = event.payload?.metadata?.skip_frontend_execution === true;
    if (!skipFrontendExecution) {
      setIsSending(false, conversationRef);
      setThinkingStatus(null, conversationRef);
      setThinkingSourceEventType(null, conversationRef);
    }
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
      buildStructuredToolPayload({
        kind: 'tool-call',
        toolCall: toolCallMessageState.modelFacingToolCall,
        toolCallDetails: (
          event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
            ? event.payload
            : null
        ),
      }),
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
        structuredPayload: buildStructuredToolPayload({
          kind: 'tool-output',
          toolCallDetails: (
            event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
              ? event.payload
              : null
          ),
        }),
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
    if (enableTranscript) {
      recordToolMessage(toolBundleMessageState.text, {
        messageType: 'tool-bundle',
        toolName: 'tool-bundle',
        correlationId: toolBundleMessageState.correlationId || undefined,
        conversationRef: event.conversation_ref,
        userId: event.user_id,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
        structuredPayload: buildStructuredToolPayload({
          kind: 'tool-bundle',
          toolCalls: toolBundleMessageState.toolCalls,
          toolCallDetails: (
            event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
              ? event.payload
              : null
          ),
        }),
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

  const handleWebSearchProgress = useCallback((
    event: WebSearchProgressEvent,
    conversationRef?: string | null,
  ) => {
    const text = typeof event.payload?.text === 'string' ? event.payload.text.trim() : '';
    if (!text) {
      return;
    }
    const modelContext = modelContextRef.current;
    addMessage({
      id: crypto.randomUUID(),
      text,
      sender: 'assistant',
      type: 'search-source',
      sourceEventType: 'web-search-progress',
      sourceChannel: 'from-backend',
      correlationId: (
        typeof event.payload?.request_id === 'string' && event.payload.request_id.trim()
          ? event.payload.request_id.trim()
          : undefined
      ),
      turnRef: event.turn_ref,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    }, conversationRef);
    recordTrackingEvent(
      'web-search-progress',
      event.turn_ref,
      { phase: 'tool-call', toolCall: true },
      conversationRef,
    );
  }, [
    addMessage,
    modelContextRef,
    recordTrackingEvent,
  ]);

  return {
    handleToolCall,
    handleToolOutput,
    handleToolBundle,
    handleWebSearchProgress,
  };
}
