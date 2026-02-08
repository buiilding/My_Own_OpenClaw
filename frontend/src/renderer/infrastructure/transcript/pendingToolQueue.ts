import type { PendingToolMessage } from './types';

export type PendingToolQueue = {
  size: () => number;
  enqueue: (message: PendingToolMessage) => void;
  drain: () => PendingToolMessage[];
};

export function createPendingToolQueue(): PendingToolQueue {
  const pendingToolMessages: PendingToolMessage[] = [];

  return {
    size: () => pendingToolMessages.length,
    enqueue: (message: PendingToolMessage) => {
      pendingToolMessages.push(message);
    },
    drain: () => {
      if (pendingToolMessages.length === 0) {
        return [];
      }
      return pendingToolMessages.splice(0, pendingToolMessages.length);
    },
  };
}
