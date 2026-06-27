/**
 * Covers renderer settings runtime boundary. behavior in the frontend test suite.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const settingsRuntimeFiles = [
  '../../src/renderer/app/providers/appConfigRuntimeSync.js',
  '../../src/renderer/app/providers/AppConfigProvider.jsx',
  '../../src/renderer/features/dashboard/components/sections/ModelsSection.jsx',
].map((relativePath) => path.resolve(__dirname, relativePath));

describe('renderer settings runtime boundary', () => {
  test('model list and settings sync callers use the settings app-runtime client', async () => {
    const offenders: string[] = [];

    for (const file of settingsRuntimeFiles) {
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('infrastructure/api/client') || source.includes('ApiClient.')) {
        offenders.push(path.relative(path.resolve(__dirname, '../../src/renderer'), file));
      }
      if (source.includes('infrastructure/api/agentSdkClient')) {
        offenders.push(path.relative(path.resolve(__dirname, '../../src/renderer'), file));
      }
      if (source.includes('window.ipc')) {
        offenders.push(path.relative(path.resolve(__dirname, '../../src/renderer'), file));
      }
    }

    expect(offenders).toEqual([]);
  });

  test('app config and status providers route desktop IPC through app runtime clients', async () => {
    const providerFiles = [
      'app/providers/AppConfigProvider.jsx',
      'app/providers/AppStatusProvider.jsx',
    ];
    const offenders: string[] = [];

    for (const relativePath of providerFiles) {
      const source = await fs.readFile(
        path.resolve(__dirname, '../../src/renderer', relativePath),
        'utf8',
      );
      if (
        source.includes('IpcBridge')
        || source.includes('INVOKE_CHANNELS')
        || source.includes('ON_CHANNELS')
        || source.includes('SAVE_FRONTEND_CONFIG')
        || source.includes('LOAD_FRONTEND_CONFIG')
        || source.includes('BACKEND_SETTINGS_EVENT')
        || source.includes('GET_CLIENT_USER_ID')
        || source.includes('IPC_STATUS')
        || source.includes('WAKEWORD_TOGGLE')
      ) {
        offenders.push(relativePath);
      }
    }

    const appConfigClientSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopAppConfigRuntimeClient.ts'),
      'utf8',
    );
    const settingsUpdateErrorRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopSettingsUpdateErrorRuntime.ts'),
      'utf8',
    );
    const appStatusProviderSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/providers/AppStatusProvider.jsx'),
      'utf8',
    );
    const sessionClientSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopClientSessionRuntimeClient.ts'),
      'utf8',
    );
    const voiceClientSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopVoiceRuntimeClient.ts'),
      'utf8',
    );

    expect(offenders).toEqual([]);
    expect(providerFiles).toContain('app/providers/AppStatusProvider.jsx');
    expect(appStatusProviderSource).toContain('DesktopAppConfigRuntimeClient.onSettingsSaveStatusAction');
    expect(appStatusProviderSource).not.toContain('DesktopAppConfigRuntimeClient.onSettingsEvent');
    expect(appStatusProviderSource).not.toContain('isSettingsUpdateError');
    expect(appStatusProviderSource).not.toContain('data.type');
    expect(appStatusProviderSource).not.toContain("case 'settings-updated'");
    expect(appStatusProviderSource).not.toContain('Failed to update settings');
    expect(appStatusProviderSource).not.toContain('payload?.message');
    expect(appConfigClientSource).toContain('INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG');
    expect(appConfigClientSource).toContain('INVOKE_CHANNELS.LOAD_FRONTEND_CONFIG');
    expect(appConfigClientSource).toContain('ON_CHANNELS.BACKEND_SETTINGS_EVENT');
    expect(appConfigClientSource).toContain('function normalizeDesktopSettingsEvent');
    expect(appConfigClientSource).not.toContain('export function normalizeDesktopSettingsEvent');
    expect(appConfigClientSource).toContain('function resolveDesktopSettingsSaveStatusAction');
    expect(appConfigClientSource).not.toContain('export function resolveDesktopSettingsSaveStatusAction');
    expect(appConfigClientSource).toContain('onSettingsSaveStatusAction');
    expect(appConfigClientSource).toContain('DesktopSettingsUpdateErrorRuntime');
    expect(settingsUpdateErrorRuntimeSource).toContain('export const DesktopSettingsUpdateErrorRuntime = Object.freeze');
    expect(settingsUpdateErrorRuntimeSource).not.toContain('export function isSettingsUpdateErrorText');
    expect(settingsUpdateErrorRuntimeSource).not.toContain('export function isSettingsUpdateErrorPayload');
    expect(sessionClientSource).toContain('INVOKE_CHANNELS.GET_CLIENT_USER_ID');
    expect(sessionClientSource).toContain('ON_CHANNELS.IPC_STATUS');
    expect(sessionClientSource).toContain('function resolveDesktopClientIpcStatusValues');
    expect(sessionClientSource).not.toContain('export function resolveDesktopClientIpcStatusValues');
    expect(voiceClientSource).toContain('ON_CHANNELS.WAKEWORD_TOGGLE');
    expect(providerFiles).toContain('app/providers/AppConfigProvider.jsx');
  });

  test('workspace settings routes workspace update fan-out through app runtime client', async () => {
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        '../../src/renderer/features/dashboard/components/sections/settings/WorkspaceSettingsTab.jsx',
      ),
      'utf8',
    );
    const workspaceClientSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopWorkspaceRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('IpcBridge');
    expect(source).not.toContain('ON_CHANNELS');
    expect(source).not.toContain('WORKSPACE_ACCESS_UPDATED');
    expect(source).not.toContain('infrastructure/workspace/workspaceAccess');
    expect(source).not.toContain('payload?.workspaceName');
    expect(source).not.toContain('payload?.workspacePath');
    expect(source).not.toContain('payload.workspace');
    expect(source).not.toContain('result.workspace');
    expect(source).not.toContain('activeWorkspaceName === nextWorkspace');
    expect(source).not.toContain('activeWorkspacePath === nextWorkspace');
    expect(source).not.toContain('activeWorkspace.activeWorkspacePath');
    expect(source).not.toContain('nextWorkspace.activeWorkspaceName');
    expect(source).toContain('DesktopWorkspaceRuntimeClient.onActiveWorkspaceUpdated');
    expect(source).toContain('DesktopWorkspaceRuntimeClient.areActiveWorkspaceSelectionsEqual');
    expect(source).toContain('DesktopWorkspaceRuntimeClient.getActiveWorkspacePresentation');
    expect(source).toContain('DesktopWorkspaceRuntimeClient.getEmptyActiveWorkspaceSelection');
    expect(source).toContain('DesktopWorkspaceRuntimeClient.fetchActiveWorkspace');
    expect(source).toContain('DesktopWorkspaceRuntimeClient.requestGrantedActiveWorkspace');
    expect(workspaceClientSource).toContain('function normalizeWorkspaceAccessUpdatedPayload');
    expect(workspaceClientSource).not.toContain('export function normalizeWorkspaceAccessUpdatedPayload');
    expect(workspaceClientSource).toContain('function getEmptyActiveWorkspaceSelection');
    expect(workspaceClientSource).not.toContain('export function getEmptyActiveWorkspaceSelection');
    expect(workspaceClientSource).toContain('function areActiveWorkspaceSelectionsEqual');
    expect(workspaceClientSource).not.toContain('export function areActiveWorkspaceSelectionsEqual');
    expect(workspaceClientSource).toContain('function getActiveWorkspacePresentation');
    expect(workspaceClientSource).not.toContain('export function getActiveWorkspacePresentation');
    expect(workspaceClientSource).toContain('onWorkspaceAccessUpdated');
    expect(workspaceClientSource).toContain('onWorkspaceSelectionUpdated');
    expect(workspaceClientSource).toContain('areActiveWorkspaceSelectionsEqual');
    expect(workspaceClientSource).toContain('getActiveWorkspacePresentation');
    expect(workspaceClientSource).toContain('getEmptyActiveWorkspaceSelection');
    expect(workspaceClientSource).toContain('fetchActiveWorkspaceSelection');
    expect(workspaceClientSource).toContain('requestActiveWorkspaceSelection');
    expect(workspaceClientSource).toContain('ON_CHANNELS.WORKSPACE_ACCESS_UPDATED');
    expect(workspaceClientSource).toContain('INVOKE_CHANNELS.CHECK_PERMISSION');
    expect(workspaceClientSource).toContain('INVOKE_CHANNELS.REQUEST_PERMISSION');
    expect(workspaceClientSource).toContain('INVOKE_CHANNELS.SET_ACTIVE_WORKSPACE');
  });

  test('settings tab copy reads active skin through renderer skin facade', async () => {
    const settingsSkinConsumerFiles = [
      'AgentSettingsTab.jsx',
      'BrowserSettingsTab.jsx',
      'GeneralSettingsTab.jsx',
      'MemorySettingsTab.jsx',
      'WorkspaceSettingsTab.jsx',
      'useMemorySettingsActions.js',
    ];

    for (const relativePath of settingsSkinConsumerFiles) {
      const source = await fs.readFile(
        path.resolve(
          __dirname,
          `../../src/renderer/features/dashboard/components/sections/settings/${relativePath}`,
        ),
        'utf8',
      );
      expect(source).toContain('DesktopRuntimeSkin');
      expect(source).toContain('DesktopRuntimeSkin.desktopRuntimeSkin');
      expect(source).not.toContain('import { desktopRuntimeSkin');
      expect(source).not.toContain('= desktopRuntimeSkin.settings');
    }
  });

  test('memory settings destructive confirmation routes through app runtime facade', async () => {
    const memorySettingsActionsSource = await fs.readFile(
      path.resolve(
        __dirname,
        '../../src/renderer/features/dashboard/components/sections/settings/useMemorySettingsActions.js',
      ),
      'utf8',
    );
    const dialogRuntimeSource = await fs.readFile(
      path.resolve(
        __dirname,
        '../../src/renderer/app/runtime/desktopMemorySettingsDialogRuntime.js',
      ),
      'utf8',
    );

    expect(memorySettingsActionsSource).toContain('DesktopMemorySettingsDialogRuntime');
    expect(memorySettingsActionsSource).toContain(
      'DesktopMemorySettingsDialogRuntime.confirmMemorySettingsDestructiveAction',
    );
    expect(memorySettingsActionsSource).not.toContain('window.confirm');
    expect(dialogRuntimeSource).toContain('host.confirm');
    expect(dialogRuntimeSource).not.toContain('export function getDialogHost');
  });

  test('browser settings status detail presentation routes through permission runtime', async () => {
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        '../../src/renderer/features/dashboard/components/sections/settings/BrowserSettingsTab.jsx',
      ),
      'utf8',
    );
    const permissionRuntimeSource = await fs.readFile(
      path.resolve(
        __dirname,
        '../../src/renderer/app/runtime/desktopPermissionPresentationRuntime.js',
      ),
      'utf8',
    );

    expect(source).toContain('DesktopPermissionPresentationRuntime');
    expect(source).toContain('status={effectiveStatus}');
    expect(source).not.toContain('permissions.find');
    expect(source).not.toContain('statusesByPermissionId[BROWSER_PERMISSION_ID]');
    expect(source).not.toContain('permission?.permission_id');
    expect(source).not.toContain('effectiveStatus?.status');
    expect(source).not.toContain('effectiveStatus?.reason');
    expect(source).not.toContain('effectiveStatus?.details');
    expect(source).not.toContain('details?.remediation');
    expect(permissionRuntimeSource).toContain('DesktopPermissionPresentationRuntime');
    expect(permissionRuntimeSource).not.toContain('export function getPermissionStatusForId');
  });

  test('global stop shortcut settings and storage route through app runtime client', async () => {
    const generalSettingsSource = await fs.readFile(
      path.resolve(
        __dirname,
        '../../src/renderer/features/dashboard/components/sections/settings/GeneralSettingsTab.jsx',
      ),
      'utf8',
    );
    const configStorageSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js'),
      'utf8',
    );
    const shortcutClientSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopShortcutRuntimeClient.ts'),
      'utf8',
    );
    const appConfigProviderSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/providers/AppConfigProvider.jsx'),
      'utf8',
    );

    for (const source of [generalSettingsSource, configStorageSource]) {
      expect(source).not.toContain('infrastructure/shortcuts/agentStopShortcut');
    }
    expect(generalSettingsSource).toContain('DesktopShortcutRuntimeClient.getGlobalAgentStopShortcutOptions');
    expect(generalSettingsSource).toContain('DesktopShortcutRuntimeClient.getGlobalAgentStopShortcutLabel');
    expect(generalSettingsSource).toContain(
      'DesktopShortcutRuntimeClient.getGlobalAgentStopShortcutStatusPresentation',
    );
    expect(generalSettingsSource).not.toContain('globalAgentStopShortcutStatus?.registrationFailed');
    expect(generalSettingsSource).not.toContain('globalAgentStopShortcutStatus?.usingFallback');
    expect(generalSettingsSource).not.toContain('globalAgentStopShortcutStatus?.resolvedAccelerator');
    expect(generalSettingsSource).not.toContain('globalAgentStopShortcutStatus?.requestedAccelerator');
    expect(generalSettingsSource).not.toContain('globalAgentStopShortcutStatus.resolvedAccelerator');
    expect(generalSettingsSource).not.toContain('globalAgentStopShortcutStatus.requestedAccelerator');
    expect(appConfigProviderSource).toContain(
      'DesktopShortcutRuntimeClient.resolveGlobalAgentStopShortcutFallbackAccelerator',
    );
    expect(appConfigProviderSource).toContain(
      'DesktopShortcutRuntimeClient.areGlobalAgentStopShortcutStatusesEqual',
    );
    expect(appConfigProviderSource).not.toContain('JSON.stringify(previousShortcutStatus');
    expect(appConfigProviderSource).not.toContain('shortcutStatus?.registrationFailed');
    expect(appConfigProviderSource).not.toContain('shortcutStatus?.usingFallback');
    expect(appConfigProviderSource).not.toContain('shortcutStatus?.resolvedAccelerator');
    expect(appConfigProviderSource).not.toContain('shortcutStatus.resolvedAccelerator');
    expect(appConfigProviderSource).toContain('DesktopRendererConfigStorageRuntime');
    expect(configStorageSource).toContain('DesktopShortcutRuntimeClient.normalizeGlobalAgentStopShortcutAccelerator');
    expect(configStorageSource).toContain('DesktopRendererConfigStorageRuntime');
    expect(configStorageSource).not.toContain('export function getRendererConfigStorageKey');
    expect(configStorageSource).not.toContain('export function isRendererConfigStorageEvent');
    expect(configStorageSource).not.toContain('export function loadConfigFromStorage');
    expect(configStorageSource).not.toContain('export function saveConfigToStorage');
    expect(shortcutClientSource).toContain('normalizeGlobalAgentStopShortcutAccelerator');
    expect(shortcutClientSource).toContain('function getGlobalAgentStopShortcutStatusPresentation');
    expect(shortcutClientSource).toContain('function resolveGlobalAgentStopShortcutFallbackAccelerator');
    expect(shortcutClientSource).toContain('function areGlobalAgentStopShortcutStatusesEqual');
    expect(shortcutClientSource).not.toContain('export function getGlobalAgentStopShortcutStatusPresentation');
    expect(shortcutClientSource).not.toContain('export function resolveGlobalAgentStopShortcutFallbackAccelerator');
    expect(shortcutClientSource).not.toContain('export function areGlobalAgentStopShortcutStatusesEqual');
    await expect(fs.stat(
      path.resolve(__dirname, '../../src/renderer/utils/configStorage.js'),
    )).rejects.toThrow();
  });

  test('app startup and onboarding shortcut labels route through app runtime client', async () => {
    const appSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/App.jsx'),
      'utf8',
    );
    const onboardingSource = await fs.readFile(
      path.resolve(
        __dirname,
        '../../src/renderer/features/onboarding/components/DesktopOnboardingSlideshow.jsx',
      ),
      'utf8',
    );

    for (const source of [appSource, onboardingSource]) {
      expect(source).not.toContain('infrastructure/shortcuts/agentStopShortcut');
    }
    expect(appSource).toContain('DesktopShortcutRuntimeClient.getGlobalAgentStopShortcutLabel');
    expect(onboardingSource).toContain('DesktopShortcutRuntimeClient.getAgentStopShortcutLabel');
  });

  test('agent settings routes extension and capability IPC through app runtime client', async () => {
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        '../../src/renderer/features/dashboard/components/sections/settings/AgentSettingsTab.jsx',
      ),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopExtensionRuntimeClient.ts'),
      'utf8',
    );
    const agentSettingsBodySource = source.split('AgentSettingsTab.propTypes')[0] ?? source;

    expect(source).not.toContain('IpcBridge');
    expect(source).not.toContain('INVOKE_CHANNELS');
    expect(source).not.toContain('ON_CHANNELS');
    expect(source).not.toContain('LIST_AGENT_EXTENSIONS');
    expect(source).not.toContain('AGENT_CAPABILITY_EVENT');
    expect(source).not.toContain('payload?.plugins');
    expect(source).not.toContain('payload?.skills');
    expect(source).not.toContain('payload?.mcps');
    expect(source).not.toContain('payload?.errors');
    expect(source).not.toContain('payload?.accepted');
    expect(source).not.toContain('payload?.rejected');
    expect(source).not.toContain('payload?.remote_tools');
    expect(source).not.toContain('toggleListValue');
    expect(source).not.toContain('disabledLocalTools');
    expect(source).not.toContain('disabledRemoteTools');
    expect(agentSettingsBodySource).not.toContain('agent_disabled_local_tools:');
    expect(agentSettingsBodySource).not.toContain('agent_disabled_remote_tools:');
    expect(source).not.toContain('.includes(toolName)');
    expect(source).not.toContain('extensionRuntime.skills.length');
    expect(source).not.toContain('extensionRuntime.mcps.length');
    expect(source).not.toContain('extensionRuntime.mcps.map');
    expect(source).not.toContain('server.tools');
    expect(source).not.toContain('server.command');
    expect(source).not.toContain('event?.manifestStatus');
    expect(source).not.toContain('event.manifestStatus');
    expect(source).not.toContain('event?.remoteToolCatalog');
    expect(source).not.toContain('event.remoteToolCatalog');
    expect(source).not.toContain('remoteToolCatalog.remote_tools');
    expect(source).not.toContain('reason_unavailable');
    expect(source).not.toContain('available === false');
    expect(source).not.toContain('error.kind');
    expect(source).not.toContain('error.id');
    expect(source).not.toContain('error.reason');
    expect(source).not.toContain('manifestStatus.accepted');
    expect(source).not.toContain('manifestStatus.rejected');
    expect(source).not.toContain('(tool) => [tool.name, tool]');
    expect(source).not.toContain('rejectedTool.reason');
    expect(source).not.toContain('plugin.permissions');
    expect(source).not.toContain('plugin.settings_panels');
    expect(source).not.toContain('plugin.tools');
    expect(source).not.toContain('plugin.config_schema');
    expect(source).not.toContain('permission.reason');
    expect(source).not.toContain('panel.description');
    expect(source).not.toContain('.find((tool) => tool.name === toolName)');
    expect(source).not.toContain("event?.type === 'client-tool-manifest'");
    expect(source).not.toContain("event?.type === 'remote-tool-catalog'");
    expect(source).toContain('DesktopExtensionRuntimeClient.listAgentExtensions');
    expect(source).toContain('DesktopExtensionRuntimeClient.onAgentCapabilityUpdate');
    expect(source).toContain('DesktopExtensionRuntimeClient.getRemoteToolPresentation');
    expect(source).toContain('DesktopExtensionRuntimeClient.getExtensionRuntimeErrorPresentation');
    expect(source).toContain('DesktopExtensionRuntimeClient.getLocalToolManifestPresentation');
    expect(source).toContain('DesktopExtensionRuntimeClient.getPluginRuntimePresentation');
    expect(source).toContain('DesktopExtensionRuntimeClient.getSkillRuntimePresentation');
    expect(source).toContain('DesktopExtensionRuntimeClient.getMcpRuntimeMetadataPresentation');
    expect(source).toContain('DesktopExtensionRuntimeClient.isLocalToolEnabled');
    expect(source).toContain('DesktopExtensionRuntimeClient.isRemoteToolEnabled');
    expect(source).toContain('DesktopExtensionRuntimeClient.getLocalToolToggleConfigPatch');
    expect(source).toContain('DesktopExtensionRuntimeClient.getRemoteToolToggleConfigPatch');
    expect(source).toContain('DesktopExtensionRuntimeClient.getEmptyExtensionRuntime');
    expect(source).toContain('DesktopExtensionRuntimeClient.getEmptyToolManifestStatus');
    expect(source).toContain('DesktopExtensionRuntimeClient.getEmptyRemoteToolCatalog');
    expect(source).not.toContain('EMPTY_AGENT_EXTENSION_RUNTIME');
    expect(source).not.toContain('EMPTY_AGENT_TOOL_MANIFEST_STATUS');
    expect(source).not.toContain('EMPTY_AGENT_REMOTE_TOOL_CATALOG');
    expect(source).not.toContain('DesktopAgentExtensionRuntimeClient');
    expect(clientSource).not.toContain('export const EMPTY_AGENT_EXTENSION_RUNTIME');
    expect(clientSource).not.toContain('export const EMPTY_AGENT_TOOL_MANIFEST_STATUS');
    expect(clientSource).not.toContain('export const EMPTY_AGENT_REMOTE_TOOL_CATALOG');
    expect(clientSource).toContain('function normalizeAgentExtensionRuntime');
    expect(clientSource).not.toContain('export function normalizeAgentExtensionRuntime');
    expect(clientSource).toContain('function normalizeAgentCapabilityEvent');
    expect(clientSource).not.toContain('export function normalizeAgentCapabilityEvent');
    expect(clientSource).toContain('function resolveAgentCapabilityUpdate');
    expect(clientSource).not.toContain('export function resolveAgentCapabilityUpdate');
    expect(clientSource).toContain('function getAgentRemoteToolPresentation');
    expect(clientSource).toContain('function getAgentExtensionRuntimeErrorPresentation');
    expect(clientSource).toContain('function getAgentLocalToolManifestPresentation');
    expect(clientSource).toContain('function getAgentPluginRuntimePresentation');
    expect(clientSource).toContain('function getAgentSkillRuntimePresentation');
    expect(clientSource).toContain('function getAgentMcpRuntimeMetadataPresentation');
    expect(clientSource).toContain('function getAgentLocalToolToggleConfigPatch');
    expect(clientSource).toContain('function getAgentRemoteToolToggleConfigPatch');
    expect(clientSource).toContain('function isAgentLocalToolEnabled');
    expect(clientSource).toContain('function isAgentRemoteToolEnabled');
    expect(clientSource).not.toContain('export function getAgentRemoteToolPresentation');
    expect(clientSource).not.toContain('export function getAgentExtensionRuntimeErrorPresentation');
    expect(clientSource).not.toContain('export function getAgentLocalToolManifestPresentation');
    expect(clientSource).not.toContain('export function getAgentPluginRuntimePresentation');
    expect(clientSource).not.toContain('export function getAgentSkillRuntimePresentation');
    expect(clientSource).not.toContain('export function getAgentMcpRuntimeMetadataPresentation');
    expect(clientSource).not.toContain('export function getAgentLocalToolToggleConfigPatch');
    expect(clientSource).not.toContain('export function getAgentRemoteToolToggleConfigPatch');
    expect(clientSource).not.toContain('export function isAgentLocalToolEnabled');
    expect(clientSource).not.toContain('export function isAgentRemoteToolEnabled');
    expect(clientSource).toContain('getRemoteToolPresentation');
    expect(clientSource).toContain('getExtensionRuntimeErrorPresentation');
    expect(clientSource).toContain('getLocalToolManifestPresentation');
    expect(clientSource).toContain('getPluginRuntimePresentation');
    expect(clientSource).toContain('getSkillRuntimePresentation');
    expect(clientSource).toContain('getMcpRuntimeMetadataPresentation');
    expect(clientSource).toContain('getLocalToolToggleConfigPatch');
    expect(clientSource).toContain('getRemoteToolToggleConfigPatch');
    expect(clientSource).toContain('getEmptyExtensionRuntime');
    expect(clientSource).toContain('getEmptyToolManifestStatus');
    expect(clientSource).toContain('getEmptyRemoteToolCatalog');
    expect(clientSource).toContain('isLocalToolEnabled');
    expect(clientSource).toContain('isRemoteToolEnabled');
    expect(clientSource).toContain('onAgentCapabilityEvent');
    expect(clientSource).toContain('onAgentCapabilityUpdate');
    expect(clientSource).toContain('manifestStatus');
    expect(clientSource).toContain('remoteToolCatalog');
    expect(clientSource).toContain('INVOKE_CHANNELS.LIST_AGENT_EXTENSIONS');
    expect(clientSource).toContain('ON_CHANNELS.AGENT_CAPABILITY_EVENT');
    expect(clientSource).not.toContain('DesktopAgentExtensionRuntimeClient');
  });

  test('MCP settings card presentation routes through MCP runtime client', async () => {
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        '../../src/renderer/features/dashboard/components/sections/McpsSection.jsx',
      ),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopMcpRuntimeClient.ts'),
      'utf8',
    );

    expect(source).toContain('DesktopMcpRuntimeClient.getMcpServerPresentation');
    expect(source).toContain('DesktopMcpRuntimeClient.getMcpRegistryErrorPresentation');
    expect(source).toContain('DesktopMcpRuntimeClient.getEmptyMcpRegistry');
    expect(source).not.toContain('EMPTY_DESKTOP_MCP_REGISTRY');
    expect(source).not.toContain('server.status?.label');
    expect(source).not.toContain('server.status?.state');
    expect(source).not.toContain('server.status?.reason');
    expect(source).not.toContain('server.effective_enabled === true');
    expect(source).not.toContain('server.command');
    expect(source).not.toContain('server.args');
    expect(source).not.toContain('server.tools');
    expect(source).not.toContain('server.extension_id');
    expect(source).not.toContain('server.mcp_id');
    expect(source).not.toContain('server.id');
    expect(source).not.toContain('registryError.kind');
    expect(source).not.toContain('registryError.id');
    expect(source).not.toContain('registryError.reason');
    expect(clientSource).toContain('getDesktopMcpServerPresentation');
    expect(clientSource).toContain('getDesktopMcpRegistryErrorPresentation');
    expect(clientSource).toContain('statusClassName');
    expect(clientSource).toContain('debugSpec');
  });

  test('settings runtime facade describes SDK command IPC rather than backend IPC', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopSettingsRuntimeClient.ts'),
      'utf8',
    );

    expect(source).toContain('SDK command IPC');
    expect(source).not.toContain('backend IPC');
  });

  test('settings sync docs route renderer updates through SDK command IPC', async () => {
    const docs = await Promise.all([
      fs.readFile(
        path.resolve(
          __dirname,
          '../../docs/frontend/runtime/config_sync_and_settings_lifecycle_reference.md',
        ),
        'utf8',
      ),
      fs.readFile(
        path.resolve(__dirname, '../../docs/frontend/runtime/settings_sync_change_workflow.md'),
        'utf8',
      ),
    ]);
    const source = docs.join('\n');

    expect(source).toContain('SDK-shaped `settings.update` command');
    expect(source).toContain('through the Agent SDK runtime');
    expect(source).toContain('renderer-to-SDK/main settings command shape');
    expect(source).not.toContain('renderer sends `to-backend`');
    expect(source).not.toContain('renderer-to-backend settings payload shape');
  });

  test('app config provider routes settings events through app runtime client', async () => {
    const providerSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/providers/AppConfigProvider.jsx'),
      'utf8',
    );
    const settingsEventClientSource = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts'),
      'utf8',
    );

    expect(providerSource).toContain(
      'DesktopSettingsEventRuntimeClient.useDesktopSettingsEventHandlers',
    );
    expect(providerSource).toContain('DesktopSettingsEventRuntimeClient.routeDesktopSettingsEvent');
    expect(providerSource).toContain('DesktopClientSessionRuntimeClient.onIpcStatusValues');
    expect(providerSource).toContain('DesktopClientSessionRuntimeClient.resolveIpcStatusValues');
    expect(providerSource).toContain('DesktopVoiceRuntimeClient.onWakewordToggleState');
    expect(providerSource).not.toContain('appConfigEvents');
    expect(providerSource).not.toContain('routeConfigSettingsEvent');
    expect(providerSource).not.toContain('DesktopClientSessionRuntimeClient.onIpcStatus(');
    expect(providerSource).not.toContain('DesktopVoiceRuntimeClient.onWakewordToggle(');
    expect(providerSource).not.toContain('data?.isConnected');
    expect(providerSource).not.toContain('data.isConnected');
    expect(providerSource).not.toContain('data?.globalAgentStopShortcutStatus');
    expect(providerSource).not.toContain('data.globalAgentStopShortcutStatus');
    expect(providerSource).not.toContain('data?.enabled');
    expect(providerSource).not.toContain('data.enabled');
    expect(providerSource).not.toContain('extractTranscriptUserId');
    expect(providerSource).not.toContain('desktopRendererConfigFilterRuntime');
    expect(providerSource).not.toContain('filterRendererConfig');
    expect(providerSource).not.toContain('mergeRendererProviderConfig');
    expect(providerSource).not.toContain('sanitizeRendererProviderConfig');
    expect(providerSource).toContain('buildMergedRendererConfig');
    expect(providerSource).not.toContain('features/settings/hooks/useSettingsManagement');
    expect(providerSource).not.toContain('useSettingsManagement');
    expect(settingsEventClientSource).toContain('handleModelsListed');
    expect(settingsEventClientSource).toContain('routeDesktopSettingsEvent');
    expect(settingsEventClientSource).toContain('function routeDesktopSettingsEvent');
    expect(settingsEventClientSource).not.toContain('export function routeDesktopSettingsEvent');
    expect(settingsEventClientSource).not.toContain('export function useDesktopSettingsEventHandlers');
    expect(settingsEventClientSource).toContain('DesktopSettingsEventRuntimeClient');
  });

  test('renderer runtime sync names local-only config as renderer-owned state', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../src/renderer/app/providers/appConfigRuntimeSync.js'),
      'utf8',
    );

    expect(source).toContain('LOCAL_ONLY_RENDERER_CONFIG_KEYS');
    expect(source).not.toContain('LOCAL_ONLY_FRONTEND_CONFIG_KEYS');
  });
});
