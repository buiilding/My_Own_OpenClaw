/**
 * Covers renderer voice runtime boundary. behavior in the frontend test suite.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

describe('renderer voice runtime boundary', () => {
  test('wakeword controller uses the voice app-runtime client for wakeword notifications', async () => {
    const wakewordControllerPath = path.resolve(
      __dirname,
      '../../src/renderer/app/WakewordController.jsx',
    );
    const source = await fs.readFile(wakewordControllerPath, 'utf8');

    expect(source).not.toContain('infrastructure/api/client');
    expect(source).not.toContain('ApiClient.');
    expect(source).toContain('DesktopVoiceRuntimeClient.wakewordDetected');
    expect(source).toContain('DesktopWindowRuntimeClient.showChatboxWithValues');
    expect(source).not.toContain('DesktopWindowRuntimeClient.showChatbox({');
    expect(source).not.toContain('SHOW_CHATBOX');
    expect(source).not.toContain('IpcBridge.invoke');
  });

  test('voice mode hook delegates transcription protocol details to the voice app-runtime client', async () => {
    const voiceModeHookPath = path.resolve(
      __dirname,
      '../../src/renderer/features/voice/hooks/useVoiceMode.ts',
    );
    const runtimeClientPath = path.resolve(
      __dirname,
      '../../src/renderer/app/runtime/desktopVoiceRuntimeClient.ts',
    );
    const source = await fs.readFile(voiceModeHookPath, 'utf8');
    const runtimeSource = await fs.readFile(runtimeClientPath, 'utf8');

    expect(source).toContain('DesktopVoiceRuntimeClient.createTranscriptionWebSocket');
    expect(source).toContain('DesktopVoiceRuntimeClient.isTranscriptionWebSocketActive');
    expect(source).toContain('DesktopVoiceRuntimeClient.dispatchTranscriptionGatewayMessage');
    expect(source).not.toContain('DesktopVoiceRuntimeClient.normalizeTranscriptionGatewayMessage');
    expect(runtimeSource).toContain('const event = normalizeTranscriptionGatewayMessage(rawData);');
    expect(runtimeSource).not.toContain('DesktopVoiceRuntimeClient.normalizeTranscriptionGatewayMessage');
    expect(runtimeSource).toContain('function resolveWakewordReadyStatus');
    expect(runtimeSource).not.toContain('export function resolveWakewordReadyStatus');
    expect(runtimeSource).toContain('function resolveWakewordDetectionValues');
    expect(runtimeSource).not.toContain('export function resolveWakewordDetectionValues');
    expect(runtimeSource).toContain('function resolveWakewordToggleState');
    expect(runtimeSource).not.toContain('export function resolveWakewordToggleState');
    expect(source).toContain('DesktopVoiceRuntimeClient.sendDefaultTranscriptionLanguage');
    expect(source).toContain('DesktopVoiceRuntimeClient.sendTranscriptionStartOverIfOpen');
    expect(source).toContain('DesktopVoiceRuntimeClient.sendTranscriptionAudioMessageIfOpen');
    expect(source).toContain('DesktopVoiceRuntimeClient.closeTranscriptionWebSocket');
    expect(source).toContain('DesktopVoiceRuntimeClient.scheduleTranscriptionReconnectTimer');
    expect(source).toContain('DesktopVoiceRuntimeClient.clearTranscriptionReconnectTimer');
    expect(runtimeSource).toContain('scheduleTranscriptionReconnectTimer');
    expect(runtimeSource).toContain('clearTranscriptionReconnectTimer');
    expect(runtimeSource).toContain('setTimeout');
    expect(runtimeSource).toContain('clearTimeout');
    expect(source).not.toContain('buildTranscriptionWebSocketUrl');
    expect(source).not.toContain('new WebSocket');
    expect(source).not.toContain('.readyState');
    expect(source).not.toContain('.close()');
    expect(source).not.toContain('setTimeout(');
    expect(source).not.toContain('clearTimeout(');
    expect(source).not.toContain('websocketRef.current.send');
    expect(source).not.toContain('JSON.parse');
    expect(source).not.toContain('switch (data.type)');
    expect(source).not.toContain('data.clientId');
    expect(source).not.toContain('data.text');
    expect(source).not.toContain('data.isFinal');
    expect(source).not.toContain('data.messageType');
  });

  test('voice hooks consume app-runtime audio capture helpers', async () => {
    const voiceModeHookPath = path.resolve(
      __dirname,
      '../../src/renderer/features/voice/hooks/useVoiceMode.ts',
    );
    const detectionHookPath = path.resolve(
      __dirname,
      '../../src/renderer/features/voice/hooks/useWakewordDetection.ts',
    );
    const rendererRoot = path.resolve(__dirname, '../../src/renderer');
    const voiceModeSource = await fs.readFile(voiceModeHookPath, 'utf8');
    const detectionSource = await fs.readFile(detectionHookPath, 'utf8');
    const audioEncodingRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopVoiceAudioEncodingRuntime.ts'),
      'utf8',
    );
    const audioCleanupRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopVoiceAudioCaptureCleanupRuntime.ts'),
      'utf8',
    );
    const audioInputDeviceRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopVoiceAudioInputDeviceRuntime.ts'),
      'utf8',
    );
    const audioProcessorRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopVoiceAudioProcessorNodeRuntime.ts'),
      'utf8',
    );

    for (const source of [voiceModeSource, detectionSource]) {
      expect(source).toContain('desktopVoiceAudioEncodingRuntime');
      expect(source).toContain('DesktopVoiceAudioEncodingRuntime');
      expect(source).toContain('desktopVoiceAudioCaptureCleanupRuntime');
      expect(source).toContain('DesktopVoiceAudioCaptureCleanupRuntime');
      expect(source).toContain('desktopVoiceAudioInputDeviceRuntime');
      expect(source).toContain('DesktopVoiceAudioInputDeviceRuntime');
      expect(source).toContain('desktopVoiceAudioProcessorNodeRuntime');
      expect(source).toContain('DesktopVoiceAudioProcessorNodeRuntime');
      expect(source).not.toContain('import { float32ToPcm16');
      expect(source).not.toContain('import { cleanupAudioCaptureNodes');
      expect(source).not.toContain('import { createAudioCaptureProcessorNode');
      expect(source).not.toContain('../utils/audioEncoding');
      expect(source).not.toContain('../utils/audioCaptureCleanup');
      expect(source).not.toContain('../utils/audioProcessorNode');
      expect(source).not.toContain('navigator.mediaDevices');
      expect(source).not.toContain('window.AudioContext');
      expect(source).not.toContain('webkitAudioContext');
    }
    expect(audioEncodingRuntimeSource).toContain('export const DesktopVoiceAudioEncodingRuntime = Object.freeze');
    expect(audioEncodingRuntimeSource).not.toContain('export function float32ToPcm16');
    expect(audioEncodingRuntimeSource).not.toContain('export function normalizeAudioCaptureChunkSize');
    expect(audioEncodingRuntimeSource).not.toContain('export function buildGatewayAudioMessage');
    expect(audioCleanupRuntimeSource).toContain('export const DesktopVoiceAudioCaptureCleanupRuntime = Object.freeze');
    expect(audioCleanupRuntimeSource).not.toContain('export function cleanupAudioCaptureNodes');
    expect(audioCleanupRuntimeSource).not.toContain('export function takeAudioContext');
    expect(audioCleanupRuntimeSource).not.toContain('export async function closeAudioContextSafely');
    expect(audioInputDeviceRuntimeSource).toContain('export const DesktopVoiceAudioInputDeviceRuntime = Object.freeze');
    expect(audioInputDeviceRuntimeSource).not.toContain('export async function requestAudioInputStream');
    expect(audioInputDeviceRuntimeSource).not.toContain('export function createAudioInputContext');
    expect(audioInputDeviceRuntimeSource).not.toContain('export function onAudioInputDeviceChange');
    expect(audioProcessorRuntimeSource).toContain('export const DesktopVoiceAudioProcessorNodeRuntime = Object.freeze');
    expect(audioProcessorRuntimeSource).not.toContain('export async function createAudioCaptureProcessorNode');

    await expect(fs.access(path.join(rendererRoot, 'features/voice/utils/audioEncoding.ts'))).rejects.toThrow();
    await expect(fs.access(path.join(rendererRoot, 'features/voice/utils/audioCaptureCleanup.ts'))).rejects.toThrow();
    await expect(fs.access(path.join(rendererRoot, 'features/voice/utils/audioProcessorNode.ts'))).rejects.toThrow();
  });

  test('wakeword hooks delegate bridge IPC to the voice app-runtime client', async () => {
    const detectionHookPath = path.resolve(
      __dirname,
      '../../src/renderer/features/voice/hooks/useWakewordDetection.ts',
    );
    const bridgeHookPath = path.resolve(
      __dirname,
      '../../src/renderer/features/voice/hooks/useWakewordBridgeEvents.ts',
    );
    const detectionSource = await fs.readFile(detectionHookPath, 'utf8');
    const bridgeSource = await fs.readFile(bridgeHookPath, 'utf8');
    const wakewordEventRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopWakewordEventRuntime.ts'),
      'utf8',
    );

    expect(detectionSource).toContain('DesktopVoiceRuntimeClient.sendWakewordAudioChunk');
    expect(detectionSource).toContain('DesktopVoiceRuntimeClient.enableWakeword');
    expect(detectionSource).toContain('DesktopVoiceRuntimeClient.disableWakeword');
    expect(detectionSource).toContain('DesktopWakewordEventRuntime');
    expect(detectionSource).not.toContain('import { getChunkSizeWarning');
    expect(detectionSource).not.toContain('SEND_CHANNELS');
    expect(detectionSource).not.toContain('IpcBridge.');
    expect(bridgeSource).toContain('DesktopVoiceRuntimeClient.onWakewordDetectedValues');
    expect(bridgeSource).not.toContain('DesktopVoiceRuntimeClient.onWakewordDetected(');
    expect(bridgeSource).toContain('DesktopVoiceRuntimeClient.onWakewordReadyStatus');
    expect(bridgeSource).not.toContain('DesktopVoiceRuntimeClient.onWakewordStatus');
    expect(bridgeSource).not.toContain('data?.confidence');
    expect(bridgeSource).not.toContain('data.model');
    expect(bridgeSource).not.toContain('data.score');
    expect(bridgeSource).toContain('DesktopWakewordEventRuntime');
    expect(bridgeSource).not.toContain('resolveConfidence');
    expect(bridgeSource).not.toContain('status.ready');
    expect(bridgeSource).not.toContain('status.error');
    expect(bridgeSource).not.toContain('ON_CHANNELS');
    expect(bridgeSource).not.toContain('IpcBridge.');
    expect(wakewordEventRuntimeSource).toContain('export const DesktopWakewordEventRuntime = Object.freeze');
    expect(wakewordEventRuntimeSource).not.toContain('export function getChunkSizeWarning');
    expect(wakewordEventRuntimeSource).not.toContain('export function resolveConfidence');
    expect(wakewordEventRuntimeSource).not.toContain('export function isWithinCooldown');
  });

  test('voice hooks route lifecycle traces through the gated voice debug helper', async () => {
    const hookPaths = [
      '../../src/renderer/features/voice/hooks/useVoiceMode.ts',
      '../../src/renderer/features/voice/hooks/useWakewordDetection.ts',
      '../../src/renderer/features/voice/hooks/useWakewordBridgeEvents.ts',
    ];
    const debugTraceRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopVoiceDebugTraceRuntime.ts'),
      'utf8',
    );

    for (const hookPath of hookPaths) {
      const source = await fs.readFile(path.resolve(__dirname, hookPath), 'utf8');

      expect(source).toContain('logVoiceDebugTrace');
      expect(source).toContain('DesktopVoiceDebugTraceRuntime');
      expect(source).toContain('desktopVoiceDebugTraceRuntime');
      expect(source).not.toContain('../utils/voiceDebugTrace');
      expect(source).not.toContain('console.log(');
    }
    expect(debugTraceRuntimeSource).toContain('export const DesktopVoiceDebugTraceRuntime = Object.freeze');
    expect(debugTraceRuntimeSource).not.toContain('export function logVoiceDebugTrace');
  });

  test('wakeword hooks consume app-runtime wakeword helpers', async () => {
    const detectionHookPath = path.resolve(
      __dirname,
      '../../src/renderer/features/voice/hooks/useWakewordDetection.ts',
    );
    const bridgeHookPath = path.resolve(
      __dirname,
      '../../src/renderer/features/voice/hooks/useWakewordBridgeEvents.ts',
    );
    const captureGuardRuntimePath = path.resolve(
      __dirname,
      '../../src/renderer/app/runtime/desktopWakewordCaptureGuardRuntime.ts',
    );
    const rendererRoot = path.resolve(__dirname, '../../src/renderer');
    const detectionSource = await fs.readFile(detectionHookPath, 'utf8');
    const bridgeSource = await fs.readFile(bridgeHookPath, 'utf8');
    const captureGuardRuntimeSource = await fs.readFile(captureGuardRuntimePath, 'utf8');

    expect(detectionSource).toContain('desktopWakewordCaptureGuardRuntime');
    expect(detectionSource).toContain('DesktopWakewordCaptureGuardRuntime');
    expect(detectionSource).toContain('desktopWakewordEventRuntime');
    expect(detectionSource).toContain('onAudioInputDeviceChange');
    expect(detectionSource).not.toContain('devicechange');
    expect(bridgeSource).toContain('desktopWakewordEventRuntime');
    for (const source of [detectionSource, bridgeSource]) {
      expect(source).not.toContain('../utils/wakewordCaptureGuard');
      expect(source).not.toContain('../utils/wakewordEventUtils');
    }
    expect(captureGuardRuntimeSource).toContain('export const DesktopWakewordCaptureGuardRuntime = Object.freeze');
    expect(captureGuardRuntimeSource).not.toContain('export function getWakewordCaptureGuard');
    expect(captureGuardRuntimeSource).not.toContain('export function clearWakewordCaptureGuard');
    expect(captureGuardRuntimeSource).not.toContain('export function isMissingAudioDeviceError');
    expect(captureGuardRuntimeSource).not.toContain('export async function hasAvailableAudioInputDevice');

    await expect(fs.access(path.join(rendererRoot, 'features/voice/utils/wakewordCaptureGuard.ts'))).rejects.toThrow();
    await expect(fs.access(path.join(rendererRoot, 'features/voice/utils/wakewordEventUtils.ts'))).rejects.toThrow();
    await expect(fs.access(path.join(rendererRoot, 'features/voice/utils/voiceDebugTrace.ts'))).rejects.toThrow();
  });

  test('renderer source topology routes voice through the voice app-runtime client', async () => {
    const folderStructurePath = path.resolve(
      __dirname,
      '../../src/renderer/folder_structure.md',
    );
    const source = await fs.readFile(folderStructurePath, 'utf8');

    expect(source).toContain('Voice Mode (Desktop Voice Runtime Gateway)');
    expect(source).toContain('DesktopVoiceRuntimeClient');
    expect(source).toContain('backend owns STT provider policy');
    expect(source).toContain('typed audio-chunk runtime events');
    expect(source).not.toContain('Voice Mode (Backend Transcription Gateway)');
    expect(source).not.toContain('WebSocket connection to backend `/ws/transcription`');
    expect(source).not.toContain('TTS audio chunks from backend');
  });

  test('renderer voice docs keep backend provider policy behind the gateway boundary', async () => {
    const rendererVoiceDocPaths = [
      '../../docs/frontend/renderer/voice/voice_mode_gateway_connection_and_transcription_region_reference.md',
      '../../docs/frontend/renderer/voice_capture_and_wakeword_controller_reference.md',
      '../../src/renderer/folder_structure.md',
    ];
    const docText = (
      await Promise.all(
        rendererVoiceDocPaths.map((docPath) =>
          fs.readFile(path.resolve(__dirname, docPath), 'utf8'),
        ),
      )
    ).join('\n');

    expect(docText).toContain('provider-specific translation');
    expect(docText).toContain('voice app-runtime client');
    expect(docText).toContain('renderer-facing code treats provider/model config as backend-owned route');
    expect(docText).not.toContain('desktop voice runtime facade');
    expect(docText).not.toContain('WindieOS-local gateway protocol');
    expect(docText).not.toContain('Nova-Voice');
    expect(docText).not.toContain('OpenAI Realtime');
    expect(docText).not.toContain('openai_realtime');
    expect(docText).not.toContain('stt_provider=');
    expect(docText).not.toContain('TTS audio chunks from backend');
  });
});
