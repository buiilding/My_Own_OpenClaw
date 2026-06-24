/**
 * Stores and retrieves desktop conversation state for the renderer UI.
 */

import {
  buildTraceTimeline,
} from '../../../../../packages/windie-sdk-js/src/projections/conversationProjections.js';
import {
  SDK_RUNTIME_COMMANDS,
} from '../../../../../packages/windie-sdk-js/src/runtime/SdkRuntimeCommands.js';
import type {
  CompactedReplaySnapshot,
  ConversationMetadata,
  ConversationEvent,
  ListConversationOptions,
  RehydrateSnapshot,
  SearchConversationOptions,
  ConversationRevision,
  ConversationStore,
  ConversationView,
  DisplayConversation,
  SdkDisplayRow,
  TraceTimelineEntry,
} from '../../../../../packages/windie-sdk-js/src/conversation/types.js';
import { AgentSdkCommandInvokeClient } from '../../app/runtime/agentSdkCommandInvokeClient';

const {
  invokeAgentSdkCommand,
} = AgentSdkCommandInvokeClient;

function readSnapshotDisplayRows(
  snapshot: { view?: ConversationView | null } | null | undefined,
): SdkDisplayRow[] {
  if (Array.isArray(snapshot?.view?.displayRows)) {
    return snapshot.view.displayRows;
  }
  return [];
}

export type DesktopTraceTimelineOptions = {
  turnRef?: string | null;
  traceId?: string | null;
  path?: string | null;
};

export function createDesktopConversationStore(
  userId: string,
): ConversationStore {
  return {
    async appendEvent(event: ConversationEvent): Promise<void> {
      await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_APPEND_EVENT, {
        userId,
        conversationRef: event.conversationRef,
        event,
      });
    },
    async appendEvents(events: ConversationEvent[]): Promise<void> {
      for (const event of events) {
        await this.appendEvent(event);
      }
    },
    async replaceCompactedReplay(snapshot: CompactedReplaySnapshot): Promise<void> {
      await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_REPLACE_COMPACTED_REPLAY, {
        userId,
        conversationRef: snapshot.conversationRef,
        snapshot,
      });
    },
    async loadEvents(conversationRef: string): Promise<ConversationEvent[]> {
      const snapshot = await invokeAgentSdkCommand<{
        state?: { events?: ConversationEvent[] };
      }>(SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD, {
        userId,
        conversationRef,
      });
      return Array.isArray(snapshot?.state?.events) ? snapshot.state.events : [];
    },
    async loadForDisplay(conversationRef: string): Promise<DisplayConversation> {
      const snapshot = await invokeAgentSdkCommand<{
        display?: DisplayConversation;
      }>(SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD_DISPLAY, {
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
    async loadDisplayRows(conversationRef: string): Promise<SdkDisplayRow[]> {
      const snapshot = await invokeAgentSdkCommand<{
        view?: ConversationView | null;
      }>(SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD_DISPLAY, {
        userId,
        conversationRef,
      });
      return readSnapshotDisplayRows(snapshot);
    },
    async loadForRehydrate(conversationRef: string): Promise<RehydrateSnapshot> {
      const snapshot = await invokeAgentSdkCommand<{
        rehydrate?: RehydrateSnapshot;
      }>(SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD_REHYDRATE, {
        userId,
        conversationRef,
      });
      return snapshot?.rehydrate ?? {
        conversationRef,
        revisionId: '',
        messages: [],
      };
    },
    async listMetadata(options?: ListConversationOptions): Promise<ConversationMetadata[]> {
      const metadata = await invokeAgentSdkCommand<ConversationMetadata[]>(SDK_RUNTIME_COMMANDS.CONVERSATIONS_LIST, {
        userId,
        limit: options?.limit,
      });
      return Array.isArray(metadata) ? metadata : [];
    },
    async searchMetadata(options: SearchConversationOptions): Promise<ConversationMetadata[]> {
      const metadata = await invokeAgentSdkCommand<ConversationMetadata[]>(SDK_RUNTIME_COMMANDS.CONVERSATIONS_SEARCH, {
        userId,
        query: options.query,
        limit: options.limit,
      });
      return Array.isArray(metadata) ? metadata : [];
    },
    async deleteConversation(conversationRef: string): Promise<void> {
      await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATIONS_DELETE, {
        userId,
        conversationRef,
      });
    },
    async clearConversations(): Promise<void> {
      await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATIONS_CLEAR_ALL, {
        userId,
      });
    },
    async getRevision(conversationRef: string) {
      return invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_GET_REVISION, {
        userId,
        conversationRef,
      });
    },
    async listRevisions(options: { conversationRef: string; limit?: number }): Promise<ConversationRevision[]> {
      const revisions = await invokeAgentSdkCommand<ConversationRevision[]>(
        SDK_RUNTIME_COMMANDS.CONVERSATION_LIST_REVISIONS,
        {
          userId,
          conversationRef: options.conversationRef,
          limit: options.limit,
        },
      );
      return Array.isArray(revisions) ? revisions : [];
    },
  };
}

export async function loadDesktopTraceTimeline(
  userId: string,
  conversationRef: string,
  options: DesktopTraceTimelineOptions = {},
): Promise<TraceTimelineEntry[]> {
  const store = createDesktopConversationStore(userId);
  const events = await store.loadEvents(conversationRef);
  return buildTraceTimeline(events, {
    conversationRef,
    turnRef: options.turnRef,
    traceId: options.traceId,
    path: options.path,
  });
}
