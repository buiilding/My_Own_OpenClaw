/**
 * Stores and retrieves desktop conversation state for the renderer UI.
 */

import {
  buildTraceTimeline,
  createConversationEvent,
  type CompactedReplaySnapshot,
  type ConversationMetadata,
  type ConversationRewritePlan,
  type ConversationEvent,
  type ListConversationOptions,
  type RehydrateSnapshot,
  type SearchConversationOptions,
  type ConversationStore,
  type DisplayConversation,
  type SdkDisplayRow,
  type TraceTimelineEntry,
} from '../api/windieSdkClient';
import { invokeWindieCommand } from '../../app/runtime/windieCommandInvokeClient';

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
      await invokeWindieCommand('conversation.appendEvent', {
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
    async rewriteConversation(plan: ConversationRewritePlan): Promise<void> {
      await invokeWindieCommand('conversation.rewrite', {
        userId,
        conversationRef: plan.conversationRef,
        plan,
      });
    },
    async replaceCompactedReplay(snapshot: CompactedReplaySnapshot): Promise<void> {
      await invokeWindieCommand('conversation.replaceCompactedReplay', {
        userId,
        conversationRef: snapshot.conversationRef,
        snapshot,
      });
    },
    async loadEvents(conversationRef: string): Promise<ConversationEvent[]> {
      const snapshot = await invokeWindieCommand<{
        state?: { events?: ConversationEvent[] };
      }>('conversation.load', {
        userId,
        conversationRef,
      });
      return Array.isArray(snapshot?.state?.events) ? snapshot.state.events : [];
    },
    async loadForDisplay(conversationRef: string): Promise<DisplayConversation> {
      const snapshot = await invokeWindieCommand<{
        display?: DisplayConversation;
      }>('conversation.loadDisplay', {
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
      const snapshot = await invokeWindieCommand<{
        displayRows?: SdkDisplayRow[];
      }>('conversation.loadDisplay', {
        userId,
        conversationRef,
      });
      return Array.isArray(snapshot?.displayRows) ? snapshot.displayRows : [];
    },
    async loadForRehydrate(conversationRef: string): Promise<RehydrateSnapshot> {
      const snapshot = await invokeWindieCommand<{
        rehydrate?: RehydrateSnapshot;
      }>('conversation.loadRehydrate', {
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
      const metadata = await invokeWindieCommand<ConversationMetadata[]>('conversations.list', {
        userId,
        limit: options?.limit,
      });
      return Array.isArray(metadata) ? metadata : [];
    },
    async searchMetadata(options: SearchConversationOptions): Promise<ConversationMetadata[]> {
      const metadata = await invokeWindieCommand<ConversationMetadata[]>('conversations.search', {
        userId,
        query: options.query,
        limit: options.limit,
      });
      return Array.isArray(metadata) ? metadata : [];
    },
    async deleteConversation(conversationRef: string): Promise<void> {
      await invokeWindieCommand('conversations.delete', {
        userId,
        conversationRef,
      });
    },
    async clearConversations(): Promise<void> {
      await invokeWindieCommand('conversations.clearAll', {
        userId,
      });
    },
    async getRevision(conversationRef: string) {
      return invokeWindieCommand('conversation.getRevision', {
        userId,
        conversationRef,
      });
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
