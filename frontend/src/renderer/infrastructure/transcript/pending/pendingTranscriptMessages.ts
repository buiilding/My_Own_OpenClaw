import { createPendingAssistantQueue } from './pendingAssistantQueue';
import { createPendingToolQueue } from './pendingToolQueue';
import { createPendingUserQueue } from './pendingUserQueue';
import { flushPendingEntries, requeuePending } from './transcriptPendingFlush';
import type {
  PendingAssistantMessage,
  PendingToolMessage,
  PendingUserMessage,
  SessionInfo,
  TranscriptEntry,
  TranscriptStructuredToolPayload,
  TranscriptTransparencyData,
} from '../types';

type WarnFn = (message: string, error: unknown) => void;

type PendingTranscriptMessagesDependencies = {
  storeTranscriptEntry: (entry: TranscriptEntry) => Promise<void>;
  warn: WarnFn;
};

type UserRetryOptions = {
  timestamp?: string;
  modelId?: string | null;
  modelProvider?: string | null;
  screenshotRef?: string | null;
  transparency?: TranscriptTransparencyData | null;
};

type AssistantRetryOptions = {
  messageType?: string;
  modelId?: string | null;
  modelProvider?: string | null;
  screenshotRef?: string | null;
  transparency?: TranscriptTransparencyData | null;
};

type ToolRetryOptions = {
  messageType: string;
  toolName?: string;
  correlationId?: string;
  modelId?: string | null;
  modelProvider?: string | null;
  screenshotRef?: string | null;
  transparency?: TranscriptTransparencyData | null;
  structuredPayload?: TranscriptStructuredToolPayload | null;
};

type PendingTranscriptMessages = {
  hasPendingEntries: () => boolean;
  flushPendingMessages: (sessionInfo: SessionInfo) => Promise<void>;
  queueUserMessageForRetry: (
    text: string,
    options?: UserRetryOptions,
  ) => void;
  queueAssistantMessageForRetry: (
    text: string,
    options?: AssistantRetryOptions,
  ) => void;
  queueToolMessageForRetry: (
    text: string,
    options: ToolRetryOptions,
  ) => void;
};

export function createPendingTranscriptMessages({
  storeTranscriptEntry,
  warn,
}: PendingTranscriptMessagesDependencies): PendingTranscriptMessages {
  const pendingAssistantQueue = createPendingAssistantQueue();
  const pendingUserQueue = createPendingUserQueue();
  const pendingToolQueue = createPendingToolQueue();

  const flushPendingMessages = async (sessionInfo: SessionInfo): Promise<void> => {
    if (
      !sessionInfo.conversationRef
      || !sessionInfo.userId
      || (
        pendingUserQueue.size() === 0
        && pendingAssistantQueue.size() === 0
        && pendingToolQueue.size() === 0
      )
    ) {
      return;
    }

    const pendingUserMessages = pendingUserQueue.drain();
    const flushedUserMessages = await flushPendingEntries<PendingUserMessage>({
      messages: pendingUserMessages,
      toTranscriptEntry: (message) => ({
        content: message.text,
        role: 'user',
        messageType: 'user',
        timestamp: message.timestamp,
        modelId: message.modelId,
        modelProvider: message.modelProvider,
        screenshotRef: message.screenshotRef,
        transparency: message.transparency,
      }),
      requeue: (messages) => requeuePending(messages, pendingUserQueue.enqueue),
      category: 'user',
      storeTranscriptEntry,
      warn,
    });
    if (!flushedUserMessages) {
      return;
    }

    const pendingAssistantMessages = pendingAssistantQueue.drain();
    const flushedAssistantMessages = await flushPendingEntries<PendingAssistantMessage>({
      messages: pendingAssistantMessages,
      toTranscriptEntry: (message) => ({
        content: message.text,
        role: 'assistant',
        messageType: message.messageType || 'llm-text',
        modelId: message.modelId,
        modelProvider: message.modelProvider,
        screenshotRef: message.screenshotRef,
        transparency: message.transparency,
      }),
      requeue: (messages) => requeuePending(messages, pendingAssistantQueue.enqueue),
      category: 'assistant',
      storeTranscriptEntry,
      warn,
    });
    if (!flushedAssistantMessages) {
      return;
    }

    const pendingToolMessages = pendingToolQueue.drain();
    await flushPendingEntries<PendingToolMessage>({
      messages: pendingToolMessages,
      toTranscriptEntry: (message) => ({
        content: message.text,
        role: message.messageType === 'tool-call' ? 'assistant' : 'tool',
        messageType: message.messageType,
        toolName: message.toolName || undefined,
        correlationId: message.correlationId || undefined,
        modelId: message.modelId,
        modelProvider: message.modelProvider,
        screenshotRef: message.screenshotRef,
        transparency: message.transparency,
        structuredPayload: message.structuredPayload,
      }),
      requeue: (messages) => requeuePending(messages, pendingToolQueue.enqueue),
      category: 'tool',
      storeTranscriptEntry,
      warn,
    });
  };

  return {
    hasPendingEntries: () => (
      pendingUserQueue.size() > 0
      || pendingAssistantQueue.size() > 0
      || pendingToolQueue.size() > 0
    ),
    flushPendingMessages,
    queueUserMessageForRetry: (
      text: string,
      options: UserRetryOptions = {},
    ) => {
      pendingUserQueue.enqueue({
        text,
        timestamp: options.timestamp,
        modelId: options.modelId,
        modelProvider: options.modelProvider,
        screenshotRef: options.screenshotRef,
        transparency: options.transparency,
      });
    },
    queueAssistantMessageForRetry: (
      text: string,
      options: AssistantRetryOptions = {},
    ) => {
      pendingAssistantQueue.enqueue({
        text,
        messageType: options.messageType,
        modelId: options.modelId,
        modelProvider: options.modelProvider,
        screenshotRef: options.screenshotRef,
        transparency: options.transparency,
      });
    },
    queueToolMessageForRetry: (
      text: string,
      options: ToolRetryOptions,
    ) => {
      pendingToolQueue.enqueue({
        text,
        messageType: options.messageType,
        toolName: options.toolName,
        correlationId: options.correlationId,
        modelId: options.modelId,
        modelProvider: options.modelProvider,
        screenshotRef: options.screenshotRef,
        transparency: options.transparency,
        structuredPayload: options.structuredPayload,
      });
    },
  };
}
