/**
 * Covers renderer app runtime boundary. behavior in the frontend test suite.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const appRoot = path.resolve(__dirname, '../../frontend/src/renderer/app');
const rendererRoot = path.resolve(__dirname, '../../frontend/src/renderer');
const allowedRelativePaths = new Set([
  'runtime/desktopChatStreamIngressRuntime.ts',
  'runtime/desktopTranscriptSessionRuntimeClient.ts',
]);
const allowedSdkOwnedInternalChannelPaths = new Set([
  'infrastructure/ipc/channels.ts',
]);

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(absolutePath));
      continue;
    }
    if (/\.(cjs|js|jsx|ts|tsx)$/.test(entry.name)) {
      files.push(absolutePath);
    }
  }
  return files;
}

describe('renderer app runtime boundary', () => {
  test('renderer skin and SDK facade use desktop-runtime UI wording', async () => {
    const skinSource = await fs.readFile(
      path.join(appRoot, 'skin/windieDesktopSkin.js'),
      'utf8',
    );
    const sdkFacadeSource = await fs.readFile(
      path.join(rendererRoot, 'infrastructure/api/agentSdkClient.ts'),
      'utf8',
    );

    expect(skinSource).toContain('generic desktop runtime UI');
    expect(skinSource).not.toContain('generic desktop agent UI');
    expect(sdkFacadeSource).toContain('desktop runtime UI');
    expect(sdkFacadeSource).not.toContain('desktop agent UI');
  });

  test('frontend architecture docs describe renderer skin facades with desktop-runtime wording', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../docs/architecture/frontend_architecture.md'),
      'utf8',
    );

    expect(source).toContain('active desktop-runtime skin');
    expect(source).not.toContain(`active desktop-${'agent'} skin`);
  });

  test('conversation library facade uses SDK-shaped commands for user-facing conversation actions', async () => {
    const source = await fs.readFile(
      path.join(appRoot, 'runtime/desktopConversationLibraryClient.js'),
      'utf8',
    );

    expect(source).toContain('invokeAgentSdkCommand');
    expect(source).toContain('SDK_RUNTIME_COMMANDS.CONVERSATIONS_LIST');
    expect(source).toContain('SDK_RUNTIME_COMMANDS.CONVERSATIONS_SEARCH');
    expect(source).toContain('SDK_RUNTIME_COMMANDS.CONVERSATIONS_DELETE');
    expect(source).toContain('SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD_DISPLAY');
    expect(source).not.toContain("'conversation.load'");
    expect(source).not.toContain("'conversation.loadRehydrate'");
    expect(source).not.toContain('DesktopConversationStoreAdapter');
    expect(source).not.toContain('INVOKE_CHANNELS.LIST_CHAT_CONVERSATIONS');
    expect(source).not.toContain('INVOKE_CHANNELS.GET_CHAT_EVENTS');
    expect(source).toContain('TRANSIENT_METADATA_LIST_ERROR_PATTERNS');
    expect(source).toContain('timed out waiting for local runtime');
    expect(source).not.toContain("message.includes('local backend not ready')");
    expect(source).not.toContain('sidecar daemon request failed');
    expect(source).not.toContain('timed out waiting for sidecar daemon');
    expect(source).not.toContain("message.includes('sidecar daemon request failed')");
    expect(source).not.toContain("message.includes('timed out waiting for sidecar daemon')");
  });

  test('chat stream stale-turn guard uses generic runtime packet wording', async () => {
    const source = await fs.readFile(
      path.join(appRoot, 'runtime/desktopChatStreamEventRuntime.ts'),
      'utf8',
    );

    expect(source).toContain('runtime packets can re-anchor stream state');
    expect(source).not.toContain('backend packets can re-anchor stream state');
  });

  test('live-turn and agent runtime transport facades use SDK-shaped command invoke for SDK runtime commands', async () => {
    const liveTurnSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopLiveTurnRuntimeClient.ts'),
      'utf8',
    );
    const agentRuntimeTransportSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopRuntimeTransport.ts'),
      'utf8',
    );

    expect(liveTurnSource).toContain('invokeAgentSdkCommand');
    expect(liveTurnSource).toContain('SDK_RUNTIME_COMMANDS.CONVERSATION_SEND');
    expect(liveTurnSource).toContain('SDK_RUNTIME_COMMANDS.CONVERSATION_STOP');
    expect(liveTurnSource).not.toContain('WINDIE_SEND');
    expect(liveTurnSource).not.toContain('WINDIE_STOP');

    expect(agentRuntimeTransportSource).toContain('invokeAgentSdkCommand');
    expect(agentRuntimeTransportSource).toContain('SDK_RUNTIME_COMMANDS.CONVERSATION_SEND');
    expect(agentRuntimeTransportSource).toContain('SDK_RUNTIME_COMMANDS.CONVERSATION_STOP');
    expect(agentRuntimeTransportSource).toContain('SDK_RUNTIME_COMMANDS.CONVERSATION_REHYDRATE');
    expect(agentRuntimeTransportSource).toContain('SDK_RUNTIME_COMMANDS.CONVERSATION_COMPACT');
    expect(agentRuntimeTransportSource).toContain('SDK_RUNTIME_COMMANDS.SETTINGS_UPDATE');
    expect(agentRuntimeTransportSource).toContain('SDK_RUNTIME_COMMANDS.MODELS_LIST');
    expect(agentRuntimeTransportSource).toContain('SDK_RUNTIME_COMMANDS.WAKEWORD_DETECTED');
    expect(agentRuntimeTransportSource).toContain('AgentRuntimeTransport');
    expect(agentRuntimeTransportSource).not.toContain('BackendTransport');
    expect(agentRuntimeTransportSource).not.toContain('WINDIE_SEND');
    expect(agentRuntimeTransportSource).not.toContain('WINDIE_STOP');
    expect(agentRuntimeTransportSource).not.toContain('WINDIE_REHYDRATE');
    expect(agentRuntimeTransportSource).not.toContain('WINDIE_COMPACT_HISTORY');
  });

  test('SDK command invoke client resolves the generic agent SDK bridge', async () => {
    const source = await fs.readFile(
      path.join(appRoot, 'runtime/agentSdkCommandInvokeClient.ts'),
      'utf8',
    );

    expect(source).toContain('getAgentSdkCommandBridge');
    expect(source).toContain('type AgentSdkCommandBridge');
    expect(source).toContain('window.agentSdk ?? null');
    expect(source).not.toContain('window.desktopAgent');
    expect(source).not.toContain('window.windie');
    expect(source).toContain('DESKTOP_RUNTIME_INVOKE_CHANNELS.INVOKE');
    expect(source).not.toContain('INVOKE_CHANNELS.WINDIE_INVOKE');
    expect(source).not.toContain('getDesktopAgentCommandBridge');
    expect(source).not.toContain('DesktopAgentCommandBridge');
  });

  test('renderer app startup installs interaction logging through app runtime client', async () => {
    const mainSource = await fs.readFile(
      path.join(appRoot, 'main.jsx'),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopInteractionRuntimeClient.ts'),
      'utf8',
    );

    expect(mainSource).toContain('DesktopInteractionRuntimeClient.installInteractionLogger');
    expect(mainSource).not.toContain('infrastructure/interaction/rendererInteractionLogger');
    expect(mainSource).not.toContain('installRendererInteractionLogger');
    expect(clientSource).toContain('installRendererInteractionLogger()');
    expect(clientSource).toContain('logUserSentMessage(details)');
  });

  test('app providers read latest-ref helper through renderer hooks runtime client', async () => {
    const providerFiles = [
      'providers/AppProvider.jsx',
      'providers/AppConfigProvider.jsx',
    ];
    const hookClientSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopRendererHooksRuntimeClient.ts'),
      'utf8',
    );

    for (const providerFile of providerFiles) {
      const source = await fs.readFile(path.join(appRoot, providerFile), 'utf8');
      expect(source).toContain('desktopRendererHooksRuntimeClient');
      expect(source).not.toContain('infrastructure/hooks/useLatestRef');
    }
    expect(hookClientSource).toContain('infrastructure/hooks/useLatestRef');
  });

  test('app provider code uses runtime facades for transcript session helpers', async () => {
    const files = await listSourceFiles(appRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = normalizeRelativePath(path.relative(appRoot, file));
      if (allowedRelativePaths.has(relativePath)) {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('infrastructure/transcript/TranscriptWriter')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('app config provider binds transcript users through transcript runtime client', async () => {
    const providerSource = await fs.readFile(
      path.join(appRoot, 'providers/AppConfigProvider.jsx'),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopTranscriptSessionRuntimeClient.ts'),
      'utf8',
    );

    expect(providerSource).toContain('DesktopTranscriptSessionRuntimeClient.bindTranscriptUser');
    expect(providerSource).not.toContain('features/chat/session/conversationSessionRuntime');
    expect(providerSource).not.toContain('applyTranscriptSessionUserBinding');
    expect(clientSource).toContain('applyTranscriptSessionUserBinding');
  });

  test('app runtime modules do not import chat feature internals', async () => {
    const files = await listSourceFiles(path.join(appRoot, 'runtime'));
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = normalizeRelativePath(path.relative(appRoot, file));
      if (allowedRelativePaths.has(relativePath)) {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('features/chat')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('renderer app and feature code does not call SDK-owned sidecar/internal IPC channels', async () => {
    const roots = [
      path.join(rendererRoot, 'app'),
      path.join(rendererRoot, 'features'),
      path.join(rendererRoot, 'infrastructure/transcript'),
    ];
    const files = (await Promise.all(roots.map(root => listSourceFiles(root)))).flat();
    const offenders: string[] = [];
    const forbidden = [
      'INVOKE_CHANNELS.WINDIE_SEND',
      'INVOKE_CHANNELS.WINDIE_STOP',
      'INVOKE_CHANNELS.WINDIE_REHYDRATE',
      'INVOKE_CHANNELS.WINDIE_COMPACT_HISTORY',
      'INVOKE_CHANNELS.WINDIE_UPDATE_SETTINGS',
      'INVOKE_CHANNELS.WINDIE_LIST_MODELS',
      'INVOKE_CHANNELS.LIST_CHAT_CONVERSATIONS',
      'INVOKE_CHANNELS.SEARCH_CHAT_CONVERSATIONS',
      'INVOKE_CHANNELS.GET_CHAT_EVENTS',
      'INVOKE_CHANNELS.DELETE_CHAT_CONVERSATION',
      'INVOKE_CHANNELS.CLEAR_CHAT_HISTORY',
      'windie:send',
      'windie:stop',
      'windie:rehydrate',
      'windie:compact-history',
      'list-chat-conversations',
      'search-chat-conversations',
      'get-chat-events',
      'delete-chat-conversation',
      'clear-chat-history',
    ];

    for (const file of files) {
      const relativePath = normalizeRelativePath(path.relative(rendererRoot, file));
      if (allowedSdkOwnedInternalChannelPaths.has(relativePath)) {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      if (forbidden.some((needle) => source.includes(needle))) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('renderer IPC channel module validates shape without duplicating product wire values', async () => {
    const source = await fs.readFile(
      path.join(rendererRoot, 'infrastructure/ipc/channels.ts'),
      'utf8',
    );
    const sharedRegistry = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/shared/ipcChannels.json'),
      'utf8',
    );

    expect(source).toContain('EXPECTED_SHARED_CHANNEL_KEYS');
    expect(source).toContain('must be a non-empty string');
    expect(source).not.toContain('EXPECTED_SHARED_CHANNEL_REGISTRY =');
    expect(source).not.toContain('windie:');
    expect(sharedRegistry).toContain('windie:invoke');
    expect(sharedRegistry).toContain('windie:current-turn');
  });
});
