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
import { createDesktopBackendTransport } from './desktopBackendTransport';
import { DesktopLocalRuntimeEventSource } from './desktopLocalRuntimeEventSource';
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

type LocalConversationSnapshotInput = {
  userId: string;
  conversationRef: string;
  conversation?: Record<string, unknown> | null;
  includeParsedMessages?: boolean;
  includeReplayState?: boolean;
};

type LocalConversationSnapshot = {
  transcriptEntries: JsonRecord[];
  replayEntries: JsonRecord[];
  workspaceBinding: {
    workspacePath: string;
    workspaceName: string;
  };
  parsedMessages: Array<Record<string, unknown>>;
  rehydrateMessages: Array<Record<string, unknown>>;
};

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export const desktopConversationContinuityService = new ConversationContinuityService({
  storeFactory: ({ userId }) => createDesktopConversationStore(userId),
  transportFactory: ({ workspacePath }) => createDesktopBackendTransport(workspacePath ?? null),
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

function displayRowsToParsedMessages(rows: SdkDisplayRow[] = []) {
  return rows.map((row) => ({
    id: row.id,
    text: typeof row.content === 'string' ? row.content : JSON.stringify(row.content),
    sender: row.role,
    role: row.role,
    message_type: row.type,
    timestamp: row.metadata?.timestamp ?? null,
  }));
}

function resolveWorkspaceBindingFromEvents(events: JsonRecord[] = []) {
  for (const event of events) {
    const payload = event?.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
      ? event.payload as JsonRecord
      : {};
    const workspacePath = optionalString(payload.workspacePath)
      ?? optionalString(payload.workspace_path);
    if (workspacePath) {
      return {
        workspacePath,
        workspaceName: optionalString(payload.workspaceName)
          ?? optionalString(payload.workspace_name)
          ?? '',
      };
    }
  }
  return {
    workspacePath: '',
    workspaceName: '',
  };
}

export const DesktopConversationContinuityService = {
  listMetadata(userId: string, options?: ListConversationOptions): Promise<ConversationMetadata[]> {
    return invokeWindieCommand('conversations.list', {
      userId,
      limit: options?.limit,
    });
  },

  async loadForDisplay(userId: string, conversationRef: string): Promise<DisplayConversation> {
    const snapshot = await invokeWindieCommand<{ display?: DisplayConversation }>('conversation.load', {
      userId,
      conversationRef,
    });
    return snapshot?.display ?? {
      conversationRef,
      revisionId: '',
      messages: [],
      compaction: { status: 'idle' },
    };
  },

  async loadDisplayRows(userId: string, conversationRef: string): Promise<SdkDisplayRow[]> {
    const snapshot = await invokeWindieCommand<{ displayRows?: SdkDisplayRow[] }>('conversation.load', {
      userId,
      conversationRef,
    });
    return Array.isArray(snapshot?.displayRows) ? snapshot.displayRows : [];
  },

  async loadRehydrateSnapshot(input: LoadRehydrateSnapshotInput): Promise<RehydrateSnapshot> {
    const snapshot = await invokeWindieCommand<{ rehydrate?: RehydrateSnapshot }>('conversation.load', {
      userId: input.userId,
      conversationRef: input.conversationRef,
    });
    return snapshot?.rehydrate ?? {
      conversationRef: input.conversationRef,
      revisionId: '',
      messages: [],
    };
  },

  async rehydrateFromStore(input: RehydrateFromStoreInput) {
    const snapshot = await this.loadRehydrateSnapshot(input);
    const messages = Array.isArray(snapshot.messages)
      ? snapshot.messages.filter((message): message is RehydrateConversationEntry => (
        Boolean(message)
        && typeof message === 'object'
        && !Array.isArray(message)
        && ['user', 'assistant', 'tool'].includes(String(message.role))
        && typeof message.content === 'string'
      ))
      : [];
    if (messages.length === 0) {
      return {
        conversationRef: input.conversationRef,
        revisionId: snapshot.revisionId,
        messageCount: 0,
        hydrated: false,
        replayGenerationId: snapshot.replayGenerationId ?? null,
      };
    }
    await this.rehydrateMessages({
      conversationRef: input.conversationRef,
      messages,
      workspacePath: input.workspacePath,
    });
    return {
      conversationRef: input.conversationRef,
      revisionId: snapshot.revisionId,
      messageCount: messages.length,
      hydrated: true,
      replayGenerationId: snapshot.replayGenerationId ?? null,
    };
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
    return invokeWindieCommand('conversations.delete', {
      userId,
      conversationRef,
    });
  },

  async loadLocalConversationSnapshot(
    input: LocalConversationSnapshotInput,
  ): Promise<LocalConversationSnapshot> {
    const snapshot = await invokeWindieCommand<{
      state?: { events?: JsonRecord[] };
      displayRows?: SdkDisplayRow[];
      rehydrate?: RehydrateSnapshot;
    }>('conversation.load', {
      userId: input.userId,
      conversationRef: input.conversationRef,
    });
    const events = Array.isArray(snapshot?.state?.events) ? snapshot.state.events : [];
    const displayRows = input.includeParsedMessages && Array.isArray(snapshot?.displayRows)
      ? snapshot.displayRows
      : [];
    return {
      transcriptEntries: events as LocalConversationSnapshot['transcriptEntries'],
      replayEntries: [],
      workspaceBinding: resolveWorkspaceBindingFromEvents(events),
      parsedMessages: displayRowsToParsedMessages(displayRows),
      rehydrateMessages: Array.isArray(snapshot?.rehydrate?.messages)
        ? snapshot.rehydrate.messages
        : [],
    };
  },

  async searchConversations(input: SearchConversationsInput) {
    const metadata = await invokeWindieCommand<ConversationMetadata[]>('conversations.search', {
      userId: input.userId,
      query: input.query,
      limit: input.limit,
    });
    return Array.isArray(metadata) ? metadata.map(metadataToDashboardConversation) : [];
  },

  subscribeMetadataInvalidations(listener: ConversationMetadataInvalidationListener) {
    return desktopConversationContinuityService.subscribeMetadataInvalidations(listener);
  },
};
