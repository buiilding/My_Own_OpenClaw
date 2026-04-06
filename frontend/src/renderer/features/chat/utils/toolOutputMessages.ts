import { buildToolOutputChatMessageState } from '../../../infrastructure/transcript/toolOutputChatMessageState';
import type { ChatMessage } from '../stores/chatStore';

export type TranscriptModelContext = {
  modelId: string | null;
  modelProvider: string | null;
};

type BuildToolOutputEnvelopeInput = {
  outputText: string;
  sourceEventType: string;
  sourceChannel: string;
  screenshot?: string | null;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  screenshotContentType?: string | null;
  toolMetadata?: Record<string, unknown> | null;
  toolName?: string | null;
  executionTime?: number | null;
  success?: boolean | null;
  correlationId?: string | null;
  toolOutputDetails?: Record<string, unknown> | null;
  turnRef?: string | null;
  modelContext: TranscriptModelContext;
};

export function buildToolOutputEnvelopeMessage({
  outputText,
  sourceEventType,
  sourceChannel,
  screenshot = null,
  screenshotRef = null,
  screenshotUrl = null,
  screenshotContentType = null,
  toolMetadata = null,
  toolName = null,
  executionTime = null,
  success = null,
  correlationId = null,
  toolOutputDetails = null,
  turnRef = null,
  modelContext,
}: BuildToolOutputEnvelopeInput): ChatMessage {
  return buildToolOutputChatMessageState({
    outputText,
    sourceEventType,
    sourceChannel,
    screenshot,
    screenshotRef,
    screenshotUrl,
    screenshotContentType,
    toolMetadata,
    toolName,
    executionTime,
    success,
    correlationId,
    toolOutputDetails,
    turnRef,
    modelId: modelContext.modelId,
    modelProvider: modelContext.modelProvider,
  });
}
