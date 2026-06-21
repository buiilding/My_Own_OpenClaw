/**
 * Provides the reusable chat session module for the TypeScript SDK runtime.
 */

import type {
  DisplayConversation,
  RehydrateSnapshot,
} from '../conversation/types.js';
import {
  createAgentStreamEventRuntime,
  type AgentStreamEvent,
} from './AgentStreamEvents.js';
import type {
  ConversationEventListener,
  ConversationListener,
  ConversationSnapshot,
  EditAndResendInput,
  RetryTurnInput,
  SdkConversationRuntime,
  SendInput,
  TurnResult,
} from './ConversationRuntime.js';

function normalizeSendInput(input: string | SendInput): SendInput {
  return typeof input === 'string' ? { text: input } : input;
}

const agentStreamEventRuntime = createAgentStreamEventRuntime();

export class AgentChatSession {
  constructor(readonly conversationRef: string, private readonly runtime: SdkConversationRuntime) {}

  subscribe(listener: ConversationListener): () => void {
    return this.runtime.subscribe(listener);
  }

  onEvent(listener: ConversationEventListener): () => void {
    return this.runtime.subscribeEvents(listener);
  }

  async load(): Promise<ConversationSnapshot> {
    return this.runtime.load();
  }

  async display(): Promise<DisplayConversation> {
    return (await this.load()).display;
  }

  async send(input: string | SendInput): Promise<TurnResult> {
    return this.runtime.send(normalizeSendInput(input));
  }

  async *stream(input: string | SendInput): AsyncIterableIterator<AgentStreamEvent> {
    const seenToolOutputs = new Set<string>();
    for await (const runtimeEvent of this.runtime.stream(normalizeSendInput(input))) {
      const streamEvents = agentStreamEventRuntime.toStreamEvents(runtimeEvent);
      if (streamEvents.length === 0) {
        continue;
      }
      if (runtimeEvent.type === 'conversation_event') {
        const keys = agentStreamEventRuntime.toolOutputStreamKeys(runtimeEvent.event);
        if (keys.some(key => seenToolOutputs.has(key))) {
          continue;
        }
        keys.forEach(key => seenToolOutputs.add(key));
      }
      for (const streamEvent of streamEvents) {
        yield streamEvent;
      }
    }
  }

  async editAndResend(input: EditAndResendInput): Promise<TurnResult> {
    return this.runtime.editAndResend(input);
  }

  async retry(input: RetryTurnInput = {}): Promise<TurnResult> {
    return this.runtime.retryTurn(input);
  }

  async stop(turnRef?: string | null): Promise<void> {
    await this.runtime.stop(turnRef ?? null);
  }

  async rehydrate(): Promise<RehydrateSnapshot> {
    return this.runtime.rehydrate();
  }

  close(): void {
    this.runtime.close();
  }
}
