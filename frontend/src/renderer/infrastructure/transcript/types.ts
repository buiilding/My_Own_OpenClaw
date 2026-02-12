export type SessionInfo = {
  conversationRef: string | null;
  userId: string | null;
};

export type PendingUserMessage = {
  text: string;
  screenshotRef?: string | null;
  timestamp?: string;
  modelId?: string | null;
  modelProvider?: string | null;
};

export type PendingToolMessage = {
  text: string;
  messageType: string;
  toolName?: string | null;
  correlationId?: string | null;
  modelId?: string | null;
  modelProvider?: string | null;
  screenshotRef?: string | null;
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
};
