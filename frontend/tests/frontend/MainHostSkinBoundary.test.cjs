/**
 * Covers the main-process host skin/config boundary.
 */

const fs = require('fs');
const path = require('path');

const mainRoot = path.resolve(__dirname, '../../src/main');
const indexPath = path.join(mainRoot, 'index.cjs');
const mainIpcPath = path.join(mainRoot, 'ipc.cjs');
const skinPath = path.join(mainRoot, 'app/main_host_skin.cjs');
const backendEndpointsPath = path.join(mainRoot, 'app/backend_endpoints.cjs');
const debugEnvPath = path.join(mainRoot, 'app/debug_env.cjs');
const gpuRuntimePath = path.join(mainRoot, 'app/gpu_runtime.cjs');
const runtimePathsPath = path.join(mainRoot, 'app/runtime_paths.cjs');
const runtimeModePath = path.join(mainRoot, 'app/runtime_mode.cjs');
const vmWorkerRuntimePath = path.join(mainRoot, 'app/vm_worker_runtime.cjs');
const mainProcessBootstrapRuntimePath = path.join(mainRoot, 'app/main_process_bootstrap_runtime.cjs');
const ipcQueryEventsPath = path.join(mainRoot, 'ipc/ipc_query_events.cjs');
const ipcRuntimeHelpersPath = path.join(mainRoot, 'ipc/ipc_runtime_helpers.cjs');
const ipcAgentConnectionEventsPath = path.join(mainRoot, 'ipc/ipc_agent_connection_events.cjs');
const ipcAgentBackendCloseRuntimePath = path.join(mainRoot, 'ipc/ipc_agent_backend_close_runtime.cjs');
const ipcHostRuntimeConfigPath = path.join(mainRoot, 'ipc/ipc_host_runtime_config.cjs');
const ipcHostOptionStatePath = path.join(mainRoot, 'ipc/ipc_host_option_state.cjs');
const desktopRuntimeChannelsPath = path.join(mainRoot, 'ipc/ipc_desktop_runtime_channels.cjs');
const retiredDesktopAgentChannelsPath = path.join(mainRoot, 'ipc/ipc_desktop_agent_channels.cjs');
const ipcRendererWindowsPath = path.join(mainRoot, 'ipc/ipc_renderer_windows.cjs');
const ipcQueryBroadcastPath = path.join(mainRoot, 'ipc/ipc_query_broadcast.cjs');
const mainWindowIconRuntimePath = path.join(mainRoot, 'surfaces/main_window_icon_runtime.cjs');
const mainWindowRuntimePath = path.join(mainRoot, 'surfaces/main_window_runtime.cjs');
const mcpRuntimePath = path.join(mainRoot, 'extensions/mcp_runtime.cjs');
const layerLogSinkPath = path.join(mainRoot, 'logging/layer_log_sink.cjs');
const extensionManifestPath = path.join(mainRoot, 'extensions/extension_manifest.cjs');
const wakewordBridgePath = path.join(mainRoot, 'wakeword/wakeword_bridge.cjs');
const wakewordRuntimePath = path.join(mainRoot, 'wakeword/wakeword_bridge_runtime.cjs');
const localRuntimeLaunchOptionsPath = path.join(mainRoot, 'sidecar/local_runtime_launch_options.cjs');
const localRuntimeUtilsPath = path.join(mainRoot, 'sidecar/local_runtime_utils.cjs');
const localRuntimeBridgePath = path.join(mainRoot, 'sidecar/local_runtime_bridge.cjs');
const localRuntimeBridgeModulePaths = [
  localRuntimeBridgePath,
  path.join(mainRoot, 'sidecar/local_runtime_display_bounds.cjs'),
  path.join(mainRoot, 'sidecar/local_runtime_execute_tool_runtime.cjs'),
  path.join(mainRoot, 'sidecar/local_runtime_screenshot_attachment.cjs'),
  path.join(mainRoot, 'sidecar/local_runtime_timeout_policy.cjs'),
  path.join(mainRoot, 'sidecar/local_runtime_tool_args.cjs'),
  path.join(mainRoot, 'sidecar/local_runtime_utils.cjs'),
  path.join(mainRoot, 'sidecar/local_runtime_window_visibility.cjs'),
  path.join(mainRoot, 'sidecar/local_runtime_status_broadcaster.cjs'),
  path.join(mainRoot, 'sidecar/local_runtime_supervisor.cjs'),
];
const browserPermissionServicePath = path.join(mainRoot, 'permissions/permission_service_browser.cjs');
const automationPermissionServicePath = path.join(mainRoot, 'permissions/permission_service_automation.cjs');
const screenCapturePermissionServicePath = path.join(mainRoot, 'permissions/permission_service_screen_capture.cjs');
const inputControlPermissionServicePath = path.join(mainRoot, 'permissions/permission_service_input_control.cjs');
const microphonePermissionServicePath = path.join(mainRoot, 'permissions/permission_service_microphone.cjs');
const workspacePermissionServicePath = path.join(mainRoot, 'permissions/permission_service_workspace.cjs');
const permissionIpcRuntimePath = path.join(mainRoot, 'permissions/permission_ipc_runtime.cjs');
const permissionManifestPath = path.resolve(__dirname, '../../src/shared/permissions/permission_manifest.json');
const permissionManifestReferencePath = path.resolve(
  __dirname,
  '../../docs/frontend/main/permission_manifest_probe_and_request_ipc_reference.md',
);
const queryPayloadReferencePath = path.resolve(
  __dirname,
  '../../docs/frontend/main/query_payload_and_relay_reference.md',
);
const ipcHelperReferencePath = path.resolve(
  __dirname,
  '../../docs/frontend/main/ipc_helper_module_split_and_runtime_boundary_reference.md',
);
const mainMarkerConsumerPaths = [
  layerLogSinkPath,
  path.join(mainRoot, 'surfaces/main_window_overlay_runtime.cjs'),
  path.join(mainRoot, 'surfaces/main_window_runtime.cjs'),
  path.join(mainRoot, 'surfaces/window_suppression_runtime.cjs'),
  path.join(mainRoot, 'surfaces/window_visibility_runtime.cjs'),
];
const retiredDesktopAgentChannelGroupName = (group) => `DESKTOP_${'AGENT'}_${group}_CHANNELS`;
const retiredDesktopAgentMarker = (suffix) => `__desktop${'Agent'}${suffix}`;
const retiredDesktopAgentIpcGroupDescription = `desktop-${'agent'} IPC channel groups`;

describe('main host skin/config boundary', () => {
  test('WindieOS host permission copy lives in the main host skin', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');

    expect(skinSource).toContain("const productName = 'WindieOS'");
    expect(skinSource).toContain('identity');
    expect(skinSource).toContain('assets');
    expect(skinSource).toContain('dataPaths');
    expect(skinSource).toContain('appIconFileName');
    expect(skinSource).toContain("appDataDirName: 'windieos'");
    expect(skinSource).toContain("diagnosticsDb: 'WINDIE_APP_DIAGNOSTICS_DB'");
    expect(skinSource).toContain("userDataDir: 'WINDIE_USER_DATA_DIR'");
    expect(skinSource).toContain('diagnostics');
    expect(skinSource).toContain("localRuntimeErrorMarkers: Object.freeze(['sidecar'])");
    expect(skinSource).toContain('runtimePaths');
    expect(skinSource).toContain("packagedEntrypointDirName: 'sidecar'");
    expect(skinSource).toContain("pythonPath: 'WINDIE_PYTHON_PATH'");
    expect(skinSource).toContain('gpu');
    expect(skinSource).toContain("forceSoftwareRendering: 'WINDIE_FORCE_SOFTWARE_RENDERING'");
    expect(skinSource).toContain('extensions');
    expect(skinSource).toContain("contributionsDir: 'WINDIE_AGENT_CONTRIBUTIONS_DIR'");
    expect(skinSource).toContain('mcp');
    expect(skinSource).toContain("enabledServers: 'WINDIE_ENABLED_MCPS'");
    expect(skinSource).toContain('logging');
    expect(skinSource).toContain("logDirSegments: Object.freeze(['.windie', 'logs'])");
    expect(skinSource).toContain("layerLogFilePrefix: 'WINDIE'");
    expect(skinSource).toContain("rendererVerboseLogFile: 'WINDIE_RENDERER_VERBOSE_LOG_FILE'");
    expect(skinSource).toContain('debug');
    expect(skinSource).toContain("streamEvents: 'WINDIE_DEBUG_STREAM_EVENTS'");
    expect(skinSource).toContain("toolScreenshot: 'WINDIE_DEBUG_TOOL_SCREENSHOT'");
    expect(skinSource).toContain('shortcuts');
    expect(skinSource).toContain('wakewordHotkeyByPlatform');
    expect(skinSource).toContain('wakewordFallbackHotkeysByPlatform');
    expect(skinSource).toContain('sdkAgentName');
    expect(skinSource).toContain('trayTooltip');
    expect(skinSource).toContain('mcpClientInfo');
    expect(skinSource).toContain('logPrefix');
    expect(skinSource).toContain('hostedBackend');
    expect(skinSource).toContain('https://api.windieos.com');
    expect(skinSource).toContain('wss://api.windieos.com/ws');
    expect(skinSource).toContain("runsApiKeyHeader: 'x-windie-runs-key'");
    expect(skinSource).toContain("defaultHttpUrl: 'WINDIE_DEFAULT_BACKEND_HTTP_URL'");
    expect(skinSource).toContain("defaultWsUrl: 'WINDIE_DEFAULT_BACKEND_WS_URL'");
    expect(skinSource).toContain('vmWorker');
    expect(skinSource).toContain("vmMode: 'WINDIE_VM_MODE'");
    expect(skinSource).toContain("vmWorkerMode: 'WINDIE_VM_WORKER_MODE'");
    expect(skinSource).toContain("workspaceId: 'WINDIE_VM_WORKSPACE_ID'");
    expect(skinSource).toContain("'WINDIE_VM_RUNS_API_KEY'");
    expect(skinSource).toContain("'WINDIE_RUNS_API_KEY'");
    expect(skinSource).toContain('browserAutomation');
    expect(skinSource).toContain('macAutomation');
    expect(skinSource).toContain('localRuntimeNotReady');
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
    expect(skinSource).toContain('localRuntime');
    expect(skinSource).toContain("backendHttpUrl: 'WINDIE_BACKEND_HTTP_URL'");
    expect(skinSource).toContain("permissionStatePath: 'WINDIE_PERMISSION_STATE_PATH'");
    expect(skinSource).toContain("verboseStderr: 'WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR'");
    expect(skinSource).toContain('browserWarmupExplanation');
    expect(skinSource).toContain('wakeword');
    expect(skinSource).toContain("allowRuntimeDownload: 'WINDIE_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD'");
    expect(skinSource).toContain("modelName: 'WINDIE_WAKEWORD_NAME'");
    expect(skinSource).toContain("modelName: 'hey_jarvis'");
  });

  test('shared permission manifest uses generic agent-host descriptions', () => {
    const manifestSource = fs.readFileSync(permissionManifestPath, 'utf8');
    const manifest = JSON.parse(manifestSource);

    expect(manifestSource).not.toContain('WindieOS');
    expect(manifestSource).not.toContain('WindieOS browser');
    expect(manifestSource).not.toContain('desktop agent');
    expect(manifestSource).not.toContain('desktop runtime');
    expect(manifest.permissions.find(permission => permission.permission_id === 'screen_capture')).toMatchObject({
      description: expect.stringContaining('agent host'),
    });
    const browserPermission = manifest.permissions.find(
      permission => permission.permission_id === 'browser_automation',
    );
    expect(browserPermission?.description).toContain('dedicated browser');
    expect(browserPermission?.description).toContain('agent host');
  });

  test('hosted backend defaults live in host skin config', () => {
    const backendEndpointSource = fs.readFileSync(backendEndpointsPath, 'utf8');
    const runtimeModeSource = fs.readFileSync(runtimeModePath, 'utf8');
    const vmWorkerRuntimeSource = fs.readFileSync(vmWorkerRuntimePath, 'utf8');
    const bootstrapSource = fs.readFileSync(mainProcessBootstrapRuntimePath, 'utf8');
    const indexSource = fs.readFileSync(indexPath, 'utf8');

    expect(backendEndpointSource).toContain('configureBackendEndpointRuntime');
    expect(backendEndpointSource).not.toContain('mainHostSkin');
    expect(fs.readFileSync(mainIpcPath, 'utf8')).not.toContain("require('./app/main_host_skin.cjs')");
    expect(fs.readFileSync(mainIpcPath, 'utf8')).toContain('configureIpcHostRuntime(config = {})');
    expect(indexSource).toContain('configureIpcHostRuntime({');
    expect(indexSource).toContain('hostedBackend: mainHostSkin.hostedBackend');
    expect(indexSource).toContain('debug: mainHostSkin.debug');
    expect(indexSource).toContain('runsApiKeyHeader: mainHostSkin.hostedBackend.runsApiKeyHeader');
    expect(indexSource).toContain('vmWorkerEnv: mainHostSkin.vmWorker.env');
    expect(indexSource).toContain('appIconFileName: mainHostSkin.assets.appIconFileName');
    expect(indexSource).toContain('rendererLogPrefix: mainHostSkin.identity.logPrefix');
    expect(indexSource).toContain('trayTooltip: mainHostSkin.identity.trayTooltip');
    expect(indexSource).toContain('bundledRuntimeCopy: mainHostSkin.bundledRuntime');
    expect(indexSource).toContain('runtimePaths: mainHostSkin.runtimePaths');
    expect(indexSource).toContain('wakewordEnv: mainHostSkin.wakeword.env');
    expect(indexSource).toContain('wakewordModelName: mainHostSkin.wakeword.modelName');
    expect(indexSource).toContain('wakewordStderrLogMarkers: mainHostSkin.wakeword.stderrLogMarkers');
    expect(indexSource).toContain('localRuntimeBridgeCopy: {');
    expect(indexSource).toContain('browserWarmupExplanation: mainHostSkin.localRuntime.browserWarmupExplanation');
    expect(bootstrapSource).toContain('runsApiKeyHeader: deps.runsApiKeyHeader');
    expect(bootstrapSource).toContain('vmWorkerEnv: deps.vmWorkerEnv');
    expect(bootstrapSource).not.toContain('deps.mainHostSkin?.hostedBackend');
    expect(bootstrapSource).not.toContain('deps.mainHostSkin?.vmWorker');
    expect(bootstrapSource).not.toContain('deps.mainHostSkin');
    expect(backendEndpointSource).not.toContain('https://api.windieos.com');
    expect(backendEndpointSource).not.toContain('wss://api.windieos.com/ws');
    expect(backendEndpointSource).not.toContain('WINDIE_DEFAULT_BACKEND_HTTP_URL');
    expect(backendEndpointSource).not.toContain('WINDIE_DEFAULT_BACKEND_WS_URL');
    expect(runtimeModeSource).toContain('runtimeModeEnv');
    expect(runtimeModeSource).not.toContain('WINDIE_VM_MODE');
    expect(runtimeModeSource).not.toContain('WINDIE_VM_WORKER_MODE');
    expect(vmWorkerRuntimeSource).toContain('runsApiKeyHeader');
    expect(vmWorkerRuntimeSource).toContain('vmWorkerEnv');
    expect(vmWorkerRuntimeSource).not.toContain('x-windie-runs-key');
    expect(vmWorkerRuntimeSource).not.toContain('WINDIE_VM_');
    expect(vmWorkerRuntimeSource).not.toContain('WINDIE_RUNS_API_KEY');
  });

  test('main window icon asset filename lives in host skin config', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');
    const iconSource = fs.readFileSync(mainWindowIconRuntimePath, 'utf8');
    const windowRuntimeSource = fs.readFileSync(mainWindowRuntimePath, 'utf8');

    expect(skinSource).toContain("appIconFileName: 'windieos.app.png'");
    expect(iconSource).toContain("DEFAULT_APP_ICON_FILE_NAME = 'app.png'");
    expect(iconSource).not.toContain('windieos.app.png');
    expect(windowRuntimeSource).toContain('appIconFileName = null');
    expect(windowRuntimeSource).toContain('iconFileName: appIconFileName');
    expect(windowRuntimeSource).not.toContain('mainHostSkin?.assets?.appIconFileName');
  });

  test('diagnostics app-data directory name lives in host skin config', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');
    const diagnosticsSource = fs.readFileSync(
      path.join(mainRoot, 'diagnostics/app_diagnostics_store.cjs'),
      'utf8',
    );

    expect(skinSource).toContain("appDataDirName: 'windieos'");
    expect(skinSource).toContain("diagnosticsDb: 'WINDIE_APP_DIAGNOSTICS_DB'");
    expect(skinSource).toContain("userDataDir: 'WINDIE_USER_DATA_DIR'");
    expect(skinSource).toContain("localRuntimeErrorMarkers: Object.freeze(['sidecar'])");
    expect(diagnosticsSource).toContain("DEFAULT_APP_DATA_DIR_NAME = 'desktop-runtime'");
    expect(diagnosticsSource).toContain('dataPathConfig');
    expect(diagnosticsSource).toContain('dataPaths.appDataDirName');
    expect(diagnosticsSource).toContain('configureAppDiagnosticsStore');
    expect(diagnosticsSource).toContain('DEFAULT_LOCAL_RUNTIME_ERROR_MARKERS');
    expect(diagnosticsSource).toContain('configuredLocalRuntimeErrorMarkers');
    expect(diagnosticsSource).not.toContain('mainHostSkin');
    expect(fs.readFileSync(indexPath, 'utf8')).toContain('configureAppDiagnosticsStore(mainHostSkin.diagnostics)');
    expect(diagnosticsSource).not.toContain('windieos');
    expect(diagnosticsSource).not.toContain('sidecar');
    expect(diagnosticsSource).not.toContain('WINDIE_APP_DIAGNOSTICS_DB');
    expect(diagnosticsSource).not.toContain('WINDIE_USER_DATA_DIR');
  });

  test('main composition root consumes host skin copy for permission adapters', () => {
    const source = fs.readFileSync(indexPath, 'utf8');

    expect(source).toContain("require('./app/main_host_skin.cjs')");
    expect(source).toContain('browserAutomationCopy.localRuntimeNotReady');
    expect(source).toContain('browserAutomationCopy.installBrowserPrompt');
    expect(source).toContain('local_runtime_status');
    expect(source).not.toContain(['backend', 'status'].join('_'));
    expect(source).toContain('verifyScreenCaptureCapability');
    expect(source).toContain('macAutomationCopy.probeFailure');
    expect(source).toContain('macAutomationCopy.requestFailure');
    expect(source).toContain('local_runtime_result');
    expect(source).not.toContain('backend_result');
    expect(source).not.toContain('WindieOS local backend is not ready.');
    expect(source).not.toContain('WindieOS local runtime is not ready.');
    expect(source).not.toContain('Click Grant to install Chromium for WindieOS.');
    expect(source).not.toContain('Reinstall WindieOS or install browser feature pack dependencies.');
    expect(source).not.toContain('Failed to open the WindieOS browser.');
    expect(source).not.toContain('WindieOS could not verify macOS Automation permission yet.');
    expect(source).not.toContain('WindieOS could not request macOS Automation permission.');
  });

  test('permission services consume injected permission copy', () => {
    const sources = [
      fs.readFileSync(browserPermissionServicePath, 'utf8'),
      fs.readFileSync(automationPermissionServicePath, 'utf8'),
      fs.readFileSync(screenCapturePermissionServicePath, 'utf8'),
      fs.readFileSync(inputControlPermissionServicePath, 'utf8'),
      fs.readFileSync(microphonePermissionServicePath, 'utf8'),
      fs.readFileSync(workspacePermissionServicePath, 'utf8'),
    ];

    for (const source of sources) {
      expect(source).toContain('deps.permissionCopy');
      expect(source).not.toContain('deps.mainHostSkin');
      expect(source).not.toContain('WindieOS');
      expect(source).not.toContain('WindieOS browser');
      expect(source).not.toContain('enable WindieOS under System Events');
      expect(source).not.toContain('Select workspace folder for WindieOS');
    }

    expect(fs.readFileSync(indexPath, 'utf8'))
      .toContain('permissionCopy: mainHostSkin.permissions');
    expect(fs.readFileSync(permissionIpcRuntimePath, 'utf8'))
      .toContain('permissionCopy: permissionCopy || {}');
    expect(fs.readFileSync(permissionIpcRuntimePath, 'utf8'))
      .not.toContain('mainHostSkin');
    expect(fs.readFileSync(permissionIpcRuntimePath, 'utf8'))
      .not.toContain('local_runtime_bridge.cjs');
  });

  test('main permission docs route product copy through host-skin wording', () => {
    const source = fs.readFileSync(permissionManifestReferencePath, 'utf8');

    expect(source).toContain('host-skinned app will open its dedicated browser');
    expect(source).toContain('profile the agent host should use');
    expect(source).toContain('local-runtime browser capability verification');
    expect(source).toContain('register the host app in the Screen Recording list');
    expect(source).toContain('while the app re-probes');
    expect(source).toContain('user enables the app in System Settings');
    expect(source).toContain('same capture path used by auto-screenshot');
    expect(source).toContain('local-runtime shell commands use');
    expect(source).not.toContain('backend runtime verification');
    expect(source).not.toContain('WindieOS will open its dedicated browser');
    expect(source).not.toContain('profile WindieOS should use');
    expect(source).not.toContain('register WindieOS in the Screen Recording list');
    expect(source).not.toContain('WindieOS re-probes');
    expect(source).not.toContain('enables WindieOS in System Settings');
    expect(source).not.toContain('WindieOS focuses the onboarding window');
    expect(source).not.toContain('same backend used by auto-screenshot');
    expect(source).not.toContain('sidecar shell commands use');
  });

  test('query event builders keep product copy in the host skin', () => {
    const source = fs.readFileSync(ipcQueryEventsPath, 'utf8');
    const ipcSource = fs.readFileSync(mainIpcPath, 'utf8');
    const hostCopyRuntimeSource = fs.readFileSync(
      path.join(mainRoot, 'ipc/ipc_host_copy_runtime.cjs'),
      'utf8',
    );
    const indexSource = fs.readFileSync(indexPath, 'utf8');

    expect(source).toContain('copy.sendFailure');
    expect(source).toContain('copy.interruptedAfterAccept');
    expect(indexSource).toContain('configureIpcHostCopyRuntime({');
    expect(indexSource).toContain('identity: mainHostSkin.identity');
    expect(indexSource).toContain('queryEvents: mainHostSkin.queryEvents');
    expect(ipcSource).toContain('createIpcHostCopyRuntime()');
    expect(ipcSource).toContain('ipcHostCopyRuntime.getSdkAgentName()');
    expect(ipcSource).toContain('ipcHostCopyRuntime.getMcpClientInfo()');
    expect(ipcSource).toContain('ipcHostCopyRuntime.getQueryEvents()');
    expect(hostCopyRuntimeSource).toContain('DEFAULT_IPC_HOST_COPY');
    expect(hostCopyRuntimeSource).toContain('sdkAgentName');
    expect(hostCopyRuntimeSource).toContain('mcpClientInfo');
    expect(hostCopyRuntimeSource).toContain('queryEvents');
    expect(ipcSource).not.toContain('mainHostSkin.identity');
    expect(ipcSource).not.toContain('mainHostSkin.queryEvents');
    expect(source).not.toContain('WindieOS');
    expect(source).not.toContain("WindieOS isn't connected");
    expect(source).not.toContain('WindieOS lost connection');
    expect(source).not.toContain('backend reconnects');
  });

  test('query relay docs use local-runtime bootstrap wording', () => {
    const source = fs.readFileSync(queryPayloadReferencePath, 'utf8');

    expect(source).toContain('local-runtime/tool runtime bootstrap');
    expect(source).not.toContain('sidecar/tool runtime bootstrap');
  });

  test('main IPC helper docs use hosted-backend runtime wording', () => {
    const source = fs.readFileSync(ipcHelperReferencePath, 'utf8');

    expect(source).toContain('managed hosted-backend runtime');
    expect(source).not.toContain('managed backend runtime');
  });

  test('query send-failure broadcast builds sdk events without backend normalizer import', () => {
    const source = fs.readFileSync(ipcQueryBroadcastPath, 'utf8');

    expect(source).toContain('createConversationEvent');
    expect(source).toContain("type: 'turn_error'");
    expect(source).toContain("source: 'electron-main'");
    expect(source).not.toContain('backendEventNormalizer');
    expect(source).not.toContain('normalizeBackendEventToConversationEvent');
  });

  test('MCP runtime uses generic defaults instead of product identity', () => {
    const source = fs.readFileSync(mcpRuntimePath, 'utf8');

    expect(source).toContain("name: 'Desktop Runtime'");
    expect(source).not.toContain("name: 'WindieOS'");
    expect(source).not.toContain('WINDIE_ENABLED_MCPS');
  });

  test('layer log sink uses generic defaults instead of product prefix and env keys', () => {
    const source = fs.readFileSync(layerLogSinkPath, 'utf8');
    const skinSource = fs.readFileSync(skinPath, 'utf8');

    expect(source).toContain("DEFAULT_LOG_PREFIX = '[Desktop Runtime]'");
    expect(source).toContain("DEFAULT_LOG_DIR_SEGMENTS = Object.freeze(['.desktop-runtime', 'logs'])");
    expect(source).toContain("layerLogFilePrefix: 'AGENT'");
    expect(source).toContain("rendererVerboseLogFile: 'AGENT_RENDERER_VERBOSE_LOG_FILE'");
    expect(source).toContain("'local-runtime'");
    expect(source).toContain('LOCAL_RUNTIME');
    expect(source).toContain('configureLayerLogSink');
    expect(skinSource).toContain("layerLogFilePrefix: 'WINDIE'");
    expect(skinSource).toContain("rendererVerboseLogFile: 'WINDIE_RENDERER_VERBOSE_LOG_FILE'");
    expect(skinSource).toContain("aliases: Object.freeze(['sidecar'])");
    expect(skinSource).toContain("fileName: 'sidecar.log'");
    expect(skinSource).toContain('SIDECAR');
    expect(source).not.toContain(".windie");
    expect(source).not.toContain('sidecar');
    expect(source).not.toContain('WINDIE_RENDERER_VERBOSE_LOG_FILE');
    expect(source).not.toContain('WINDIE_');
    expect(source).not.toContain('Unknown Windie log layer');
    expect(source).not.toContain('[WindieOS]');
  });

  test('main composition root configures layer logs through the host skin', () => {
    const source = fs.readFileSync(indexPath, 'utf8');

    expect(source).toContain('configureLayerLogSink(mainHostSkin.logging)');
    expect(source).not.toContain(".windie");
  });

  test('main debug env names live in host skin config', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');
    const debugEnvSource = fs.readFileSync(debugEnvPath, 'utf8');
    const indexSource = fs.readFileSync(indexPath, 'utf8');
    const mainIpcSource = fs.readFileSync(mainIpcPath, 'utf8');
    const genericDebugSources = [
      debugEnvSource,
      fs.readFileSync(path.join(mainRoot, 'debug/chat_pill_trace_runtime.cjs'), 'utf8'),
      fs.readFileSync(path.join(mainRoot, 'debug/live_surface_trace_runtime.cjs'), 'utf8'),
      fs.readFileSync(path.join(mainRoot, 'ipc/ipc_runtime_helpers.cjs'), 'utf8'),
      fs.readFileSync(path.join(mainRoot, 'ipc/ipc_renderer_windows.cjs'), 'utf8'),
      fs.readFileSync(path.join(mainRoot, 'ipc/ipc_assistant_trace.cjs'), 'utf8'),
      fs.readFileSync(path.join(mainRoot, 'ipc/ipc_diagnostics_runtime.cjs'), 'utf8'),
      fs.readFileSync(path.join(mainRoot, 'surfaces/surface_runtime.cjs'), 'utf8'),
      fs.readFileSync(path.join(mainRoot, 'app/main_process_lifecycle_runtime.cjs'), 'utf8'),
      fs.readFileSync(path.join(mainRoot, 'wakeword/wakeword_bridge.cjs'), 'utf8'),
      fs.readFileSync(path.join(mainRoot, 'sidecar/local_runtime_bridge.cjs'), 'utf8'),
    ].join('\n');

    expect(skinSource).toContain("streamEvents: 'WINDIE_DEBUG_STREAM_EVENTS'");
    expect(skinSource).toContain("scriptedProvider: 'WINDIE_ENABLE_SCRIPTED_PROVIDER'");
    expect(debugEnvSource).toContain("streamEvents: 'AGENT_DEBUG_STREAM_EVENTS'");
    expect(debugEnvSource).toContain("scriptedProvider: 'AGENT_ENABLE_SCRIPTED_PROVIDER'");
    expect(debugEnvSource).toContain('configureDebugEnvRuntime');
    expect(indexSource).toContain('configureIpcHostRuntime({');
    expect(indexSource).toContain('debug: mainHostSkin.debug');
    expect(mainIpcSource).toContain('createIpcHostRuntimeConfig({');
    expect(mainIpcSource).toContain('ipcHostRuntimeConfig.configure(config)');
    expect(fs.readFileSync(ipcHostRuntimeConfigPath, 'utf8'))
      .toContain('configureDebugEnvRuntime(config.debug)');
    expect(mainIpcSource).not.toContain('configureDebugEnvRuntime(config.debug)');
    expect(mainIpcSource).not.toContain('configureDebugEnvRuntime(mainHostSkin.debug)');
    expect(genericDebugSources).not.toContain('WINDIE_DEBUG_');
    expect(genericDebugSources).not.toContain('WINDIE_DEV_UI');
    expect(genericDebugSources).not.toContain('WINDIE_ENABLE_SCRIPTED_PROVIDER');
  });

  test('bundled runtime helpers use generic defaults instead of product reinstall copy', () => {
    const sources = [
      fs.readFileSync(wakewordRuntimePath, 'utf8'),
      fs.readFileSync(localRuntimeLaunchOptionsPath, 'utf8'),
    ];

    for (const source of sources) {
      expect(source).toContain('Please reinstall this app');
      expect(source).not.toContain('Please reinstall WindieOS');
      expect(source).not.toContain('Reinstall WindieOS');
    }
  });

  test('wakeword process env names live in host skin config', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');
    const wakewordSource = fs.readFileSync(wakewordBridgePath, 'utf8');
    const mainWindowSource = fs.readFileSync(mainWindowRuntimePath, 'utf8');

    expect(skinSource).toContain("packagedApp: 'WINDIE_PACKAGED_APP'");
    expect(skinSource).toContain("allowRuntimeDownload: 'WINDIE_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD'");
    expect(skinSource).toContain("modelName: 'WINDIE_WAKEWORD_NAME'");
    expect(skinSource).toContain("modelName: 'hey_jarvis'");
    expect(wakewordSource).toContain("packagedApp: 'AGENT_PACKAGED_APP'");
    expect(wakewordSource).toContain("allowRuntimeDownload: 'AGENT_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD'");
    expect(wakewordSource).toContain("modelName: 'AGENT_WAKEWORD_NAME'");
    expect(wakewordSource).toContain('resolveWakewordEnvConfig');
    expect(fs.readFileSync(indexPath, 'utf8')).toContain('wakewordEnv: mainHostSkin.wakeword.env');
    expect(fs.readFileSync(indexPath, 'utf8')).toContain('wakewordModelName: mainHostSkin.wakeword.modelName');
    expect(mainWindowSource).toContain('wakewordEnv,');
    expect(mainWindowSource).toContain('wakewordModelName,');
    expect(mainWindowSource).not.toContain('mainHostSkin?.wakeword?.env');
    expect(wakewordSource).not.toContain('WINDIE_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD');
    expect(wakewordSource).not.toContain('WINDIE_WAKEWORD_NAME');
    expect(wakewordSource).not.toContain('WINDIE_PACKAGED_APP');
  });

  test('wakeword primary hotkey lives in host skin config', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');
    const indexSource = fs.readFileSync(indexPath, 'utf8');
    const lifecycleSource = fs.readFileSync(
      path.join(mainRoot, 'app/main_process_lifecycle_runtime.cjs'),
      'utf8',
    );

    expect(skinSource).toContain("win32: 'CommandOrControl+Alt+W'");
    expect(skinSource).toContain("default: 'Super+Alt+W'");
    expect(skinSource).toContain("'CommandOrControl+Shift+W'");
    expect(skinSource).toContain("'CommandOrControl+Alt+J'");
    expect(indexSource).toContain('mainHostSkin.shortcuts.wakewordHotkeyByPlatform[process.platform]');
    expect(indexSource).toContain('mainHostSkin.shortcuts.wakewordHotkeyByPlatform.default');
    expect(indexSource).toContain('mainHostSkin.shortcuts.wakewordFallbackHotkeysByPlatform[process.platform]');
    expect(indexSource).toContain('mainHostSkin.shortcuts.wakewordFallbackHotkeysByPlatform.default');
    expect(indexSource).toContain('wakewordFallbackHotkeys: WAKEWORD_FALLBACK_HOTKEYS');
    expect(indexSource).not.toContain("process.platform === 'win32'");
    expect(indexSource).not.toContain("'CommandOrControl+Alt+W'");
    expect(indexSource).not.toContain("'Super+Alt+W'");
    expect(lifecycleSource).toContain('buildWakewordHotkeyCandidates');
    expect(lifecycleSource).toContain('wakewordFallbackHotkeys');
    expect(lifecycleSource).not.toContain("'CommandOrControl+Alt+W'");
    expect(lifecycleSource).not.toContain("'CommandOrControl+Shift+W'");
    expect(lifecycleSource).not.toContain("'CommandOrControl+Alt+J'");
  });

  test('wakeword stderr product markers live in host skin config', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');
    const wakewordSource = fs.readFileSync(wakewordBridgePath, 'utf8');
    const wakewordRuntimeSource = fs.readFileSync(wakewordRuntimePath, 'utf8');
    const mainWindowSource = fs.readFileSync(mainWindowRuntimePath, 'utf8');

    expect(skinSource).toContain("stderrLogMarkers: Object.freeze(['hey_jarvis'])");
    expect(wakewordRuntimeSource).toContain('DEFAULT_WAKEWORD_STDERR_LOG_MARKERS');
    expect(wakewordRuntimeSource).toContain("'[Python]'");
    expect(wakewordRuntimeSource).toContain("'DETECTED'");
    expect(wakewordSource).toContain('wakewordStderrLogMarkers');
    expect(fs.readFileSync(indexPath, 'utf8')).toContain('wakewordStderrLogMarkers: mainHostSkin.wakeword.stderrLogMarkers');
    expect(mainWindowSource).toContain('wakewordStderrLogMarkers,');
    expect(mainWindowSource).not.toContain('mainHostSkin?.wakeword?.stderrLogMarkers');
    expect(wakewordRuntimeSource).not.toContain('hey_jarvis');
    expect(wakewordSource).not.toContain('hey_jarvis');
  });

  test('local runtime launch fallback avoids conda-environment-specific copy', () => {
    const source = fs.readFileSync(localRuntimeLaunchOptionsPath, 'utf8');

    expect(source).toContain('local-runtime Python executable');
    expect(source).toContain('resolveRuntimePathEnvConfig');
    expect(source).not.toContain('WINDIE_PYTHON_PATH');
    expect(source).not.toContain('frontend_jarvis Python executable');
  });

  test('runtime path Python override env name lives in host skin config', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');
    const runtimePathsSource = fs.readFileSync(runtimePathsPath, 'utf8');
    const ipcSource = fs.readFileSync(mainIpcPath, 'utf8');
    const hostOptionStateSource = fs.readFileSync(ipcHostOptionStatePath, 'utf8');
    const mainWindowSource = fs.readFileSync(mainWindowRuntimePath, 'utf8');

    expect(skinSource).toContain("pythonPath: 'WINDIE_PYTHON_PATH'");
    expect(runtimePathsSource).toContain("pythonPath: 'AGENT_PYTHON_PATH'");
    expect(runtimePathsSource).toContain("DEFAULT_PACKAGED_ENTRYPOINT_DIR_NAME = 'local-runtime'");
    expect(runtimePathsSource).toContain('resolveRuntimePathEnvConfig');
    expect(runtimePathsSource).toContain('resolveRuntimePathConfig');
    expect(runtimePathsSource).not.toContain('WINDIE_PYTHON_PATH');
    expect(fs.readFileSync(indexPath, 'utf8')).toContain('runtimePaths: mainHostSkin.runtimePaths');
    expect(fs.readFileSync(indexPath, 'utf8')).toContain('localRuntimeDaemonEntrypoint: mainHostSkin.localRuntime.daemonEntrypoint');
    expect(fs.readFileSync(indexPath, 'utf8')).toContain('localRuntimeEnv: mainHostSkin.localRuntime.env');
    expect(hostOptionStateSource).toContain('runtimePaths: options.runtimePaths');
    expect(ipcSource).toContain('createIpcHostOptionState()');
    expect(ipcSource).not.toContain('runtimePaths: options.runtimePaths');
    expect(ipcSource).not.toContain('runtimePaths: mainHostSkin.runtimePaths');
    expect(mainWindowSource).toContain('runtimePaths,');
    expect(mainWindowSource).not.toContain('mainHostSkin?.runtimePaths');
  });

  test('GPU software rendering env name lives in host skin config', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');
    const gpuSource = fs.readFileSync(gpuRuntimePath, 'utf8');
    const indexSource = fs.readFileSync(indexPath, 'utf8');

    expect(skinSource).toContain("forceSoftwareRendering: 'WINDIE_FORCE_SOFTWARE_RENDERING'");
    expect(gpuSource).toContain("forceSoftwareRendering: 'AGENT_FORCE_SOFTWARE_RENDERING'");
    expect(gpuSource).toContain('resolveGpuEnvConfig');
    expect(gpuSource).not.toContain('WINDIE_FORCE_SOFTWARE_RENDERING');
    expect(indexSource).toContain('gpuEnv: mainHostSkin.gpu.env');
  });

  test('extension contribution env name lives in host skin config', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');
    const extensionSource = fs.readFileSync(extensionManifestPath, 'utf8');
    const indexSource = fs.readFileSync(indexPath, 'utf8');

    expect(skinSource).toContain("contributionsDir: 'WINDIE_AGENT_CONTRIBUTIONS_DIR'");
    expect(extensionSource).toContain("contributionsDir: 'AGENT_CONTRIBUTIONS_DIR'");
    expect(extensionSource).toContain('configureExtensionManifestRuntime');
    expect(extensionSource).not.toContain('WINDIE_AGENT_CONTRIBUTIONS_DIR');
    expect(indexSource).toContain('configureExtensionManifestRuntime(mainHostSkin.extensions)');
  });

  test('MCP enablement env name lives in host skin config', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');
    const mcpSource = fs.readFileSync(mcpRuntimePath, 'utf8');
    const indexSource = fs.readFileSync(indexPath, 'utf8');

    expect(skinSource).toContain("enabledServers: 'WINDIE_ENABLED_MCPS'");
    expect(mcpSource).toContain("enabledServers: 'AGENT_ENABLED_MCPS'");
    expect(mcpSource).toContain('configureMcpRuntime');
    expect(mcpSource).not.toContain('WINDIE_ENABLED_MCPS');
    expect(indexSource).toContain('configureMcpRuntime(mainHostSkin.mcp)');
  });

  test('local runtime helpers consume host copy with generic defaults', () => {
    const localRuntimeSource = fs.readFileSync(localRuntimeBridgePath, 'utf8');

    expect(localRuntimeSource).toContain('DEFAULT_BROWSER_WARMUP_EXPLANATION');
    expect(localRuntimeSource).toContain('localRuntimeBridgeCopy.browserWarmupExplanation');
    expect(localRuntimeSource).toContain('Agent SDK local runtime resolver is unavailable.');
    expect(localRuntimeSource).toContain('options.localRuntimeBridgeCopy');
    expect(localRuntimeSource).not.toContain('options.mainHostSkin?.localRuntime');
    expect(fs.readFileSync(mainWindowRuntimePath, 'utf8'))
      .toContain('localRuntimeBridgeCopy,');
    expect(fs.readFileSync(indexPath, 'utf8'))
      .toContain('browserWarmupExplanation: mainHostSkin.localRuntime.browserWarmupExplanation');
    expect(fs.readFileSync(mainWindowRuntimePath, 'utf8'))
      .not.toContain('mainHostSkin?.localRuntime');
    expect(fs.readFileSync(indexPath, 'utf8'))
      .not.toContain('localRuntimeCopy: mainHostSkin.localRuntime');
    const retiredProductRuntimeCopy = `${['Win', 'die'].join('')} SDK local runtime`;
    expect(localRuntimeSource).not.toContain(retiredProductRuntimeCopy);
    expect(localRuntimeSource).not.toContain('Open the WindieOS browser');
  });

  test('local runtime verbose stderr env name lives in host skin config', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');
    const utilsSource = fs.readFileSync(localRuntimeUtilsPath, 'utf8');
    const launchSource = fs.readFileSync(localRuntimeLaunchOptionsPath, 'utf8');
    const ipcSource = fs.readFileSync(mainIpcPath, 'utf8');
    const hostOptionStateSource = fs.readFileSync(ipcHostOptionStatePath, 'utf8');

    expect(skinSource).toContain("verboseStderr: 'WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR'");
    expect(utilsSource).toContain("verboseStderr: 'AGENT_VERBOSE_LOCAL_RUNTIME_STDERR'");
    expect(utilsSource).toContain('resolveLocalRuntimeEnvConfig');
    expect(launchSource).toContain('localRuntimeEnv');
    expect(fs.readFileSync(indexPath, 'utf8')).toContain('localRuntimeEnv: mainHostSkin.localRuntime.env');
    expect(hostOptionStateSource).toContain('localRuntimeEnv: options.localRuntimeEnv');
    expect(ipcSource).not.toContain('localRuntimeEnv: options.localRuntimeEnv');
    expect(ipcSource).not.toContain('localRuntimeEnv: mainHostSkin.localRuntime.env');
    expect(utilsSource).not.toContain('WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR');
    expect(launchSource).not.toContain('WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR');
  });

  test('local runtime daemon transport env names live in host skin config', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');
    const launchSource = fs.readFileSync(localRuntimeLaunchOptionsPath, 'utf8');
    const ipcSource = fs.readFileSync(mainIpcPath, 'utf8');
    const hostOptionStateSource = fs.readFileSync(ipcHostOptionStatePath, 'utf8');
    const agentClientFactorySource = fs.readFileSync(
      path.join(mainRoot, 'ipc/ipc_electron_agent_client_factory.cjs'),
      'utf8',
    );

    expect(skinSource).toContain("backendHttpUrl: 'WINDIE_BACKEND_HTTP_URL'");
    expect(skinSource).toContain("backendAuthStatePath: 'WINDIE_BACKEND_AUTH_STATE_PATH'");
    expect(skinSource).toContain("semanticSummarizer: 'WINDIE_ENABLE_SEMANTIC_SUMMARIZER'");
    expect(skinSource).toContain("packagedApp: 'WINDIE_PACKAGED_APP'");
    expect(skinSource).toContain("browserFeaturePackAutoinstall: 'WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL'");
    expect(skinSource).toContain("sourcePath: 'WINDIE_LOCAL_RUNTIME_SOURCE_PATH'");
    expect(skinSource).toContain("sourceStamp: 'WINDIE_LOCAL_RUNTIME_SOURCE_STAMP'");
    expect(skinSource).toContain("permissionStatePath: 'WINDIE_PERMISSION_STATE_PATH'");
    expect(skinSource).toContain("userDataDir: 'WINDIE_USER_DATA_DIR'");
    expect(skinSource).toContain("daemonEntrypoint: 'sidecar_daemon.py'");
    expect(launchSource).toContain("backendHttpUrl: 'AGENT_BACKEND_HTTP_URL'");
    expect(launchSource).toContain("userDataDir: 'AGENT_USER_DATA_DIR'");
    expect(launchSource).toContain("DEFAULT_LOCAL_RUNTIME_DAEMON_ENTRYPOINT = 'local_runtime_daemon.py'");
    expect(launchSource).toContain('resolveLocalRuntimeDaemonEnvConfig');
    expect(fs.readFileSync(indexPath, 'utf8')).toContain('localRuntimeEnv: mainHostSkin.localRuntime.env');
    expect(fs.readFileSync(indexPath, 'utf8')).toContain('localRuntimeDaemonEntrypoint: mainHostSkin.localRuntime.daemonEntrypoint');
    expect(hostOptionStateSource).toContain('localRuntimeEnv: options.localRuntimeEnv');
    expect(hostOptionStateSource).toContain('daemonEntrypoint: options.localRuntimeDaemonEntrypoint');
    expect(ipcSource).not.toContain('localRuntimeEnv: options.localRuntimeEnv');
    expect(ipcSource).not.toContain('daemonEntrypoint: options.localRuntimeDaemonEntrypoint');
    expect(ipcSource).not.toContain('mainHostSkin.localRuntime.env');
    expect(ipcSource).not.toContain('mainHostSkin.localRuntime.daemonEntrypoint');
    expect(agentClientFactorySource).toContain('resolveUserDataRoot = appUserDataRoot');
    expect(agentClientFactorySource).toContain('userDataRoot: resolveUserDataRoot()');
    expect(launchSource).not.toContain("'sidecar_daemon.py'");
    expect(launchSource).not.toContain('WINDIE_BACKEND_HTTP_URL');
    expect(launchSource).not.toContain('WINDIE_LOCAL_RUNTIME_SOURCE_PATH');
    expect(launchSource).not.toContain('WINDIE_PERMISSION_STATE_PATH');
    expect(launchSource).not.toContain('WINDIE_USER_DATA_DIR');
  });

  test('host skin local readiness copy uses local-runtime wording', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');

    expect(skinSource).toContain('local runtime is not ready');
    expect(skinSource).not.toContain('local backend is not ready');
  });

  test('main local-runtime adapter headers use local-runtime boundary wording', () => {
    for (const modulePath of localRuntimeBridgeModulePaths) {
      const header = fs.readFileSync(modulePath, 'utf8').split('\n').slice(0, 3).join('\n');

      expect(header).toMatch(/local-runtime|local runtime/i);
      expect(header).not.toContain('local sidecar');
      expect(header).not.toContain('local backend');
    }
  });

  test('main local-runtime adapter console labels use local-runtime bridge naming', () => {
    for (const modulePath of localRuntimeBridgeModulePaths) {
      const source = fs.readFileSync(modulePath, 'utf8');
      const retiredBridgeLogPrefix = `[Main][${'Sidecar' + 'Bridge'}]`;

      expect(source).not.toContain(['[Main][Local', 'BackendBridge]'].join(''));
      expect(source).not.toContain(retiredBridgeLogPrefix);
    }

    const joinedSource = localRuntimeBridgeModulePaths
      .map(modulePath => fs.readFileSync(modulePath, 'utf8'))
      .join('\n');
    expect(joinedSource).toContain('[Main][LocalRuntimeBridge]');
  });

  test('main local-runtime adapter debug stdout flag uses local-runtime wording', () => {
    const bridgeSource = fs.readFileSync(localRuntimeBridgePath, 'utf8');

    expect(bridgeSource).toContain("isDebugFlagEnabled('localRuntimeStdout')");
    expect(bridgeSource).not.toContain('WINDIE_DEBUG_LOCAL_RUNTIME_STDOUT');
    expect(bridgeSource).not.toContain('WINDIE_DEBUG_LOCAL_BACKEND_STDOUT');
  });

  test('main local-runtime adapter active dependencies use local-runtime names', () => {
    const bridgeSource = fs.readFileSync(localRuntimeBridgePath, 'utf8');
    const supervisorSource = fs.readFileSync(
      path.join(mainRoot, 'sidecar/local_runtime_supervisor.cjs'),
      'utf8',
    );
    const executeToolRuntimeSource = fs.readFileSync(
      path.join(mainRoot, 'sidecar/local_runtime_execute_tool_runtime.cjs'),
      'utf8',
    );

    expect(supervisorSource).toContain('function createLocalRuntimeSupervisor');
    expect(supervisorSource).not.toContain(['createLocal', 'BackendSupervisor'].join(''));
    expect(executeToolRuntimeSource).toContain('function createLocalRuntimeExecuteToolRuntime');
    expect(executeToolRuntimeSource).not.toContain(['createLocal', 'BackendExecuteToolRuntime'].join(''));
    expect(bridgeSource).toContain('function initializeLocalRuntimeBridge');
    expect(bridgeSource).toContain('function stopLocalRuntime');
    expect(bridgeSource).toContain('async function getLocalRuntimeStatus');
    expect(bridgeSource).not.toContain(['initializeLocal', 'BackendBridge'].join(''));
    expect(bridgeSource).not.toContain(['stopLocal', 'Backend'].join(''));
    expect(bridgeSource).not.toContain(['getLocal', 'BackendStatus'].join(''));
    expect(bridgeSource).toContain('createLocalRuntimeSupervisor');
    expect(bridgeSource).toContain('createLocalRuntimeExecuteToolRuntime');
  });

  test('main composition root consumes local runtime bridge names', () => {
    const source = fs.readFileSync(indexPath, 'utf8');

    expect(source).toContain('initializeLocalRuntimeBridge');
    expect(source).toContain('stopLocalRuntime');
    expect(source).toContain('getLocalRuntimeStatus');
    expect(source).not.toContain(['initializeLocal', 'BackendBridge'].join(''));
    expect(source).not.toContain(['stopLocal', 'Backend'].join(''));
    expect(source).not.toContain(['getLocal', 'BackendStatus'].join(''));
  });

  test('main SDK conversation channels use desktop-runtime channel groups', () => {
    const {
      DESKTOP_RUNTIME_SEND_CHANNELS,
      DESKTOP_RUNTIME_INVOKE_CHANNELS,
      DESKTOP_RUNTIME_ON_CHANNELS,
    } = require(desktopRuntimeChannelsPath);
    expect(DESKTOP_RUNTIME_SEND_CHANNELS.PENDING_TURN).toBe('windie:pending-turn');
    expect(DESKTOP_RUNTIME_INVOKE_CHANNELS.INVOKE).toBe('windie:invoke');
    expect(DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT).toBe('windie:conversation-event');
    expect(DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN).toBe('windie:current-turn');

    const channelSource = fs.readFileSync(desktopRuntimeChannelsPath, 'utf8');
    const genericHostSources = [
      mainIpcPath,
      ipcRendererWindowsPath,
      ipcQueryBroadcastPath,
    ].map(modulePath => fs.readFileSync(modulePath, 'utf8')).join('\n');

    expect(channelSource).toContain('desktop-runtime IPC channel groups');
    expect(fs.existsSync(retiredDesktopAgentChannelsPath)).toBe(false);
    expect(channelSource).not.toContain(retiredDesktopAgentIpcGroupDescription);
    expect(genericHostSources).toContain('DESKTOP_RUNTIME_ON_CHANNELS');
    expect(genericHostSources).toContain('DESKTOP_RUNTIME_INVOKE_CHANNELS');
    expect(genericHostSources).not.toContain(retiredDesktopAgentChannelGroupName('ON'));
    expect(genericHostSources).not.toContain(retiredDesktopAgentChannelGroupName('INVOKE'));
    expect(genericHostSources).not.toMatch(
      /['"`]windie:(status|conversation-event|memory-store-changed|rows|current-turn|pending-turn|invoke)['"`]/,
    );
  });

  test('main backend connection logs use generic agent-backend wording', () => {
    const mainSource = fs.readFileSync(mainIpcPath, 'utf8');
    const runtimeHelpersSource = fs.readFileSync(ipcRuntimeHelpersPath, 'utf8');
    const connectionEventSource = fs.readFileSync(ipcAgentConnectionEventsPath, 'utf8');
    const backendCloseSource = fs.readFileSync(ipcAgentBackendCloseRuntimePath, 'utf8');
    const source = `${mainSource}\n${runtimeHelpersSource}\n${connectionEventSource}\n${backendCloseSource}`;

    expect(connectionEventSource).toContain('Successfully connected to agent backend through Agent SDK runtime.');
    expect(backendCloseSource).toContain('Disconnected from agent backend. Attempting to reconnect...');
    expect(backendCloseSource).toContain('Disconnected from agent backend');
    expect(connectionEventSource).toContain('Error parsing message from agent backend');
    expect(connectionEventSource).not.toContain('Error parsing message from backend');
    expect(source).toContain('Error from agent backend');
    expect(source).not.toContain('Error from backend');
    expect(source).not.toContain('Python backend');
  });

  test('main-private host markers use generic desktop-runtime naming', () => {
    const bannedMarkers = [
      '__windieConsoleStreamErrorGuardInstalled',
      '__windieLayerLogInstalled',
      '__windieLayerLogOriginals',
      '__windieRendererConsoleLoggingAttached',
      '__windiePendingCollapseToChatPill',
      '__windieScreenshotRestoreBounds',
      retiredDesktopAgentMarker('PendingCollapseToChatPill'),
      retiredDesktopAgentMarker('RendererConsoleLoggingAttached'),
      retiredDesktopAgentMarker('ScreenshotRestoreBounds'),
    ];

    for (const markerConsumerPath of mainMarkerConsumerPaths) {
      const source = fs.readFileSync(markerConsumerPath, 'utf8');
      for (const marker of bannedMarkers) {
        expect(source).not.toContain(marker);
      }
    }
  });
});
