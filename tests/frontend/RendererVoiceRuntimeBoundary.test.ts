/**
 * Covers renderer voice runtime boundary. behavior in the frontend test suite.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

describe('renderer voice runtime boundary', () => {
  test('wakeword controller uses the desktop voice runtime facade for wakeword notifications', async () => {
    const wakewordControllerPath = path.resolve(
      __dirname,
      '../../frontend/src/renderer/app/WakewordController.jsx',
    );
    const source = await fs.readFile(wakewordControllerPath, 'utf8');

    expect(source).not.toContain('infrastructure/api/client');
    expect(source).not.toContain('ApiClient.');
    expect(source).toContain('DesktopVoiceRuntimeClient.wakewordDetected');
    expect(source).toContain('DesktopWindowRuntimeClient.showChatbox');
    expect(source).not.toContain('SHOW_CHATBOX');
    expect(source).not.toContain('IpcBridge.invoke');
  });

  test('voice mode hook delegates transcription protocol details to the desktop voice runtime', async () => {
    const voiceModeHookPath = path.resolve(
      __dirname,
      '../../frontend/src/renderer/features/voice/hooks/useVoiceMode.ts',
    );
    const source = await fs.readFile(voiceModeHookPath, 'utf8');

    expect(source).toContain('DesktopVoiceRuntimeClient.createTranscriptionWebSocket');
    expect(source).toContain('DesktopVoiceRuntimeClient.normalizeTranscriptionGatewayMessage');
    expect(source).toContain('DesktopVoiceRuntimeClient.sendDefaultTranscriptionLanguage');
    expect(source).toContain('DesktopVoiceRuntimeClient.sendTranscriptionStartOver');
    expect(source).not.toContain('buildTranscriptionWebSocketUrl');
    expect(source).not.toContain('new WebSocket');
    expect(source).not.toContain('JSON.parse');
  });

  test('voice hooks route lifecycle traces through the gated voice debug helper', async () => {
    const hookPaths = [
      '../../frontend/src/renderer/features/voice/hooks/useVoiceMode.ts',
      '../../frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts',
      '../../frontend/src/renderer/features/voice/hooks/useWakewordBridgeEvents.ts',
    ];

    for (const hookPath of hookPaths) {
      const source = await fs.readFile(path.resolve(__dirname, hookPath), 'utf8');

      expect(source).toContain('logVoiceDebugTrace');
      expect(source).not.toContain('console.log(');
    }
  });
});
