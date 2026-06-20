/**
 * Covers renderer skin/config boundary behavior in the frontend test suite.
 */

const fs = require('fs');
const path = require('path');

const rendererRoot = path.resolve(__dirname, '../../frontend/src/renderer');
const appPath = path.join(rendererRoot, 'app/App.jsx');
const skinPath = path.join(rendererRoot, 'app/skin/windieDesktopSkin.js');
const skinFacadePath = path.join(rendererRoot, 'app/skin/desktopRuntimeSkin.js');
const skinConfigFacadePath = path.join(rendererRoot, 'app/skin/desktopRuntimeConfig.js');
const skinCssFacadePath = path.join(rendererRoot, 'app/skin/desktopRuntimeSkin.css');
const skinCssPath = path.join(rendererRoot, 'app/skin/windieDesktopSkin.css');
const dashboardShellCssPath = path.join(rendererRoot, 'styles/DashboardShell.css');
const dashboardPanelSurfacesCssPath = path.join(rendererRoot, 'styles/DashboardPanelSurfaces.css');
const settingsSurfaceCssPath = path.join(rendererRoot, 'styles/SettingsSurface.css');
const modelSelectionDefaultsPath = path.join(rendererRoot, 'app/skin/modelSelectionDefaults.js');
const providerCredentialSettingsPath = path.join(rendererRoot, 'app/skin/providerCredentialSettings.js');
const providerModelDisplaySettingsPath = path.join(rendererRoot, 'app/skin/providerModelDisplaySettings.js');
const storageSettingsPath = path.join(rendererRoot, 'app/skin/storageSettings.js');
const appearanceSettingsPath = path.join(rendererRoot, 'app/skin/appearanceSettings.js');
const settingsRoot = path.join(rendererRoot, 'features/dashboard/components/sections/settings');
const dashboardSectionsRoot = path.join(rendererRoot, 'features/dashboard/components/sections');
const providerApiKeysPropTypesPath = path.join(dashboardSectionsRoot, 'providerApiKeysPropTypes.js');
const configFilterPath = path.join(rendererRoot, 'app/runtime/desktopRendererConfigFilterRuntime.js');
const configStoragePath = path.join(rendererRoot, 'app/runtime/desktopRendererConfigStorageRuntime.js');
const applyAppearanceThemePath = path.join(rendererRoot, 'app/applyAppearanceTheme.js');
const memoryPreferencePath = path.join(rendererRoot, 'app/runtime/desktopMemoryRetrievalPreferenceRuntime.js');
const permissionStoragePath = path.join(rendererRoot, 'app/runtime/desktopPermissionOnboardingStorageRuntime.js');
const appConfigProviderPath = path.join(rendererRoot, 'app/providers/AppConfigProvider.jsx');

function read(relativePath) {
  return fs.readFileSync(path.join(settingsRoot, relativePath), 'utf8');
}

const retiredDesktopAgentMarker = (suffix) => `__desktop${'Agent'}${suffix}`;
const retiredDesktopAgentToken = (suffix) => `desktop-${'agent'}-${suffix}`;
const retiredDesktopAgentClassName = (suffix) => `Desktop${'Agent'}${suffix}`;
const retiredSettingsCssFile = `Clone${'Settings'}.css`;
const retiredSettingsClassPrefix = `clone-${'settings'}`;
const retiredSettingsToggleName = `Clone${'Toggle'}`;
const retiredDashboardPanelsCssFile = `Clone${'Memory'}Models.css`;
const retiredDashboardPanelClassTokens = [
  `clone-${'memory'}`,
  `clone-${'model'}`,
  `clone-${'panel'}`,
  `clone-${'empty'}`,
];

describe('renderer skin/config boundary', () => {
  test('WindieOS product strings for settings live in the renderer skin', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');
    const skinFacadeSource = fs.readFileSync(skinFacadePath, 'utf8');

    expect(skinSource).toContain("const productName = 'WindieOS'");
    expect(skinSource).toContain("const browserName = 'Windie Browser'");
    expect(skinSource).toContain('remoteTools');
    expect(skinSource).toContain('memoryPanel');
    expect(skinSource).toContain('onboarding');
    expect(skinSource).toContain('chat');
    expect(skinSource).toContain('web_search');
    expect(skinSource).toContain('run_shell_command');
    expect(skinSource).toContain('requireUserMessage');
    expect(skinFacadeSource).toContain('windieDesktopSkin as desktopRuntimeSkin');
    expect(skinFacadeSource).toContain("from './windieDesktopSkin'");
  });

  test('renderer brand icon asset lives in the renderer skin stylesheet', () => {
    const appSource = fs.readFileSync(appPath, 'utf8');
    const skinCssFacadeSource = fs.readFileSync(skinCssFacadePath, 'utf8');
    const skinCssSource = fs.readFileSync(skinCssPath, 'utf8');
    const dashboardShellCssSource = fs.readFileSync(dashboardShellCssPath, 'utf8');

    expect(appSource).toContain("import './skin/desktopRuntimeSkin.css'");
    expect(appSource).not.toContain("import './skin/windieDesktopSkin.css'");
    expect(skinCssFacadeSource).toContain('@import "./windieDesktopSkin.css"');
    expect(skinCssSource).toContain('--cg-brand-app-icon-url');
    expect(skinCssSource).toContain('windieos.app.png');
    expect(dashboardShellCssSource).toContain('--cg-brand-app-icon-url');
    expect(dashboardShellCssSource).not.toContain('--windie-desktop-brand-icon-url');
    expect(dashboardShellCssSource).not.toContain('windieos.app.png');
    expect(dashboardShellCssSource).not.toContain('cg-gpt');
    expect(dashboardShellCssSource).not.toContain('ui-gpt');
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
      expect(source).toContain('desktopRuntimeSkin');
      expect(source).not.toContain('windieDesktopSkin');
      expect(source).not.toContain('WindieOS');
      expect(source).not.toContain('Windie Browser');
      expect(source).not.toContain('hosted WindieOS backend');
      expect(source).not.toContain('Local sidecar tools');
      expect(source).not.toContain('No sidecar plugins loaded');
      expect(source).not.toContain('Connect WindieOS before deleting saved data.');
    }
  });

  test('settings surface source uses generic renderer UI naming', () => {
    const sourcePaths = [
      settingsSurfaceCssPath,
      path.join(dashboardSectionsRoot, 'SettingsSection.jsx'),
      path.join(dashboardSectionsRoot, 'McpsSection.jsx'),
      path.join(settingsRoot, 'settingsControls.jsx'),
      path.join(settingsRoot, 'GeneralSettingsTab.jsx'),
      path.join(settingsRoot, 'AppearanceSettingsTab.jsx'),
      path.join(settingsRoot, 'AgentSettingsTab.jsx'),
      path.join(rendererRoot, 'app/runtime/desktopMcpRuntimeClient.ts'),
    ];
    const sources = sourcePaths.map((sourcePath) => fs.readFileSync(sourcePath, 'utf8'));

    expect(fs.existsSync(settingsSurfaceCssPath)).toBe(true);
    expect(fs.existsSync(path.join(rendererRoot, 'styles', retiredSettingsCssFile))).toBe(false);
    expect(sources.join('\n')).toContain('settings-surface');
    expect(sources.join('\n')).toContain('SettingsToggle');
    for (const source of sources) {
      expect(source).not.toContain(retiredSettingsCssFile);
      expect(source).not.toContain(retiredSettingsClassPrefix);
      expect(source).not.toContain(retiredSettingsToggleName);
    }
  });

  test('dashboard panel source uses generic renderer UI naming', () => {
    const sourcePaths = [
      dashboardPanelSurfacesCssPath,
      appPath,
      path.join(dashboardSectionsRoot, 'MemorySection.jsx'),
      path.join(dashboardSectionsRoot, 'MemoryItem.jsx'),
      path.join(dashboardSectionsRoot, 'ModelsSection.jsx'),
      path.join(dashboardSectionsRoot, 'UsageSection.jsx'),
      path.join(dashboardSectionsRoot, 'McpsSection.jsx'),
      path.join(dashboardSectionsRoot, 'ApiKeysSection.jsx'),
      path.join(dashboardSectionsRoot, 'modelCards.jsx'),
    ];
    const sources = sourcePaths.map((sourcePath) => fs.readFileSync(sourcePath, 'utf8'));

    expect(fs.existsSync(dashboardPanelSurfacesCssPath)).toBe(true);
    expect(fs.existsSync(path.join(rendererRoot, 'styles', retiredDashboardPanelsCssFile))).toBe(false);
    expect(sources.join('\n')).toContain('dashboard-panel');
    expect(sources.join('\n')).toContain('memory-surface');
    expect(sources.join('\n')).toContain('model-surface');
    for (const source of sources) {
      expect(source).not.toContain(retiredDashboardPanelsCssFile);
      for (const retiredToken of retiredDashboardPanelClassTokens) {
        expect(source).not.toContain(retiredToken);
      }
    }
  });

  test('memory panel consumes skin copy instead of hard-coding product copy', () => {
    const source = fs.readFileSync(path.join(dashboardSectionsRoot, 'MemorySection.jsx'), 'utf8');

    expect(source).toContain('desktopRuntimeSkin');
    expect(source).not.toContain('windieDesktopSkin');
    expect(source).not.toContain('WindieOS builds understanding');
    expect(source).not.toContain('Memories will appear as you interact with WindieOS');
    expect(source).not.toContain('Search memories...');
  });

  test('onboarding and chat consumers read product copy from the skin', () => {
    const consumers = [
      'features/onboarding/components/DesktopOnboardingSlideshow.jsx',
      'features/chat/hooks/useChatMessageSender.ts',
      'features/chat/hooks/useConversationReplayActions.js',
      'features/chat/components/ChatInterface.jsx',
      'features/chat/components/ChatBrowserSessionControl.jsx',
      'app/runtime/desktopLiveTurnRuntimeClient.ts',
    ].map((relativePath) => fs.readFileSync(path.join(rendererRoot, relativePath), 'utf8'));

    for (const source of consumers) {
      expect(source).toContain('desktopRuntimeSkin');
      expect(source).not.toContain('windieDesktopSkin');
      expect(source).not.toContain('WindieOS onboarding');
      expect(source).not.toContain('Start WindieOS');
      expect(source).not.toContain('Welcome to WindieOS Demo');
      expect(source).not.toContain("WindieOS isn't connected");
      expect(source).not.toContain('WindieOS could not prepare');
      expect(source).not.toContain('WindieOS runtime');
      expect(source).not.toContain('dedicated Windie browser');
      expect(source).not.toContain('canStartWindieOs');
      expect(source).not.toContain('__windieReplayStep');
      expect(source).not.toContain(retiredDesktopAgentMarker('ReplayStep'));
      expect(source).not.toContain('backend reconnects');
    }
  });

  test('voice capture internals do not embed product naming', () => {
    const consumers = [
      'app/runtime/desktopVoiceAudioProcessorNodeRuntime.ts',
      'features/voice/hooks/useVoiceMode.ts',
      'app/runtime/desktopWakewordCaptureGuardRuntime.ts',
    ].map((relativePath) => fs.readFileSync(path.join(rendererRoot, relativePath), 'utf8'));

    for (const source of consumers) {
      expect(source).not.toContain('WindieOS');
      expect(source).not.toContain('windieos-capture-processor');
      expect(source).not.toContain('WindieOSCaptureProcessor');
      expect(source).not.toContain(retiredDesktopAgentToken('capture-processor'));
      expect(source).not.toContain(retiredDesktopAgentClassName('CaptureProcessor'));
      expect(source).not.toContain('__windieWakewordCaptureGuard');
      expect(source).not.toContain(retiredDesktopAgentMarker('WakewordCaptureGuard'));
    }
  });

  test('settings components do not expose local execution targets as user-facing labels', () => {
    const source = read('AgentSettingsTab.jsx');
    const retiredExecutionTargetFallback = `execution_target || '${'sidecar'}'`;
    const retiredAcceptedToolFallback = `acceptedTool.execution_target || '${'sidecar'}'`;

    expect(source).toContain('formatToolAcceptanceRuntimeSummary');
    expect(source).not.toContain(retiredExecutionTargetFallback);
    expect(source).not.toContain(retiredAcceptedToolFallback);
  });

  test('provider credential defaults live in renderer skin config', () => {
    const configFacadeSource = fs.readFileSync(skinConfigFacadePath, 'utf8');
    const providerSkinSource = fs.readFileSync(providerCredentialSettingsPath, 'utf8');
    const providerPropTypesSource = fs.readFileSync(providerApiKeysPropTypesPath, 'utf8');
    const configStorageSource = fs.readFileSync(configStoragePath, 'utf8');
    const apiKeysSource = fs.readFileSync(
      path.join(dashboardSectionsRoot, 'providerApiKeys.js'),
      'utf8',
    );

    expect(configFacadeSource).toContain("from './providerCredentialSettings'");
    expect(providerSkinSource).toContain('DEFAULT_PROVIDER_API_KEYS');
    expect(providerSkinSource).toContain('PROVIDER_API_KEY_SPECS');
    expect(providerPropTypesSource).toContain('PropTypes.objectOf(providerApiKeyEntryPropType)');
    expect(providerPropTypesSource).not.toContain('openai: providerApiKeyEntryPropType');
    expect(providerPropTypesSource).not.toContain('anthropic: providerApiKeyEntryPropType');
    expect(providerPropTypesSource).not.toContain('kimi_coding: providerApiKeyEntryPropType');
    expect(providerPropTypesSource).not.toContain('google: providerApiKeyEntryPropType');
    expect(providerPropTypesSource).not.toContain('openrouter: providerApiKeyEntryPropType');
    expect(providerPropTypesSource).not.toContain('mistral: providerApiKeyEntryPropType');
    expect(configStorageSource).toContain('desktopRuntimeConfig');
    expect(configStorageSource).not.toContain('providerCredentialSettings');
    expect(apiKeysSource).toContain('desktopRuntimeConfig');
    expect(apiKeysSource).not.toContain('providerCredentialSettings');
    expect(configStorageSource).not.toContain('openai: { enabled: false');
    expect(apiKeysSource).not.toContain('OpenAI API Key');
  });

  test('default model selection lives in renderer skin config', () => {
    const configFacadeSource = fs.readFileSync(skinConfigFacadePath, 'utf8');
    const modelDefaultsSource = fs.readFileSync(modelSelectionDefaultsPath, 'utf8');
    const configStorageSource = fs.readFileSync(configStoragePath, 'utf8');

    expect(configFacadeSource).toContain("from './modelSelectionDefaults'");
    expect(modelDefaultsSource).toContain('DEFAULT_MODEL_SELECTION');
    expect(modelDefaultsSource).toContain("provider: 'openai'");
    expect(modelDefaultsSource).toContain("modelId: 'gpt-5.4@@gpt-5-4-none-thinking'");
    expect(configStorageSource).toContain('desktopRuntimeConfig');
    expect(configStorageSource).not.toContain('modelSelectionDefaults');
    expect(configStorageSource).not.toContain("model_provider: 'openai'");
    expect(configStorageSource).not.toContain("selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking'");
  });

  test('provider model display fallbacks live in renderer skin config', () => {
    const configFacadeSource = fs.readFileSync(skinConfigFacadePath, 'utf8');
    const providerDisplaySource = fs.readFileSync(providerModelDisplaySettingsPath, 'utf8');
    const modelCardDataSource = fs.readFileSync(
      path.join(dashboardSectionsRoot, 'modelCardData.js'),
      'utf8',
    );
    const chatModelOptionsSource = fs.readFileSync(
      path.join(rendererRoot, 'app/runtime/desktopChatModelOptionsRuntime.js'),
      'utf8',
    );

    expect(configFacadeSource).toContain("from './providerModelDisplaySettings'");
    expect(providerDisplaySource).toContain('PROVIDER_MODEL_DISPLAY_FALLBACKS');
    expect(providerDisplaySource).toContain('PROVIDER_LABEL_OVERRIDES');
    expect(providerDisplaySource).toContain('OpenAI flagship model family');
    expect(modelCardDataSource).toContain('desktopRuntimeConfig');
    expect(modelCardDataSource).not.toContain('providerModelDisplaySettings');
    expect(chatModelOptionsSource).toContain('desktopRuntimeConfig');
    expect(chatModelOptionsSource).not.toContain('providerModelDisplaySettings');
    expect(modelCardDataSource).not.toContain("provider.includes('openai')");
    expect(modelCardDataSource).not.toContain('OpenAI flagship model family');
    expect(modelCardDataSource).not.toContain('Agentic coding model');
    expect(chatModelOptionsSource).not.toContain("lowerProvider === 'openai'");
    expect(chatModelOptionsSource).not.toContain("return 'OpenRouter'");
  });

  test('persisted renderer storage keys live in renderer skin config', () => {
    const configFacadeSource = fs.readFileSync(skinConfigFacadePath, 'utf8');
    const storageSettingsSource = fs.readFileSync(storageSettingsPath, 'utf8');
    const consumers = [
      configStoragePath,
      memoryPreferencePath,
      permissionStoragePath,
      appConfigProviderPath,
    ].map((sourcePath) => fs.readFileSync(sourcePath, 'utf8'));

    expect(configFacadeSource).toContain("from './storageSettings'");
    expect(storageSettingsSource).toContain('RENDERER_STORAGE_KEYS');
    expect(storageSettingsSource).toContain('windieos-config');
    expect(storageSettingsSource).toContain('windieos-memory-retrieval-injection-enabled');
    expect(storageSettingsSource).toContain('windieos-permission-onboarding');
    const removedPermissionOnboardingKey = `desktop-${'agent'}-permission-onboarding`;
    expect(storageSettingsSource).not.toContain(removedPermissionOnboardingKey);

    for (const source of consumers) {
      expect(source).toContain('RENDERER_STORAGE_KEYS');
      expect(source).not.toContain("'windieos-config'");
      expect(source).not.toContain("'windieos-memory-retrieval-injection-enabled'");
      expect(source).not.toContain(`'${removedPermissionOnboardingKey}'`);
      expect(source).not.toContain("'windieos-permission-onboarding'");
    }
  });

  test('appearance defaults live in renderer skin config', () => {
    const configFacadeSource = fs.readFileSync(skinConfigFacadePath, 'utf8');
    const appearanceSettingsSource = fs.readFileSync(appearanceSettingsPath, 'utf8');
    const configStorageSource = fs.readFileSync(configStoragePath, 'utf8');
    const applyAppearanceThemeSource = fs.readFileSync(applyAppearanceThemePath, 'utf8');
    const appearanceTabSource = read('AppearanceSettingsTab.jsx');

    expect(configFacadeSource).toContain("from './appearanceSettings'");
    expect(appearanceSettingsSource).toContain('DEFAULT_APPEARANCE_THEME');
    expect(appearanceSettingsSource).toContain("accent: '#339CFF'");
    expect(configStorageSource).toContain('desktopRuntimeConfig');
    expect(configStorageSource).not.toContain('DEFAULT_APPEARANCE_THEME = Object.freeze');
    expect(configStorageSource).not.toContain("accent: '#339CFF'");
    expect(applyAppearanceThemeSource).toContain('desktopRuntimeConfig');
    expect(applyAppearanceThemeSource).not.toContain('../utils/configStorage');
    expect(appearanceTabSource).toContain('desktopRuntimeConfig');
    expect(appearanceTabSource).not.toContain('utils/configStorage');
  });

  test('renderer config helpers describe the settings runtime boundary', () => {
    const configFilterSource = fs.readFileSync(configFilterPath, 'utf8');
    const configStorageSource = fs.readFileSync(configStoragePath, 'utf8');

    expect(configFilterSource).toContain('renderer only persists its local subset of runtime settings');
    expect(configFilterSource).toContain('RENDERER_CONFIG_FIELDS');
    expect(configFilterSource).not.toContain('FRONTEND_CONFIG_FIELDS');
    expect(configFilterSource).not.toContain('subset of the backend configuration');
    expect(configFilterSource).not.toContain('configuration object from backend');
    expect(configStorageSource).toContain('desktop settings runtime');
    expect(configStorageSource).toContain('runtime settings changes are acknowledged');
    expect(configStorageSource).not.toContain('Syncs with backend on connection');
    expect(configStorageSource).not.toContain('when backend confirms changes');
    expect(fs.existsSync(path.join(rendererRoot, 'utils/configFilter.js'))).toBe(false);
    expect(fs.existsSync(path.join(rendererRoot, 'utils/configStorage.js'))).toBe(false);
    expect(fs.existsSync(path.join(rendererRoot, 'features/permissions/utils/permissionStorage.js'))).toBe(false);
  });
});
