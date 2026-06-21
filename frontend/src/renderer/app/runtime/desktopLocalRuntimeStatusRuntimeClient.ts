/**
 * Exposes local-runtime readiness snapshots through the renderer app runtime boundary.
 */

import {
  getLocalRuntimeStatusSnapshot,
  subscribeLocalRuntimeStatusStore,
} from '../../infrastructure/runtime/localRuntimeStatusStore';

function isLocalRuntimeStatusReady(snapshot: unknown): boolean {
  return Boolean(
    snapshot
    && typeof snapshot === 'object'
    && !Array.isArray(snapshot)
    && 'ready' in snapshot
    && snapshot.ready === true,
  );
}

export const DesktopLocalRuntimeStatusRuntimeClient = {
  getSnapshot: getLocalRuntimeStatusSnapshot,
  subscribe: subscribeLocalRuntimeStatusStore,

  isReady(): boolean {
    return isLocalRuntimeStatusReady(getLocalRuntimeStatusSnapshot());
  },

  onReady(listener: () => void): (() => void) {
    const notifyIfReady = () => {
      if (this.isReady()) {
        listener();
      }
    };
    const unsubscribe = subscribeLocalRuntimeStatusStore(notifyIfReady);
    notifyIfReady();
    return unsubscribe;
  },
};
