import type { PendingUserMessage } from '../types';

type PendingUserQueue = {
  size: () => number;
  enqueue: (message: PendingUserMessage) => void;
  drain: () => PendingUserMessage[];
};

export function createPendingUserQueue(): PendingUserQueue {
  const pendingUserMessages: PendingUserMessage[] = [];

  return {
    size: () => pendingUserMessages.length,
    enqueue: (message: PendingUserMessage) => {
      pendingUserMessages.push(message);
    },
    drain: () => {
      if (pendingUserMessages.length === 0) {
        return [];
      }
      return pendingUserMessages.splice(0, pendingUserMessages.length);
    },
  };
}
