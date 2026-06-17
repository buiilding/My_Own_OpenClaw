/**
 * Coordinates the desktop voice runtime client for the renderer UI.
 */

import { createDesktopAgentRuntimeTransport } from './desktopAgentRuntimeTransport';
import { buildTranscriptionWebSocketUrl } from '../../infrastructure/services/BackendEndpointStore';

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

function parseBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Renderer voice command facade for the SDK runtime hosted by Electron main.
 */
export const DesktopVoiceRuntimeClient = {
  wakewordDetected(): Promise<string | void> {
    return createDesktopAgentRuntimeTransport(null).wakewordDetected({});
  },

  getTranscriptionGatewayUrl(): string {
    return buildTranscriptionWebSocketUrl();
  },

  createTranscriptionWebSocket(gatewayUrl: string = buildTranscriptionWebSocketUrl()): WebSocket {
    return new WebSocket(gatewayUrl);
  },

  sendDefaultTranscriptionLanguage(websocket: WebSocket): void {
    websocket.send(SET_LANGUAGE_PAYLOAD);
  },

  sendTranscriptionStartOver(websocket: WebSocket): void {
    websocket.send(START_OVER_PAYLOAD);
  },

  normalizeTranscriptionGatewayMessage(rawData: unknown): DesktopTranscriptionGatewayEvent | null {
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
  },
};
