/**
 * Covers desktop voice runtime client. behavior in the frontend test suite.
 */

import { DesktopVoiceRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopVoiceRuntimeClient';
import {
  IpcBridge,
  ON_CHANNELS,
  SEND_CHANNELS,
} from '../../frontend/src/renderer/infrastructure/ipc/bridge';

const mockInvokeAgentSdkCommand = jest.fn(async () => undefined);

jest.mock('../../frontend/src/renderer/app/runtime/agentSdkCommandInvokeClient', () => {
  return {
    invokeAgentSdkCommand: (...args: unknown[]) => mockInvokeAgentSdkCommand(...args),
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

  test('sends wakeword notifications through the desktop runtime transport', async () => {
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

  test('normalizes transcription gateway messages', () => {
    expect(
      DesktopVoiceRuntimeClient.normalizeTranscriptionGatewayMessage(JSON.stringify({
        type: 'status',
        client_id: 'client-1',
      })),
    ).toEqual({ type: 'status', clientId: 'client-1' });

    expect(
      DesktopVoiceRuntimeClient.normalizeTranscriptionGatewayMessage(JSON.stringify({
        type: 'realtime',
        translation: 'translated text',
        text: 'raw text',
        is_final: 'true',
      })),
    ).toEqual({ type: 'realtime', text: 'translated text', isFinal: true });

    expect(
      DesktopVoiceRuntimeClient.normalizeTranscriptionGatewayMessage(JSON.stringify({
        type: 'realtime',
        text: 'raw text',
        is_final: false,
      })),
    ).toEqual({ type: 'realtime', text: 'raw text', isFinal: false });

    expect(
      DesktopVoiceRuntimeClient.normalizeTranscriptionGatewayMessage(JSON.stringify({
        type: 'utterance_end',
      })),
    ).toEqual({ type: 'utterance_end' });

    expect(
      DesktopVoiceRuntimeClient.normalizeTranscriptionGatewayMessage(JSON.stringify({
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
      })),
    ).toEqual({
      type: 'trace_event',
      path: 'voice.transcription',
      stage: 'audio_frame',
      status: 'succeeded',
      runtime: 'backend',
    });

    expect(
      DesktopVoiceRuntimeClient.normalizeTranscriptionGatewayMessage(JSON.stringify({
        type: 'custom',
      })),
    ).toEqual({ type: 'unknown', messageType: 'custom' });
  });

  test('returns null for binary transcription gateway messages', () => {
    expect(
      DesktopVoiceRuntimeClient.normalizeTranscriptionGatewayMessage(new ArrayBuffer(8)),
    ).toBeNull();
  });
});
