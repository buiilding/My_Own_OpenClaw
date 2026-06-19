/**
 * Implements the conversation continuity service service for the TypeScript SDK runtime.
 */

import type {
  AgentRuntimeTransport,
  CompactedReplaySnapshot,
  ConversationMetadata,
  ConversationStore,
  DisplayConversation,
  JsonRecord,
  ListConversationOptions,
  RehydratePayload,
  RehydrateSnapshot,
  SdkDisplayRow,
  SearchConversationOptions,
} from '../conversation/types.js';
import { searchConversationMetadata } from '../conversation/metadata.js';

type DeletableConversationStore = ConversationStore & {
  searchMetadata?: (options: SearchConversationOptions) => Promise<ConversationMetadata[]>;
  deleteConversation?: (conversationRef: string) => Promise<void>;
};

export type ConversationContinuityStoreFactory = (input: {
  userId: string;
}) => DeletableConversationStore;

export type ConversationContinuityTransportFactory = (input: {
  workspacePath?: string | null;
}) => Pick<AgentRuntimeTransport, 'rehydrateConversation'>;

export type ConversationMetadataInvalidationEvent = {
  type: 'conversation-metadata-invalidated';
  reason: string;
  conversationRef?: string | null;
  title?: string | null;
  source?: string | null;
  sourceEvent?: JsonRecord;
};

export type ConversationMetadataInvalidationListener = (
  event: ConversationMetadataInvalidationEvent,
) => void;

export type ConversationContinuityLocalRuntimeEventSource = {
  subscribeEvents?: (listener: (event: JsonRecord & { type?: unknown }) => void) => () => void;
};

export type ConversationContinuityServiceOptions = {
  storeFactory: ConversationContinuityStoreFactory;
  transportFactory?: ConversationContinuityTransportFactory;
  localRuntimeEventSource?: ConversationContinuityLocalRuntimeEventSource;
};

export type ConversationUserInput = {
  userId: string;
};

export type ConversationRefInput = ConversationUserInput & {
  conversationRef: string;
};

export type RehydrateConversationFromStoreInput = ConversationRefInput & {
  workspacePath?: string | null;
};

export type RehydrateConversationFromStoreResult = {
  conversationRef: string;
  revisionId: string;
  messageCount: number;
  hydrated: boolean;
  replayGenerationId?: string | null;
};

export type ReplaceCompactedReplayInput = ConversationUserInput & {
  snapshot: CompactedReplaySnapshot;
};

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function toProviderHistoryMessage(message: JsonRecord): JsonRecord | null {
  const role = message.role;
  if (role !== 'user' && role !== 'assistant' && role !== 'tool') {
    return null;
  }
  const content = typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content ?? '');
  return {
    ...message,
    role,
    content,
  };
}

function toProviderHistoryMessages(messages: JsonRecord[]): JsonRecord[] {
  return messages
    .map(toProviderHistoryMessage)
    .filter((message): message is JsonRecord => Boolean(message));
}

export function conversationMetadataInvalidationFromLocalRuntimeEvent(
  event: JsonRecord & { type?: unknown },
): ConversationMetadataInvalidationEvent | null {
  if (event.type !== 'conversation-title-updated') {
    return null;
  }
  const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
    ? event.payload as JsonRecord
    : {};
  return {
    type: 'conversation-metadata-invalidated',
    reason: 'conversation-title-updated',
    conversationRef: optionalString(payload.conversation_id),
    title: optionalString(payload.title),
    source: optionalString(payload.source),
    sourceEvent: event,
  };
}

export class ConversationContinuityService {
  constructor(private readonly options: ConversationContinuityServiceOptions) {}

  async listMetadata(
    input: ConversationUserInput,
    options?: ListConversationOptions,
  ): Promise<ConversationMetadata[]> {
    return this.storeFor(input).listMetadata(options);
  }

  async searchMetadata(
    input: ConversationUserInput,
    options: SearchConversationOptions,
  ): Promise<ConversationMetadata[]> {
    const store = this.storeFor(input);
    if (typeof store.searchMetadata === 'function') {
      return store.searchMetadata(options);
    }
    return searchConversationMetadata(await store.listMetadata(), options);
  }

  async loadForDisplay(input: ConversationRefInput): Promise<DisplayConversation> {
    return this.storeFor(input).loadForDisplay(input.conversationRef);
  }

  async loadDisplayRows(input: ConversationRefInput): Promise<SdkDisplayRow[]> {
    return this.storeFor(input).loadDisplayRows(input.conversationRef);
  }

  async loadRehydrateSnapshot(input: ConversationRefInput): Promise<RehydrateSnapshot> {
    return this.storeFor(input).loadForRehydrate(input.conversationRef);
  }

  async rehydrateFromStore(
    input: RehydrateConversationFromStoreInput,
  ): Promise<RehydrateConversationFromStoreResult> {
    const snapshot = await this.loadRehydrateSnapshot(input);
    const messages = toProviderHistoryMessages(snapshot.messages);
    if (messages.length === 0) {
      return {
        conversationRef: input.conversationRef,
        revisionId: snapshot.revisionId,
        messageCount: 0,
        hydrated: false,
        replayGenerationId: snapshot.replayGenerationId ?? null,
      };
    }

    const transport = this.options.transportFactory?.({
      workspacePath: input.workspacePath ?? null,
    });
    if (!transport) {
      throw new Error('Conversation continuity rehydrate requires an agent runtime transport');
    }

    const payload: RehydratePayload = {
      conversation_ref: input.conversationRef,
      messages,
      rehydrate_mode: 'replace',
      workspace_path: optionalString(input.workspacePath),
    };
    await transport.rehydrateConversation(payload);

    return {
      conversationRef: input.conversationRef,
      revisionId: snapshot.revisionId,
      messageCount: messages.length,
      hydrated: true,
      replayGenerationId: snapshot.replayGenerationId ?? null,
    };
  }

  async replaceCompactedReplay(input: ReplaceCompactedReplayInput): Promise<void> {
    await this.storeFor(input).replaceCompactedReplay(input.snapshot);
  }

  async deleteConversation(input: ConversationRefInput): Promise<void> {
    const store = this.storeFor(input);
    if (typeof store.deleteConversation === 'function') {
      await store.deleteConversation(input.conversationRef);
      return;
    }
    throw new Error('Conversation continuity delete requires a deletable conversation store');
  }

  subscribeMetadataInvalidations(listener: ConversationMetadataInvalidationListener): () => void {
    const source = this.options.localRuntimeEventSource;
    if (typeof source?.subscribeEvents !== 'function') {
      return () => {};
    }
    return source.subscribeEvents((event) => {
      const invalidation = conversationMetadataInvalidationFromLocalRuntimeEvent(event);
      if (invalidation) {
        listener(invalidation);
      }
    });
  }

  private storeFor(input: ConversationUserInput): DeletableConversationStore {
    return this.options.storeFactory({ userId: input.userId });
  }
}
