/**
 * Implements the desktop conversation continuity service service for the renderer UI.
 */

import {
  DesktopConversationRuntimeContracts,
  type ListConversationOptions,
  type DisplayConversation,
  type DisplayTimelineCheckpoint,
  type DisplayTimelineReplaceReason,
  type DisplayTimelineRow,
  type EditAndResendInput,
  type RetryTurnInput,
  type SdkDisplayRow,
  type ConversationView,
  type ConversationMetadata,
  type ConversationMetadataInvalidationListener,
  type CompactedReplaySnapshot,
  type TraceTimelineEntry,
  type TurnResult,
} from './desktopConversationRuntimeContracts';
import {
  createDesktopConversationStore,
  loadDesktopTraceTimeline,
  type DesktopTraceTimelineOptions,
} from '../../infrastructure/transcript/desktopConversationStore';
import { DesktopRuntimeTransport } from './desktopRuntimeTransport';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { AgentSdkCommandInvokeClient } from './agentSdkCommandInvokeClient';
import { DesktopDashboardConversationLoadRuntime } from './desktopDashboardConversationLoadRuntime';
import { IpcBridge } from '../../infrastructure/ipc/bridge';
import { DESKTOP_RUNTIME_ON_CHANNELS } from '../../infrastructure/ipc/channels';

const {
  ConversationContinuityService,
  SDK_RUNTIME_COMMANDS,
} = DesktopConversationRuntimeContracts;
const {
  invokeAgentSdkCommand,
} = AgentSdkCommandInvokeClient;
const {
  createDesktopRuntimeTransport,
} = DesktopRuntimeTransport;
const {
  metadataListToDashboardConversations,
} = DesktopDashboardConversationLoadRuntime;

type ReplaceDisplayRowsInput = {
  userId: string;
  conversationRef: string;
  baseRevisionId: string;
  reason: DisplayTimelineReplaceReason;
  rows: DisplayTimelineRow[];
};

type EditAndResendCommandInput = EditAndResendInput & {
  userId: string;
  conversationRef: string;
};

type RetryTurnCommandInput = RetryTurnInput & {
  userId: string;
  conversationRef: string;
};

type SearchConversationsInput = {
  userId: string;
  query: string;
  limit?: number;
};

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readSnapshotDisplayRows(
  snapshot: { view?: ConversationView | null; displayRows?: SdkDisplayRow[] } | null | undefined,
): SdkDisplayRow[] {
  if (Array.isArray(snapshot?.view?.displayRows)) {
    return snapshot.view.displayRows;
  }
  return Array.isArray(snapshot?.displayRows) ? snapshot.displayRows : [];
}

const desktopConversationContinuityService = new ConversationContinuityService({
  storeFactory: ({ userId }) => createDesktopConversationStore(userId),
  transportFactory: ({ workspacePath }) => createDesktopRuntimeTransport(workspacePath ?? null),
});

export const DesktopConversationContinuityService = {
  listMetadata(userId: string, options?: ListConversationOptions): Promise<ConversationMetadata[]> {
    return invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATIONS_LIST, {
      userId,
      limit: options?.limit,
    });
  },

  async loadForDisplay(userId: string, conversationRef: string): Promise<DisplayConversation> {
    const snapshot = await invokeAgentSdkCommand<{ display?: DisplayConversation }>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD_DISPLAY,
      {
        userId,
        conversationRef,
      },
    );
    return snapshot?.display ?? {
      conversationRef,
      revisionId: '',
      messages: [],
      compaction: { status: 'idle' },
    };
  },

  async loadDisplayRows(userId: string, conversationRef: string): Promise<SdkDisplayRow[]> {
    const snapshot = await invokeAgentSdkCommand<{
      view?: ConversationView | null;
      displayRows?: SdkDisplayRow[];
    }>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD_DISPLAY,
      {
        userId,
        conversationRef,
      },
    );
    return readSnapshotDisplayRows(snapshot);
  },

  async loadDisplayTimeline(
    userId: string,
    conversationRef: string,
    revisionId: string | null = null,
  ): Promise<DisplayTimelineCheckpoint> {
    return invokeAgentSdkCommand<DisplayTimelineCheckpoint>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD_DISPLAY_TIMELINE,
      {
        userId,
        conversationRef,
        revisionId: revisionId ?? undefined,
      },
    );
  },

  async replaceRows(input: ReplaceDisplayRowsInput): Promise<DisplayTimelineCheckpoint> {
    return invokeAgentSdkCommand<DisplayTimelineCheckpoint>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_REPLACE_ROWS,
      {
        userId: input.userId,
        conversationRef: input.conversationRef,
        baseRevisionId: input.baseRevisionId,
        reason: input.reason,
        rows: input.rows,
      },
    );
  },

  async editAndResend(input: EditAndResendCommandInput): Promise<TurnResult> {
    return invokeAgentSdkCommand<TurnResult>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_EDIT_AND_RESEND,
      {
        userId: input.userId,
        conversationRef: input.conversationRef,
        messageId: input.messageId,
        text: input.text,
        turnRef: input.turnRef,
        payload: input.payload,
        model: input.model,
      },
    );
  },

  async retryTurn(input: RetryTurnCommandInput): Promise<TurnResult> {
    return invokeAgentSdkCommand<TurnResult>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_RETRY_TURN,
      {
        userId: input.userId,
        conversationRef: input.conversationRef,
        messageId: input.messageId,
        turnRef: input.turnRef,
        payload: input.payload,
        model: input.model,
      },
    );
  },

  loadTraceTimeline(
    userId: string,
    conversationRef: string,
    options: DesktopTraceTimelineOptions = {},
  ): Promise<TraceTimelineEntry[]> {
    return loadDesktopTraceTimeline(userId, conversationRef, options);
  },

  async compactHistory(force: boolean = true, conversationRef: string | null = null): Promise<void> {
    const resolvedConversationRef = optionalString(conversationRef)
      ?? DesktopTranscriptSessionRuntimeClient.getActiveConversationRef();
    if (!resolvedConversationRef) {
      return;
    }
    await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_COMPACT, {
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
    return invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATIONS_DELETE, {
      userId,
      conversationRef,
    });
  },

  async searchConversations(input: SearchConversationsInput) {
    const metadata = await invokeAgentSdkCommand<ConversationMetadata[]>(SDK_RUNTIME_COMMANDS.CONVERSATIONS_SEARCH, {
      userId: input.userId,
      query: input.query,
      limit: input.limit,
    });
    return metadataListToDashboardConversations(metadata);
  },

  subscribeMetadataInvalidations(listener: ConversationMetadataInvalidationListener) {
    return IpcBridge.on(DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_METADATA_INVALIDATED, (event) => {
      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        return;
      }
      listener(event as Parameters<ConversationMetadataInvalidationListener>[0]);
    });
  },
};
