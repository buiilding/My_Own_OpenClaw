/**
 * Coordinates desktop client session and transport snapshot commands.
 */

import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../infrastructure/ipc/bridge';

export type DesktopIpcStatusPayload = {
  isConnected?: boolean;
  userId?: string | null;
  [key: string]: unknown;
};

export type DesktopIpcStatusListener = (payload: DesktopIpcStatusPayload | null | undefined) => void;

export type DesktopClientSessionSnapshot = DesktopIpcStatusPayload & {
  userId: string | null;
};

export type DesktopTransportConnectionStatus = {
  isConnected: boolean;
  hasConnectionState: boolean;
};

export type DesktopObservedTransportConnectionStatus = {
  isConnected: boolean;
};

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeDesktopClientSessionSnapshot(payload: unknown): DesktopClientSessionSnapshot {
  const source = recordOrEmpty(payload);
  const snapshot: DesktopClientSessionSnapshot = {
    ...source,
    userId: normalizeOptionalString(source.userId),
  };
  if (typeof source.isConnected === 'boolean') {
    snapshot.isConnected = source.isConnected;
  } else {
    delete snapshot.isConnected;
  }
  return snapshot;
}

export function normalizeDesktopTransportConnectionStatus(
  payload: unknown,
): DesktopTransportConnectionStatus {
  const source = recordOrEmpty(payload);
  return {
    isConnected: source.isConnected === true,
    hasConnectionState: typeof source.isConnected === 'boolean',
  };
}

export function normalizeObservedDesktopTransportConnectionStatus(
  payload: unknown,
): DesktopObservedTransportConnectionStatus | null {
  const status = normalizeDesktopTransportConnectionStatus(payload);
  if (status.hasConnectionState !== true) {
    return null;
  }
  return {
    isConnected: status.isConnected,
  };
}

export const DesktopClientSessionRuntimeClient = {
  loadMainSessionSnapshot(): Promise<DesktopClientSessionSnapshot | undefined> {
    if (!INVOKE_CHANNELS?.GET_CLIENT_USER_ID) {
      return Promise.resolve(undefined);
    }
    return IpcBridge.invoke(INVOKE_CHANNELS.GET_CLIENT_USER_ID)
      .then(normalizeDesktopClientSessionSnapshot);
  },

  onIpcStatus(listener: DesktopIpcStatusListener): (() => void) | undefined {
    if (!ON_CHANNELS?.IPC_STATUS) {
      return undefined;
    }
    return IpcBridge.on(
      ON_CHANNELS.IPC_STATUS,
      (payload: unknown) => listener(normalizeDesktopClientSessionSnapshot(payload)),
    );
  },

  loadMainTransportStatus(): Promise<DesktopTransportConnectionStatus | undefined> {
    if (!INVOKE_CHANNELS?.GET_CLIENT_USER_ID) {
      return Promise.resolve(undefined);
    }
    return IpcBridge.invoke(INVOKE_CHANNELS.GET_CLIENT_USER_ID)
      .then(normalizeDesktopTransportConnectionStatus);
  },

  onIpcTransportStatus(
    listener: (payload: DesktopTransportConnectionStatus) => void,
  ): (() => void) | undefined {
    if (!ON_CHANNELS?.IPC_STATUS) {
      return undefined;
    }
    return IpcBridge.on(
      ON_CHANNELS.IPC_STATUS,
      (payload: unknown) => listener(normalizeDesktopTransportConnectionStatus(payload)),
    );
  },

  loadObservedMainTransportStatus(): Promise<DesktopObservedTransportConnectionStatus | null | undefined> {
    if (!INVOKE_CHANNELS?.GET_CLIENT_USER_ID) {
      return Promise.resolve(undefined);
    }
    return IpcBridge.invoke(INVOKE_CHANNELS.GET_CLIENT_USER_ID)
      .then(normalizeObservedDesktopTransportConnectionStatus);
  },

  onObservedIpcTransportStatus(
    listener: (payload: DesktopObservedTransportConnectionStatus) => void,
  ): (() => void) | undefined {
    if (!ON_CHANNELS?.IPC_STATUS) {
      return undefined;
    }
    return IpcBridge.on(
      ON_CHANNELS.IPC_STATUS,
      (payload: unknown) => {
        const status = normalizeObservedDesktopTransportConnectionStatus(payload);
        if (status === null) {
          return;
        }
        listener(status);
      },
    );
  },
};
