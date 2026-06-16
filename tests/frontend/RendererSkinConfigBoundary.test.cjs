/**
 * Covers renderer skin/config boundary behavior in the frontend test suite.
 */

const fs = require('fs');
const path = require('path');

const rendererRoot = path.resolve(__dirname, '../../frontend/src/renderer');
const skinPath = path.join(rendererRoot, 'app/skin/windieDesktopSkin.js');
const settingsRoot = path.join(rendererRoot, 'features/dashboard/components/sections/settings');
const dashboardSectionsRoot = path.join(rendererRoot, 'features/dashboard/components/sections');

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

  test('settings components do not expose sidecar execution targets as user-facing labels', () => {
    const source = read('AgentSettingsTab.jsx');

    expect(source).toContain('formatToolAcceptanceRuntimeSummary');
    expect(source).not.toContain("execution_target || 'sidecar'");
    expect(source).not.toContain("acceptedTool.execution_target || 'sidecar'");
  });
});
