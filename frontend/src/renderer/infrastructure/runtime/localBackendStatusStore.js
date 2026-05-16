import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../ipc/bridge';

const EMPTY_LOCAL_BACKEND_STATUS = Object.freeze({
  ready: false,
  status: 'stopped',
  error: '',
});

let currentSnapshot = EMPTY_LOCAL_BACKEND_STATUS;
let removeIpcListener = null;
let bootstrapPromise = null;
const storeSubscribers = new Set();

function logLocalBackendStatusStore(stage, payload = {}) {
  if (typeof console === 'undefined') {
    return;
  }
  console.log('[LocalBackendStatusStore]', stage, payload);
}

function normalizeLocalBackendStatus(payload = {}) {
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
  logLocalBackendStatusStore('snapshot', nextSnapshot);
  currentSnapshot = nextSnapshot;
  notifyStoreSubscribers();
}

function ensureIpcSubscription() {
  if (removeIpcListener) {
    return;
  }

  removeIpcListener = IpcBridge.on(ON_CHANNELS.LOCAL_BACKEND_STATUS, (payload = {}) => {
    applySnapshot(normalizeLocalBackendStatus(payload));
  });
}

function ensureBootstrapStatusRead() {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = IpcBridge.invoke(INVOKE_CHANNELS.GET_LOCAL_BACKEND_STATUS)
    .then((payload = {}) => {
      logLocalBackendStatusStore('bootstrap-response', payload);
      applySnapshot(normalizeLocalBackendStatus(payload));
    })
    .catch((error) => {
      logLocalBackendStatusStore('bootstrap-error', {
        error: error?.message || String(error),
      });
      applySnapshot(EMPTY_LOCAL_BACKEND_STATUS);
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
  currentSnapshot = EMPTY_LOCAL_BACKEND_STATUS;
}

export function subscribeLocalBackendStatusStore(onStoreChange) {
  storeSubscribers.add(onStoreChange);
  ensureIpcSubscription();
  void ensureBootstrapStatusRead();

  return () => {
    storeSubscribers.delete(onStoreChange);
    disposeIpcSubscriptionIfIdle();
  };
}

export function getLocalBackendStatusSnapshot() {
  return currentSnapshot;
}
