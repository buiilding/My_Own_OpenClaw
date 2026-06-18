/**
 * Exposes local-runtime readiness snapshots through the renderer app runtime boundary.
 */

import {
  getLocalRuntimeStatusSnapshot,
  subscribeLocalRuntimeStatusStore,
} from '../../infrastructure/runtime/localRuntimeStatusStore';

export const DesktopLocalRuntimeStatusRuntimeClient = {
  getSnapshot: getLocalRuntimeStatusSnapshot,
  subscribe: subscribeLocalRuntimeStatusStore,
};
