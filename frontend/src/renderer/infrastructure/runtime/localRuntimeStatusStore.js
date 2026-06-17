/**
 * Stores and retrieves local runtime status state for the renderer UI.
 */

import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../ipc/bridge';

const EMPTY_LOCAL_RUNTIME_STATUS = Object.freeze({
  ready: false,
  status: 'stopped',
  error: '',
});
const GET_LOCAL_RUNTIME_STATUS_CHANNEL = INVOKE_CHANNELS.GET_LOCAL_BACKEND_STATUS;
const LOCAL_RUNTIME_STATUS_CHANNEL = ON_CHANNELS.LOCAL_BACKEND_STATUS;

let currentSnapshot = EMPTY_LOCAL_RUNTIME_STATUS;
let removeIpcListener = null;
let bootstrapPromise = null;
let liveStatusRevision = 0;
const storeSubscribers = new Set();

function normalizeLocalRuntimeStatus(payload = {}) {
  return Object.freeze({
    ready: payload?.ready === true,
    status: typeof payload?.status === 'string' && payload.status.trim()
      ? payload.status.trim()
      : (payload?.ready === true ? 'ready' : 'stopped'),
    error: typeof payload?.error === 'string' ? payload.error : '',
  });
}

function snapshotsMatch(current, next) {
  return (
    current.ready === next.ready
    && current.status === next.status
    && current.error === next.error
  );
}

function notifyStoreSubscribers() {
  for (const onStoreChange of storeSubscribers) {
    onStoreChange();
  }
}

function applySnapshot(nextSnapshot) {
  if (snapshotsMatch(currentSnapshot, nextSnapshot)) {
    return;
  }
  currentSnapshot = nextSnapshot;
  notifyStoreSubscribers();
}

function ensureIpcSubscription() {
  if (removeIpcListener) {
    return;
  }

  removeIpcListener = IpcBridge.on(LOCAL_RUNTIME_STATUS_CHANNEL, (payload = {}) => {
    liveStatusRevision += 1;
    applySnapshot(normalizeLocalRuntimeStatus(payload));
  });
}

function ensureBootstrapStatusRead() {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  const bootstrapStartRevision = liveStatusRevision;
  bootstrapPromise = IpcBridge.invoke(GET_LOCAL_RUNTIME_STATUS_CHANNEL)
    .then((payload = {}) => {
      if (liveStatusRevision !== bootstrapStartRevision) {
        return;
      }
      applySnapshot(normalizeLocalRuntimeStatus(payload));
    })
    .catch(() => {
      if (liveStatusRevision !== bootstrapStartRevision) {
        return;
      }
      applySnapshot(EMPTY_LOCAL_RUNTIME_STATUS);
    })
    .finally(() => {
      bootstrapPromise = null;
    });

  return bootstrapPromise;
}

function disposeIpcSubscriptionIfIdle() {
  if (storeSubscribers.size > 0) {
    return;
  }

  removeIpcListener?.();
  removeIpcListener = null;
  currentSnapshot = EMPTY_LOCAL_RUNTIME_STATUS;
  liveStatusRevision = 0;
}

export function subscribeLocalRuntimeStatusStore(onStoreChange) {
  storeSubscribers.add(onStoreChange);
  ensureIpcSubscription();
  void ensureBootstrapStatusRead();

  return () => {
    storeSubscribers.delete(onStoreChange);
    disposeIpcSubscriptionIfIdle();
  };
}

export function getLocalRuntimeStatusSnapshot() {
  return currentSnapshot;
}
