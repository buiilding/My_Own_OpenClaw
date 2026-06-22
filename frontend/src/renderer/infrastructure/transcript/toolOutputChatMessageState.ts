/**
 * Provides the tool output chat message state module for the renderer UI.
 */

import { buildMessageScreenshotState, resolveScreenshotAttachmentState } from '../services/screenshotMessageState';
import type { SdkDisplayAttachment } from '../../../../../packages/windie-sdk-js/src/conversation/types.js';

type ToolOutputChatMessageStateInput = {
  id?: string | null;
  outputText: string;
  sourceEventType?: string | null;
  sourceChannel?: string | null;
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
  attachments?: SdkDisplayAttachment[] | null;
  turnRef?: string | null;
  modelId?: string | null;
  modelProvider?: string | null;
  isComplete?: boolean | null;
  modelFacingToolOutput?: string | null;
  deriveScreenshotUrlFromRef?: boolean;
  preserveNullAttachmentFields?: boolean;
  preserveNullToolMetadata?: boolean;
  preserveNullToolOutputDetails?: boolean;
};

export function buildToolOutputChatMessageState({
  id = null,
  outputText,
  sourceEventType = null,
  sourceChannel = null,
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
  attachments = null,
  turnRef = null,
  modelId = null,
  modelProvider = null,
  isComplete = null,
  modelFacingToolOutput = outputText,
  deriveScreenshotUrlFromRef = true,
  preserveNullAttachmentFields = true,
  preserveNullToolMetadata = true,
  preserveNullToolOutputDetails = true,
}: ToolOutputChatMessageStateInput) {
  const screenshotState = preserveNullAttachmentFields
    ? buildMessageScreenshotState({
      screenshot,
      screenshotRef,
      screenshotUrl,
      screenshotContentType,
    })
    : resolveScreenshotAttachmentState({
      screenshot,
      screenshotRef,
      screenshotUrl,
      screenshotContentType,
      preserveInlineScreenshotWithRemote: false,
      deriveUrlFromRef: deriveScreenshotUrlFromRef,
    });

  const screenshotFields = preserveNullAttachmentFields
    ? {
      screenshot: screenshotState.screenshot,
      screenshotRef: screenshotState.screenshotRef,
      screenshotUrl: screenshotState.screenshotUrl,
      screenshotContentType: screenshotState.screenshotContentType,
    }
    : {
      ...(screenshotState.screenshot ? { screenshot: screenshotState.screenshot } : {}),
      ...(screenshotState.screenshotRef ? { screenshotRef: screenshotState.screenshotRef } : {}),
      ...(screenshotState.screenshotUrl ? { screenshotUrl: screenshotState.screenshotUrl } : {}),
      ...(screenshotState.screenshotContentType ? { screenshotContentType: screenshotState.screenshotContentType } : {}),
    };

  return {
    id: id || crypto.randomUUID(),
    text: outputText,
    sender: 'assistant',
    type: 'tool-output',
    ...(sourceEventType ? { sourceEventType } : {}),
    ...(sourceChannel ? { sourceChannel } : {}),
    ...screenshotFields,
    ...(preserveNullToolMetadata || toolMetadata !== null ? { toolMetadata } : {}),
    ...(toolName ? { toolName } : {}),
    ...(executionTime !== null && executionTime !== undefined ? { executionTime } : {}),
    ...(success !== null && success !== undefined ? { success } : {}),
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
