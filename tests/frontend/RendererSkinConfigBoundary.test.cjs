/**
 * Covers renderer skin/config boundary behavior in the frontend test suite.
 */

const fs = require('fs');
const path = require('path');

const rendererRoot = path.resolve(__dirname, '../../frontend/src/renderer');
const skinPath = path.join(rendererRoot, 'app/skin/windieDesktopSkin.js');
const providerCredentialSettingsPath = path.join(rendererRoot, 'app/skin/providerCredentialSettings.js');
const settingsRoot = path.join(rendererRoot, 'features/dashboard/components/sections/settings');
const dashboardSectionsRoot = path.join(rendererRoot, 'features/dashboard/components/sections');
const configStoragePath = path.join(rendererRoot, 'utils/configStorage.js');

function read(relativePath) {
  return fs.readFileSync(path.join(settingsRoot, relativePath), 'utf8');
}

describe('renderer skin/config boundary', () => {
  test('WindieOS product strings for settings live in the renderer skin', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');

    expect(skinSource).toContain("const productName = 'WindieOS'");
    expect(skinSource).toContain("const browserName = 'Windie Browser'");
    expect(skinSource).toContain('remoteTools');
    expect(skinSource).toContain('memoryPanel');
    expect(skinSource).toContain('onboarding');
    expect(skinSource).toContain('chat');
    expect(skinSource).toContain('web_search');
    expect(skinSource).toContain('run_shell_command');
    expect(skinSource).toContain('requireUserMessage');
  });

  test('settings components consume skin copy instead of hard-coding product copy', () => {
    const settingsSources = [
      'AgentSettingsTab.jsx',
      'GeneralSettingsTab.jsx',
      'BrowserSettingsTab.jsx',
      'WorkspaceSettingsTab.jsx',
      'MemorySettingsTab.jsx',
      'useMemorySettingsActions.js',
    ].map(read);

    for (const source of settingsSources) {
      expect(source).toContain('windieDesktopSkin');
      expect(source).not.toContain('WindieOS');
      expect(source).not.toContain('Windie Browser');
      expect(source).not.toContain('hosted WindieOS backend');
      expect(source).not.toContain('Local sidecar tools');
      expect(source).not.toContain('No sidecar plugins loaded');
      expect(source).not.toContain('Connect WindieOS before deleting saved data.');
    }
  });

  test('memory panel consumes skin copy instead of hard-coding product copy', () => {
    const source = fs.readFileSync(path.join(dashboardSectionsRoot, 'MemorySection.jsx'), 'utf8');

    expect(source).toContain('windieDesktopSkin');
    expect(source).not.toContain('WindieOS builds understanding');
    expect(source).not.toContain('Memories will appear as you interact with WindieOS');
    expect(source).not.toContain('Search memories...');
  });

  test('onboarding and chat consumers read product copy from the skin', () => {
    const consumers = [
      'features/onboarding/components/FrontendOnboardingSlideshow.jsx',
      'features/chat/hooks/useChatMessageSender.ts',
      'features/chat/hooks/useConversationReplayActions.js',
      'features/chat/components/ChatInterface.jsx',
      'features/chat/components/ChatBrowserSessionControl.jsx',
      'app/runtime/desktopLiveTurnRuntimeClient.ts',
    ].map((relativePath) => fs.readFileSync(path.join(rendererRoot, relativePath), 'utf8'));

    for (const source of consumers) {
      expect(source).toContain('windieDesktopSkin');
      expect(source).not.toContain('WindieOS onboarding');
      expect(source).not.toContain('Start WindieOS');
      expect(source).not.toContain('Welcome to WindieOS Demo');
      expect(source).not.toContain("WindieOS isn't connected");
      expect(source).not.toContain('WindieOS could not prepare');
      expect(source).not.toContain('WindieOS runtime');
      expect(source).not.toContain('dedicated Windie browser');
      expect(source).not.toContain('canStartWindieOs');
      expect(source).not.toContain('__windieReplayStep');
    }
  });

  test('voice capture internals do not embed product naming', () => {
    const consumers = [
      'features/voice/utils/audioProcessorNode.ts',
      'features/voice/hooks/useVoiceMode.ts',
      'features/voice/utils/wakewordCaptureGuard.ts',
    ].map((relativePath) => fs.readFileSync(path.join(rendererRoot, relativePath), 'utf8'));

    for (const source of consumers) {
      expect(source).not.toContain('WindieOS');
      expect(source).not.toContain('windieos-capture-processor');
      expect(source).not.toContain('WindieOSCaptureProcessor');
      expect(source).not.toContain('__windieWakewordCaptureGuard');
    }
  });

  test('settings components do not expose sidecar execution targets as user-facing labels', () => {
    const source = read('AgentSettingsTab.jsx');

    expect(source).toContain('formatToolAcceptanceRuntimeSummary');
    expect(source).not.toContain("execution_target || 'sidecar'");
    expect(source).not.toContain("acceptedTool.execution_target || 'sidecar'");
  });

  test('provider credential defaults live in renderer skin config', () => {
    const providerSkinSource = fs.readFileSync(providerCredentialSettingsPath, 'utf8');
    const configStorageSource = fs.readFileSync(configStoragePath, 'utf8');
    const apiKeysSource = fs.readFileSync(
      path.join(dashboardSectionsRoot, 'providerApiKeys.js'),
      'utf8',
    );

    expect(providerSkinSource).toContain('DEFAULT_PROVIDER_API_KEYS');
    expect(providerSkinSource).toContain('PROVIDER_API_KEY_SPECS');
    expect(configStorageSource).toContain('providerCredentialSettings');
    expect(apiKeysSource).toContain('providerCredentialSettings');
    expect(configStorageSource).not.toContain('openai: { enabled: false');
    expect(apiKeysSource).not.toContain('OpenAI API Key');
  });
});
