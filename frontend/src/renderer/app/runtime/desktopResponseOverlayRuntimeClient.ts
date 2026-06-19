/**
 * Coordinates response overlay window commands for renderer runtime clients.
 */

import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../infrastructure/ipc/bridge';

export type ResponseboxSizePayload = {
  visible: boolean;
  width: number;
  height: number;
  compact_hover?: boolean;
  turn_ref?: string | null;
  stale_guard_ref?: string | null;
  dismissed?: boolean;
};

export type ResponseboxSizeValues = {
  visible: boolean;
  width: unknown;
  height: unknown;
  compactHover?: boolean;
  turnRef?: string | null;
  staleGuardRef?: string | null;
  dismissed?: boolean;
};

export type ResponseboxHitTestPayload = {
  active: boolean;
};

export type ResponseOverlayVisibilityPayload = {
  visible: boolean;
};

export type ResponseOverlayVisibilityListener = (
  visible: boolean,
) => void;

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumberOrZero(value: unknown): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function optionalStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function normalizeResponseOverlayVisibilityPayload(
  payload: unknown,
): ResponseOverlayVisibilityPayload {
  const source = recordOrEmpty(payload);
  return {
    visible: source.visible === true,
  };
}

export function buildResponseboxSizePayload(values: ResponseboxSizeValues): ResponseboxSizePayload {
  const payload: ResponseboxSizePayload = {
    visible: values.visible === true,
    width: finiteNumberOrZero(values.width),
    height: finiteNumberOrZero(values.height),
    turn_ref: optionalStringOrNull(values.turnRef),
    stale_guard_ref: optionalStringOrNull(values.staleGuardRef),
  };
  if (typeof values.compactHover === 'boolean') {
    payload.compact_hover = values.compactHover;
  }
  if (typeof values.dismissed === 'boolean') {
    payload.dismissed = values.dismissed;
  }
  return payload;
}

export const DesktopResponseOverlayRuntimeClient = {
  setResponseboxSize(payload: ResponseboxSizePayload): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SET_RESPONSEBOX_SIZE, payload);
  },

  setResponseboxSizeValues(values: ResponseboxSizeValues): Promise<unknown> {
    return DesktopResponseOverlayRuntimeClient.setResponseboxSize(
      buildResponseboxSizePayload(values),
    );
  },

  setResponseboxHitTestActive(payload: ResponseboxHitTestPayload): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SET_RESPONSEBOX_HIT_TEST_ACTIVE, payload);
  },

  onResponseOverlayVisibility(
    listener: ResponseOverlayVisibilityListener,
  ): (() => void) | undefined {
    return IpcBridge.on(
      ON_CHANNELS.RESPONSE_OVERLAY_VISIBILITY,
      (payload: unknown) => listener(normalizeResponseOverlayVisibilityPayload(payload).visible),
    );
  },
};
