/**
 * Covers the main-process host skin/config boundary.
 */

const fs = require('fs');
const path = require('path');

const mainRoot = path.resolve(__dirname, '../../frontend/src/main');
const indexPath = path.join(mainRoot, 'index.cjs');
const mainIpcPath = path.join(mainRoot, 'ipc.cjs');
const skinPath = path.join(mainRoot, 'app/main_host_skin.cjs');
const backendEndpointsPath = path.join(mainRoot, 'app/backend_endpoints.cjs');
const debugEnvPath = path.join(mainRoot, 'app/debug_env.cjs');
const gpuRuntimePath = path.join(mainRoot, 'app/gpu_runtime.cjs');
const runtimePathsPath = path.join(mainRoot, 'app/runtime_paths.cjs');
const runtimeModePath = path.join(mainRoot, 'app/runtime_mode.cjs');
const vmWorkerRuntimePath = path.join(mainRoot, 'app/vm_worker_runtime.cjs');
const ipcQueryEventsPath = path.join(mainRoot, 'ipc/ipc_query_events.cjs');
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
const permissionManifestPath = path.resolve(__dirname, '../../frontend/src/shared/permissions/permission_manifest.json');
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
  });

  test('shared permission manifest uses generic desktop-runtime descriptions', () => {
    const manifestSource = fs.readFileSync(permissionManifestPath, 'utf8');
    const manifest = JSON.parse(manifestSource);

    expect(manifestSource).not.toContain('WindieOS');
    expect(manifestSource).not.toContain('WindieOS browser');
    expect(manifestSource).not.toContain('desktop agent');
    expect(manifest.permissions.find(permission => permission.permission_id === 'screen_capture')).toMatchObject({
      description: expect.stringContaining('desktop runtime'),
    });
    expect(manifest.permissions.find(permission => permission.permission_id === 'browser_automation')).toMatchObject({
      description: expect.stringContaining('dedicated browser'),
    });
  });

  test('hosted backend defaults live in host skin config', () => {
    const backendEndpointSource = fs.readFileSync(backendEndpointsPath, 'utf8');
    const runtimeModeSource = fs.readFileSync(runtimeModePath, 'utf8');
    const vmWorkerRuntimeSource = fs.readFileSync(vmWorkerRuntimePath, 'utf8');

    expect(backendEndpointSource).toContain("require('./main_host_skin.cjs')");
    expect(backendEndpointSource).toContain('mainHostSkin.hostedBackend');
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
    expect(windowRuntimeSource).toContain('mainHostSkin?.assets?.appIconFileName');
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
    expect(diagnosticsSource).toContain("DEFAULT_APP_DATA_DIR_NAME = 'desktop-runtime'");
    expect(diagnosticsSource).toContain('dataPathConfig');
    expect(diagnosticsSource).toContain('dataPaths.appDataDirName');
    expect(diagnosticsSource).toContain('configureAppDiagnosticsStore');
    expect(diagnosticsSource).not.toContain('mainHostSkin');
    expect(fs.readFileSync(indexPath, 'utf8')).toContain('configureAppDiagnosticsStore(mainHostSkin.dataPaths)');
    expect(diagnosticsSource).not.toContain('windieos');
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
    expect(source).not.toContain('backend reconnects');
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
    expect(debugEnvSource).toContain("streamEvents: 'AGENT_DEBUG_STREAM_EVENTS'");
    expect(debugEnvSource).toContain('configureDebugEnvRuntime');
    expect(indexSource).toContain('configureDebugEnvRuntime(mainHostSkin.debug)');
    expect(mainIpcSource).toContain('configureDebugEnvRuntime(mainHostSkin.debug)');
    expect(genericDebugSources).not.toContain('WINDIE_DEBUG_');
    expect(genericDebugSources).not.toContain('WINDIE_DEV_UI');
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
    expect(wakewordSource).toContain("packagedApp: 'AGENT_PACKAGED_APP'");
    expect(wakewordSource).toContain("allowRuntimeDownload: 'AGENT_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD'");
    expect(wakewordSource).toContain('resolveWakewordEnvConfig');
    expect(mainWindowSource).toContain('wakewordEnv: mainHostSkin?.wakeword?.env');
    expect(wakewordSource).not.toContain('WINDIE_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD');
    expect(wakewordSource).not.toContain('WINDIE_PACKAGED_APP');
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
    expect(mainWindowSource).toContain('wakewordStderrLogMarkers: mainHostSkin?.wakeword?.stderrLogMarkers');
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
    const mainWindowSource = fs.readFileSync(mainWindowRuntimePath, 'utf8');

    expect(skinSource).toContain("pythonPath: 'WINDIE_PYTHON_PATH'");
    expect(runtimePathsSource).toContain("pythonPath: 'AGENT_PYTHON_PATH'");
    expect(runtimePathsSource).toContain("DEFAULT_PACKAGED_ENTRYPOINT_DIR_NAME = 'local-runtime'");
    expect(runtimePathsSource).toContain('resolveRuntimePathEnvConfig');
    expect(runtimePathsSource).toContain('resolveRuntimePathConfig');
    expect(runtimePathsSource).not.toContain('WINDIE_PYTHON_PATH');
    expect(ipcSource).toContain('runtimePaths: mainHostSkin.runtimePaths');
    expect(mainWindowSource).toContain('runtimePaths: mainHostSkin?.runtimePaths');
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
    expect(localRuntimeSource).toContain('localRuntimeCopy.browserWarmupExplanation');
    expect(localRuntimeSource).toContain('Agent SDK local runtime resolver is unavailable.');
    expect(localRuntimeSource).not.toContain('Windie SDK local runtime');
    expect(localRuntimeSource).not.toContain('Open the WindieOS browser');
  });

  test('local runtime verbose stderr env name lives in host skin config', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');
    const utilsSource = fs.readFileSync(localRuntimeUtilsPath, 'utf8');
    const launchSource = fs.readFileSync(localRuntimeLaunchOptionsPath, 'utf8');
    const ipcSource = fs.readFileSync(mainIpcPath, 'utf8');

    expect(skinSource).toContain("verboseStderr: 'WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR'");
    expect(utilsSource).toContain("verboseStderr: 'AGENT_VERBOSE_LOCAL_RUNTIME_STDERR'");
    expect(utilsSource).toContain('resolveLocalRuntimeEnvConfig');
    expect(launchSource).toContain('localRuntimeEnv');
    expect(ipcSource).toContain('localRuntimeEnv: mainHostSkin.localRuntime.env');
    expect(utilsSource).not.toContain('WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR');
    expect(launchSource).not.toContain('WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR');
  });

  test('local runtime daemon transport env names live in host skin config', () => {
    const skinSource = fs.readFileSync(skinPath, 'utf8');
    const launchSource = fs.readFileSync(localRuntimeLaunchOptionsPath, 'utf8');
    const ipcSource = fs.readFileSync(mainIpcPath, 'utf8');

    expect(skinSource).toContain("backendHttpUrl: 'WINDIE_BACKEND_HTTP_URL'");
    expect(skinSource).toContain("backendAuthStatePath: 'WINDIE_BACKEND_AUTH_STATE_PATH'");
    expect(skinSource).toContain("semanticSummarizer: 'WINDIE_ENABLE_SEMANTIC_SUMMARIZER'");
    expect(skinSource).toContain("packagedApp: 'WINDIE_PACKAGED_APP'");
    expect(skinSource).toContain("browserFeaturePackAutoinstall: 'WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL'");
    expect(skinSource).toContain("sourcePath: 'WINDIE_LOCAL_RUNTIME_SOURCE_PATH'");
    expect(skinSource).toContain("sourceStamp: 'WINDIE_LOCAL_RUNTIME_SOURCE_STAMP'");
    expect(skinSource).toContain("permissionStatePath: 'WINDIE_PERMISSION_STATE_PATH'");
    expect(skinSource).toContain("userDataDir: 'WINDIE_USER_DATA_DIR'");
    expect(launchSource).toContain("backendHttpUrl: 'AGENT_BACKEND_HTTP_URL'");
    expect(launchSource).toContain("userDataDir: 'AGENT_USER_DATA_DIR'");
    expect(launchSource).toContain('resolveLocalRuntimeDaemonEnvConfig');
    expect(ipcSource).toContain('localRuntimeEnv: mainHostSkin.localRuntime.env');
    expect(ipcSource).toContain('userDataRoot: appUserDataRoot()');
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

  test('main sidecar adapter console labels use local-runtime bridge naming', () => {
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

  test('main sidecar adapter debug stdout flag uses local-runtime wording', () => {
    const bridgeSource = fs.readFileSync(localRuntimeBridgePath, 'utf8');

    expect(bridgeSource).toContain("isDebugFlagEnabled('localRuntimeStdout')");
    expect(bridgeSource).not.toContain('WINDIE_DEBUG_LOCAL_RUNTIME_STDOUT');
    expect(bridgeSource).not.toContain('WINDIE_DEBUG_LOCAL_BACKEND_STDOUT');
  });

  test('main sidecar adapter active dependencies use local-runtime names', () => {
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
    const source = fs.readFileSync(mainIpcPath, 'utf8');

    expect(source).toContain('Successfully connected to agent backend through Agent SDK runtime.');
    expect(source).toContain('Disconnected from agent backend. Attempting to reconnect...');
    expect(source).toContain('Disconnected from agent backend');
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
