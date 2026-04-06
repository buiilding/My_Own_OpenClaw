export type SessionInfo = {
  conversationRef: string | null;
  userId: string | null;
};

export type TranscriptTransparencyData = {
  systemPrompt?: string | null;
  toolSchemas?: unknown[] | null;
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
  modelId?: string | null;
  modelProvider?: string | null;
  screenshotRef?: string | null;
  transparency?: TranscriptTransparencyData | null;
  structuredPayload?: TranscriptStructuredToolPayload | null;
};

export type PendingAssistantMessage = {
  text: string;
  messageType?: string;
  modelId?: string | null;
  modelProvider?: string | null;
  screenshotRef?: string | null;
  transparency?: TranscriptTransparencyData | null;
  structuredPayload?: TranscriptStructuredToolPayload | null;
};

export type TranscriptEntry = {
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
};
