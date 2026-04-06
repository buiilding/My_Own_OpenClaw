import type { MutableRefObject } from 'react';
import type {
  BundleExecutionResult,
  ToolExecutionResult,
} from '../../../../infrastructure/services/toolExecution/ToolExecutionService';
import { formatToolOutputMessage } from '../../../../infrastructure/services/MessageFormatter';
import {
  buildBundleOutputMessage,
  buildToolOutputMessage,
} from './toolRunnerMessages';
import type { TranscriptModelContext } from '../transcriptModelContext';
import { recordToolOutputTranscriptMessage } from '../toolOutputTranscriptPersistence';

type PersistResultOptions = {
  shouldAcceptExecutionResult: (correlationId: string | null | undefined) => boolean;
  resolveExecutionConversationRef: (correlationId: string | null | undefined) => string | null;
  addMessage: (message: unknown, conversationRef?: string | null) => void;
  modelContextRef: MutableRefObject<TranscriptModelContext>;
};

type PersistAcceptedToolMessageOptions = Pick<PersistResultOptions, 'addMessage' | 'modelContextRef'>;

function persistAcceptedToolMessage(
  result: ToolExecutionResult,
  conversationRef: string | null,
  options: PersistAcceptedToolMessageOptions,
): void {
  const { addMessage, modelContextRef } = options;
  addMessage(buildToolOutputMessage(result), conversationRef);
  recordToolOutputTranscriptMessage({
    text: result.formattedMessage,
    toolName: result.toolName,
    correlationId: result.correlationId,
    screenshotRef: result.screenshotRef ?? null,
    conversationRef,
    modelContext: modelContextRef.current,
    toolOutputDetails: {
      result: result.result,
      system_state: result.systemState || null,
      correlation_id: result.correlationId,
      tool_name: result.toolName,
      execution_time: result.executionTime,
    },
  });
}

export function persistToolRunnerToolResult(
  result: ToolExecutionResult,
  options: PersistResultOptions,
): void {
  const {
    shouldAcceptExecutionResult,
    resolveExecutionConversationRef,
    addMessage,
    modelContextRef,
  } = options;
  if (!shouldAcceptExecutionResult(result.correlationId)) {
    return;
  }
  const conversationRef = resolveExecutionConversationRef(result.correlationId);
  persistAcceptedToolMessage(result, conversationRef, { addMessage, modelContextRef });
}

export function persistToolRunnerBundleResult(
  result: BundleExecutionResult,
  options: PersistResultOptions,
): void {
  const {
    shouldAcceptExecutionResult,
    resolveExecutionConversationRef,
    addMessage,
    modelContextRef,
  } = options;
  if (!shouldAcceptExecutionResult(result.correlationId)) {
    return;
  }
  const conversationRef = resolveExecutionConversationRef(result.correlationId);
  addMessage(buildBundleOutputMessage(result), conversationRef);
  recordToolOutputTranscriptMessage({
    text: result.formattedMessage,
    toolName: 'bundled_tools',
    correlationId: result.correlationId,
    screenshotRef: result.screenshotRef ?? null,
    conversationRef,
    modelContext: modelContextRef.current,
    toolOutputDetails: {
      bundled: true,
      results: result.results,
      correlation_id: result.correlationId,
      execution_time_total: result.totalTime,
    },
  });
}

type PersistSurfaceFailureOptions = Pick<PersistResultOptions, 'addMessage' | 'modelContextRef'> & {
  conversationRef: string | null;
};

export function persistToolRunnerSurfaceFailureResult(
  toolName: string,
  correlationId: string,
  failureError: string,
  options: PersistSurfaceFailureOptions,
): void {
  const result = {
    success: false,
    error: failureError,
    data: null,
  };
  const formattedMessage = formatToolOutputMessage(toolName, result);

  persistAcceptedToolMessage(
    {
      toolName,
      result,
      executionTime: 0,
      correlationId,
      formattedMessage,
      screenshot: null,
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: null,
      systemState: null,
    },
    options.conversationRef,
    options,
  );
}
