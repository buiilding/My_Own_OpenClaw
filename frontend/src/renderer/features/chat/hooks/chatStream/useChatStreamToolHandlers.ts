import { useCallback } from 'react';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
import { type ChatMessage } from '../../stores/chatStore';
import {
  type BackendEventType,
  type ToolBundleEvent,
  type ToolOutputEvent,
} from '../../../../types/backendEvents';
import {
  formatToolOutputText,
} from '../../utils/chatStream/chatStreamFormatting';
import {
  buildToolBundleMessage,
  buildToolOutputMessage,
} from '../../utils/chatStream/chatStreamToolMessages';
import {
  buildToolCallChatMessageState,
} from '../../../../infrastructure/transcript/toolCallChatMessageState';
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

type JsonObject = Record<string, unknown>;
type ToolStreamEvent = ToolOutputEvent | ToolBundleEvent | ConversationEvent;

type UseChatStreamToolHandlersDeps = {
  enableTranscript: boolean;
  addMessage: (message: ChatMessage, conversationRef?: string | null) => void;
  setIsSending: (value: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (value: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (value: string | null, conversationRef?: string | null) => void;
  modelContextRef: { current: MinimalModelContext };
  recordTrackingEvent: TrackEventFn;
};

function unwrapToolBackendEvent<TEvent extends ToolOutputEvent | ToolBundleEvent>(
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

function asJsonObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
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
    identity: { conversationRef: string; userId?: string | null },
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
      conversationRef: identity.conversationRef,
      userId: identity.userId ?? undefined,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
      structuredPayload,
    });
  }, [enableTranscript, modelContextRef]);

  const handleToolCall = useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    if (event.type !== 'tool_call') {
      return;
    }
    const resolvedConversationRef = conversationRef ?? event.conversationRef;
    const toolCallDetails = asJsonObject(event.payload?.structuredPayload) ?? asJsonObject(event.payload);
    const metadata = asJsonObject(toolCallDetails?.metadata);
    const args = asJsonObject(event.payload?.args) ?? asJsonObject(toolCallDetails?.parameters);
    const toolName = readString(event.payload?.toolName) ?? readString(toolCallDetails?.tool_name) ?? '';
    const requestId = readString(event.payload?.requestId) ?? readString(toolCallDetails?.request_id);
    const correlationId = (
      readString(event.payload?.correlationId)
      ?? resolveToolCallCorrelationId(toolCallDetails)
    );
    const userId = readString(event.payload?.userId);
    const skipFrontendExecution = metadata?.skip_frontend_execution === true;
    if (!skipFrontendExecution) {
      setIsSending(false, resolvedConversationRef);
      setThinkingStatus(null, resolvedConversationRef);
      setThinkingSourceEventType(null, resolvedConversationRef);
    }
    const toolCallMessageState = buildToolCallMessageState({
      rawToolCall: asJsonObject(metadata?.model_facing_tool_call),
      fallbackToolName: toolName || null,
      fallbackToolCallId: requestId,
      fallbackArguments: args,
      metadata,
      toolCallDetails,
      correlationId,
    });
    const modelContext = modelContextRef.current;
    addMessage(buildToolCallChatMessageState({
      text: toolCallMessageState.text,
      toolCallDisplayText: toolCallMessageState.toolCallDisplayText,
      modelFacingToolCall: toolCallMessageState.modelFacingToolCall ?? null,
      toolCallDetails: toolCallMessageState.toolCallDetails ?? null,
      correlationId: toolCallMessageState.correlationId ?? null,
      sourceEventType: 'tool-call',
      sourceChannel: 'from-backend',
      turnRef: event.turnRef ?? undefined,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    }) as ChatMessage, resolvedConversationRef);

    recordTrackingEvent('tool-call', event.turnRef, { toolCall: true }, resolvedConversationRef);

    recordToolCallTranscript(
      toolCallMessageState.text,
      { conversationRef: event.conversationRef, userId },
      toolName,
      toolCallMessageState.correlationId,
      buildStructuredToolPayload({
        kind: 'tool-call',
        toolCall: toolCallMessageState.modelFacingToolCall,
        toolCallDetails,
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
