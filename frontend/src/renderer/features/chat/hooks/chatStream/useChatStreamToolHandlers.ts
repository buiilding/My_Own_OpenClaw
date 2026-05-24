import { useCallback } from 'react';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
import { type ChatMessage } from '../../stores/chatStore';
import {
  type BackendEventType,
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
} from '../../utils/chatStream/chatStreamToolMessages';
import {
  buildToolBundleMessageState,
  buildToolCallMessageState,
} from '../../../../infrastructure/transcript/toolCallMessageState';
import {
  buildStructuredToolPayload,
} from '../../../../infrastructure/transcript/structuredToolPayload';
import type { TranscriptStructuredToolPayload } from '../../../../infrastructure/transcript/types';
import {
  buildScreenshotAttachment,
  resolveToolCallCorrelationId,
  resolveToolOutputCorrelationId,
} from '../../utils/chatStream/chatStreamEventUtils';
import { recordToolOutputTranscriptMessage } from '../../utils/toolOutputTranscriptPersistence';
import { DesktopConversationRuntimeClient } from '../../session/desktopConversationRuntimeClient';

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

type ToolStreamEvent = ToolCallEvent | ToolOutputEvent | ToolBundleEvent | ConversationEvent;

type UseChatStreamToolHandlersDeps = {
  enableTranscript: boolean;
  addMessage: (message: ChatMessage, conversationRef?: string | null) => void;
  setIsSending: (value: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (value: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (value: string | null, conversationRef?: string | null) => void;
  modelContextRef: { current: MinimalModelContext };
  recordTrackingEvent: TrackEventFn;
};

function unwrapToolBackendEvent<TEvent extends ToolCallEvent | ToolOutputEvent | ToolBundleEvent>(
  event: ToolStreamEvent,
  expectedType: TEvent['type'],
): TEvent | null {
  if ('turn_ref' in event && event.type === expectedType) {
    return event as TEvent;
  }
  const rawEvent = event.payload?.rawEvent;
  if (
    rawEvent
    && typeof rawEvent === 'object'
    && !Array.isArray(rawEvent)
    && (rawEvent as { type?: unknown }).type === expectedType
  ) {
    return rawEvent as TEvent;
  }
  return null;
}

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
    structuredPayload: TranscriptStructuredToolPayload | null,
  ) => {
    if (!enableTranscript) {
      return;
    }
    const modelContext = modelContextRef.current;
    DesktopConversationRuntimeClient.recordToolMessage(text, {
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

  const handleToolCall = useCallback((event: ToolCallEvent | ConversationEvent, conversationRef?: string | null) => {
    const backendEvent = unwrapToolBackendEvent<ToolCallEvent>(event, 'tool-call');
    if (!backendEvent) {
      return;
    }
    const resolvedConversationRef = conversationRef ?? ('conversationRef' in event ? event.conversationRef : null);
    const skipFrontendExecution = backendEvent.payload?.metadata?.skip_frontend_execution === true;
    if (!skipFrontendExecution) {
      setIsSending(false, resolvedConversationRef);
      setThinkingStatus(null, resolvedConversationRef);
      setThinkingSourceEventType(null, resolvedConversationRef);
    }
    const toolCallMessageState = buildToolCallMessageState({
      rawToolCall: backendEvent.payload?.metadata?.model_facing_tool_call || null,
      fallbackToolName: backendEvent.payload?.tool_name || null,
      fallbackToolCallId: backendEvent.payload?.request_id || null,
      fallbackArguments: backendEvent.payload?.parameters || null,
      metadata: backendEvent.payload?.metadata || null,
      toolCallDetails: backendEvent.payload || null,
      correlationId: resolveToolCallCorrelationId(backendEvent.payload),
    });
    const modelContext = modelContextRef.current;
    addMessage(buildToolCallMessage(backendEvent, toolCallMessageState, modelContext), resolvedConversationRef);

    recordTrackingEvent('tool-call', backendEvent.turn_ref, { toolCall: true }, resolvedConversationRef);

    recordToolCallTranscript(
      toolCallMessageState.text,
      backendEvent,
      backendEvent.payload?.tool_name || '',
      toolCallMessageState.correlationId,
      buildStructuredToolPayload({
        kind: 'tool-call',
        toolCall: toolCallMessageState.modelFacingToolCall,
        toolCallDetails: (
          backendEvent.payload && typeof backendEvent.payload === 'object' && !Array.isArray(backendEvent.payload)
            ? backendEvent.payload
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

  const handleToolOutput = useCallback((event: ToolOutputEvent | ConversationEvent, conversationRef?: string | null) => {
    const backendEvent = unwrapToolBackendEvent<ToolOutputEvent>(event, 'tool-output');
    if (!backendEvent) {
      return;
    }
    const resolvedConversationRef = conversationRef ?? ('conversationRef' in event ? event.conversationRef : null);
    setIsSending(false, resolvedConversationRef);
    setThinkingStatus(null, resolvedConversationRef);
    setThinkingSourceEventType(null, resolvedConversationRef);
    const outputText = formatToolOutputText(backendEvent.payload);
    const { screenshotRef, screenshotUrl } = buildScreenshotAttachment(backendEvent.payload?.screenshot_ref);
    const modelContext = modelContextRef.current;
    addMessage(buildToolOutputMessage(
      backendEvent,
      outputText,
      modelContext,
      backendEvent.payload?.screenshot || null,
      screenshotRef,
      screenshotUrl,
    ), resolvedConversationRef);
    recordTrackingEvent('tool-output', backendEvent.turn_ref, { toolOutput: true }, resolvedConversationRef);

    const correlationId = resolveToolOutputCorrelationId(backendEvent.payload, backendEvent.id) || undefined;
    const toolOutputDetails = (
      backendEvent.payload && typeof backendEvent.payload === 'object' && !Array.isArray(backendEvent.payload)
        ? backendEvent.payload
        : null
    );

    if (enableTranscript) {
      recordToolOutputTranscriptMessage({
        text: outputText,
        toolName: backendEvent.payload?.tool_name,
        correlationId,
        conversationRef: backendEvent.conversation_ref,
        userId: backendEvent.user_id,
        screenshotRef,
        modelContext,
        toolOutputDetails,
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

  const handleToolBundle = useCallback((event: ToolBundleEvent | ConversationEvent, conversationRef?: string | null) => {
    const backendEvent = unwrapToolBackendEvent<ToolBundleEvent>(event, 'tool-bundle');
    if (!backendEvent) {
      return;
    }
    const resolvedConversationRef = conversationRef ?? ('conversationRef' in event ? event.conversationRef : null);
    setThinkingStatus(null, resolvedConversationRef);
    setThinkingSourceEventType(null, resolvedConversationRef);
    const toolBundleMessageState = buildToolBundleMessageState(backendEvent.payload);
    const modelContext = modelContextRef.current;
    addMessage(buildToolBundleMessage(backendEvent, toolBundleMessageState, modelContext), resolvedConversationRef);

    recordTrackingEvent(
      'tool-bundle',
      backendEvent.turn_ref,
      { phase: 'tool-call', toolCall: true },
      resolvedConversationRef,
    );
    if (enableTranscript) {
      DesktopConversationRuntimeClient.recordToolMessage(toolBundleMessageState.text, {
        messageType: 'tool-bundle',
        toolName: 'tool-bundle',
        correlationId: toolBundleMessageState.correlationId || undefined,
        conversationRef: backendEvent.conversation_ref,
        userId: backendEvent.user_id,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
        structuredPayload: buildStructuredToolPayload({
          kind: 'tool-bundle',
          toolCalls: toolBundleMessageState.toolCalls,
          toolCallDetails: (
            backendEvent.payload && typeof backendEvent.payload === 'object' && !Array.isArray(backendEvent.payload)
              ? backendEvent.payload
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
    event: ConversationEvent,
    conversationRef?: string | null,
  ) => {
    if (event.type !== 'tool_progress') {
      return;
    }
    const resolvedConversationRef = conversationRef ?? event.conversationRef;
    const text = typeof event.payload?.text === 'string' ? event.payload.text.trim() : '';
    if (!text) {
      return;
    }
    const correlationId = typeof event.payload?.requestId === 'string' && event.payload.requestId.trim()
      ? event.payload.requestId.trim()
      : typeof event.payload?.correlationId === 'string' && event.payload.correlationId.trim()
        ? event.payload.correlationId.trim()
        : undefined;
    const modelContext = modelContextRef.current;
    addMessage({
      id: crypto.randomUUID(),
      text,
      sender: 'assistant',
      type: 'search-source',
      sourceEventType: 'web-search-progress',
      sourceChannel: 'from-backend',
      correlationId,
      turnRef: event.turnRef ?? undefined,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    }, resolvedConversationRef);
    recordTrackingEvent(
      'web-search-progress',
      event.turnRef,
      { phase: 'tool-call', toolCall: true },
      resolvedConversationRef,
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
