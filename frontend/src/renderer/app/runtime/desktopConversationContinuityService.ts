/**
 * Implements the desktop conversation continuity service service for the renderer UI.
 */

import {
  DesktopConversationRuntimeContracts,
  type ListConversationOptions,
  type CheckoutRevisionInput,
  type CheckoutRevisionResult,
  type ForkConversationInput,
  type ForkConversationResult,
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

type EditAndResendCommandInput = {
  userId: string;
  conversationRef: string;
  messageId: string;
  text: string;
};

type RetryTurnCommandInput = {
  userId: string;
  conversationRef: string;
  messageId: string;
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

function exactReplayCommandString(value: unknown, label: string): string {
  if (typeof value === 'string' && value.length > 0 && value === value.trim()) {
    return value;
  }
  throw new Error(`Desktop replay command requires exact ${label}.`);
}

function exactRevisionCommandString(value: unknown, label: string): string {
  if (typeof value === 'string' && value.length > 0 && value === value.trim()) {
    return value;
  }
  throw new Error(`Desktop revision command requires exact ${label}.`);
}

function optionalExactRevisionCommandString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return exactRevisionCommandString(value, label);
}

function readExactConversationRef(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
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
    const conversationRef = exactReplayCommandString(input.conversationRef, 'conversation reference');
    const messageId = exactReplayCommandString(input.messageId, 'message id');
    return invokeAgentSdkCommand<TurnResult>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_EDIT_AND_RESEND,
      {
        userId: input.userId,
        conversationRef,
        messageId,
        text: input.text,
      },
    );
  },

  async retryTurn(input: RetryTurnCommandInput): Promise<TurnResult> {
    const conversationRef = exactReplayCommandString(input.conversationRef, 'conversation reference');
    const messageId = exactReplayCommandString(input.messageId, 'message id');
    return invokeAgentSdkCommand<TurnResult>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_RETRY_TURN,
      {
        userId: input.userId,
        conversationRef,
        messageId,
      },
    );
  },

  async checkoutRevision(input: CheckoutRevisionCommandInput): Promise<CheckoutRevisionResult> {
    const conversationRef = exactRevisionCommandString(input.conversationRef, 'conversation reference');
    const revisionId = exactRevisionCommandString(input.revisionId, 'revision id');
    return invokeAgentSdkCommand<CheckoutRevisionResult>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_CHECKOUT_REVISION,
      {
        userId: input.userId,
        conversationRef,
        revisionId,
      },
    );
  },

  async listRevisions(
    userId: string,
    conversationRef: string,
    limit: number = 50,
  ): Promise<ConversationRevision[]> {
    const exactConversationRef = exactRevisionCommandString(conversationRef, 'conversation reference');
    const revisions = await invokeAgentSdkCommand<ConversationRevision[]>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_LIST_REVISIONS,
      {
        userId,
        conversationRef: exactConversationRef,
        limit,
      },
    );
    return Array.isArray(revisions) ? revisions : [];
  },

  async forkConversation(input: ForkConversationCommandInput): Promise<ForkConversationResult> {
    const conversationRef = exactRevisionCommandString(input.conversationRef, 'conversation reference');
    const sourceRevisionId = exactRevisionCommandString(input.sourceRevisionId, 'source revision id');
    const cutAfterRowId = optionalExactRevisionCommandString(input.cutAfterRowId, 'cut row id');
    const newConversationRef = optionalExactRevisionCommandString(
      input.newConversationRef,
      'new conversation reference',
    );
    return invokeAgentSdkCommand<ForkConversationResult>(
      SDK_RUNTIME_COMMANDS.CONVERSATION_FORK,
      {
        userId: input.userId,
        conversationRef,
        sourceRevisionId,
        cutAfterRowId,
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
    const hasExplicitConversationRef = conversationRef !== null && conversationRef !== undefined;
    const resolvedConversationRef = hasExplicitConversationRef
      ? exactRevisionCommandString(conversationRef, 'conversation reference')
      : readExactConversationRef(DesktopTranscriptSessionRuntimeClient.getActiveConversationRef());
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
