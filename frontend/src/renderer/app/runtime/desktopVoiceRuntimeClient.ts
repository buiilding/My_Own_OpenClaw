/**
 * Coordinates the voice app-runtime client for the renderer UI.
 */

import { DesktopRuntimeTransport } from './desktopRuntimeTransport';
import { DesktopRuntimeEndpointClient } from './desktopRuntimeEndpointClient';
import { DesktopWakewordEventRuntime } from './desktopWakewordEventRuntime';
import { IpcBridge } from '../../infrastructure/ipc/bridge';
import { ON_CHANNELS, SEND_CHANNELS } from '../../infrastructure/ipc/channels';

const {
  createDesktopRuntimeTransport,
} = DesktopRuntimeTransport;

const SET_LANGUAGE_PAYLOAD = JSON.stringify({
  type: 'set_langs',
  source_language: 'en',
  target_language: 'en',
});
const START_OVER_PAYLOAD = JSON.stringify({ type: 'start_over' });

type DesktopTranscriptionGatewayEvent =
  | { type: 'status'; clientId: string | null }
  | { type: 'realtime'; text: string; isFinal: boolean }
  | { type: 'utterance_end' }
  | {
    type: 'trace_event';
    path: string | null;
    stage: string | null;
    status: string | null;
    runtime: string | null;
  }
  | { type: 'unknown'; messageType: string | null };

export type TranscriptionGatewayTraceEvent = {
  path: string | null;
  stage: string | null;
  status: string | null;
  runtime: string | null;
};

export type TranscriptionGatewayMessageHandlers = {
  onBinaryMessage?: () => void;
  onClientId?: (clientId: string) => void;
  onRealtimeText?: (text: string, isFinal: boolean) => void;
  onUtteranceEnd?: () => void;
  onTraceEvent?: (event: TranscriptionGatewayTraceEvent) => void;
  onUnknownMessage?: (messageType: string | null) => void;
};

export type WakewordDetectionPayload = {
  model?: string;
  confidence?: unknown;
  score?: unknown;
};

export type WakewordDetectionValues = {
  model: string;
  confidence: number;
  score?: number;
};

export type WakewordStatusPayload = {
  ready?: boolean;
  error?: string | null;
};

export type WakewordReadyStatus = {
  ready: boolean;
  error: string | null;
};

export type WakewordTogglePayload = {
  enabled?: unknown;
};

export type WakewordToggleState = {
  enabled: boolean;
};

function parseBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTranscriptionGatewayMessage(rawData: unknown): DesktopTranscriptionGatewayEvent | null {
  if (rawData instanceof ArrayBuffer || rawData instanceof Blob) {
    return null;
  }

  const data = JSON.parse(rawData as string);
  if (!isRecord(data)) {
    return { type: 'unknown', messageType: null };
  }

  switch (data.type) {
    case 'status':
      return {
        type: 'status',
        clientId: typeof data.client_id === 'string' ? data.client_id : null,
      };

    case 'realtime':
      return {
        type: 'realtime',
        text: typeof data.translation === 'string'
          ? data.translation
          : typeof data.text === 'string'
            ? data.text
            : '',
        isFinal: parseBoolean(data.is_final),
      };

    case 'utterance_end':
      return { type: 'utterance_end' };

    case 'trace_event': {
      const payload = isRecord(data.payload) ? data.payload : {};
      return {
        type: 'trace_event',
        path: typeof payload.path === 'string' ? payload.path : null,
        stage: typeof payload.stage === 'string' ? payload.stage : null,
        status: typeof payload.status === 'string' ? payload.status : null,
        runtime: typeof payload.runtime === 'string' ? payload.runtime : null,
      };
    }

    default:
      return {
        type: 'unknown',
        messageType: typeof data.type === 'string' ? data.type : null,
      };
  }
}

function resolveWakewordStatusReady(status: WakewordStatusPayload | null | undefined): boolean {
  return status?.ready === true;
}

function resolveWakewordStatusError(status: WakewordStatusPayload | null | undefined): string | null {
  return typeof status?.error === 'string' && status.error.length > 0 ? status.error : null;
}

function resolveWakewordReadyStatus(
  status: WakewordStatusPayload | null | undefined,
): WakewordReadyStatus {
  return {
    ready: resolveWakewordStatusReady(status),
    error: resolveWakewordStatusError(status),
  };
}

function resolveWakewordDetectionValues(
  payload: WakewordDetectionPayload | null | undefined,
): WakewordDetectionValues | null {
  const source = isRecord(payload) ? payload : {};
  const confidence = DesktopWakewordEventRuntime.resolveConfidence(source.confidence);
  if (confidence === null) {
    return null;
  }
  const score = DesktopWakewordEventRuntime.resolveConfidence(source.score);
  const values: WakewordDetectionValues = {
    model: typeof source.model === 'string' ? source.model : '',
    confidence,
  };
  if (score !== null) {
    values.score = score;
  }
  return values;
}

function resolveWakewordToggleState(
  payload: WakewordTogglePayload | null | undefined,
): WakewordToggleState | null {
  const source = isRecord(payload) ? payload : {};
  if (typeof source.enabled !== 'boolean') {
    return null;
  }
  return { enabled: source.enabled };
}

/**
 * Renderer voice command facade for the SDK runtime hosted by Electron main.
 */
export const DesktopVoiceRuntimeClient = {
  wakewordDetected(): Promise<string | void> {
    return createDesktopRuntimeTransport(null).wakewordDetected({});
  },

  sendWakewordAudioChunk(buffer: ArrayBufferLike): void {
    IpcBridge.send(SEND_CHANNELS.WAKEWORD_AUDIO_CHUNK, buffer);
  },

  enableWakeword(): void {
    IpcBridge.send(SEND_CHANNELS.WAKEWORD_ENABLE, {});
  },

  disableWakeword(): void {
    IpcBridge.send(SEND_CHANNELS.WAKEWORD_DISABLE, {});
  },

  onWakewordDetected(listener: (payload: WakewordDetectionPayload) => void): (() => void) | undefined {
    return IpcBridge.on(ON_CHANNELS.WAKEWORD_DETECTED, listener as (payload: unknown) => void);
  },

  onWakewordDetectedValues(
    listener: (payload: WakewordDetectionValues) => void,
    onInvalidConfidence?: () => void,
  ): (() => void) | undefined {
    return this.onWakewordDetected((payload) => {
      const values = resolveWakewordDetectionValues(payload);
      if (!values) {
        onInvalidConfidence?.();
        return;
      }
      listener(values);
    });
  },

  onWakewordStatus(listener: (payload: WakewordStatusPayload) => void): (() => void) | undefined {
    return IpcBridge.on(ON_CHANNELS.WAKEWORD_STATUS, listener as (payload: unknown) => void);
  },

  onWakewordReadyStatus(listener: (payload: WakewordReadyStatus) => void): (() => void) | undefined {
    return this.onWakewordStatus((payload) => {
      listener(resolveWakewordReadyStatus(payload));
    });
  },

  onWakewordToggle(listener: (payload: WakewordTogglePayload) => void): (() => void) | undefined {
    return IpcBridge.on(ON_CHANNELS.WAKEWORD_TOGGLE, listener as (payload: unknown) => void);
  },

  onWakewordToggleState(listener: (payload: WakewordToggleState) => void): (() => void) | undefined {
    return this.onWakewordToggle((payload) => {
      const state = resolveWakewordToggleState(payload);
      if (!state) {
        return;
      }
      listener(state);
    });
  },

  getTranscriptionGatewayUrl(): string {
    return DesktopRuntimeEndpointClient.buildTranscriptionWebSocketUrl();
  },

  createTranscriptionWebSocket(
    gatewayUrl: string = DesktopRuntimeEndpointClient.buildTranscriptionWebSocketUrl(),
  ): WebSocket {
    return new WebSocket(gatewayUrl);
  },

  isTranscriptionWebSocketActive(websocket: WebSocket | null | undefined): boolean {
    return Boolean(websocket && websocket.readyState !== WebSocket.CLOSED);
  },

  isTranscriptionWebSocketOpen(websocket: WebSocket | null | undefined): websocket is WebSocket {
    return Boolean(websocket && websocket.readyState === WebSocket.OPEN);
  },

  closeTranscriptionWebSocket(websocket: WebSocket | null | undefined): void {
    websocket?.close();
  },

  sendDefaultTranscriptionLanguage(websocket: WebSocket): void {
    websocket.send(SET_LANGUAGE_PAYLOAD);
  },

  sendTranscriptionStartOver(websocket: WebSocket): void {
    websocket.send(START_OVER_PAYLOAD);
  },

  sendTranscriptionStartOverIfOpen(websocket: WebSocket | null | undefined): void {
    if (this.isTranscriptionWebSocketOpen(websocket)) {
      this.sendTranscriptionStartOver(websocket);
    }
  },

  sendTranscriptionAudioMessage(websocket: WebSocket, message: Parameters<WebSocket['send']>[0]): void {
    websocket.send(message);
  },

  sendTranscriptionAudioMessageIfOpen(
    websocket: WebSocket | null | undefined,
    message: Parameters<WebSocket['send']>[0],
  ): boolean {
    if (!this.isTranscriptionWebSocketOpen(websocket)) {
      return false;
    }
    this.sendTranscriptionAudioMessage(websocket, message);
    return true;
  },

  dispatchTranscriptionGatewayMessage(
    rawData: unknown,
    handlers: TranscriptionGatewayMessageHandlers,
  ): void {
    const event = normalizeTranscriptionGatewayMessage(rawData);
    if (!event) {
      handlers.onBinaryMessage?.();
      return;
    }

    switch (event.type) {
      case 'status':
        if (event.clientId) {
          handlers.onClientId?.(event.clientId);
        }
        return;

      case 'realtime':
        if (event.text) {
          handlers.onRealtimeText?.(event.text, event.isFinal);
        }
        return;

      case 'utterance_end':
        handlers.onUtteranceEnd?.();
        return;

      case 'trace_event':
        handlers.onTraceEvent?.({
          path: event.path,
          stage: event.stage,
          status: event.status,
          runtime: event.runtime,
        });
        return;

      case 'unknown':
        handlers.onUnknownMessage?.(event.messageType);
        return;
    }
  },
};
