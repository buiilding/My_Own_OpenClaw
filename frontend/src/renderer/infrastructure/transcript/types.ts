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
