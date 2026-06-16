/**
 * Covers the main-process host skin/config boundary.
 */

const fs = require('fs');
const path = require('path');

const mainRoot = path.resolve(__dirname, '../../frontend/src/main');
const indexPath = path.join(mainRoot, 'index.cjs');
const skinPath = path.join(mainRoot, 'app/main_host_skin.cjs');
const browserPermissionServicePath = path.join(mainRoot, 'permissions/permission_service_browser.cjs');
const automationPermissionServicePath = path.join(mainRoot, 'permissions/permission_service_automation.cjs');

describe('main host skin/config boundary', () => {
  test('WindieOS host permission copy lives in the main host skin', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');

    expect(skinSource).toContain("const productName = 'WindieOS'");
    expect(skinSource).toContain('browserAutomation');
    expect(skinSource).toContain('macAutomation');
    expect(skinSource).toContain('localBackendNotReady');
    expect(skinSource).toContain('installBrowserPrompt');
    expect(skinSource).toContain('installDialogMessage');
    expect(skinSource).toContain('openProfileAction');
    expect(skinSource).toContain('probeFailure');
    expect(skinSource).toContain('probeRemediation');
  });

  test('main composition root consumes host skin copy for permission adapters', () => {
    const source = fs.readFileSync(indexPath, 'utf8');

    expect(source).toContain("require('./app/main_host_skin.cjs')");
    expect(source).toContain('browserAutomationCopy.localBackendNotReady');
    expect(source).toContain('browserAutomationCopy.installBrowserPrompt');
    expect(source).toContain('macAutomationCopy.probeFailure');
    expect(source).toContain('macAutomationCopy.requestFailure');
    expect(source).not.toContain('WindieOS local backend is not ready.');
    expect(source).not.toContain('Click Grant to install Chromium for WindieOS.');
    expect(source).not.toContain('Reinstall WindieOS or install browser feature pack dependencies.');
    expect(source).not.toContain('Failed to open the WindieOS browser.');
    expect(source).not.toContain('WindieOS could not verify macOS Automation permission yet.');
    expect(source).not.toContain('WindieOS could not request macOS Automation permission.');
  });

  test('browser and automation permission services consume injected host skin copy', () => {
    const sources = [
      fs.readFileSync(browserPermissionServicePath, 'utf8'),
      fs.readFileSync(automationPermissionServicePath, 'utf8'),
    ];

    for (const source of sources) {
      expect(source).toContain('deps.mainHostSkin');
      expect(source).not.toContain('WindieOS');
      expect(source).not.toContain('WindieOS browser');
      expect(source).not.toContain('enable WindieOS under System Events');
    }
  });

});
