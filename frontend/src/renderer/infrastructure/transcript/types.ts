/**
 * Defines types contracts for the renderer UI.
 */

import type { ToolSchema } from '../../types/toolSchemas';

export type SessionInfo = {
  conversationRef: string | null;
  userId: string | null;
};

export type TranscriptTransparencyData = {
  systemPrompt?: string | null;
  toolSchemas?: ToolSchema[] | null;
  fullUserMessage?: {
    content?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;
  fullAssistantMessage?: {
    content?: string | null;
  } | null;
};

export type TranscriptStructuredToolPayload = {
  kind: 'tool-call' | 'tool-bundle' | 'tool-output';
  toolCall?: Record<string, unknown> | null;
  toolCalls?: Record<string, unknown>[] | null;
  toolCallDetails?: Record<string, unknown> | null;
};

export type PendingUserMessage = {
  text: string;
  messageId?: string | null;
  screenshotRef?: string | null;
  timestamp?: string;
  modelId?: string | null;
  modelProvider?: string | null;
  transparency?: TranscriptTransparencyData | null;
};

export type PendingToolMessage = {
  text: string;
  messageType: string;
  toolName?: string | null;
  correlationId?: string | null;
  timestamp?: string;
  modelId?: string | null;
  modelProvider?: string | null;
  screenshotRef?: string | null;
  transparency?: TranscriptTransparencyData | null;
  structuredPayload?: TranscriptStructuredToolPayload | null;
};

export type PendingAssistantMessage = {
  text: string;
  messageType?: string;
  timestamp?: string;
  modelId?: string | null;
  modelProvider?: string | null;
  screenshotRef?: string | null;
  transparency?: TranscriptTransparencyData | null;
  structuredPayload?: TranscriptStructuredToolPayload | null;
};

export type TranscriptEntry = {
  messageId?: string | null;
  content: string;
  role?: string | null;
  messageType?: string | null;
  toolName?: string | null;
  correlationId?: string | null;
  conversationRef?: string | null;
  userId?: string | null;
  timestamp?: string;
  modelId?: string | null;
  modelProvider?: string | null;
  screenshotRef?: string | null;
  transparency?: TranscriptTransparencyData | null;
  structuredPayload?: TranscriptStructuredToolPayload | null;
};
