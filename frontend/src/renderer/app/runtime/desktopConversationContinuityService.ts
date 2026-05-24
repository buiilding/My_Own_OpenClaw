import {
  ConversationContinuityService,
  type JsonRecord,
  InMemoryConversationStore,
  type WindieModelSelection,
  type ListConversationOptions,
  type RehydrateSnapshot,
  type DisplayConversation,
  type ConversationMetadata,
  type ConversationMetadataInvalidationListener,
  type CompactedReplaySnapshot,
  createConversationRuntime,
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
import {
  DesktopTranscriptProjectionRuntimeClient,
  type TranscriptProjectionRewriteEntry,
} from './desktopTranscriptProjectionRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';

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
  text?: string;
  projectionEntries: TranscriptProjectionRewriteEntry[];
  payload?: JsonRecord;
  model?: WindieModelSelection | null;
  workspacePath?: string | null;
};

type SearchConversationsInput = {
  userId: string;
  query: string;
  limit?: number;
};

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

class StaticRehydrateConversationStore extends InMemoryConversationStore {
  constructor(
    private readonly conversationRef: string,
    private readonly messages: RehydrateConversationEntry[],
  ) {
    super();
  }

  async loadForRehydrate(): Promise<RehydrateSnapshot> {
    return {
      conversationRef: this.conversationRef,
      revisionId: `rev-rehydrate-${this.conversationRef}`,
      messages: this.messages,
    };
  }
}

async function createSeededConversationRuntime({
  conversationRef,
  userId,
  projectionEntries,
  workspacePath,
}: Pick<RewriteAndResendInput, 'conversationRef' | 'userId' | 'projectionEntries' | 'workspacePath'>) {
  const store = await DesktopTranscriptProjectionRuntimeClient.createSeededConversationStore({
    conversationRef,
    userId,
    projectionEntries,
  });
  const runtime = createConversationRuntime({
    conversationRef,
    store,
    transport: createDesktopBackendTransport(workspacePath ?? null),
  });
  await runtime.load();
  return runtime;
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

  loadRehydrateSnapshot(input: LoadRehydrateSnapshotInput): Promise<RehydrateSnapshot> {
    return desktopConversationContinuityService.loadRehydrateSnapshot(input);
  },

  rehydrateFromStore(input: RehydrateFromStoreInput) {
    return desktopConversationContinuityService.rehydrateFromStore(input);
  },

  async rehydrateMessages(input: RehydrateMessagesInput): Promise<void> {
    const runtime = createConversationRuntime({
      conversationRef: input.conversationRef,
      store: new StaticRehydrateConversationStore(input.conversationRef, input.messages),
      transport: createDesktopBackendTransport(input.workspacePath ?? null),
    });
    await runtime.rehydrate();
  },

  async editAndResend(input: RewriteAndResendInput): Promise<void> {
    const runtime = await createSeededConversationRuntime(input);
    await runtime.editAndResend({
      messageId: input.messageId,
      text: input.text ?? '',
      payload: input.payload,
      model: input.model ?? undefined,
    });
  },

  async retryTurn(input: RewriteAndResendInput): Promise<void> {
    const runtime = await createSeededConversationRuntime(input);
    await runtime.retryTurn({
      messageId: input.messageId,
      payload: input.payload,
      model: input.model ?? undefined,
    });
  },

  async compactHistory(force: boolean = true, conversationRef: string | null = null): Promise<void> {
    const resolvedConversationRef = optionalString(conversationRef)
      ?? DesktopTranscriptSessionRuntimeClient.getActiveConversationRef();
    if (!resolvedConversationRef) {
      return;
    }
    const runtime = createConversationRuntime({
      conversationRef: resolvedConversationRef,
      store: new InMemoryConversationStore(),
      transport: createDesktopBackendTransport(null),
    });
    await runtime.compactHistory({ force });
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
