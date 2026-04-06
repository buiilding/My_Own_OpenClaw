import { buildMessageScreenshotState } from '../../../infrastructure/services/screenshotMessageState';
import type { ChatMessage } from '../stores/chatStore';

type ToolOutputMessageStateInput = {
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
  modelId?: string | null;
  modelProvider?: string | null;
};

export function buildToolOutputMessageState({
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
  modelId = null,
  modelProvider = null,
}: ToolOutputMessageStateInput): ChatMessage {
  const screenshotState = buildMessageScreenshotState({
    screenshot,
    screenshotRef,
    screenshotUrl,
    screenshotContentType,
  });

  return {
    id: crypto.randomUUID(),
    text: outputText,
    sender: 'assistant',
    type: 'tool-output',
    sourceEventType,
    sourceChannel,
    screenshot: screenshotState.screenshot,
    screenshotRef: screenshotState.screenshotRef,
    screenshotUrl: screenshotState.screenshotUrl,
    screenshotContentType: screenshotState.screenshotContentType,
    toolMetadata,
    ...(toolName ? { toolName } : {}),
    ...(executionTime !== null && executionTime !== undefined ? { executionTime } : {}),
    ...(success !== null && success !== undefined ? { success } : {}),
    ...(correlationId ? { correlationId } : {}),
    modelFacingToolOutput: outputText,
    toolOutputDetails,
    ...(turnRef ? { turnRef } : {}),
    ...(modelId ? { modelId } : {}),
    ...(modelProvider ? { modelProvider } : {}),
  };
}
