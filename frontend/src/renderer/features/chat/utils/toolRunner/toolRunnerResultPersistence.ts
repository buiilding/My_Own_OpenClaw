import type { MutableRefObject } from 'react';
import type {
  BundleExecutionResult,
  ToolExecutionResult,
} from '../../../../infrastructure/services/ToolExecutionService';
import { recordToolMessage } from '../../../../infrastructure/transcript/TranscriptWriter';
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
      conversationRef: conversationRef || undefined,
    },
  );
}
