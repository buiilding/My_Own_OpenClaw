/**
 * Covers renderer settings runtime boundary. behavior in the frontend test suite.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const settingsRuntimeFiles = [
  '../../frontend/src/renderer/app/providers/appConfigRuntimeSync.js',
  '../../frontend/src/renderer/app/providers/AppConfigProvider.jsx',
  '../../frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx',
].map((relativePath) => path.resolve(__dirname, relativePath));

describe('renderer settings runtime boundary', () => {
  test('model list and settings sync callers use the desktop settings runtime facade', async () => {
    const offenders: string[] = [];

    for (const file of settingsRuntimeFiles) {
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('infrastructure/api/client') || source.includes('ApiClient.')) {
        offenders.push(path.relative(path.resolve(__dirname, '../../frontend/src/renderer'), file));
      }
      if (source.includes('infrastructure/api/agentSdkClient')) {
        offenders.push(path.relative(path.resolve(__dirname, '../../frontend/src/renderer'), file));
      }
      if (source.includes('window.ipc')) {
        offenders.push(path.relative(path.resolve(__dirname, '../../frontend/src/renderer'), file));
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
        path.resolve(__dirname, '../../frontend/src/renderer', relativePath),
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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopAppConfigRuntimeClient.ts'),
      'utf8',
    );
    const sessionClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopClientSessionRuntimeClient.ts'),
      'utf8',
    );
    const voiceClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopVoiceRuntimeClient.ts'),
      'utf8',
    );

    expect(offenders).toEqual([]);
    expect(appConfigClientSource).toContain('INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG');
    expect(appConfigClientSource).toContain('INVOKE_CHANNELS.LOAD_FRONTEND_CONFIG');
    expect(appConfigClientSource).toContain('ON_CHANNELS.BACKEND_SETTINGS_EVENT');
    expect(sessionClientSource).toContain('INVOKE_CHANNELS.GET_CLIENT_USER_ID');
    expect(sessionClientSource).toContain('ON_CHANNELS.IPC_STATUS');
    expect(voiceClientSource).toContain('ON_CHANNELS.WAKEWORD_TOGGLE');
  });

  test('workspace settings routes workspace update fan-out through app runtime client', async () => {
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        '../../frontend/src/renderer/features/dashboard/components/sections/settings/WorkspaceSettingsTab.jsx',
      ),
      'utf8',
    );
    const workspaceClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopWorkspaceRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('IpcBridge');
    expect(source).not.toContain('ON_CHANNELS');
    expect(source).not.toContain('WORKSPACE_ACCESS_UPDATED');
    expect(source).toContain('DesktopWorkspaceRuntimeClient.onWorkspaceAccessUpdated');
    expect(workspaceClientSource).toContain('ON_CHANNELS.WORKSPACE_ACCESS_UPDATED');
  });

  test('agent settings routes extension and capability IPC through app runtime client', async () => {
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        '../../frontend/src/renderer/features/dashboard/components/sections/settings/AgentSettingsTab.jsx',
      ),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopAgentExtensionRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('IpcBridge');
    expect(source).not.toContain('INVOKE_CHANNELS');
    expect(source).not.toContain('ON_CHANNELS');
    expect(source).not.toContain('LIST_AGENT_EXTENSIONS');
    expect(source).not.toContain('AGENT_CAPABILITY_EVENT');
    expect(source).toContain('DesktopAgentExtensionRuntimeClient.listAgentExtensions');
    expect(source).toContain('DesktopAgentExtensionRuntimeClient.onAgentCapabilityEvent');
    expect(clientSource).toContain('INVOKE_CHANNELS.LIST_AGENT_EXTENSIONS');
    expect(clientSource).toContain('ON_CHANNELS.AGENT_CAPABILITY_EVENT');
  });

  test('settings runtime facade describes SDK command IPC rather than backend IPC', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopSettingsRuntimeClient.ts'),
      'utf8',
    );

    expect(source).toContain('SDK command IPC');
    expect(source).not.toContain('backend IPC');
  });

  test('renderer runtime sync names local-only config as renderer-owned state', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/providers/appConfigRuntimeSync.js'),
      'utf8',
    );

    expect(source).toContain('LOCAL_ONLY_RENDERER_CONFIG_KEYS');
    expect(source).not.toContain('LOCAL_ONLY_FRONTEND_CONFIG_KEYS');
  });
});
