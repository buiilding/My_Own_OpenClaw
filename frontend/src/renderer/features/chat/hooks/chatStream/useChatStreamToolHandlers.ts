import { useCallback } from 'react';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
import { type ChatMessage } from '../../stores/chatStore';
import type { StreamTrackingEventType } from '../../../../app/runtime/desktopChatStreamTrackingRuntime';
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
import { buildToolOutputEnvelopeMessage } from '../../utils/toolOutputMessages';
import { recordToolOutputTranscriptMessage } from '../../utils/toolOutputTranscriptPersistence';
import { recordToolTranscriptMessage } from '../../utils/chatStream/chatStreamTranscriptPersistence';

type MinimalModelContext = {
  modelId: string | null;
  modelProvider: string | null;
};

type TrackEventFn = (
  eventType: StreamTrackingEventType,
  turnRef: string | null | undefined,
  options?: Record<string, unknown>,
  conversationRef?: string | null,
) => void;

type JsonObject = Record<string, unknown>;

type UseChatStreamToolHandlersDeps = {
  enableTranscript: boolean;
  addMessage: (message: ChatMessage, conversationRef?: string | null) => void;
  setIsSending: (value: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (value: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (value: string | null, conversationRef?: string | null) => void;
  modelContextRef: { current: MinimalModelContext };
  recordTrackingEvent: TrackEventFn;
};

function asJsonObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readJsonArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function sdkToolBundleDetails(payload: JsonObject): JsonObject {
  const structuredPayload = asJsonObject(payload.structuredPayload);
  if (structuredPayload) {
    return structuredPayload;
  }
  return {
    ...payload,
    bundle_id: readString(payload.bundleId) ?? readString(payload.bundle_id) ?? undefined,
    tools: readJsonArray(payload.tools) ?? [],
  };
}

function formatSdkToolOutputText(payload: JsonObject | null): string {
  if (typeof payload?.display_content === 'string' && payload.display_content.length > 0) {
    return payload.display_content;
  }
  if (typeof payload?.output === 'string' && payload.output.length > 0) {
    return payload.output;
  }
  if (payload?.error) {
    return `Error: ${payload.error}`;
  }
  return 'No output';
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
    recordToolTranscriptMessage({
      text,
      messageType: 'tool-call',
      toolName,
      correlationId,
      conversationRef: identity.conversationRef,
      userId: identity.userId ?? undefined,
      modelContext,
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

  const handleToolOutput = useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    if (event.type !== 'tool_output') {
      return;
    }
    const resolvedConversationRef = conversationRef ?? event.conversationRef;
    setIsSending(false, resolvedConversationRef);
    setThinkingStatus(null, resolvedConversationRef);
    setThinkingSourceEventType(null, resolvedConversationRef);
    const toolOutputDetails = asJsonObject(event.payload?.structuredPayload) ?? asJsonObject(event.payload);
    const outputText = formatSdkToolOutputText(toolOutputDetails);
    const toolName = readString(event.payload?.toolName) ?? readString(toolOutputDetails?.tool_name);
    const requestId = readString(event.payload?.requestId) ?? readString(toolOutputDetails?.request_id);
    const correlationId = (
      readString(event.payload?.correlationId)
      ?? resolveToolOutputCorrelationId(toolOutputDetails, event.eventId)
      ?? requestId
      ?? undefined
    );
    const screenshot = readString(event.payload?.screenshot) ?? readString(toolOutputDetails?.screenshot);
    const screenshotRefValue = readString(event.payload?.screenshotRef) ?? readString(toolOutputDetails?.screenshot_ref);
    const { screenshotRef, screenshotUrl } = buildScreenshotAttachment(screenshotRefValue);
    const modelContext = modelContextRef.current;
    addMessage(buildToolOutputEnvelopeMessage({
      outputText,
      sourceEventType: 'tool-output',
      sourceChannel: 'from-backend',
      screenshot: screenshotRef ? null : screenshot,
      screenshotRef,
      screenshotUrl,
      toolMetadata: asJsonObject(toolOutputDetails?.metadata),
      toolName,
      executionTime: typeof toolOutputDetails?.execution_time === 'number' ? toolOutputDetails.execution_time : null,
      success: typeof toolOutputDetails?.success === 'boolean' ? toolOutputDetails.success : null,
      correlationId,
      toolOutputDetails,
      turnRef: event.turnRef ?? null,
      modelContext,
    }), resolvedConversationRef);
    recordTrackingEvent('tool-output', event.turnRef, { toolOutput: true }, resolvedConversationRef);

    if (enableTranscript) {
      recordToolOutputTranscriptMessage({
        text: outputText,
        toolName,
        correlationId,
        conversationRef: event.conversationRef,
        userId: readString(event.payload?.userId),
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

  const handleToolBundle = useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    if (event.type !== 'tool_bundle_call') {
      return;
    }
    const resolvedConversationRef = conversationRef ?? event.conversationRef;
    setThinkingStatus(null, resolvedConversationRef);
    setThinkingSourceEventType(null, resolvedConversationRef);
    const toolBundleDetails = sdkToolBundleDetails(event.payload);
    const toolBundleMessageState = buildToolBundleMessageState(toolBundleDetails);
    const modelContext = modelContextRef.current;
    addMessage(buildToolCallChatMessageState({
      text: toolBundleMessageState.text,
      toolCallDisplayText: toolBundleMessageState.toolCallDisplayText,
      toolCallDetails: toolBundleMessageState.toolCallDetails ?? null,
      correlationId: toolBundleMessageState.correlationId ?? null,
      sourceEventType: 'tool-bundle',
      sourceChannel: 'from-backend',
      turnRef: event.turnRef ?? undefined,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    }) as ChatMessage, resolvedConversationRef);

    recordTrackingEvent(
      'tool-bundle',
      event.turnRef,
      { phase: 'tool-call', toolCall: true },
      resolvedConversationRef,
    );
    if (enableTranscript) {
      recordToolTranscriptMessage({
        text: toolBundleMessageState.text,
        messageType: 'tool-bundle',
        toolName: 'tool-bundle',
        correlationId: toolBundleMessageState.correlationId || undefined,
        conversationRef: event.conversationRef,
        userId: readString(event.payload?.userId) ?? undefined,
        modelContext,
        structuredPayload: buildStructuredToolPayload({
          kind: 'tool-bundle',
          toolCalls: toolBundleMessageState.toolCalls,
          toolCallDetails: toolBundleDetails,
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
