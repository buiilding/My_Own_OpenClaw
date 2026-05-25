import { useCallback } from 'react';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
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
import { recordToolTranscriptMessage } from '../../utils/chatStream/chatStreamTranscriptPersistence';

type MinimalModelContext = {
  modelId: string | null;
  modelProvider: string | null;
};

type JsonObject = Record<string, unknown>;

type UseChatStreamToolHandlersDeps = {
  enableTranscript: boolean;
  modelContextRef: { current: MinimalModelContext };
};

function asJsonObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function sdkToolBundleDetails(payload: JsonObject): JsonObject {
  const structuredPayload = asJsonObject(payload.structuredPayload);
  if (structuredPayload) {
    return structuredPayload;
  }
  return {
    ...payload,
    bundle_id: readString(payload.bundleId) ?? readString(payload.bundle_id) ?? undefined,
    tools: Array.isArray(payload.tools) ? payload.tools : [],
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
  modelContextRef,
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

  const handleToolCall = useCallback((event: ConversationEvent, _conversationRef?: string | null) => {
    if (event.type !== 'tool_call') {
      return;
    }
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
    const toolCallMessageState = buildToolCallMessageState({
      rawToolCall: asJsonObject(metadata?.model_facing_tool_call),
      fallbackToolName: toolName || null,
      fallbackToolCallId: requestId,
      fallbackArguments: args,
      metadata,
      toolCallDetails,
      correlationId,
    });

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
    recordToolCallTranscript,
  ]);

  const handleToolOutput = useCallback((event: ConversationEvent, _conversationRef?: string | null) => {
    if (event.type !== 'tool_output') {
      return;
    }
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
    const screenshotRefValue = readString(event.payload?.screenshotRef) ?? readString(toolOutputDetails?.screenshot_ref);
    const { screenshotRef } = buildScreenshotAttachment(screenshotRefValue);
    const modelContext = modelContextRef.current;

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
    enableTranscript,
    modelContextRef,
  ]);

  const handleToolBundle = useCallback((event: ConversationEvent, _conversationRef?: string | null) => {
    if (event.type !== 'tool_bundle_call') {
      return;
    }
    const toolBundleDetails = sdkToolBundleDetails(event.payload);
    const toolBundleMessageState = buildToolBundleMessageState(toolBundleDetails);
    const modelContext = modelContextRef.current;

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
    enableTranscript,
    modelContextRef,
  ]);

  return {
    handleToolCall,
    handleToolOutput,
    handleToolBundle,
  };
}
