/**
 * Covers renderer skin/config boundary behavior in the frontend test suite.
 */

const fs = require('fs');
const path = require('path');

const rendererRoot = path.resolve(__dirname, '../../src/renderer');
const mainRoot = path.resolve(__dirname, '../../src/main');
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
const rendererConfigReferencePath = path.resolve(
  __dirname,
  '../../docs/frontend/renderer/settings/config/frontend_config_filter_storage_and_provider_merge_runtime_reference.md',
);
const credentialWorkflowPath = path.resolve(
  __dirname,
  '../../docs/security/credential_token_change_workflow.md',
);
const rendererStateWorkflowPath = path.resolve(
  __dirname,
  '../../docs/frontend/renderer/renderer_state_change_workflow.md',
);
const rendererSettingsSectionReferencePath = path.resolve(
  __dirname,
  '../../docs/frontend/renderer/settings/sections/settings_section_tabs_and_wakeword_toggle_runtime_reference.md',
);
const rendererStartupWorkflowPath = path.resolve(
  __dirname,
  '../../docs/frontend/renderer/app_startup_onboarding_change_workflow.md',
);
const rendererPermissionOnboardingReferencePath = path.resolve(
  __dirname,
  '../../docs/frontend/renderer/permissions/permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md',
);
const rendererVoiceReferencePath = path.resolve(
  __dirname,
  '../../docs/frontend/renderer/voice_capture_and_wakeword_controller_reference.md',
);
const memoryRetrievalPreferenceTestPath = path.resolve(
  __dirname,
  'MemoryRetrievalPreference.test.js',
);
const memorySectionTestPath = path.resolve(
  __dirname,
  'MemorySection.test.jsx',
);
const permissionStorageTestPath = path.resolve(
  __dirname,
  'PermissionStorage.test.js',
);
const settingsRoot = path.join(rendererRoot, 'features/dashboard/components/sections/settings');
const dashboardSectionsRoot = path.join(rendererRoot, 'features/dashboard/components/sections');
const providerApiKeysPropTypesPath = path.join(dashboardSectionsRoot, 'providerApiKeysPropTypes.js');
const providerCredentialRuntimePath = path.join(rendererRoot, 'app/runtime/desktopProviderCredentialRuntime.js');
const configFilterPath = path.join(rendererRoot, 'app/runtime/desktopRendererConfigFilterRuntime.js');
const configStoragePath = path.join(rendererRoot, 'app/runtime/desktopRendererConfigStorageRuntime.js');
const appConfigPersistencePath = path.join(rendererRoot, 'app/providers/appConfigPersistence.js');
const providerCredentialStorePath = path.join(mainRoot, 'ipc/ipc_provider_credentials_store.cjs');
const appearanceThemeRuntimePath = path.join(rendererRoot, 'app/runtime/desktopAppearanceThemeRuntime.js');
const memoryPreferencePath = path.join(rendererRoot, 'app/runtime/desktopMemoryRetrievalPreferenceRuntime.js');
const permissionStoragePath = path.join(rendererRoot, 'app/runtime/desktopPermissionOnboardingStorageRuntime.js');
const appConfigProviderPath = path.join(rendererRoot, 'app/providers/AppConfigProvider.jsx');
const appProviderPath = path.join(rendererRoot, 'app/providers/AppProvider.jsx');

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
    expect(skinSource).not.toContain('export function formatToolAcceptanceRuntimeSummary');
    expect(skinFacadeSource).toContain('export const desktopRuntimeSkin = windieDesktopSkin');
    expect(skinFacadeSource).toContain('export const DesktopRuntimeSkin = Object.freeze');
    expect(skinFacadeSource).toContain("from './windieDesktopSkin'");
    expect(skinFacadeSource).toContain('function formatToolAcceptanceRuntimeSummary');
    expect(skinFacadeSource).toContain('formatToolAcceptanceRuntimeSummary');
    expect(skinFacadeSource).not.toContain('export {');
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

  test('renderer settings docs route wakeword and browser copy through the skin', () => {
    const settingsReferenceSource = fs.readFileSync(rendererSettingsSectionReferencePath, 'utf8');
    const voiceReferenceSource = fs.readFileSync(rendererVoiceReferencePath, 'utf8');
    const docText = [
      settingsReferenceSource,
      voiceReferenceSource,
    ].join('\n');

    expect(docText).toContain('skin-named dedicated browser permission/status controls');
    expect(docText).toContain('skin-provided wakeword STT toggle');
    expect(docText).toContain('skin-configured wakeword activation');
    expect(docText).not.toContain('Windie browser permission/status controls');
    expect(docText).not.toContain('Speech-To-Text After "Hey Jarvis"');
    expect(docText).not.toContain('for "Hey Jarvis" activation');
  });

  test('renderer onboarding docs keep product-specific app claims out of generic workflow text', () => {
    const startupWorkflowSource = fs.readFileSync(rendererStartupWorkflowPath, 'utf8');
    const permissionOnboardingSource = fs.readFileSync(
      rendererPermissionOnboardingReferencePath,
      'utf8',
    );

    expect(startupWorkflowSource).toContain('why the desktop app opens onboarding');
    expect(startupWorkflowSource).not.toContain('why WindieOS opens onboarding');
    expect(permissionOnboardingSource).toContain(
      'the current\ndesktop app does not expose a reliable standalone App Management',
    );
    expect(permissionOnboardingSource).not.toContain('WindieOS does not\nhave a reliable standalone App Management');
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
    const appConfigPersistenceSource = fs.readFileSync(appConfigPersistencePath, 'utf8');
    const providerCredentialStoreSource = fs.readFileSync(providerCredentialStorePath, 'utf8');
    const providerCredentialRuntimeSource = fs.readFileSync(providerCredentialRuntimePath, 'utf8');
    const credentialWorkflowSource = fs.readFileSync(credentialWorkflowPath, 'utf8');

    expect(configFacadeSource).toContain("from './providerCredentialSettings'");
    expect(configFacadeSource).toContain('export const DesktopRuntimeConfig = Object.freeze');
    expect(configFacadeSource).not.toContain('export {');
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
    expect(configStorageSource).toContain('desktopProviderCredentialRuntime');
    expect(appConfigPersistenceSource).toContain('DesktopProviderCredentialRuntime');
    expect(appConfigPersistenceSource).toContain('stripProviderApiKeySecrets');
    expect(appConfigPersistenceSource).not.toContain("api_key: ''");
    expect(providerCredentialStoreSource).toContain('provider-credentials.json');
    expect(providerCredentialStoreSource).toContain('safeStorage');
    expect(providerCredentialRuntimeSource).toContain('desktopRuntimeConfig');
    expect(providerCredentialRuntimeSource).not.toContain('providerCredentialSettings');
    expect(providerCredentialRuntimeSource).toContain('DesktopProviderCredentialRuntime');
    expect(providerCredentialRuntimeSource).toContain('stripProviderApiKeySecrets');
    expect(providerCredentialRuntimeSource).toContain('getProviderApiKeySpecs');
    expect(providerCredentialRuntimeSource).not.toContain('export function stripProviderApiKeySecrets');
    expect(providerCredentialRuntimeSource).not.toContain('export function getProviderApiKeySpecs');
    expect(providerCredentialRuntimeSource).not.toContain('export function normalizeProviderApiKeys');
    expect(providerCredentialRuntimeSource).not.toContain('export { PROVIDER_API_KEY_SPECS }');
    expect(configStorageSource).not.toContain('openai: { enabled: false');
    expect(providerCredentialRuntimeSource).not.toContain('OpenAI API Key');
    expect(credentialWorkflowSource).toContain('ApiKeysSection.jsx');
    expect(credentialWorkflowSource).toContain('desktopProviderCredentialRuntime.js');
    expect(credentialWorkflowSource).not.toContain('providerApiKeys.js');
    expect(fs.existsSync(path.join(dashboardSectionsRoot, 'providerApiKeys.js'))).toBe(false);
  });

  test('default model selection lives in renderer skin config', () => {
    const configFacadeSource = fs.readFileSync(skinConfigFacadePath, 'utf8');
    const modelDefaultsSource = fs.readFileSync(modelSelectionDefaultsPath, 'utf8');
    const configStorageSource = fs.readFileSync(configStoragePath, 'utf8');

    expect(configFacadeSource).toContain("from './modelSelectionDefaults'");
    expect(configFacadeSource).toContain('DesktopRuntimeConfig');
    expect(modelDefaultsSource).toContain('DEFAULT_MODEL_SELECTION');
    expect(modelDefaultsSource).toContain("provider: 'openai'");
    expect(modelDefaultsSource).toContain("modelId: 'gpt-5.4@@gpt-5-4-none-thinking'");
    expect(configStorageSource).toContain('desktopRuntimeConfig');
    expect(configStorageSource).not.toContain('modelSelectionDefaults');
    expect(configStorageSource).not.toContain("model_provider: 'openai'");
    expect(configStorageSource).not.toContain("selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking'");
  });

  test('renderer config docs route default provider and model values through the skin', () => {
    const configReferenceSource = fs.readFileSync(rendererConfigReferencePath, 'utf8');
    const rendererStateWorkflowSource = fs.readFileSync(rendererStateWorkflowPath, 'utf8');

    expect(configReferenceSource).toContain('The generic storage runtime assembles defaults through the');
    expect(configReferenceSource).toContain('`desktopRuntimeConfig` facade');
    expect(configReferenceSource).toContain('Concrete provider/model defaults');
    expect(configReferenceSource).toContain('live in the active renderer skin');
    expect(configReferenceSource).toContain('Current WindieOS skin defaults:');
    expect(configReferenceSource).toContain('`model_provider: "openai"`');
    expect(configReferenceSource).toContain('`selected_model_id: "gpt-5.4@@gpt-5-4-none-thinking"`');
    expect(configReferenceSource).not.toContain(
      'desktopRendererConfigStorageRuntime.js owns OpenAI defaults',
    );
    expect(configReferenceSource).not.toContain(
      'desktopRendererConfigStorageRuntime.js owns GPT defaults',
    );
    expect(rendererStateWorkflowSource).not.toContain('Workflow for changing WindieOS renderer state');
  });

  test('provider model display fallbacks live in renderer skin config', () => {
    const configFacadeSource = fs.readFileSync(skinConfigFacadePath, 'utf8');
    const providerDisplaySource = fs.readFileSync(providerModelDisplaySettingsPath, 'utf8');
    const modelCardPresentationRuntimeSource = fs.readFileSync(
      path.join(rendererRoot, 'app/runtime/desktopModelCardPresentationRuntime.js'),
      'utf8',
    );
    const chatModelOptionsSource = fs.readFileSync(
      path.join(rendererRoot, 'app/runtime/desktopChatModelOptionsRuntime.js'),
      'utf8',
    );

    expect(configFacadeSource).toContain("from './providerModelDisplaySettings'");
    expect(configFacadeSource).toContain('DesktopRuntimeConfig');
    expect(configFacadeSource).toContain('function formatProviderDisplayLabel');
    expect(configFacadeSource).toContain('function resolveProviderModelDisplay');
    expect(providerDisplaySource).toContain('PROVIDER_MODEL_DISPLAY_FALLBACKS');
    expect(providerDisplaySource).toContain('PROVIDER_LABEL_OVERRIDES');
    expect(providerDisplaySource).toContain('OpenAI flagship model family');
    expect(providerDisplaySource).not.toContain('export function formatProviderDisplayLabel');
    expect(providerDisplaySource).not.toContain('export function resolveProviderModelDisplay');
    expect(modelCardPresentationRuntimeSource).toContain('desktopRuntimeConfig');
    expect(modelCardPresentationRuntimeSource).toContain('DesktopModelCardPresentationRuntime');
    expect(modelCardPresentationRuntimeSource).not.toContain('export function toModelCard');
    expect(modelCardPresentationRuntimeSource).not.toContain('export function normalizeProviderLabel');
    expect(modelCardPresentationRuntimeSource).not.toContain('export function toProviderCards');
    expect(modelCardPresentationRuntimeSource).not.toContain('providerModelDisplaySettings');
    expect(chatModelOptionsSource).toContain('desktopRuntimeConfig');
    expect(chatModelOptionsSource).not.toContain('providerModelDisplaySettings');
    expect(modelCardPresentationRuntimeSource).not.toContain("provider.includes('openai')");
    expect(modelCardPresentationRuntimeSource).not.toContain('OpenAI flagship model family');
    expect(modelCardPresentationRuntimeSource).not.toContain('Agentic coding model');
    expect(chatModelOptionsSource).not.toContain("lowerProvider === 'openai'");
    expect(chatModelOptionsSource).not.toContain("return 'OpenRouter'");
  });

  test('persisted renderer storage keys live in renderer skin config', () => {
    const configFacadeSource = fs.readFileSync(skinConfigFacadePath, 'utf8');
    const storageSettingsSource = fs.readFileSync(storageSettingsPath, 'utf8');
    const permissionStorageSource = fs.readFileSync(permissionStoragePath, 'utf8');
    const storageOwnerSources = [
      configStoragePath,
      memoryPreferencePath,
      permissionStoragePath,
    ].map((sourcePath) => fs.readFileSync(sourcePath, 'utf8'));
    const appConfigProviderSource = fs.readFileSync(appConfigProviderPath, 'utf8');
    const callerTestSources = [
      memoryRetrievalPreferenceTestPath,
      memorySectionTestPath,
      permissionStorageTestPath,
    ].map((sourcePath) => fs.readFileSync(sourcePath, 'utf8'));

    expect(configFacadeSource).toContain("from './storageSettings'");
    expect(configFacadeSource).toContain('DesktopRuntimeConfig');
    expect(storageSettingsSource).toContain('RENDERER_STORAGE_KEYS');
    expect(storageSettingsSource).toContain('windieos-config');
    expect(storageSettingsSource).toContain('windieos-memory-retrieval-injection-enabled');
    expect(storageSettingsSource).toContain('windieos-permission-onboarding');
    const removedPermissionOnboardingKey = `desktop-${'agent'}-permission-onboarding`;
    expect(storageSettingsSource).not.toContain(removedPermissionOnboardingKey);

    for (const source of storageOwnerSources) {
      expect(source).toContain('RENDERER_STORAGE_KEYS');
      expect(source).not.toContain("'windieos-config'");
      expect(source).not.toContain("'windieos-memory-retrieval-injection-enabled'");
      expect(source).not.toContain(`'${removedPermissionOnboardingKey}'`);
      expect(source).not.toContain("'windieos-permission-onboarding'");
    }
    expect(appConfigProviderSource).toContain('isRendererConfigStorageEvent');
    expect(appConfigProviderSource).not.toContain('RENDERER_STORAGE_KEYS');
    expect(appConfigProviderSource).not.toContain("'windieos-config'");
    expect(callerTestSources.join('\n')).toContain('DesktopMemoryRetrievalPreferenceRuntime');
    expect(callerTestSources.join('\n')).toContain('DesktopPermissionOnboardingStorageRuntime');
    expect(callerTestSources.join('\n')).toContain('getPermissionOnboardingStorageKey');
    expect(permissionStorageSource).toContain('DesktopPermissionOnboardingStorageRuntime');
    expect(permissionStorageSource).not.toContain('export function getPermissionOnboardingStorageKey');
    expect(permissionStorageSource).not.toContain('export function loadPermissionOnboardingState');
    expect(permissionStorageSource).not.toContain('export function savePermissionOnboardingState');
    for (const source of callerTestSources) {
      expect(source).not.toContain('RENDERER_STORAGE_KEYS');
      expect(source).not.toContain('desktopRuntimeConfig');
    }
  });

  test('appearance defaults live in renderer skin config', () => {
    const configFacadeSource = fs.readFileSync(skinConfigFacadePath, 'utf8');
    const appearanceSettingsSource = fs.readFileSync(appearanceSettingsPath, 'utf8');
    const configStorageSource = fs.readFileSync(configStoragePath, 'utf8');
    const appearanceThemeRuntimeSource = fs.readFileSync(appearanceThemeRuntimePath, 'utf8');
    const appProviderSource = fs.readFileSync(appProviderPath, 'utf8');
    const appearanceTabSource = read('AppearanceSettingsTab.jsx');

    expect(configFacadeSource).toContain("from './appearanceSettings'");
    expect(configFacadeSource).toContain('DesktopRuntimeConfig');
    expect(appearanceSettingsSource).toContain('DEFAULT_APPEARANCE_THEME');
    expect(appearanceSettingsSource).toContain("accent: '#339CFF'");
    expect(appearanceSettingsSource).toContain("foreground: '#4C4C4C'");
    expect(appearanceSettingsSource).toContain("user_message_background: '#339CFF'");
    expect(appearanceSettingsSource).toContain("user_message_foreground: '#FFFFFF'");
    expect(appearanceThemeRuntimeSource).toContain('desktopRuntimeConfig');
    expect(appearanceThemeRuntimeSource).toContain('DesktopAppearanceThemeRuntime');
    expect(appearanceThemeRuntimeSource).not.toContain('export function normalizeAppearanceMode');
    expect(appearanceThemeRuntimeSource).not.toContain('export function getAppearanceModeDescriptors');
    expect(appearanceThemeRuntimeSource).not.toContain('export function getAppearanceThemeSectionDescriptors');
    expect(appearanceThemeRuntimeSource).not.toContain('export function getAppearanceThemeFieldDescriptors');
    expect(appearanceThemeRuntimeSource).not.toContain('export function resolveSystemAppearanceTheme');
    expect(appearanceThemeRuntimeSource).not.toContain('export function resolveEffectiveAppearanceTheme');
    expect(appearanceThemeRuntimeSource).not.toContain('export function normalizeAppearanceTheme');
    expect(appearanceThemeRuntimeSource).not.toContain('export function resolveAppearanceThemeSection');
    expect(appearanceThemeRuntimeSource).toContain('applyAppearanceTheme');
    expect(appearanceThemeRuntimeSource).toContain('document?.documentElement');
    expect(appearanceThemeRuntimeSource).toContain('window?.matchMedia');
    expect(configStorageSource).toContain('desktopRuntimeConfig');
    expect(configStorageSource).toContain('desktopAppearanceThemeRuntime');
    expect(configStorageSource).toContain('DesktopAppearanceThemeRuntime');
    expect(configStorageSource).not.toContain('DEFAULT_APPEARANCE_THEME');
    expect(configStorageSource).not.toContain('DEFAULT_APPEARANCE_THEME = Object.freeze');
    expect(configStorageSource).not.toContain("accent: '#339CFF'");
    expect(appProviderSource).toContain('DesktopAppearanceThemeRuntime.applyAppearanceTheme');
    expect(appProviderSource).not.toContain('../applyAppearanceTheme');
    expect(appProviderSource).not.toContain('DEFAULT_APPEARANCE_THEME');
    expect(appProviderSource).not.toContain('../utils/configStorage');
    expect(appearanceTabSource).toContain('desktopAppearanceThemeRuntime');
    expect(appearanceTabSource).toContain('DesktopAppearanceThemeRuntime');
    expect(appearanceTabSource).not.toContain('DEFAULT_APPEARANCE_THEME');
    expect(appearanceTabSource).not.toContain('utils/configStorage');
    expect(appearanceTabSource).not.toContain('THEME_MODE_OPTIONS = Object.freeze');
    expect(appearanceTabSource).not.toContain('THEME_SECTIONS = Object.freeze');
    expect(appearanceTabSource).not.toContain('THEME_FIELDS = Object.freeze');
  });

  test('renderer config helpers describe the settings runtime boundary', () => {
    const configFilterSource = fs.readFileSync(configFilterPath, 'utf8');
    const configStorageSource = fs.readFileSync(configStoragePath, 'utf8');

    expect(configFilterSource).toContain('renderer only persists its local subset of runtime settings');
    expect(configFilterSource).toContain('RENDERER_CONFIG_FIELDS');
    expect(configFilterSource).not.toContain('FRONTEND_CONFIG_FIELDS');
    expect(configFilterSource).not.toContain('subset of the backend configuration');
    expect(configFilterSource).not.toContain('configuration object from backend');
    expect(configStorageSource).toContain('settings app-runtime client');
    expect(configStorageSource).toContain('runtime settings changes are acknowledged');
    expect(configStorageSource).not.toContain('Syncs with backend on connection');
    expect(configStorageSource).not.toContain('when backend confirms changes');
    expect(fs.existsSync(path.join(rendererRoot, 'utils/configFilter.js'))).toBe(false);
    expect(fs.existsSync(path.join(rendererRoot, 'utils/configStorage.js'))).toBe(false);
    expect(fs.existsSync(path.join(rendererRoot, 'features/permissions/utils/permissionStorage.js'))).toBe(false);
  });
});
