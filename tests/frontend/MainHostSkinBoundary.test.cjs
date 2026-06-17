/**
 * Covers the main-process host skin/config boundary.
 */

const fs = require('fs');
const path = require('path');

const mainRoot = path.resolve(__dirname, '../../frontend/src/main');
const indexPath = path.join(mainRoot, 'index.cjs');
const skinPath = path.join(mainRoot, 'app/main_host_skin.cjs');
const ipcQueryEventsPath = path.join(mainRoot, 'ipc/ipc_query_events.cjs');
const openAICodexOAuthPath = path.join(mainRoot, 'app/openai_codex_oauth.cjs');
const openAICodexOAuthHandlersPath = path.join(mainRoot, 'ipc/ipc_openai_codex_oauth_handlers.cjs');
const mcpRuntimePath = path.join(mainRoot, 'extensions/mcp_runtime.cjs');
const layerLogSinkPath = path.join(mainRoot, 'logging/layer_log_sink.cjs');
const wakewordRuntimePath = path.join(mainRoot, 'wakeword/wakeword_bridge_runtime.cjs');
const sidecarLaunchOptionsPath = path.join(mainRoot, 'sidecar/sdk_sidecar_launch_options.cjs');
const localBackendBridgePath = path.join(mainRoot, 'sidecar/local_backend_bridge.cjs');
const browserPermissionServicePath = path.join(mainRoot, 'permissions/permission_service_browser.cjs');
const automationPermissionServicePath = path.join(mainRoot, 'permissions/permission_service_automation.cjs');
const screenCapturePermissionServicePath = path.join(mainRoot, 'permissions/permission_service_screen_capture.cjs');
const inputControlPermissionServicePath = path.join(mainRoot, 'permissions/permission_service_input_control.cjs');
const microphonePermissionServicePath = path.join(mainRoot, 'permissions/permission_service_microphone.cjs');
const workspacePermissionServicePath = path.join(mainRoot, 'permissions/permission_service_workspace.cjs');

describe('main host skin/config boundary', () => {
  test('WindieOS host permission copy lives in the main host skin', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');

    expect(skinSource).toContain("const productName = 'WindieOS'");
    expect(skinSource).toContain('identity');
    expect(skinSource).toContain('sdkAgentName');
    expect(skinSource).toContain('trayTooltip');
    expect(skinSource).toContain('mcpClientInfo');
    expect(skinSource).toContain('logPrefix');
    expect(skinSource).toContain('browserAutomation');
    expect(skinSource).toContain('macAutomation');
    expect(skinSource).toContain('localBackendNotReady');
    expect(skinSource).toContain('installBrowserPrompt');
    expect(skinSource).toContain('installDialogMessage');
    expect(skinSource).toContain('openProfileAction');
    expect(skinSource).toContain('probeFailure');
    expect(skinSource).toContain('probeRemediation');
    expect(skinSource).toContain('screenCapture');
    expect(skinSource).toContain('accessibilityRemediation');
    expect(skinSource).toContain('osPrivacyRemediation');
    expect(skinSource).toContain('folderPickerTitle');
    expect(skinSource).toContain('queryEvents');
    expect(skinSource).toContain('bundledRuntime');
    expect(skinSource).toContain('missingPythonRuntime');
    expect(skinSource).toContain('missingWakewordExecutable');
    expect(skinSource).toContain('localBackend');
    expect(skinSource).toContain('browserWarmupExplanation');
    expect(skinSource).toContain('openAICodexOAuth');
    expect(skinSource).toContain('tokenExchangeFailure');
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
      fs.readFileSync(screenCapturePermissionServicePath, 'utf8'),
      fs.readFileSync(inputControlPermissionServicePath, 'utf8'),
      fs.readFileSync(microphonePermissionServicePath, 'utf8'),
      fs.readFileSync(workspacePermissionServicePath, 'utf8'),
    ];

    for (const source of sources) {
      expect(source).toContain('deps.mainHostSkin');
      expect(source).not.toContain('WindieOS');
      expect(source).not.toContain('WindieOS browser');
      expect(source).not.toContain('enable WindieOS under System Events');
      expect(source).not.toContain('Select workspace folder for WindieOS');
    }
  });

  test('query event builders keep product copy in the host skin', () => {
    const source = fs.readFileSync(ipcQueryEventsPath, 'utf8');

    expect(source).toContain('copy.sendFailure');
    expect(source).toContain('copy.interruptedAfterAccept');
    expect(source).not.toContain('WindieOS');
    expect(source).not.toContain("WindieOS isn't connected");
    expect(source).not.toContain('WindieOS lost connection');
  });

  test('MCP runtime uses generic defaults instead of product identity', () => {
    const source = fs.readFileSync(mcpRuntimePath, 'utf8');

    expect(source).toContain("name: 'Desktop Agent'");
    expect(source).not.toContain("name: 'WindieOS'");
  });

  test('layer log sink uses generic defaults instead of product prefix', () => {
    const source = fs.readFileSync(layerLogSinkPath, 'utf8');

    expect(source).toContain("DEFAULT_LOG_PREFIX = '[Desktop Agent]'");
    expect(source).not.toContain('[WindieOS]');
  });

  test('bundled runtime helpers use generic defaults instead of product reinstall copy', () => {
    const sources = [
      fs.readFileSync(wakewordRuntimePath, 'utf8'),
      fs.readFileSync(sidecarLaunchOptionsPath, 'utf8'),
    ];

    for (const source of sources) {
      expect(source).toContain('Please reinstall this app');
      expect(source).not.toContain('Please reinstall WindieOS');
      expect(source).not.toContain('Reinstall WindieOS');
    }
  });

  test('local backend and OAuth helpers consume host copy with generic defaults', () => {
    const localBackendSource = fs.readFileSync(localBackendBridgePath, 'utf8');
    const oauthSource = fs.readFileSync(openAICodexOAuthPath, 'utf8');
    const oauthHandlerSource = fs.readFileSync(openAICodexOAuthHandlersPath, 'utf8');

    expect(localBackendSource).toContain('DEFAULT_BROWSER_WARMUP_EXPLANATION');
    expect(localBackendSource).toContain('localBackendCopy.browserWarmupExplanation');
    expect(localBackendSource).not.toContain('Open the WindieOS browser');
    expect(oauthSource).toContain('Return to the app for details');
    expect(oauthSource).not.toContain('Return to WindieOS');
    expect(oauthHandlerSource).toContain('copy ? { copy } : {}');
  });
});
