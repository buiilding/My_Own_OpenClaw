/**
 * Covers voice app-runtime client behavior in the frontend test suite.
 */

import * as DesktopVoiceRuntimeModule from '../../src/renderer/app/runtime/desktopVoiceRuntimeClient';
import { DesktopVoiceRuntimeClient } from '../../src/renderer/app/runtime/desktopVoiceRuntimeClient';
import {
  IpcBridge,
} from '../../src/renderer/infrastructure/ipc/bridge';
import {
  ON_CHANNELS,
  SEND_CHANNELS,
} from '../../src/renderer/infrastructure/ipc/channels';

const mockInvokeAgentSdkCommand = jest.fn(async () => undefined);

jest.mock('../../src/renderer/app/runtime/agentSdkCommandInvokeClient', () => {
  return {
    AgentSdkCommandInvokeClient: {
      invokeAgentSdkCommand: (...args: unknown[]) => mockInvokeAgentSdkCommand(...args),
    },
  };
});

describe('DesktopVoiceRuntimeClient', () => {
  beforeEach(() => {
    mockInvokeAgentSdkCommand.mockReset();
    mockInvokeAgentSdkCommand.mockResolvedValue(undefined);
    jest.spyOn(IpcBridge, 'send').mockImplementation(() => undefined);
    jest.spyOn(IpcBridge, 'on').mockImplementation(() => jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('sends wakeword notifications through the SDK desktop transport adapter', async () => {
    await expect(DesktopVoiceRuntimeClient.wakewordDetected()).resolves.toBeUndefined();

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('wakeword.detected', {});
  });

  test('returns runtime transport failures to the caller', async () => {
    mockInvokeAgentSdkCommand.mockRejectedValueOnce(new Error('backend unavailable'));

    await expect(DesktopVoiceRuntimeClient.wakewordDetected()).rejects.toThrow(
      'backend unavailable',
    );
  });

  test('routes wakeword bridge commands and events through typed desktop IPC', () => {
    const detectedListener = jest.fn();
    const statusListener = jest.fn();
    const buffer = new ArrayBuffer(4);

    DesktopVoiceRuntimeClient.sendWakewordAudioChunk(buffer);
    DesktopVoiceRuntimeClient.enableWakeword();
    DesktopVoiceRuntimeClient.disableWakeword();
    DesktopVoiceRuntimeClient.onWakewordDetected(detectedListener);
    DesktopVoiceRuntimeClient.onWakewordStatus(statusListener);

    expect(IpcBridge.send).toHaveBeenCalledWith(SEND_CHANNELS.WAKEWORD_AUDIO_CHUNK, buffer);
    expect(IpcBridge.send).toHaveBeenCalledWith(SEND_CHANNELS.WAKEWORD_ENABLE, {});
    expect(IpcBridge.send).toHaveBeenCalledWith(SEND_CHANNELS.WAKEWORD_DISABLE, {});
    expect(IpcBridge.on).toHaveBeenCalledWith(ON_CHANNELS.WAKEWORD_DETECTED, detectedListener);
    expect(IpcBridge.on).toHaveBeenCalledWith(ON_CHANNELS.WAKEWORD_STATUS, statusListener);
  });

  test('keeps raw wakeword value parsers private to the runtime client', () => {
    expect(DesktopVoiceRuntimeModule).not.toHaveProperty('resolveWakewordStatusReady');
    expect(DesktopVoiceRuntimeModule).not.toHaveProperty('resolveWakewordStatusError');
    expect(DesktopVoiceRuntimeModule).not.toHaveProperty('resolveWakewordReadyStatus');
    expect(DesktopVoiceRuntimeModule).not.toHaveProperty('resolveWakewordDetectionValues');
    expect(DesktopVoiceRuntimeModule).not.toHaveProperty('resolveWakewordToggleState');
  });

  test('emits value-level wakeword detection updates', () => {
    const detectionListener = jest.fn();
    const invalidListener = jest.fn();
    let detectionHandler: ((payload: unknown) => void) | undefined;
    jest.spyOn(IpcBridge, 'on').mockImplementation((channel, handler) => {
      if (channel === ON_CHANNELS.WAKEWORD_DETECTED) {
        detectionHandler = handler;
      }
      return jest.fn();
    });

    DesktopVoiceRuntimeClient.onWakewordDetectedValues(detectionListener, invalidListener);
    detectionHandler?.({ model: 'hey-jarvis', confidence: 0.99, score: 0.8 });
    detectionHandler?.({ model: 12 as unknown as string, confidence: 0.5, score: '0.5' });
    detectionHandler?.({ model: 'hey-jarvis', confidence: 'bad' });

    expect(IpcBridge.on).toHaveBeenCalledWith(ON_CHANNELS.WAKEWORD_DETECTED, expect.any(Function));
    expect(detectionListener).toHaveBeenNthCalledWith(1, {
      model: 'hey-jarvis',
      confidence: 0.99,
      score: 0.8,
    });
    expect(detectionListener).toHaveBeenNthCalledWith(2, {
      model: '',
      confidence: 0.5,
    });
    expect(invalidListener).toHaveBeenCalledTimes(1);
  });

  test('emits value-level wakeword ready status updates', () => {
    const readyListener = jest.fn();
    let statusHandler: ((payload: unknown) => void) | undefined;
    jest.spyOn(IpcBridge, 'on').mockImplementation((channel, handler) => {
      if (channel === ON_CHANNELS.WAKEWORD_STATUS) {
        statusHandler = handler;
      }
      return jest.fn();
    });

    DesktopVoiceRuntimeClient.onWakewordReadyStatus(readyListener);
    statusHandler?.({ ready: true, error: 'warming up' });
    statusHandler?.({ ready: false, error: '' });
    statusHandler?.({});

    expect(IpcBridge.on).toHaveBeenCalledWith(ON_CHANNELS.WAKEWORD_STATUS, expect.any(Function));
    expect(readyListener).toHaveBeenNthCalledWith(1, { ready: true, error: 'warming up' });
    expect(readyListener).toHaveBeenNthCalledWith(2, { ready: false, error: null });
    expect(readyListener).toHaveBeenNthCalledWith(3, { ready: false, error: null });
  });

  test('emits value-level wakeword toggle state updates', () => {
    const toggleListener = jest.fn();
    let toggleHandler: ((payload: unknown) => void) | undefined;
    jest.spyOn(IpcBridge, 'on').mockImplementation((channel, handler) => {
      if (channel === ON_CHANNELS.WAKEWORD_TOGGLE) {
        toggleHandler = handler;
      }
      return jest.fn();
    });

    DesktopVoiceRuntimeClient.onWakewordToggleState(toggleListener);
    toggleHandler?.({ enabled: false });
    toggleHandler?.({ enabled: 'yes' });
    toggleHandler?.({ enabled: true });

    expect(IpcBridge.on).toHaveBeenCalledWith(ON_CHANNELS.WAKEWORD_TOGGLE, expect.any(Function));
    expect(toggleListener).toHaveBeenCalledTimes(2);
    expect(toggleListener).toHaveBeenNthCalledWith(1, { enabled: false });
    expect(toggleListener).toHaveBeenNthCalledWith(2, { enabled: true });
  });

  test('sends transcription gateway protocol setup messages', () => {
    const websocket = { send: jest.fn() } as unknown as WebSocket;

    DesktopVoiceRuntimeClient.sendDefaultTranscriptionLanguage(websocket);
    DesktopVoiceRuntimeClient.sendTranscriptionStartOver(websocket);

    expect(websocket.send).toHaveBeenNthCalledWith(
      1,
      '{"type":"set_langs","source_language":"en","target_language":"en"}',
    );
    expect(websocket.send).toHaveBeenNthCalledWith(2, '{"type":"start_over"}');
  });

  test('owns transcription reconnect timer scheduling and cleanup', () => {
    let nextTimerId = 0;
    const timerApi = {
      setTimeout: jest.fn(() => {
        nextTimerId += 1;
        return `timer-${nextTimerId}`;
      }),
      clearTimeout: jest.fn(),
    };
    const timerRef = {
      current: 'old-timer' as unknown as ReturnType<typeof setTimeout> | null,
    };
    const callback = jest.fn();

    const timerId = DesktopVoiceRuntimeClient.scheduleTranscriptionReconnectTimer({
      timerRef,
      callback,
      delayMs: 500,
      timerApi,
    });

    expect(timerId).toBe('timer-1');
    expect(timerRef.current).toBe('timer-1');
    expect(timerApi.clearTimeout).toHaveBeenCalledWith('old-timer');
    expect(timerApi.setTimeout).toHaveBeenCalledWith(callback, 500);

    DesktopVoiceRuntimeClient.clearTranscriptionReconnectTimer(timerRef, timerApi);

    expect(timerApi.clearTimeout).toHaveBeenCalledWith('timer-1');
    expect(timerRef.current).toBeNull();

    const fallbackCallback = jest.fn();
    const fallbackTimerRef = { current: null };
    expect(DesktopVoiceRuntimeClient.scheduleTranscriptionReconnectTimer({
      timerRef: fallbackTimerRef,
      callback: fallbackCallback,
      delayMs: 100,
      timerApi: {},
    })).toBeNull();
    expect(fallbackCallback).toHaveBeenCalledTimes(1);
    expect(fallbackTimerRef.current).toBeNull();
  });

  test('owns transcription socket state, close, and conditional sends', () => {
    const openWebsocket = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      close: jest.fn(),
    } as unknown as WebSocket;
    const closedWebsocket = {
      readyState: WebSocket.CLOSED,
      send: jest.fn(),
      close: jest.fn(),
    } as unknown as WebSocket;

    expect(DesktopVoiceRuntimeClient.isTranscriptionWebSocketActive(openWebsocket)).toBe(true);
    expect(DesktopVoiceRuntimeClient.isTranscriptionWebSocketActive(closedWebsocket)).toBe(false);
    expect(DesktopVoiceRuntimeClient.isTranscriptionWebSocketOpen(openWebsocket)).toBe(true);
    expect(DesktopVoiceRuntimeClient.isTranscriptionWebSocketOpen(closedWebsocket)).toBe(false);

    DesktopVoiceRuntimeClient.sendTranscriptionStartOverIfOpen(openWebsocket);
    DesktopVoiceRuntimeClient.sendTranscriptionStartOverIfOpen(closedWebsocket);

    expect(openWebsocket.send).toHaveBeenCalledWith('{"type":"start_over"}');
    expect(closedWebsocket.send).not.toHaveBeenCalled();

    expect(
      DesktopVoiceRuntimeClient.sendTranscriptionAudioMessageIfOpen(openWebsocket, 'audio'),
    ).toBe(true);
    expect(
      DesktopVoiceRuntimeClient.sendTranscriptionAudioMessageIfOpen(closedWebsocket, 'audio'),
    ).toBe(false);
    expect(openWebsocket.send).toHaveBeenCalledWith('audio');
    expect(closedWebsocket.send).not.toHaveBeenCalled();

    DesktopVoiceRuntimeClient.closeTranscriptionWebSocket(openWebsocket);
    DesktopVoiceRuntimeClient.closeTranscriptionWebSocket(null);

    expect(openWebsocket.close).toHaveBeenCalledTimes(1);
  });

  test('dispatches transcription gateway messages to value-level handlers', () => {
    const handlers = {
      onBinaryMessage: jest.fn(),
      onClientId: jest.fn(),
      onRealtimeText: jest.fn(),
      onUtteranceEnd: jest.fn(),
      onTraceEvent: jest.fn(),
      onUnknownMessage: jest.fn(),
    };

    DesktopVoiceRuntimeClient.dispatchTranscriptionGatewayMessage(JSON.stringify({
      type: 'status',
      client_id: 'client-1',
    }), handlers);
    DesktopVoiceRuntimeClient.dispatchTranscriptionGatewayMessage(JSON.stringify({
      type: 'realtime',
      text: 'hello',
      is_final: true,
    }), handlers);
    DesktopVoiceRuntimeClient.dispatchTranscriptionGatewayMessage(JSON.stringify({
      type: 'realtime',
      translation: 'translated text',
      text: 'raw text',
      is_final: 'true',
    }), handlers);
    DesktopVoiceRuntimeClient.dispatchTranscriptionGatewayMessage(JSON.stringify({
      type: 'utterance_end',
    }), handlers);
    DesktopVoiceRuntimeClient.dispatchTranscriptionGatewayMessage(JSON.stringify({
      type: 'trace_event',
      payload: {
        path: 'voice.transcription',
        stage: 'audio_frame',
        status: 'succeeded',
        runtime: 'backend',
        data: {
          byteLength: 4,
          text: 'must not surface',
        },
      },
    }), handlers);
    DesktopVoiceRuntimeClient.dispatchTranscriptionGatewayMessage(JSON.stringify({
      type: 'custom',
    }), handlers);
    DesktopVoiceRuntimeClient.dispatchTranscriptionGatewayMessage(new ArrayBuffer(4), handlers);

    expect('normalizeTranscriptionGatewayMessage' in DesktopVoiceRuntimeClient).toBe(false);
    expect(handlers.onClientId).toHaveBeenCalledWith('client-1');
    expect(handlers.onRealtimeText).toHaveBeenNthCalledWith(1, 'hello', true);
    expect(handlers.onRealtimeText).toHaveBeenNthCalledWith(2, 'translated text', true);
    expect(handlers.onUtteranceEnd).toHaveBeenCalledTimes(1);
    expect(handlers.onTraceEvent).toHaveBeenCalledWith({
      path: 'voice.transcription',
      stage: 'audio_frame',
      status: 'succeeded',
      runtime: 'backend',
    });
    expect(handlers.onUnknownMessage).toHaveBeenCalledWith('custom');
    expect(handlers.onBinaryMessage).toHaveBeenCalledTimes(1);
  });
});
