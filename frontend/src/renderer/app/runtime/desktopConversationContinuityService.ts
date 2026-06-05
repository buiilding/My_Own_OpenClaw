import {
  ConversationContinuityService,
  type JsonRecord,
  type WindieModelSelection,
  type ListConversationOptions,
  type RehydrateSnapshot,
  type DisplayConversation,
  type SdkDisplayRow,
  type ConversationMetadata,
  type ConversationMetadataInvalidationListener,
  type CompactedReplaySnapshot,
} from '../../infrastructure/api/windieSdkClient';
import {
  createDesktopConversationStore,
} from '../../infrastructure/transcript/desktopConversationStore';
import {
  loadLocalConversationSnapshot,
} from '../../infrastructure/transcript/conversationLocalSnapshotLoader';
import { createDesktopBackendTransport } from './desktopBackendTransport';
import { DesktopLocalRuntimeEventSource } from './desktopLocalRuntimeEventSource';
import { createIpcSidecarConversationStore } from '../../infrastructure/transcript/sdkSidecarConversationStore';
import type { LocalConversationSnapshot } from '../../infrastructure/transcript/conversationLocalSnapshotLoader';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { invokeWindieCommand } from './windieCommandInvokeClient';

export type { RehydrateConversationEntry };

type RehydrateConversationEntry = JsonRecord & {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  message_type?: string;
  tool_name?: string | null;
  correlation_id?: string | null;
  tool_call_id?: string | null;
  tool_calls?: Array<Record<string, unknown>> | null;
  timestamp?: string | null;
  screenshot_ref?: string | null;
  screenshot?: string | null;
  image_data?: string | string[] | null;
  transparency?: Record<string, unknown> | null;
  structured_content?: Array<Record<string, unknown>> | null;
  compaction_facts?: Record<string, unknown> | null;
  structured_payload?: Record<string, unknown> | null;
};

type LoadRehydrateSnapshotInput = {
  conversationRef: string;
  userId: string;
};

type RehydrateFromStoreInput = LoadRehydrateSnapshotInput & {
  workspacePath?: string | null;
};

type RehydrateMessagesInput = {
  conversationRef: string;
  messages: RehydrateConversationEntry[];
  workspacePath?: string | null;
};

type RewriteAndResendInput = {
  conversationRef: string;
  userId: string;
  messageId: string;
  userMessageOrdinal?: number;
  text?: string;
  payload?: JsonRecord;
  model?: WindieModelSelection | null;
  workspacePath?: string | null;
};

type PreparedReplayTurn = {
  conversationRef: string;
  text: string;
  payload: JsonRecord;
  model?: WindieModelSelection | null;
  workspacePath?: string | null;
  turnRef?: string | null;
};

type SearchConversationsInput = {
  userId: string;
  query: string;
  limit?: number;
};

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export const desktopConversationContinuityService = new ConversationContinuityService({
  storeFactory: ({ userId }) => createDesktopConversationStore(userId),
  transportFactory: ({ workspacePath }) => createDesktopBackendTransport(workspacePath ?? null),
  localRuntimeEventSource: DesktopLocalRuntimeEventSource,
});

export const desktopConversationMetadataService = new ConversationContinuityService({
  storeFactory: ({ userId }) => createIpcSidecarConversationStore(userId),
  localRuntimeEventSource: DesktopLocalRuntimeEventSource,
});

function metadataToDashboardConversation(metadata: ConversationMetadata) {
  return {
    conversation_id: metadata.conversationRef,
    record_kind: 'chat_event',
    title: metadata.title || metadata.conversationRef,
    last_message: metadata.lastMessage || '',
    last_timestamp: metadata.updatedAt,
    entry_count: metadata.eventCount,
    workspace_path: metadata.workspacePath || '',
    workspace_name: metadata.workspaceName || '',
    snippet: metadata.snippet || '',
    matched_role: metadata.matchedRole || '',
  };
}

export const DesktopConversationContinuityService = {
  listMetadata(userId: string, options?: ListConversationOptions): Promise<ConversationMetadata[]> {
    return desktopConversationMetadataService.listMetadata({ userId }, options);
  },

  loadForDisplay(userId: string, conversationRef: string): Promise<DisplayConversation> {
    return desktopConversationContinuityService.loadForDisplay({ userId, conversationRef });
  },

  loadDisplayRows(userId: string, conversationRef: string): Promise<SdkDisplayRow[]> {
    return desktopConversationContinuityService.loadDisplayRows({ userId, conversationRef });
  },

  loadRehydrateSnapshot(input: LoadRehydrateSnapshotInput): Promise<RehydrateSnapshot> {
    return desktopConversationContinuityService.loadRehydrateSnapshot(input);
  },

  rehydrateFromStore(input: RehydrateFromStoreInput) {
    return desktopConversationContinuityService.rehydrateFromStore(input);
  },

  async rehydrateMessages(input: RehydrateMessagesInput): Promise<void> {
    await invokeWindieCommand('conversation.rehydrate', {
      conversation_ref: input.conversationRef,
      messages: input.messages,
      rehydrate_mode: 'replace',
      workspace_path: optionalString(input.workspacePath),
    });
  },

  async prepareEditAndResend(input: RewriteAndResendInput): Promise<PreparedReplayTurn> {
    const prepared = await invokeWindieCommand<PreparedReplayTurn>('conversation.prepareEditAndResend', {
      userId: input.userId,
      conversationRef: input.conversationRef,
      messageId: input.messageId,
      userMessageOrdinal: input.userMessageOrdinal,
      text: input.text ?? '',
      payload: input.payload,
      model: input.model ?? undefined,
      workspace_path: input.workspacePath ?? null,
    });
    return {
      conversationRef: input.conversationRef,
      text: prepared.text,
      payload: prepared.payload,
      model: prepared.model ?? null,
      workspacePath: prepared.workspacePath ?? input.workspacePath ?? null,
      turnRef: prepared.turnRef ?? null,
    };
  },

  async prepareRetryTurn(input: RewriteAndResendInput): Promise<PreparedReplayTurn> {
    const prepared = await invokeWindieCommand<PreparedReplayTurn>('conversation.prepareRetryTurn', {
      userId: input.userId,
      conversationRef: input.conversationRef,
      messageId: input.messageId,
      userMessageOrdinal: input.userMessageOrdinal,
      payload: input.payload,
      model: input.model ?? undefined,
      workspace_path: input.workspacePath ?? null,
    });
    return {
      conversationRef: input.conversationRef,
      text: prepared.text,
      payload: prepared.payload,
      model: prepared.model ?? null,
      workspacePath: prepared.workspacePath ?? input.workspacePath ?? null,
      turnRef: prepared.turnRef ?? null,
    };
  },

  async compactHistory(force: boolean = true, conversationRef: string | null = null): Promise<void> {
    const resolvedConversationRef = optionalString(conversationRef)
      ?? DesktopTranscriptSessionRuntimeClient.getActiveConversationRef();
    if (!resolvedConversationRef) {
      return;
    }
    await invokeWindieCommand('conversation.compact', {
      force,
      conversation_ref: resolvedConversationRef,
    });
  },

  replaceCompactedReplay(snapshot: CompactedReplaySnapshot, userId: string) {
    return desktopConversationContinuityService.replaceCompactedReplay({
      userId,
      snapshot,
    });
  },

  deleteConversation(userId: string, conversationRef: string) {
    return desktopConversationMetadataService.deleteConversation({
      userId,
      conversationRef,
    });
  },

  loadLocalConversationSnapshot(
    input: Parameters<typeof loadLocalConversationSnapshot>[0],
  ): Promise<LocalConversationSnapshot> {
    return loadLocalConversationSnapshot(input);
  },

  async searchConversations(input: SearchConversationsInput) {
    const metadata = await desktopConversationMetadataService.searchMetadata({
      userId: input.userId,
    }, {
      query: input.query,
      limit: input.limit,
    });
    return metadata.map(metadataToDashboardConversation);
  },

  subscribeMetadataInvalidations(listener: ConversationMetadataInvalidationListener) {
    return desktopConversationMetadataService.subscribeMetadataInvalidations(listener);
  },
};
