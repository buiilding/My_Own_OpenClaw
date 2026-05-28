import { DesktopVoiceRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopVoiceRuntimeClient';
import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => {
  const actual = jest.requireActual('../../frontend/src/renderer/infrastructure/ipc/bridge');
  return {
    ...actual,
    IpcBridge: {
      ...actual.IpcBridge,
      invoke: jest.fn(async () => undefined),
    },
  };
});

describe('DesktopVoiceRuntimeClient', () => {
  const mockInvoke = IpcBridge.invoke as jest.MockedFunction<typeof IpcBridge.invoke>;

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
  });

  test('sends wakeword notifications through the desktop backend transport', async () => {
    await expect(DesktopVoiceRuntimeClient.wakewordDetected()).resolves.toBeUndefined();

    expect(mockInvoke).toHaveBeenCalledWith(INVOKE_CHANNELS.WINDIE_WAKEWORD_DETECTED, {});
  });

  test('returns backend transport failures to the caller', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('backend unavailable'));

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
