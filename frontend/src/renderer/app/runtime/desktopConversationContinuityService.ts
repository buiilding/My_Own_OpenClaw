/**
 * Implements the desktop conversation continuity service service for the renderer UI.
 */

import {
  DesktopConversationRuntimeContracts,
  type AgentModelSelection,
  type JsonRecord,
  type ListConversationOptions,
  type DisplayConversation,
  type SdkDisplayRow,
  type ConversationMetadata,
  type ConversationMetadataInvalidationListener,
  type CompactedReplaySnapshot,
  type TraceTimelineEntry,
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

type RewriteAndResendInput = {
  conversationRef: string;
  userId: string;
  messageId: string;
  text?: string;
  payload?: JsonRecord;
  model?: AgentModelSelection | null;
  workspacePath?: string | null;
};

type PreparedReplayTurn = {
  conversationRef: string;
  text: string;
  payload: JsonRecord;
  model?: AgentModelSelection | null;
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
    const snapshot = await invokeAgentSdkCommand<{ displayRows?: SdkDisplayRow[] }>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD_DISPLAY,
      {
        userId,
        conversationRef,
      },
    );
    return Array.isArray(snapshot?.displayRows) ? snapshot.displayRows : [];
  },

  loadTraceTimeline(
    userId: string,
    conversationRef: string,
    options: DesktopTraceTimelineOptions = {},
  ): Promise<TraceTimelineEntry[]> {
    return loadDesktopTraceTimeline(userId, conversationRef, options);
  },

  async prepareEditAndResend(input: RewriteAndResendInput): Promise<PreparedReplayTurn> {
    const prepared = await invokeAgentSdkCommand<PreparedReplayTurn>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_PREPARE_EDIT_AND_RESEND,
      {
        userId: input.userId,
        conversationRef: input.conversationRef,
        messageId: input.messageId,
        text: input.text ?? '',
        payload: input.payload,
        model: input.model ?? undefined,
        workspace_path: input.workspacePath ?? null,
      },
    );
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
    const prepared = await invokeAgentSdkCommand<PreparedReplayTurn>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_PREPARE_RETRY_TURN,
      {
        userId: input.userId,
        conversationRef: input.conversationRef,
        messageId: input.messageId,
        payload: input.payload,
        model: input.model ?? undefined,
        workspace_path: input.workspacePath ?? null,
      },
    );
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
