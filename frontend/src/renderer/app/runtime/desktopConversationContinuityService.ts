/**
 * Implements the desktop conversation continuity service service for the renderer UI.
 */

import {
  DesktopConversationRuntimeContracts,
  type ListConversationOptions,
  type CheckoutRevisionInput,
  type CheckoutRevisionResult,
  type EditAndResendInput,
  type ForkConversationInput,
  type ForkConversationResult,
  type RetryTurnInput,
  type ConversationMetadata,
  type ConversationRevision,
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

type EditAndResendCommandInput = Omit<EditAndResendInput, 'turnRef'> & {
  userId: string;
  conversationRef: string;
};

type RetryTurnCommandInput = Omit<RetryTurnInput, 'turnRef'> & {
  userId: string;
  conversationRef: string;
};

type CheckoutRevisionCommandInput = CheckoutRevisionInput & {
  userId: string;
  conversationRef: string;
};

type ForkConversationCommandInput = ForkConversationInput & {
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

  async editAndResend(input: EditAndResendCommandInput): Promise<TurnResult> {
    return invokeAgentSdkCommand<TurnResult>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_EDIT_AND_RESEND,
      {
        userId: input.userId,
        conversationRef: input.conversationRef,
        messageId: input.messageId,
        text: input.text,
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
        payload: input.payload,
        model: input.model,
      },
    );
  },

  async checkoutRevision(input: CheckoutRevisionCommandInput): Promise<CheckoutRevisionResult> {
    return invokeAgentSdkCommand<CheckoutRevisionResult>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_CHECKOUT_REVISION,
      {
        userId: input.userId,
        conversationRef: input.conversationRef,
        revisionId: input.revisionId,
      },
    );
  },

  async listRevisions(
    userId: string,
    conversationRef: string,
    limit: number = 50,
  ): Promise<ConversationRevision[]> {
    const revisions = await invokeAgentSdkCommand<ConversationRevision[]>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_LIST_REVISIONS,
      {
        userId,
        conversationRef,
        limit,
      },
    );
    return Array.isArray(revisions) ? revisions : [];
  },

  async forkConversation(input: ForkConversationCommandInput): Promise<ForkConversationResult> {
    const newConversationRef = optionalString(input.newConversationRef);
    return invokeAgentSdkCommand<ForkConversationResult>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_FORK,
      {
        userId: input.userId,
        conversationRef: input.conversationRef,
        sourceRevisionId: input.sourceRevisionId,
        cutAfterRowId: input.cutAfterRowId ?? null,
        ...(newConversationRef ? { newConversationRef } : {}),
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
