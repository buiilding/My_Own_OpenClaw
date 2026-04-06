import { appendConversationReplayEntry, ensureConversationReplayStateInitialized } from './conversationReplayState';
import { buildRehydrateMessagePayload } from './rehydrateMessageState';
import type { SessionInfo, TranscriptEntry } from './types';

type WorkspaceBinding = {
  workspacePath?: string | null;
  workspaceName?: string | null;
};

type StoreTranscriptEntryDeps = {
  resolveSessionInfoForEntry: (entry: TranscriptEntry) => SessionInfo;
  invokeStoreTranscript: (payload: Record<string, unknown>) => Promise<any>;
  resolveWorkspaceBinding: (conversationRef: string) => WorkspaceBinding;
  emitStoredEvent: (entry: TranscriptEntry, info: SessionInfo) => void;
};

function normalizeWorkspaceBinding(binding: WorkspaceBinding) {
  return {
    workspacePath: binding.workspacePath || null,
    workspaceName: binding.workspaceName || null,
  };
}

function buildStoreTranscriptPayload(
  entry: TranscriptEntry,
  info: SessionInfo,
  binding: ReturnType<typeof normalizeWorkspaceBinding>,
) {
  return {
    content: entry.content,
    userId: info.userId,
    conversationRef: info.conversationRef,
    role: entry.role,
    messageType: entry.messageType,
    toolName: entry.toolName,
    correlationId: entry.correlationId,
    modelId: entry.modelId,
    modelProvider: entry.modelProvider,
    screenshot: entry.screenshotRef,
    timestamp: entry.timestamp,
    workspacePath: binding.workspacePath,
    workspaceName: binding.workspaceName,
    ...(entry.transparency ? { transparency: entry.transparency } : {}),
    ...(entry.structuredPayload ? { structuredPayload: entry.structuredPayload } : {}),
  };
}

function buildReplayContext(
  info: SessionInfo,
  binding: ReturnType<typeof normalizeWorkspaceBinding>,
) {
  return {
    conversationRef: info.conversationRef,
    userId: info.userId,
    workspacePath: binding.workspacePath,
    workspaceName: binding.workspaceName,
  };
}

function buildReplayRehydrateEntry(entry: TranscriptEntry) {
  return buildRehydrateMessagePayload({
    role: entry.role || 'assistant',
    messageType: entry.messageType || null,
    rawContent: entry.content,
    timestamp: entry.timestamp || null,
    correlationId: entry.correlationId || null,
    transparency: entry.transparency || null,
    screenshotAttachment: entry.screenshotRef ? {
      screenshotRef: entry.screenshotRef,
      screenshot: null,
    } : null,
    structuredPayload: entry.structuredPayload || null,
    fallbackToolName: entry.toolName || null,
    fallbackToolCallId: entry.correlationId || null,
  });
}

export async function storeTranscriptEntry(
  entry: TranscriptEntry,
  deps: StoreTranscriptEntryDeps,
): Promise<void> {
  const info = deps.resolveSessionInfoForEntry(entry);
  if (!info.conversationRef || !info.userId) {
    return;
  }

  const binding = normalizeWorkspaceBinding(deps.resolveWorkspaceBinding(info.conversationRef));
  const storeResult = await deps.invokeStoreTranscript(
    buildStoreTranscriptPayload(entry, info, binding),
  );
  deps.emitStoredEvent(entry, info);

  const messageIndex = typeof storeResult?.data?.message_index === 'number'
    ? storeResult.data.message_index
    : null;
  const replayContext = buildReplayContext(info, binding);
  const replayInitState = await ensureConversationReplayStateInitialized(replayContext);
  if (replayInitState !== 'bootstrapped') {
    await appendConversationReplayEntry(
      replayContext,
      {
        messageIndex,
        rehydrateEntry: buildReplayRehydrateEntry(entry),
      },
    );
  }
}

