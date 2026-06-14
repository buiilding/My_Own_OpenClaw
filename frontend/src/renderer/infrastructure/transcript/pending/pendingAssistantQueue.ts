/**
 * Provides the pending assistant queue module for the renderer UI.
 */

import type { PendingAssistantMessage } from '../types';

type PendingAssistantQueue = {
  size: () => number;
  enqueue: (message: PendingAssistantMessage) => void;
  prepend: (messages: PendingAssistantMessage[]) => void;
  drain: () => PendingAssistantMessage[];
};

export function createPendingAssistantQueue(): PendingAssistantQueue {
  const pendingAssistantMessages: PendingAssistantMessage[] = [];

  return {
    size: () => pendingAssistantMessages.length,
    enqueue: (message: PendingAssistantMessage) => {
      pendingAssistantMessages.push(message);
    },
    prepend: (messages: PendingAssistantMessage[]) => {
      pendingAssistantMessages.unshift(...messages);
    },
    drain: () => {
      if (pendingAssistantMessages.length === 0) {
        return [];
      }
      return pendingAssistantMessages.splice(0, pendingAssistantMessages.length);
    },
  };
}
