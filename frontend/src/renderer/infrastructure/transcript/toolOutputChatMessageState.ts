/**
 * Provides the tool output chat message state module for the renderer UI.
 */

import type { SdkDisplayAttachment } from '../../../../../packages/windie-sdk-js/src/conversation/types.js';

type ToolOutputChatMessageStateInput = {
  id?: string | null;
  outputText: string;
  sourceEventType?: string | null;
  sourceChannel?: string | null;
  correlationId?: string | null;
  toolOutputDetails?: Record<string, unknown> | null;
  attachments?: SdkDisplayAttachment[] | null;
  turnRef?: string | null;
  modelId?: string | null;
  modelProvider?: string | null;
  isComplete?: boolean | null;
  modelFacingToolOutput?: string | null;
  preserveNullToolOutputDetails?: boolean;
};

export function buildToolOutputChatMessageState({
  id = null,
  outputText,
  sourceEventType = null,
  sourceChannel = null,
  correlationId = null,
  toolOutputDetails = null,
  attachments = null,
  turnRef = null,
  modelId = null,
  modelProvider = null,
  isComplete = null,
  modelFacingToolOutput = outputText,
  preserveNullToolOutputDetails = true,
}: ToolOutputChatMessageStateInput) {
  return {
    id: id || crypto.randomUUID(),
    text: outputText,
    sender: 'assistant',
    type: 'tool-output',
    ...(sourceEventType ? { sourceEventType } : {}),
    ...(sourceChannel ? { sourceChannel } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(modelFacingToolOutput !== null ? { modelFacingToolOutput } : {}),
    ...(preserveNullToolOutputDetails || toolOutputDetails !== null ? { toolOutputDetails } : {}),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
    ...(turnRef ? { turnRef } : {}),
    ...(modelId ? { modelId } : {}),
    ...(modelProvider ? { modelProvider } : {}),
    ...(isComplete !== null && isComplete !== undefined ? { isComplete } : {}),
  };
}
