import type { WindieModelSelection } from '../../infrastructure/api/windieSdkClient';
import {
  type BackendTransport,
  type JsonRecord,
  createConversationRuntime,
} from '../../infrastructure/api/windieSdkClient';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { DesktopSettingsRuntimeClient } from './desktopSettingsRuntimeClient';
import {
  DesktopBackendCommandRuntimeClient,
  type RehydrateConversationEntry,
  type SendConversationQueryInput as BackendSendConversationQueryInput,
  type SendConversationRehydrateInput,
} from './desktopBackendCommandRuntimeClient';
import {
  loadLocalConversationSnapshot,
  type LocalConversationSnapshot,
} from '../../infrastructure/transcript/conversationLocalSnapshotLoader';
import {
  DesktopTranscriptProjectionRuntimeClient,
  type LoadRehydrateSnapshotInput,
  type TranscriptProjectionRewriteEntry,
} from './desktopTranscriptProjectionRuntimeClient';
import type { CompactedReplaySnapshot } from '../../infrastructure/api/windieSdkClient';

export type { RehydrateConversationEntry };

type SendConversationQueryInput = {
  text: BackendSendConversationQueryInput['text'];
  conversationRef: BackendSendConversationQueryInput['conversationRef'];
  screenshotRef?: BackendSendConversationQueryInput['screenshotRef'];
  screenshotUrl?: BackendSendConversationQueryInput['screenshotUrl'];
  screenshotRefs?: BackendSendConversationQueryInput['screenshotRefs'];
  captureMeta?: BackendSendConversationQueryInput['captureMeta'];
  attachmentContext?: BackendSendConversationQueryInput['attachmentContext'];
  attachmentFilenames?: BackendSendConversationQueryInput['attachmentFilenames'];
  screenshot?: BackendSendConversationQueryInput['screenshot'];
  workspacePath?: BackendSendConversationQueryInput['workspacePath'];
  transcript?: {
    userId?: string | null;
    timestamp?: string | null;
    screenshotRef?: string | null;
  } | null;
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

type RehydrateFromStoreInput = LoadRehydrateSnapshotInput & {
  workspacePath?: string | null;
};

type ReplaceCompactedReplayFromBackendEventInput = {
  event: JsonRecord;
  conversationRef: string;
  userId?: string | null;
};

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function optionalStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());
  return normalized.length > 0 ? normalized : null;
}

function toRehydrateConversationEntry(message: JsonRecord): RehydrateConversationEntry | null {
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
  } as RehydrateConversationEntry;
}

function toRehydrateConversationEntries(messages: JsonRecord[]): RehydrateConversationEntry[] {
  return messages
    .map(toRehydrateConversationEntry)
    .filter((message): message is RehydrateConversationEntry => Boolean(message));
}

function resolveReplacementHistoryEntries(event: JsonRecord): JsonRecord[] {
  const payload = event.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [];
  }
  const entries = (payload as JsonRecord).replacement_history_entries;
  return Array.isArray(entries)
    ? entries.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function buildCompactedReplaySnapshotFromBackendEvent({
  event,
  conversationRef,
}: ReplaceCompactedReplayFromBackendEventInput): CompactedReplaySnapshot | null {
  const entries = resolveReplacementHistoryEntries(event);
  if (entries.length === 0) {
    return null;
  }
  const eventId = optionalString(event.id);
  const turnRef = optionalString(event.turn_ref) ?? optionalString(event.turnRef);
  const stableSuffix = eventId ?? turnRef ?? `${Date.now()}`;
  return {
    generationId: `compaction-${conversationRef}-${stableSuffix}`,
    conversationRef,
    sourceRevisionId: `rev-compaction-${conversationRef}-${stableSuffix}`,
    sourceTurnRef: turnRef,
    createdAt: new Date().toISOString(),
    entries,
    entryCount: entries.length,
    complete: true,
    active: true,
  };
}

function createDesktopBackendTransport(workspacePath: string | null = null): BackendTransport {
  return {
    connect: async () => undefined,
    handshake: async () => undefined,
    sendQuery: async (payload) => {
      await DesktopBackendCommandRuntimeClient.sendQuery({
        text: optionalString(payload.text) ?? '',
        conversationRef: optionalString(payload.conversation_ref)
          ?? optionalString(payload.conversationRef)
          ?? '',
        screenshotRef: optionalString(payload.screenshot_ref)
          ?? optionalString(payload.screenshotRef),
        screenshotUrl: optionalString(payload.screenshot_url)
          ?? optionalString(payload.screenshotUrl),
        screenshotRefs: optionalStringArray(payload.screenshot_refs)
          ?? optionalStringArray(payload.screenshotRefs),
        captureMeta: (payload.capture_meta ?? payload.captureMeta ?? null) as SendConversationQueryInput['captureMeta'],
        attachmentContext: optionalString(payload.attachment_context)
          ?? optionalString(payload.attachmentContext),
        attachmentFilenames: optionalStringArray(payload.attachment_filenames)
          ?? optionalStringArray(payload.attachmentFilenames),
        screenshot: optionalString(payload.screenshot),
        workspacePath: optionalString(payload.workspace_path)
          ?? optionalString(payload.workspacePath)
          ?? workspacePath,
      });
      return optionalString(payload.turn_ref) ?? optionalString(payload.turnRef) ?? '';
    },
    sendToolResult: async () => undefined,
    sendToolBundleResult: async () => undefined,
    rehydrateConversation: async (payload) => {
      await DesktopBackendCommandRuntimeClient.rehydrateConversation({
        conversationRef: optionalString(payload.conversation_ref)
          ?? optionalString(payload.conversationRef)
          ?? '',
        messages: Array.isArray(payload.messages)
          ? payload.messages as RehydrateConversationEntry[]
          : [],
        workspacePath: optionalString(payload.workspace_path)
          ?? optionalString(payload.workspacePath)
          ?? workspacePath,
      });
    },
    compactHistory: async () => undefined,
    wakewordDetected: async () => undefined,
    updateSettings: async (payload) => {
      DesktopSettingsRuntimeClient.updateSettings(payload);
      return undefined;
    },
    listModels: async () => undefined,
    stop: async (payload) => {
      DesktopBackendCommandRuntimeClient.stop(
        optionalString(payload.conversation_ref) ?? optionalString(payload.conversationRef),
      );
    },
    subscribe: () => () => undefined,
    close: async () => undefined,
  };
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

/**
 * Renderer command facade for the SDK runtime hosted by Electron main.
 *
 * Feature code should use this app runtime module instead of importing
 * low-level backend IPC or transcript storage adapters directly.
 */
export const DesktopConversationRuntimeClient = {
  getActiveConversationRef(): string | null {
    return DesktopTranscriptSessionRuntimeClient.getActiveConversationRef();
  },

  getTranscriptSessionInfo(): ReturnType<typeof DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo> {
    return DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();
  },

  setActiveConversationRef(conversationRef: string | null): void {
    DesktopTranscriptSessionRuntimeClient.setActiveConversationRef(conversationRef);
  },

  updateTranscriptSession(
    conversationRef?: string | null,
    userId?: string | null,
  ): void {
    DesktopTranscriptSessionRuntimeClient.updateTranscriptSession(conversationRef, userId);
  },

  setModel(selection: WindieModelSelection): void {
    DesktopSettingsRuntimeClient.setModel(selection);
  },

  recordAssistantMessage(
    text: string,
    options: Parameters<typeof DesktopTranscriptProjectionRuntimeClient.recordAssistantMessage>[1] = {},
  ): void {
    DesktopTranscriptProjectionRuntimeClient.recordAssistantMessage(text, options);
  },

  recordToolMessage(
    text: string,
    options: Parameters<typeof DesktopTranscriptProjectionRuntimeClient.recordToolMessage>[1],
  ): void {
    DesktopTranscriptProjectionRuntimeClient.recordToolMessage(text, options);
  },

  async replaceCompactedReplay(
    snapshot: CompactedReplaySnapshot,
    userId: string,
  ): Promise<void> {
    await DesktopTranscriptProjectionRuntimeClient.replaceCompactedReplay(snapshot, userId);
  },

  async replaceCompactedReplayFromBackendEvent(
    input: ReplaceCompactedReplayFromBackendEventInput,
  ): Promise<void> {
    const snapshot = buildCompactedReplaySnapshotFromBackendEvent(input);
    if (!snapshot) {
      return;
    }
    await DesktopTranscriptProjectionRuntimeClient.replaceCompactedReplay(
      snapshot,
      input.userId || 'default_user',
    );
  },

  async loadRehydrateSnapshot(input: LoadRehydrateSnapshotInput) {
    return DesktopTranscriptProjectionRuntimeClient.loadRehydrateSnapshot(input);
  },

  async rehydrateFromStore(input: RehydrateFromStoreInput): Promise<void> {
    const snapshot = await DesktopTranscriptProjectionRuntimeClient.loadRehydrateSnapshot(input);
    const messages = toRehydrateConversationEntries(snapshot.messages);
    if (messages.length === 0) {
      return;
    }
    await DesktopBackendCommandRuntimeClient.rehydrateConversation({
      conversationRef: input.conversationRef,
      messages,
      workspacePath: input.workspacePath ?? null,
    });
  },

  async loadLocalConversationSnapshot(
    input: Parameters<typeof loadLocalConversationSnapshot>[0],
  ): Promise<LocalConversationSnapshot> {
    return loadLocalConversationSnapshot(input);
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

  sendQuery(input: SendConversationQueryInput): Promise<void> {
    if (input.transcript) {
      DesktopTranscriptProjectionRuntimeClient.recordUserMessage(input.text, {
        conversationRef: input.conversationRef,
        userId: input.transcript.userId ?? null,
        timestamp: input.transcript.timestamp ?? undefined,
        screenshotRef: input.transcript.screenshotRef ?? input.screenshotRef ?? null,
      });
    }
    return DesktopBackendCommandRuntimeClient.sendQuery(input);
  },

  rehydrate(input: SendConversationRehydrateInput): Promise<void> {
    return DesktopBackendCommandRuntimeClient.rehydrateConversation(input);
  },

  stop(conversationRef: string | null = null): void {
    DesktopBackendCommandRuntimeClient.stop(conversationRef);
  },

  compactHistory(force: boolean = true, conversationRef: string | null = null): void {
    DesktopBackendCommandRuntimeClient.compactHistory(force, conversationRef);
  },
};
