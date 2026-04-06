import type { MutableRefObject } from 'react';
import type {
  BundleExecutionResult,
  ToolExecutionResult,
} from '../../../../infrastructure/services/toolExecution/ToolExecutionService';
import { recordToolMessage } from '../../../../infrastructure/transcript/TranscriptWriter';
import { buildStructuredToolPayload } from '../../../../infrastructure/transcript/structuredToolPayload';
import {
  buildBundleOutputMessage,
  buildToolOutputMessage,
  buildTranscriptMetadata,
  type TranscriptModelContext,
} from './toolRunnerMessages';

type PersistResultOptions = {
  shouldAcceptExecutionResult: (correlationId: string | null | undefined) => boolean;
  resolveExecutionConversationRef: (correlationId: string | null | undefined) => string | null;
  addMessage: (message: unknown, conversationRef?: string | null) => void;
  modelContextRef: MutableRefObject<TranscriptModelContext>;
};

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
  addMessage(buildToolOutputMessage(result), conversationRef);
  recordToolMessage(
    result.formattedMessage,
    {
      ...buildTranscriptMetadata(
        result.toolName,
        result.correlationId,
        result.screenshotRef ?? null,
        modelContextRef.current,
      ),
      structuredPayload: buildStructuredToolPayload({
        kind: 'tool-output',
        toolCallDetails: {
          result: result.result,
          system_state: result.systemState || null,
          correlation_id: result.correlationId,
          tool_name: result.toolName,
          execution_time: result.executionTime,
        },
      }),
      conversationRef: conversationRef || undefined,
    },
  );
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
  recordToolMessage(
    result.formattedMessage,
    {
      ...buildTranscriptMetadata(
        'bundled_tools',
        result.correlationId,
        result.screenshotRef ?? null,
        modelContextRef.current,
      ),
      structuredPayload: buildStructuredToolPayload({
        kind: 'tool-output',
        toolCallDetails: {
          bundled: true,
          results: result.results,
          correlation_id: result.correlationId,
          execution_time_total: result.totalTime,
        },
      }),
      conversationRef: conversationRef || undefined,
    },
  );
}
