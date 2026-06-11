import { DesktopVoiceRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopVoiceRuntimeClient';

const mockInvokeWindieCommand = jest.fn(async () => undefined);

jest.mock('../../frontend/src/renderer/app/runtime/windieCommandInvokeClient', () => {
  return {
    invokeWindieCommand: (...args: unknown[]) => mockInvokeWindieCommand(...args),
  };
});

describe('DesktopVoiceRuntimeClient', () => {
  beforeEach(() => {
    mockInvokeWindieCommand.mockReset();
    mockInvokeWindieCommand.mockResolvedValue(undefined);
  });

  test('sends wakeword notifications through the desktop backend transport', async () => {
    await expect(DesktopVoiceRuntimeClient.wakewordDetected()).resolves.toBeUndefined();

    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('wakeword.detected', {});
  });

  test('returns backend transport failures to the caller', async () => {
    mockInvokeWindieCommand.mockRejectedValueOnce(new Error('backend unavailable'));

    await expect(DesktopVoiceRuntimeClient.wakewordDetected()).rejects.toThrow(
      'backend unavailable',
    );
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
