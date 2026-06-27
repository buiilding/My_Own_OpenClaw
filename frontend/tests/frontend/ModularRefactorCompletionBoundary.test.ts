/**
 * Covers modular refactor completion boundary. behavior in the frontend test suite.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const retiredProductPrefix = 'Wind' + 'ie';

function retiredProductName(suffix: string): string {
  return `${retiredProductPrefix}${suffix}`;
}

async function read(relativePath: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

async function pathExists(relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function listMarkdownFiles(relativeDir: string): Promise<string[]> {
  const absoluteDir = path.join(repoRoot, relativeDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      return listMarkdownFiles(relativePath);
    }
    return entry.isFile() && entry.name.endsWith('.md') ? [relativePath] : [];
  }));
  return files.flat();
}

describe('modular sdk refactor completion boundary', () => {
  test('electron main uses AgentClient wakeUp instead of a desktop wrapper', async () => {
    const ipcSource = await read('src/main/ipc.cjs');
    const directWakeUpAdapterSource = await read('src/main/ipc/ipc_direct_wake_up_agent_adapter.cjs');
    const electronAgentClientFactorySource = await read('src/main/ipc/ipc_electron_agent_client_factory.cjs');
    const agentWakeupRuntimeSource = await read('src/main/ipc/ipc_agent_wakeup_runtime.cjs');
    const hostOptionStateSource = await read('src/main/ipc/ipc_host_option_state.cjs');
    const sdkRuntimeCommandsSource = await read('packages/windie-sdk-js/src/runtime/SdkRuntimeCommands.ts');
    const sdkRuntimeCommandsCjsSource = await read('packages/windie-sdk-js/cjs/runtime/SdkRuntimeCommands.js');
    expect(ipcSource).toContain('createElectronAgentClientFactoryRuntime({');
    expect(ipcSource).toContain('electronAgentClientFactoryRuntime.createClient()');
    expect(ipcSource).not.toContain('new AgentClient({');
    expect(electronAgentClientFactorySource).toContain('function createElectronAgentClientFactoryRuntime');
    expect(electronAgentClientFactorySource).toContain('new AgentClient({');
    expect(ipcSource).toContain('createAgentWakeupRuntime({');
    expect(ipcSource).toContain('agentWakeupRuntime.start({ reason, workspacePath })');
    expect(ipcSource).not.toContain('startAgentRuntime({ reason, workspacePath }');
    expect(ipcSource).not.toContain('client.wakeUp({');
    expect(agentWakeupRuntimeSource).toContain('function createAgentWakeupRuntime');
    expect(agentWakeupRuntimeSource).toContain('client.wakeUp({');
    expect(ipcSource).toContain('createDirectWakeUpAgentAdapter,');
    expect(ipcSource).not.toContain('createDirectWakeUpAgentAdapter({');
    expect(agentWakeupRuntimeSource).toContain('createDirectWakeUpAgentAdapter({');
    expect(ipcSource).not.toContain('agent.conversation({');
    expect(directWakeUpAdapterSource).toContain('agent.conversation({');
    expect(directWakeUpAdapterSource).toContain('Electron agent-host methods');
    expect(directWakeUpAdapterSource).not.toContain('Electron main runtime methods');
    expect(ipcSource).toContain('hostOptionState.getLocalToolLifecycle()');
    expect(ipcSource).toContain('hostOptionState.getAgentWebSocketImpl()');
    expect(ipcSource).not.toContain('let localToolLifecycle = null');
    expect(ipcSource).not.toContain('let agentWebSocketImpl = null');
    expect(hostOptionStateSource).toContain('let localToolLifecycle = null;');
    expect(hostOptionStateSource).toContain('let agentWebSocketImpl = null;');
    expect(sdkRuntimeCommandsSource).toContain('UI and host runtimes');
    expect(sdkRuntimeCommandsSource).not.toContain('UI and desktop runtimes');
    expect(sdkRuntimeCommandsCjsSource).toContain('UI and host runtimes');
    expect(sdkRuntimeCommandsCjsSource).not.toContain('UI and desktop runtimes');
    expect(ipcSource).not.toContain('windieAgentWebSocketImpl');
    expect(ipcSource).toContain("require('../../../packages/windie-sdk-js/cjs/runtime/AgentClient.js')");
    expect(ipcSource).toContain("require('../../../packages/windie-sdk-js/cjs/runtime/AgentDefinition.js')");
    expect(ipcSource).toContain("require('../../../packages/windie-sdk-js/cjs/runtime/TraceRecorder.js')");
    expect(ipcSource).toContain("require('../../../packages/windie-sdk-js/cjs/conversation/events.js')");
    expect(ipcSource).not.toContain("require('../../../packages/windie-sdk-js/cjs/index.js')");
    expect(ipcSource).not.toContain(`${retiredProductName('Agent')}.startDesktop`);
    expect(ipcSource).not.toMatch(/require\(['"].*agent_host\.cjs['"]\)/);
    expect(ipcSource).not.toMatch(/create\w*AgentHost/);
    expect(ipcSource).not.toContain(`create${retiredProductName('SdkMainRuntime')}`);
    expect(ipcSource).not.toContain('sendSdkRuntimeCommand');
    expect(ipcSource).not.toContain(`get${retiredProductName('SdkRuntime')}`);
    expect(ipcSource).not.toContain('createManagedBackendSession');
    expect(ipcSource).not.toContain('createManagedWebSocketSession');
    expect(ipcSource).not.toContain('routeSdkToolEventToLocalRuntime');
    expect(ipcSource).not.toContain('executeLocalTool:');
    const wakeCall = agentWakeupRuntimeSource.match(/client\.wakeUp\(\{[\s\S]*?\n  \}\);/)?.[0] ?? '';
    expect(wakeCall).toContain('installAuth: buildDesktopInstallAuth()');
    expect(wakeCall).toContain('name: getSdkAgentName()');
    expect(wakeCall).toContain('workspacePath: resolvedWorkspacePath');
    expect(wakeCall).toContain("builtins: testMode ? [] : 'default'");
    expect(wakeCall).toContain('localToolLifecycle: getLocalToolLifecycle()');
    expect(wakeCall).not.toContain('conversationRef:');
  });

  test('renderer live-turn runtime stays on sdk command dispatch', async () => {
    const source = await read('src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts');

    expect(source).toContain('invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_SEND');
    expect(source).toContain('invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_STOP');
    expect(source).not.toContain('createConversationRuntime');
    expect(source).not.toContain('DesktopSettingsRuntimeClient');
    expect(source).not.toContain('DesktopBackendCommandRuntimeClient');
    expect(source).not.toContain('infrastructure/api/client');
    expect(source).not.toContain('infrastructure/transcript/TranscriptWriter');
    expect(source.includes('DesktopConversationStoreAdapter')).toBe(false);
  });

  test('public examples exercise sdk stream, retry, stop, local tool, and model controls', async () => {
    const cli = await read('examples/cli-agent/run.mjs');
    const customUi = await read('examples/custom-ui/index.html');
    const localTool = await read('examples/local-tool-extension/run.mjs');
    const repoAgent = await read('examples/repo-agent-extension/run.mjs');
    const localSdkLoader = await read('examples/_shared/local_sdk_loader.mjs');

    expect(cli).toContain('conversation.stream');
    expect(cli).toContain('conversation.retryTurn');
    expect(cli).toContain('conversation.stop');
    expect(cli).not.toContain('frontend/node_modules');
    expect(customUi).toContain('conversation.setModel');
    expect(customUi).toContain('conversation.retryTurn');
    expect(customUi).toContain('conversation.stop');
    expect(customUi).not.toContain('frontend/node_modules');
    expect(localTool).toContain('moduleTool');
    expect(localTool).toContain('agent.stop');
    expect(localTool).not.toContain('frontend/node_modules');
    expect(repoAgent).toContain('plugins: [{ path: exampleDir }]');
    expect(repoAgent).toContain('agent.stop');
    expect(repoAgent).not.toContain('frontend/node_modules');
    expect(localSdkLoader).toContain('packages/windie-sdk-js');
    expect(localSdkLoader).toContain('build:esm');
    expect(localSdkLoader).not.toContain('frontend/node_modules');
  });

  test('public examples stay on the high-level AgentClient surface', async () => {
    const exampleFiles = [
      'examples/cli-agent/run.mjs',
      'examples/custom-ui/index.html',
      'examples/local-tool-extension/run.mjs',
      'examples/repo-agent-extension/run.mjs',
    ];
    const internalRuntimeNeedles = [
      'SdkConversationRuntime',
      'createConversationRuntime',
      'ManagedBackendSession',
      'ManagedWebSocketSession',
      'ToolExecutionCoordinator',
      'DesktopConversationStoreAdapter',
      'DesktopLiveTurnRuntimeClient',
      'DesktopBackendCommandRuntimeClient',
      'packages/windie-sdk-js/src/runtime',
      'packages/windie-sdk-js/src/transport',
      'packages/windie-sdk-js/src/tools/ToolExecutionCoordinator',
      'src/renderer',
      'src/main',
    ];
    const offenders: Record<string, string[]> = {};

    for (const relativePath of exampleFiles) {
      const source = await read(relativePath);
      expect(source).toContain('AgentClient');
      expect(source).not.toContain(retiredProductName('Client'));
      const matches = internalRuntimeNeedles.filter(needle => source.includes(needle));
      if (matches.length > 0) {
        offenders[relativePath] = matches;
      }
    }

    expect(offenders).toEqual({});
  });

  test('public SDK README describes local runtime examples without sidecar-facing prose', async () => {
    const readme = await read('packages/windie-sdk-js/README.md');
    const pythonReadme = await read('packages/windie-sdk-python/README.md');

    expect(readme).toContain('local-runtime execution');
    expect(readme).toContain('local-runtime module-tool registration');
    expect(readme).toContain('local-runtime plugin package registration');
    expect(readme).toContain('waking agents from external clients');
    expect(readme).toContain("backendUrl: 'https://backend.example.com'");
    expect(pythonReadme).toContain('backend_url="https://backend.example.com"');
    expect(readme).toContain("modelProvider: 'hosted-provider'");
    expect(readme).toContain("modelId: 'other-hosted-model'");
    expect(readme).not.toContain(`waking ${retiredProductName(' agents')}`);
    expect(readme).not.toContain('https://api.windieos.com');
    expect(pythonReadme).not.toContain('https://api.windieos.com');
    expect(readme).not.toContain("modelProvider: 'openai'");
    expect(readme).not.toContain("modelId: 'gpt-5.4'");
    expect(readme).not.toContain("modelProvider: 'mistral'");
    expect(readme).not.toContain('mistral-large-latest');
    expect(readme).not.toContain("pythonArgs: ['sidecar', 'python']");
    expect(readme).not.toContain('local sidecar execution');
    expect(readme).not.toContain('sidecar module-tool registration');
    expect(readme).not.toContain('sidecar plugin package registration');
  });

  test('public local-runtime examples avoid sidecar-facing descriptions', async () => {
    const localSdkLoader = await read('examples/_shared/local_sdk_loader.mjs');
    const cliAgentReadme = await read('examples/cli-agent/README.md');
    const cliAgentRun = await read('examples/cli-agent/run.mjs');
    const customUiReadme = await read('examples/custom-ui/README.md');
    const customUiHtml = await read('examples/custom-ui/index.html');
    const customUiRun = await read('examples/custom-ui/run.mjs');
    const localToolReadme = await read('examples/local-tool-extension/README.md');
    const localToolRun = await read('examples/local-tool-extension/run.mjs');
    const localToolPython = await read('examples/local-tool-extension/python/save_note.py');
    const repoAgentReadme = await read('examples/repo-agent-extension/README.md');
    const repoAgentManifest = await read('examples/repo-agent-extension/plugin.json');
    const repoAgentRun = await read('examples/repo-agent-extension/run.mjs');
    const simpleChatReadme = await read('examples/simple-chat-cli/README.md');
    const simpleChatRun = await read('examples/simple-chat-cli/run.mjs');
    const publicExampleText = [
      localSdkLoader,
      cliAgentReadme,
      cliAgentRun,
      customUiReadme,
      customUiHtml,
      customUiRun,
      localToolReadme,
      localToolRun,
      localToolPython,
      repoAgentReadme,
      repoAgentManifest,
      repoAgentRun,
      simpleChatReadme,
      simpleChatRun,
    ].join('\n');
    const retiredCliExampleService = ['windie', 'cli-agent-example'].join('-');
    const retiredRepoExampleService = ['windie', 'repo-agent-example'].join('-');
    const retiredNoteFile = ['windie', 'note.txt'].join('-');

    expect(publicExampleText).toContain('Agent SDK runtime');
    expect(publicExampleText).toContain('loadLocalAgentSdk');
    expect(publicExampleText).toContain('Agent SDK Custom UI');
    expect(publicExampleText).toContain('local-runtime daemon discovery');
    expect(publicExampleText).toContain('local-runtime plugin example');
    expect(publicExampleText).toContain('local-runtime tool implementation');
    expect(simpleChatReadme).toContain('requires an explicit backend endpoint');
    expect(simpleChatReadme).toContain('AGENT_INSTALL_TOKEN');
    expect(simpleChatReadme).toContain('AGENT_BACKEND_URL');
    expect(simpleChatReadme).not.toContain('defaults to `WINDIE_BACKEND_URL`');
    expect(simpleChatReadme).not.toContain('https://api.windieos.com');
    expect(simpleChatReadme).not.toContain('WINDIE_INSTALL_TOKEN');
    expect(simpleChatReadme).not.toContain('WINDIE_API_KEY');
    expect(simpleChatReadme).not.toContain('registers a temporary install identity');
    expect(publicExampleText).not.toContain("modelProvider: 'openai'");
    expect(publicExampleText).not.toContain("modelId: 'gpt-5.4'");
    expect(publicExampleText).not.toContain("model_provider: 'openai'");
    expect(publicExampleText).not.toContain("selected_model_id: 'gpt-5.4'");
    expect(publicExampleText).not.toContain('mistral-large-latest');
    expect(publicExampleText).not.toContain(retiredProductName(' CLI'));
    expect(publicExampleText).not.toContain('sidecar daemon discovery');
    expect(publicExampleText).not.toContain('through the sidecar');
    const retiredProductSidecarPluginCopy = [
      ['Win', 'die'].join(''),
      'sidecar plugin',
    ].join(' ');
    expect(publicExampleText).not.toContain(retiredProductSidecarPluginCopy);
    expect(publicExampleText).not.toContain('sidecar plugin manifest');
    expect(publicExampleText).not.toContain('local sidecar tool implementation');
    expect(publicExampleText).not.toContain('buildLocalWindieSdk');
    expect(publicExampleText).not.toContain('loadLocalWindieSdk');
    expect(publicExampleText).not.toContain(retiredProductName(' SDK'));
    expect(publicExampleText).not.toContain(retiredProductName(' agent'));
    expect(publicExampleText).not.toContain(retiredProductName(' local'));
    expect(publicExampleText).not.toContain('windie-local-tool-extension');
    expect(publicExampleText).not.toContain(retiredCliExampleService);
    expect(publicExampleText).not.toContain(retiredRepoExampleService);
    expect(publicExampleText).not.toContain(retiredNoteFile);
    expect(publicExampleText).toContain('agent-cli-example');
    expect(publicExampleText).toContain('agent-repo-example');
    expect(publicExampleText).toContain('agent-note.txt');
  });

  test('sdk docs describe local runtime contracts without sidecar-facing public wording', async () => {
    const sdkDocs = await Promise.all([
      read('docs/sdk/README.md'),
      read('docs/sdk/windie_client_runtime.md'),
      read('docs/sdk/conversation_runtime.md'),
      read('docs/sdk/hosted_backend_clients.md'),
      read('docs/sdk/sdk_auth_and_error_handling.md'),
      read('docs/sdk/sdk_route_change_workflow.md'),
      read('docs/sdk/query_planning_and_trace.md'),
      read('docs/sdk/tool_authoring.md'),
    ]);
    const sdkDocText = sdkDocs.join('\n');
    const apiReferenceText = await read('docs/reference/api_reference.md');
    const httpApiSurfaceText = await read('docs/reference/http_api_surface.md');
    const architectureText = await read('docs/development/agent_architecture_reference.md');
    const retiredHostedUrl = ['https://api', 'windieos', 'com'].join('.');

    expect(sdkDocText).toContain('local-runtime module-tool SDK example');
    expect(sdkDocText).toContain('local-runtime plugin SDK example');
    expect(sdkDocText).toContain('local runtime tool manifest');
    expect(sdkDocText).toContain('Python SDK package client change');
    expect(sdkDocText).toContain('Python SDK package client behavior');
    expect(sdkDocText).toContain('Python SDK remote auth/error wrappers');
    expect(sdkDocText).toContain('local runtime tool-result data');
    expect(sdkDocText).toContain('local-runtime-backed default conversation store');
    expect(sdkDocText).toContain('Host UI Migration Target');
    expect(sdkDocText).toContain('Electron agent-host runtime facades');
    expect(sdkDocText).toContain('Electron agent host should');
    expect(apiReferenceText).toContain('local runtime process just to use hosted OCR or prediction routes');
    expect(apiReferenceText).toContain("backendUrl: 'https://backend.example.com'");
    expect(apiReferenceText).toContain('backend_url="https://backend.example.com"');
    expect(httpApiSurfaceText).toContain('desktop app or local-runtime process');
    expect(httpApiSurfaceText).not.toContain('Electron app or sidecar');
    expect(sdkDocText).not.toContain('sidecar runtime client');
    expect(sdkDocText).not.toContain('sidecar daemon');
    expect(sdkDocText).not.toContain('sidecar process');
    expect(sdkDocText).not.toContain('sidecar-named env');
    expect(sdkDocText).not.toContain('sidecar_daemon.py');
    expect(sdkDocText).not.toContain('scripts/python-in-env sidecar python');
    expect(sdkDocText).not.toContain('sidecar tool manifest');
    expect(sdkDocText).not.toContain('sidecar execution');
    expect(sdkDocText).not.toContain('Sidecar owns durable rows');
    expect(sdkDocText).not.toContain('sidecar-backed conversation');
    expect(sdkDocText).not.toContain('sidecar-backed default conversation store');
    expect(sdkDocText).not.toContain('Sidecar-backed persistence');
    expect(sdkDocText).not.toContain('Electron sidecar-backed stores');
    expect(sdkDocText).not.toContain('sidecar-backed SDK store');
    expect(sdkDocText).not.toContain('Sidecar/developer client configuration');
    expect(sdkDocText).not.toContain('Sidecar remote clients');
    expect(sdkDocText).not.toContain('Python hosted client change');
    expect(sdkDocText).not.toContain('| Python client behavior |');
    expect(sdkDocText).not.toContain('Remote client auth/error wrappers');
    expect(sdkDocText).not.toContain('minimal sidecar module-tool');
    expect(sdkDocText).not.toContain('runnable sidecar plugin');
    expect(sdkDocText).not.toContain('sidecar local tool implementation');
    expect(sdkDocText).not.toContain('Use sidecar tools for local machine control');
    expect(sdkDocText).not.toContain('backed by\n  the Python sidecar');
    expect(sdkDocText).not.toContain('raw backend');
    expect(sdkDocText).not.toContain('raw-backend');
    expect(sdkDocText).not.toContain('WindieOS hosted SDK routes');
    expect(sdkDocText).not.toContain('WindieOS SDK HTTP routes');
    expect(sdkDocText).not.toContain('WindieOS SDK docs cover');
    expect(sdkDocText).not.toContain('WindieOS TypeScript and Python SDK wrappers');
    expect(sdkDocText).not.toContain('https://api.windieos.com');
    expect(sdkDocText).not.toContain('WINDIE_INSTALL_TOKEN');
    expect(sdkDocText).not.toContain('gpt-5.4');
    expect(sdkDocText).not.toContain('modelProvider: "openai"');
    expect(sdkDocText).not.toContain("model_provider: 'openai'");
    expect(sdkDocText).not.toContain('WindieOS backend SDK tool authoring');
    expect(sdkDocText).not.toContain('WindieOS exposes SDK routes');
    expect(sdkDocText).not.toContain('WindieOS app needs during normal operation');
    expect(sdkDocText).not.toContain('WindieOS renderer skin state');
    expect(sdkDocText).not.toContain('## Desktop Migration Target');
    expect(sdkDocText).not.toContain('The desktop runtime should expose');
    expect(sdkDocText).not.toContain('Electron desktop runtime facades');
    expect(apiReferenceText).not.toContain('local backend process just to use hosted OCR or prediction routes');
    expect(apiReferenceText).not.toContain(`backendUrl: '${retiredHostedUrl}'`);
    expect(apiReferenceText).not.toContain(`backend_url="${retiredHostedUrl}"`);
    expect(architectureText).not.toContain('sidecar-backed storage');
    expect(architectureText).not.toContain('sidecar-backed SDK store');
    expect(architectureText).not.toContain('SDK desktop agent');
    expect(architectureText).not.toContain(`SDK desktop-${'agent'}`);
    await expect(pathExists('tests/frontend/AgentSdkPrivateExports.test.cjs')).resolves.toBe(true);
    await expect(pathExists('tests/frontend/WindieSdkPrivateExports.test.cjs')).resolves.toBe(false);
    await expect(pathExists('tests/frontend/AgentConversationStoreApi.test.ts')).resolves.toBe(true);
    await expect(pathExists('tests/frontend/WindieAgentConversationStoreApi.test.ts')).resolves.toBe(false);
    await expect(pathExists('tests/frontend/AgentSdkPackageBoundary.test.ts')).resolves.toBe(true);
    await expect(pathExists('tests/frontend/WindieSdkPackageBoundary.test.ts')).resolves.toBe(false);
    await expect(pathExists('tests/frontend/AgentSdkClient.test.ts')).resolves.toBe(true);
    await expect(pathExists('tests/frontend/WindieSdkClient.test.ts')).resolves.toBe(false);
    await expect(pathExists('tests/frontend/AgentSdkConversationRuntime.test.ts')).resolves.toBe(true);
    await expect(pathExists('tests/frontend/WindieSdkConversationRuntime.test.ts')).resolves.toBe(false);
    await expect(pathExists('tests/frontend/AgentSdkMockBackendE2E.test.ts')).resolves.toBe(true);
    await expect(pathExists('tests/frontend/WindieSdkMockBackendE2E.test.ts')).resolves.toBe(false);
    await expect(pathExists('tests/frontend/AgentSdkFileConversationStore.test.ts')).resolves.toBe(true);
    await expect(pathExists('tests/frontend/WindieSdkFileConversationStore.test.ts')).resolves.toBe(false);
    await expect(pathExists('tests/frontend/AgentSdkModelSelection.test.ts')).resolves.toBe(true);
    await expect(pathExists('tests/frontend/WindieSdkModelSelection.test.ts')).resolves.toBe(false);
    await expect(pathExists('tests/frontend/AgentSdkManagedWebSocketSession.test.ts')).resolves.toBe(true);
    await expect(pathExists('tests/frontend/WindieSdkManagedWebSocketSession.test.ts')).resolves.toBe(false);
  });

  test('Agent SDK tests keep workspace fixtures product-neutral', async () => {
    const sdkTestText = await Promise.all([
      read('tests/frontend/AgentSdkClient.test.ts'),
      read('tests/frontend/AgentConversationStoreApi.test.ts'),
      read('tests/frontend/AgentSdkConversationRuntime.test.ts'),
      read('tests/frontend/AgentSdkFileConversationStore.test.ts'),
    ]).then(sources => sources.join('\n'));
    const retiredSdkTempPrefixes = [
      ['windie', 'sdk-daemon-'].join('-'),
      ['windie', 'sdk-provider-'].join('-'),
      ['windie', 'sdk-provider-timeout-'].join('-'),
      ['windie', 'sdk-provider-no-launch-'].join('-'),
      ['windie', 'sdk-provider-discovery-alias-'].join('-'),
      ['windie', 'sdk-provider-loopback-'].join('-'),
      ['windie', 'sdk-provider-restart-'].join('-'),
      ['windie', 'sdk-provider-command-'].join('-'),
      ['windie', 'sdk-provider-stale-launch-'].join('-'),
      ['windie', 'sdk-provider-launch-superset-'].join('-'),
      ['windie', 'sdk-launcher-'].join('-'),
      ['windie', 'sdk-query-shot-'].join('-'),
      ['windie', 'file-store-'].join('-'),
    ];

    expect(sdkTestText).not.toContain('/work/WindieOS');
    expect(sdkTestText).not.toContain('/Windieos_workspace/');
    expect(sdkTestText).not.toContain('/tmp/windie-project');
    expect(sdkTestText).not.toContain('windieos docs');
    expect(sdkTestText).not.toContain('Windie' + ' metadata keys');
    expect(sdkTestText).not.toContain(`workspaceName: '${retiredProductName('OS')}'`);
    expect(sdkTestText).not.toContain(`workspace_name: '${retiredProductName('OS')}'`);
    for (const retiredPrefix of retiredSdkTempPrefixes) {
      expect(sdkTestText).not.toContain(retiredPrefix);
    }
    expect(sdkTestText).toContain('/work/project-alpha');
    expect(sdkTestText).toContain('/tmp/project-alpha');
    expect(sdkTestText).toContain('/Users/dev/workspaces/project-alpha');
    expect(sdkTestText).toContain('project docs');
    expect(sdkTestText).toContain("workspaceName: 'Project Alpha'");
    expect(sdkTestText).toContain('agent-sdk-daemon-');
    expect(sdkTestText).toContain('agent-sdk-provider-');
    expect(sdkTestText).toContain('agent-query-shot-');
    expect(sdkTestText).toContain('agent-file-store-');
  });

  test('Agent SDK local-runtime launch tests keep disposable env fixtures product-neutral', async () => {
    const source = await read('tests/frontend/AgentSdkClient.test.ts');

    expect(source).not.toContain('WINDIE_TEST');
    expect(source).toContain('AGENT_TEST_MODE');
    expect(source).toContain('AGENT_TEST_TOKEN');
    expect(source).toContain('AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS');
  });

  test('local-runtime helper tests keep disposable env fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/sidecar/test_env_flags.py'),
      read('tests/sidecar/test_shell_process_registry.py'),
      read('tests/sidecar/test_shell_process_tool.py'),
    ]).then(sources => sources.join('\n'));

    expect(source).not.toContain('WINDIE_TEST_FLAG');
    expect(source).not.toContain('WINDIE_TEST_INT');
    expect(source).not.toContain('WINDIE_TEST');
    expect(source).toContain('AGENT_TEST_FLAG');
    expect(source).toContain('AGENT_TEST_INT');
    expect(source).toContain('AGENT_TEST');
  });

  test('local-runtime browser launcher tests keep profile compatibility wording product-neutral', async () => {
    const source = await read('tests/sidecar/tools/test_chrome_launcher.py');

    expect(source).not.toContain('WindieOS desktop launches');
    expect(source).toContain('desktop app launches keep the injected dedicated profile path');
  });

  test('renderer workspace runtime tests keep workspace fixtures product-neutral', async () => {
    const workspaceTestText = await Promise.all([
      read('tests/frontend/DesktopWorkspaceRuntimeClient.test.ts'),
      read('tests/frontend/ConversationWorkspaceBinding.test.js'),
    ]).then(sources => sources.join('\n'));

    expect(workspaceTestText).not.toContain('/repo/WindieOS');
    expect(workspaceTestText).not.toContain('C:/Projects/WindieOS');
    expect(workspaceTestText).not.toContain("activeWorkspaceName: 'WindieOS'");
    expect(workspaceTestText).not.toContain(`workspaceName: '${retiredProductName('OS')}'`);
    expect(workspaceTestText).toContain('/repo/project-alpha');
    expect(workspaceTestText).toContain('C:/Projects/project-alpha');
    expect(workspaceTestText).toContain("activeWorkspaceName: 'Project Alpha'");
  });

  test('renderer workspace surface tests keep selected workspace fixtures product-neutral', async () => {
    const workspaceSurfaceText = await Promise.all([
      read('tests/frontend/ChatInterfaceWiring.test.jsx'),
      read('tests/frontend/SettingsSection.test.jsx'),
    ]).then(sources => sources.join('\n'));

    expect(workspaceSurfaceText).not.toContain('/Users/peterbui/Projects/WindieOS');
    expect(workspaceSurfaceText).not.toContain('D:\\\\Assistants\\\\WindieOS_workspace\\\\windieos');
    expect(workspaceSurfaceText).toContain('/Users/peterbui/Projects/project-alpha');
    expect(workspaceSurfaceText).toContain('D:\\\\Assistants\\\\project-alpha');
  });

  test('renderer settings section tests keep skin copy fixtures product-neutral', async () => {
    const source = await read('tests/frontend/SettingsSection.test.jsx');

    expect(source).not.toContain('WindieOS');
    expect(source).not.toContain('Windie Browser');
    expect(source).not.toContain('Connect WindieOS before deleting saved data.');
    expect(source).toContain('Sample Desktop');
    expect(source).toContain('Sample Browser');
    expect(source).toContain('Connect Sample Desktop before deleting saved data.');
  });

  test('renderer chat wiring tests keep skin copy fixtures product-neutral', async () => {
    const source = await read('tests/frontend/ChatInterfaceWiring.test.jsx');

    expect(source).not.toContain('Welcome to WindieOS Demo');
    expect(source).toContain('Welcome to Sample Desktop Demo');
  });

  test('renderer onboarding slideshow tests keep skin copy fixtures product-neutral', async () => {
    const source = await read('tests/frontend/DesktopOnboardingSlideshow.test.jsx');

    expect(source).not.toContain('WindieOS');
    expect(source).not.toContain('Start WindieOS');
    expect(source).toContain('Sample Desktop onboarding');
    expect(source).toContain('Start Sample Desktop');
  });

  test('renderer onboarding permission action tests keep focus wording product-neutral', async () => {
    const source = await read('tests/frontend/useOnboardingPermissionActions.test.jsx');

    expect(source).not.toContain('WindieOS regains focus');
    expect(source).toContain('desktop app regains focus');
  });

  test('main permission workspace tests keep path fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('src/shared/permissions/permission_manifest.json'),
      read('tests/frontend/DesktopOnboardingSlideshow.test.jsx'),
      read('tests/frontend/PermissionIpcRuntime.test.cjs'),
      read('tests/frontend/PermissionService.test.cjs'),
    ]).then(sources => sources.join('\n'));
    const retiredPermissionTempRoot = ['windie', 'permission-runtime-'].join('-');

    expect(source).not.toContain('windieos-workspace');
    expect(source).not.toContain('windieos-conversation-workspace');
    expect(source).not.toContain('windieos-diagnostic-workspace');
    expect(source).not.toContain('windieos-untrusted-workspace');
    expect(source).not.toContain('mainHostSkin');
    expect(source).not.toContain('WindieOS');
    expect(source).not.toContain('desktop runtime should use for browsing');
    expect(source).not.toContain('desktop runtime to capture');
    expect(source).not.toContain('desktop runtime to automate');
    expect(source).not.toContain('desktop runtime to control macOS System Events');
    expect(source).not.toContain(retiredPermissionTempRoot);
    expect(source).toContain('agent host should use for browsing');
    expect(source).toContain('agent host to capture');
    expect(source).toContain('samplePermissionCopy');
    expect(source).toContain('Select sample workspace folder');
    expect(source).toContain('project-alpha-workspace');
    expect(source).toContain('project-alpha-conversation-workspace');
    expect(source).toContain('project-alpha-diagnostic-workspace');
    expect(source).toContain('project-alpha-untrusted-workspace');
    expect(source).toContain('agent-permission-runtime-');
  });

  test('repo instruction runtime tests keep workspace fixtures product-neutral', async () => {
    const source = await read('tests/frontend/RepoInstructionRuntime.test.cjs');

    expect(source).not.toContain('windieos-agents-file');
    expect(source).not.toContain('windieos-agents-layers');
    expect(source).toContain('project-alpha-agents-file');
    expect(source).toContain('project-alpha-agents-layers');
  });

  test('main IPC tests keep temp path fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/frontend/IpcMainBridge.query.test.cjs'),
      read('tests/frontend/IpcPersistenceConcurrency.test.cjs'),
      read('tests/frontend/IpcMainReplayCommands.test.cjs'),
      read('tests/frontend/AppDiagnosticsStore.test.cjs'),
      read('tests/frontend/McpControl.test.cjs'),
    ]).then(sources => sources.join('\n'));
    const retiredReplayWorkspace = ['/tmp', 'windie-workspace'].join('/');
    const retiredReplayRetryWorkspace = ['/tmp', 'windie-retry-workspace'].join('/');
    const retiredDiagnosticsTempRoot = ['windie', 'diagnostics-'].join('-');
    const retiredCuaMcpTempRoot = ['windie', 'cua-mcp-'].join('-');
    const retiredMcpDiagnosticsTempRoot = ['windie', 'mcp-diagnostics-'].join('-');

    expect(source).not.toContain('windieos-query-agents');
    expect(source).not.toContain('windieos-ipc-persist');
    expect(source).not.toContain(retiredReplayWorkspace);
    expect(source).not.toContain(retiredReplayRetryWorkspace);
    expect(source).not.toContain(retiredDiagnosticsTempRoot);
    expect(source).not.toContain(retiredCuaMcpTempRoot);
    expect(source).not.toContain(retiredMcpDiagnosticsTempRoot);
    expect(source).not.toContain('hey_jarvis');
    expect(source).toContain('project-alpha-query-agents');
    expect(source).toContain('project-alpha-ipc-persist');
    expect(source).toContain('/tmp/project-alpha-workspace');
    expect(source).toContain('/tmp/project-alpha-retry-workspace');
    expect(source).toContain('SAMPLE_WAKEWORD_MODEL');
    expect(source).toContain('agent-diagnostics-');
    expect(source).toContain('agent-cua-mcp-');
    expect(source).toContain('agent-mcp-diagnostics-');
  });

  test('main diagnostics store tests keep injected data-path fixtures product-neutral', async () => {
    const source = await read('tests/frontend/AppDiagnosticsStore.test.cjs');
    const windieDiagnosticsDbEnv = ['WINDIE', 'APP', 'DIAGNOSTICS', 'DB'].join('_');
    const windieUserDataDirEnv = ['WINDIE', 'USER', 'DATA', 'DIR'].join('_');

    expect(source).not.toContain('mainHostSkin');
    expect(source).not.toContain(windieDiagnosticsDbEnv);
    expect(source).not.toContain(windieUserDataDirEnv);
    expect(source).toContain('sampleDiagnosticsConfig');
    expect(source).toContain('SAMPLE_APP_DIAGNOSTICS_DB');
    expect(source).toContain('SAMPLE_USER_DATA_DIR');
  });

  test('main logging tests keep disposable temp fixtures product-neutral', async () => {
    const layerLogSinkSource = await read('tests/frontend/LayerLogSink.test.cjs');
    const source = await Promise.all([
      Promise.resolve(layerLogSinkSource),
      read('tests/frontend/WindieRunLayerLog.test.cjs'),
    ]).then(sources => sources.join('\n'));
    const retiredPrefixes = [
      ['windie', 'layer-log-'].join('-'),
      ['windie', 'layer-banner-'].join('-'),
      ['windie', 'layer-default-prefix-'].join('-'),
      ['windie', 'renderer-verbose-log-'].join('-'),
      ['windie', 'renderer-verbose-disabled-'].join('-'),
      ['windie', 'console-layer-log-'].join('-'),
      ['windie', 'console-epipe-log-'].join('-'),
      ['windie', 'console-unexpected-log-'].join('-'),
      ['windie', 'vite-run-log-'].join('-'),
    ];

    for (const retiredPrefix of retiredPrefixes) {
      expect(source).not.toContain(retiredPrefix);
    }
    const windieLogEnvPrefix = ['WINDIE', ''].join('_');
    expect(layerLogSinkSource).not.toContain('[WindieOS]');
    expect(layerLogSinkSource).not.toContain('mainHostSkin');
    expect(layerLogSinkSource).not.toContain(windieLogEnvPrefix);
    expect(layerLogSinkSource).toContain('[SampleApp]');
    expect(layerLogSinkSource).toContain('sampleLogConfig');
    expect(layerLogSinkSource).toContain('SAMPLE_RENDERER_VERBOSE_LOG_FILE');
    expect(source).toContain('agent-layer-log-');
    expect(source).toContain('agent-vite-run-log-');
  });

  test('main helper tests keep runtime temp fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/frontend/ChatPillVisibilityIntentStore.test.cjs'),
      read('tests/frontend/CommitterBodyFormat.test.cjs'),
      read('tests/frontend/ElectronLauncher.test.cjs'),
      read('tests/frontend/PythonInEnvScript.test.cjs'),
    ]).then(sources => sources.join('\n'));
    const retiredUserData = ['/tmp', 'windie-user-data'].join('/');
    const retiredCommitterRoot = ['windie', 'committer-'].join('-');
    const retiredCommitterAuthor = ['Windie', 'Test'].join(' ');
    const retiredFrontendLogFile = ['/tmp', 'windie-frontend.log'].join('/');
    const retiredPythonEnvRoot = ['windie', 'python-in-env-'].join('-');

    expect(source).not.toContain(retiredUserData);
    expect(source).not.toContain(retiredCommitterRoot);
    expect(source).not.toContain(retiredCommitterAuthor);
    expect(source).not.toContain(retiredFrontendLogFile);
    expect(source).not.toContain(retiredPythonEnvRoot);
    expect(source).toContain('/tmp/agent-user-data');
    expect(source).toContain('agent-committer-');
    expect(source).toContain('Agent Test');
    expect(source).toContain('/tmp/agent-frontend.log');
    expect(source).toContain('agent-python-in-env-');
  });

  test('CLI conversation history tests keep temp home fixtures product-neutral', async () => {
    const source = await read('tests/frontend/WindieCli.test.cjs');
    const retiredHistoryRoot = ['windie', 'cli-history-'].join('-');
    const retiredLegacyHistoryRoot = ['windie', 'cli-history-legacy-'].join('-');

    expect(source).not.toContain(retiredHistoryRoot);
    expect(source).not.toContain(retiredLegacyHistoryRoot);
    expect(source).toContain('agent-cli-history-');
    expect(source).toContain('agent-cli-history-legacy-');
  });

  test('conversation replay database integration keeps temp fixtures product-neutral', async () => {
    const source = await read('tests/frontend/ConversationReplayDatabaseIntegration.test.tsx');
    const retiredReplayDbRoot = ['windie', 'replay-db-'].join('-');

    expect(source).not.toContain(retiredReplayDbRoot);
    expect(source).toContain('agent-replay-db-');
  });

  test('MCP runtime tests keep configured client info fixtures product-neutral', async () => {
    const source = await read('tests/frontend/McpRuntime.test.cjs');

    expect(source).not.toContain("name: 'WindieOS'");
    expect(source).toContain("name: 'Desktop Agent'");
  });

  test('main host-copy tests keep injected identity fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/frontend/IpcAgentWakeupRuntime.test.cjs'),
      read('tests/frontend/IpcHostCopyRuntime.test.cjs'),
    ]).then(sources => sources.join('\n'));

    expect(source).not.toContain("getSdkAgentName: jest.fn(() => 'WindieOS')");
    expect(source).not.toContain("sdkAgentName: 'WindieOS'");
    expect(source).not.toContain("name: 'WindieOS'");
    expect(source).toContain("getSdkAgentName: jest.fn(() => 'Sample Agent')");
    expect(source).toContain("sdkAgentName: 'Sample Agent'");
    expect(source).toContain("name: 'Sample Runtime'");
  });

  test('Electron AgentClient factory tests keep injected user-data fixtures product-neutral', async () => {
    const source = await read('tests/frontend/IpcElectronAgentClientFactory.test.cjs');

    expect(source).not.toContain('C:/Users/test/AppData/Roaming/WindieOS');
    expect(source).toContain('C:/Users/test/AppData/Roaming/AgentRuntime');
  });

  test('renderer conversation metadata tests keep workspace fixtures product-neutral', async () => {
    const conversationMetadataText = await Promise.all([
      read('tests/frontend/ConversationGroups.test.js'),
      read('tests/frontend/DashboardConversationLoad.test.js'),
      read('tests/frontend/DesktopConversationLibraryClient.test.ts'),
      read('tests/frontend/DesktopConversationStore.test.ts'),
      read('tests/frontend/DesktopLiveTurnRuntimeClient.test.ts'),
      read('tests/frontend/DesktopConversationContinuityService.test.ts'),
      read('tests/frontend/NewChatSession.test.ts'),
      read('tests/frontend/UseDashboardConversations.test.jsx'),
    ]).then(sources => sources.join('\n'));

    expect(conversationMetadataText).not.toContain('/work/WindieOS');
    expect(conversationMetadataText).not.toContain('/workspace/WindieOS');
    expect(conversationMetadataText).not.toContain(`${retiredProductName('OS')} issue`);
    expect(conversationMetadataText).not.toContain(`${retiredProductName('OS')} follow-up`);
    expect(conversationMetadataText).not.toContain(`workspaceName: '${retiredProductName('OS')}'`);
    expect(conversationMetadataText).not.toContain(`workspace_name: '${retiredProductName('OS')}'`);
    expect(conversationMetadataText).toContain('/work/project-alpha');
    expect(conversationMetadataText).toContain('/repo/project-alpha');
    expect(conversationMetadataText).toContain('/workspace/project-alpha');
    expect(conversationMetadataText).toContain('Project Alpha issue');
    expect(conversationMetadataText).toContain("workspaceName: 'Project Alpha'");
    expect(conversationMetadataText).toContain("workspace_name: 'Project Alpha'");
  });

  test('renderer browser session tests keep tab URL fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/frontend/BrowserSessionStore.test.js'),
      read('tests/frontend/ChatBrowserSessionControl.test.jsx'),
    ]).then(sources => sources.join('\n'));

    expect(source).not.toContain('docs.windieos.com');
    expect(source).not.toContain('github.com/windieos');
    expect(source).not.toContain('windieos.com/pricing');
    expect(source).toContain('https://docs.example.com');
    expect(source).toContain('https://github.com/example/project');
    expect(source).toContain('https://example.com/pricing');
  });

  test('local-runtime chat event store tests keep workspace fixtures product-neutral', async () => {
    const source = await read('tests/sidecar/test_chat_event_store.py');

    expect(source).not.toContain('/work/WindieOS');
    expect(source).not.toContain('workspace_name="WindieOS"');
    expect(source).not.toContain('"workspace_name"] == "WindieOS"');
    expect(source).not.toContain(`You are in ${retiredProductName('OS')}.`);
    expect(source).toContain('/work/project-alpha');
    expect(source).toContain('workspace_name="Project Alpha"');
    expect(source).toContain('You are in Project Alpha.');
  });

  test('local-runtime window tests keep window title fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/sidecar/test_linux_window_manager.py'),
      read('tests/sidecar/test_windows_window_manager.py'),
      read('tests/sidecar/test_system_state.py'),
      read('tests/sidecar/test_sidecar_daemon.py'),
    ]).then(sources => sources.join('\n'));

    expect(source).not.toContain('"title": "WindieOS"');
    expect(source).not.toContain('"WindieOS Dashboard"');
    expect(source).not.toContain('lambda: "WindieOS"');
    expect(source).toContain('Project Alpha Notes');
    expect(source).toContain('Project Alpha Dashboard');
  });

  test('unicode repair tests keep text fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/sidecar/test_unicode_sanitizer.py'),
      read('tests/frontend/DesktopChatStreamMessageUpdateRuntime.test.ts'),
    ]).then(sources => sources.join('\n'));

    expect(source).not.toContain('Active: â€œWindieOS â€” README');
    expect(source).not.toContain('Active: “WindieOS — README”');
    expect(source).toContain('Active: â€œProject Alpha â€” README');
    expect(source).toContain('Active: “Project Alpha — README”');
  });

  test('backend workspace context tests keep workspace fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/backend/test_query_execution_inputs.py'),
      read('tests/backend/test_rehydrate_execution_service.py'),
      read('tests/backend/test_api_handlers.py'),
      read('tests/backend/test_prompt_manager.py'),
      read('tests/backend/test_session_manager.py'),
    ]).then(sources => sources.join('\n'));

    expect(source).not.toContain('/work/WindieOS');
    expect(source).toContain('/work/project-alpha');
  });

  test('backend config updater tests keep temp path fixtures product-neutral', async () => {
    const source = await read('tests/backend/test_container_config_updater.py');

    expect(source).not.toContain('/tmp/windieos-test-tts');
    expect(source).toContain('/tmp/project-alpha-test-tts');
  });

  test('extension scaffold tests keep contribution root fixtures product-neutral', async () => {
    const source = await read('tests/frontend/CreateWindieExtension.test.cjs');
    const manifestSource = await read('tests/frontend/ExtensionManifest.test.cjs');
    const script = await read('scripts/create-windie-extension.cjs');
    const docs = await read('docs/development/extensions.md');
    const retiredManifestRoots = [
      ['windie', 'agent-contributions-'].join('-'),
      ['windie', 'cwd-contributions-'].join('-'),
      ['windie', 'env-contributions-'].join('-'),
    ];

    expect(source).not.toContain('windie-contribution-scaffold-');
    expect(source).not.toContain('/tmp/windieos');
    const retiredStarterProductPlugin = [
      'Starter',
      ['Windie', 'OS'].join(''),
      'local-runtime plugin',
    ].join(' ');
    const retiredProductSidecarPlugin = [
      ['Win', 'die'].join(''),
      'sidecar plugin',
    ].join(' ');
    expect(source).not.toContain(retiredStarterProductPlugin);
    expect(source).not.toContain(retiredProductSidecarPlugin);
    for (const retiredRoot of retiredManifestRoots) {
      expect(manifestSource).not.toContain(retiredRoot);
    }
    expect(source).toContain('agent-contribution-scaffold-');
    expect(source).toContain('/tmp/agent-contributions');
    expect(manifestSource).toContain('agent-contributions-');
    expect(manifestSource).toContain('agent-cwd-contributions-');
    expect(manifestSource).toContain('agent-host-contributions-');
    expect(`${script}\n${docs}`).not.toContain('WindieOS repo/contribution root');
    expect(script).toContain('Contribution root. Defaults to .');
  });

  test('main window runtime tests keep injected icon fixtures product-neutral', async () => {
    const [windowRuntimeTest, bootstrapRuntimeTest] = await Promise.all([
      read('tests/frontend/MainWindowRuntime.test.cjs'),
      read('tests/frontend/MainProcessBootstrapRuntime.test.cjs'),
    ]);
    const source = `${windowRuntimeTest}\n${bootstrapRuntimeTest}`;

    expect(source).not.toContain('/tmp/windieos.png');
    expect(source).not.toContain('windieos.app.png');
    expect(source).not.toContain("trayTooltip: 'WindieOS'");
    expect(source).not.toContain("rendererLogPrefix: '[WindieOS]'");
    expect(source).not.toContain('Please reinstall WindieOS');
    expect(source).not.toContain('Open the WindieOS browser');
    expect(source).not.toContain('WINDIE_');
    expect(source).not.toContain('hey_jarvis');
    expect(source).not.toContain('x-windie-runs-key');
    expect(source).toContain('/tmp/agent-icon.png');
    expect(source).toContain('sample.app.png');
    expect(source).toContain("trayTooltip: 'Sample Desktop'");
    expect(source).toContain("rendererLogPrefix: '[SampleApp]'");
    expect(source).toContain('SAMPLE_VM_WORKSPACE_ID');
    expect(source).toContain('sample_wakeword');
  });

  test('VM runtime tests keep injected env fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/frontend/RuntimeMode.test.cjs'),
      read('tests/frontend/VmWorkerRuntime.test.cjs'),
    ]).then(sources => sources.join('\n'));

    expect(source).not.toContain('mainHostSkin');
    expect(source).not.toContain('WINDIE_VM_');
    expect(source).not.toContain('WINDIE_RUNS_API_KEY');
    expect(source).not.toContain('x-windie-runs-key');
    expect(source).toContain('sampleRuntimeModeEnv');
    expect(source).toContain('sampleVmWorkerEnv');
    expect(source).toContain('SAMPLE_VM_WORKSPACE_ID');
    expect(source).toContain('x-sample-runs-key');
  });

  test('GPU runtime tests keep injected env fixtures product-neutral', async () => {
    const source = await read('tests/frontend/GpuRuntime.test.cjs');

    expect(source).not.toContain('mainHostSkin');
    expect(source).not.toContain('WINDIE_FORCE_SOFTWARE_RENDERING');
    expect(source).toContain('sampleGpuEnv');
    expect(source).toContain('SAMPLE_FORCE_SOFTWARE_RENDERING');
  });

  test('debug trace helper tests keep injected env fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/frontend/IpcRuntimeHelpers.test.cjs'),
      read('tests/frontend/LiveSurfaceTraceRuntime.test.cjs'),
      read('tests/frontend/OverlayResponseboxHandler.test.cjs'),
      read('tests/frontend/SdkLiveTurnSurfaceController.test.cjs'),
    ]).then(sources => sources.join('\n'));

    expect(source).not.toContain('mainHostSkin');
    expect(source).not.toContain('WINDIE_DEBUG_');
    expect(source).not.toContain('WINDIE_DEV_UI');
    expect(source).not.toContain('WINDIE_ENABLE_SCRIPTED_PROVIDER');
    expect(source).toContain('SAMPLE_DEBUG_LIVE_SURFACE');
    expect(source).toContain('SAMPLE_ENABLE_SCRIPTED_PROVIDER');
  });

  test('IPC query runtime tests keep injected query copy product-neutral', async () => {
    const source = await Promise.all([
      read('tests/frontend/IpcQueryRuntime.test.cjs'),
      read('tests/frontend/ChatMessageSender.test.tsx'),
      read('tests/frontend/IpcMainBridge.query.test.cjs'),
    ]).then(sources => sources.join('\n'));

    expect(source).not.toContain('mainHostSkin');
    expect(source).not.toContain('WindieOS lost connection');
    expect(source).not.toContain("WindieOS isn't connected");
    expect(source).toContain('sampleQueryEventsCopy');
    expect(source).toContain('Sample app lost connection after accepting the message.');
    expect(source).toContain("Sample app isn't connected right now.");
  });

  test('extension and MCP runtime tests keep injected env fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/frontend/ExtensionManifest.test.cjs'),
      read('tests/frontend/McpRuntime.test.cjs'),
    ]).then(sources => sources.join('\n'));
    const windieContributionEnv = ['WINDIE', 'AGENT', 'CONTRIBUTIONS', 'DIR'].join('_');
    const windieMcpEnv = ['WINDIE', 'ENABLED', 'MCPS'].join('_');

    expect(source).not.toContain('mainHostSkin');
    expect(source).not.toContain(windieContributionEnv);
    expect(source).not.toContain(windieMcpEnv);
    expect(source).toContain('sampleExtensionConfig');
    expect(source).toContain('SAMPLE_AGENT_CONTRIBUTIONS_DIR');
    expect(source).toContain('sampleMcpConfig');
    expect(source).toContain('SAMPLE_ENABLED_MCPS');
  });

  test('backend endpoint tests keep injected hosted defaults product-neutral', async () => {
    const source = await read('tests/frontend/BackendEndpoints.test.cjs');
    const hostedDefaultHttpEnv = ['WINDIE', 'DEFAULT', 'BACKEND', 'HTTP', 'URL'].join('_');
    const hostedDefaultWsEnv = ['WINDIE', 'DEFAULT', 'BACKEND', 'WS', 'URL'].join('_');

    expect(source).not.toContain('mainHostSkin');
    expect(source).not.toContain('api.windieos.com');
    expect(source).not.toContain('staging.windieos.com');
    expect(source).not.toContain(hostedDefaultHttpEnv);
    expect(source).not.toContain(hostedDefaultWsEnv);
    expect(source).toContain('sampleHostedBackend');
    expect(source).toContain('https://hosted.example.test');
    expect(source).toContain('SAMPLE_DEFAULT_BACKEND_HTTP_URL');
    expect(source).toContain('SAMPLE_DEFAULT_BACKEND_WS_URL');
  });

  test('wakeword hook tests keep audio worklet URL fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/frontend/voice/WakewordDetectionHook.test.ts'),
      read('tests/sidecar/test_wakeword_service.py'),
    ]).then(sources => sources.join('\n'));
    const retiredWakewordModelDir = ['windie', 'models'].join('-');

    expect(source).not.toContain('blob:windieos-audio-worklet');
    expect(source).not.toContain(retiredWakewordModelDir);
    expect(source).not.toContain('/opt/WindieOS/resources/openwakeword');
    expect(source).toContain('blob:agent-audio-worklet');
    expect(source).toContain('/opt/agent-runtime/resources/openwakeword');
    expect(source).toContain('legacy-models');
  });

  test('main runtime path and wakeword bridge tests keep host config fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/frontend/RuntimePaths.test.cjs'),
      read('tests/frontend/WakewordBridge.test.cjs'),
    ]).then(sources => sources.join('\n'));

    expect(source).not.toContain('mainHostSkin');
    expect(source).not.toContain('WindieOS');
    expect(source).not.toContain('WINDIE_');
    expect(source).not.toContain('hey_jarvis');
    expect(source).not.toContain('/opt/windie');
    expect(source).not.toContain('/opt/conda/envs/windie');
    expect(source).not.toContain('/opt/WindieOS');
    expect(source).toContain('/opt/agent-runtime/resources');
    expect(source).toContain('sample-host');
    expect(source).toContain('SAMPLE_PYTHON_PATH');
    expect(source).toContain('SAMPLE_WAKEWORD_NAME');
    expect(source).toContain('sample_wakeword');
  });

  test('local runtime bridge RPC tests keep injected browser warmup copy product-neutral', async () => {
    const source = await read('tests/frontend/LocalRuntimeBridge.rpc.test.cjs');

    expect(source).not.toContain('mainHostSkin');
    expect(source).not.toContain('Open the WindieOS browser');
    expect(source).toContain('SAMPLE_BROWSER_WARMUP_EXPLANATION');
    expect(source).toContain('Open the sample browser for onboarding and profile setup.');
  });

  test('debug and wakeword runtime tests keep host config fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/frontend/DebugEnvRuntime.test.cjs'),
      read('tests/frontend/WakewordBridgeRuntime.test.cjs'),
    ]).then(sources => sources.join('\n'));

    expect(source).not.toContain('mainHostSkin');
    expect(source).not.toContain('WindieOS');
    expect(source).not.toContain('hey_jarvis');
    expect(source).toContain('SAMPLE_DEBUG_STREAM_EVENTS');
    expect(source).toContain('SAMPLE_WAKEWORD_MARKER');
  });

  test('browser use engine tests keep legacy session fixtures product-neutral', async () => {
    const source = await read('tests/sidecar/tools/test_browser_use_engine.py');
    const retiredHome = `"${['windie', 'home'].join('-')}"`;
    const retiredCli = `"${['windie', 'browser-use'].join('-')}"`;
    const retiredSession = `"${['windie', 'session'].join('-')}"`;

    expect(source).not.toContain(retiredHome);
    expect(source).not.toContain(retiredCli);
    expect(source).not.toContain(retiredSession);
    expect(source).not.toContain('ENV_WINDIE_BROWSER_USE_SESSION, "windieos"');
    expect(source).not.toContain('_browser_use_session() == "windieos"');
    expect(source).toContain('"legacy-browser-home"');
    expect(source).toContain('"legacy-browser-use"');
    expect(source).toContain('"legacy-browser-session"');
    expect(source).toContain('ENV_WINDIE_BROWSER_USE_SESSION, "legacy-agent-session"');
  });

  test('SDK conversation runtime browser trace fixtures use generic browser scope', async () => {
    const source = await read('tests/frontend/AgentSdkConversationRuntime.test.ts');

    expect(source).not.toContain('windie_dedicated_browser');
    expect(source).toContain("scope: 'dedicated_browser'");
  });

  test('mock memory seed tests keep legacy user fixtures product-neutral', async () => {
    const source = await read('tests/sidecar/test_dev_seed_mock_memory.py');
    const retiredMockUser = `"${['windie', 'mock'].join('-')}"`;
    const retiredUser = `"${['windie', 'user'].join('-')}"`;

    expect(source).not.toContain(retiredMockUser);
    expect(source).not.toContain(retiredUser);
    expect(source).toContain('"legacy-mock"');
    expect(source).toContain('"legacy-user"');
  });

  test('Python SDK package boundary tests keep endpoint fixtures product-neutral', async () => {
    const source = await read('tests/sidecar/test_windie_package_boundary.py');

    expect(source).not.toContain('Covers windie package boundary behavior');
    expect(source).toContain('Covers Python SDK package boundary behavior');
    expect(source).not.toContain('https://api.windieos.com');
    expect(source).toContain('https://backend.example.com');
  });

  test('Python SDK client tests keep explicit endpoint fixtures product-neutral', async () => {
    const source = await read('tests/sidecar/test_windie_sdk_client.py');

    expect(source).not.toContain('Covers windie sdk client behavior');
    expect(source).toContain('Covers Python SDK package client behavior');
    expect(source).not.toContain('https://api.windieos.com');
    expect(source).not.toContain('wss://api.windieos.com/ws');
    expect(source).toContain('https://backend.example.com');
    expect(source).toContain('wss://backend.example.com/ws');
  });

  test('local-runtime hosted client tests keep endpoint fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/sidecar/test_remote_api_client_base.py'),
      read('tests/sidecar/test_remote_semantic_client.py'),
    ]);
    const combined = source.join('\n');

    expect(combined).not.toContain('https://api.windieos.com');
    expect(combined).toContain('https://backend.example.com');
  });

  test('image interaction handler tests keep candidate endpoint fixtures product-neutral', async () => {
    const source = await read('tests/frontend/IpcImageInteractionHandlers.test.cjs');

    expect(source).not.toContain('https://api.windieos.com');
    expect(source).not.toContain('candidate-a.windieos.com');
    expect(source).not.toContain('candidate-b.windieos.com');
    expect(source).not.toContain('candidate.windieos.com');
    expect(source).not.toContain('runtime.windieos.test');
    expect(source).not.toContain('candidate.windieos.test');
    expect(source).toContain('candidate-a.backend.example.com');
    expect(source).toContain('runtime.backend.example.test');
  });

  test('artifact and image IPC helper tests keep endpoint fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/frontend/IpcArtifactHandlers.test.cjs'),
      read('tests/frontend/IpcArtifactFetch.test.cjs'),
      read('tests/frontend/IpcClipboardImageHandler.test.cjs'),
      read('tests/frontend/IpcImageContextMenuHandler.test.cjs'),
    ]);
    const combined = source.join('\n');

    expect(combined).not.toContain('https://api.windieos.com');
    expect(combined).toContain('https://backend.example.com');
  });

  test('local-runtime main helper tests keep endpoint fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/frontend/LocalRuntimeLaunchOptions.test.cjs'),
      read('tests/frontend/LocalRuntimeBridge.rpc.test.cjs'),
      read('tests/frontend/LocalRuntimeExecuteToolRuntime.test.cjs'),
      read('tests/sidecar/test_open_app_tool.py'),
    ]);
    const combined = source.join('\n');
    const retiredUnownedShotRoot = ['windie', 'unowned-shot-'].join('-');
    const retiredOpenAppScreenshot = ['/tmp', 'windie-shot-test.jpg'].join('/');
    const retiredMcpPathRoot = ['windie', 'mcp-path-'].join('-');
    const retiredUserDataRoot = ['/tmp', 'windie-data'].join('/');
    const retiredLocalRuntimeLogRoot = ['windie', 'local-runtime-log-'].join('-');
    const retiredMainLogRoot = ['windie', 'main-log-'].join('-');
    const retiredLegacyScreenshotPrefix = ['windie', 'shot-'].join('-');
    const retiredLegacyScreenshotDir = ['windieos', 'screenshots'].join('-');

    expect(combined).not.toContain('https://api.windieos.com');
    expect(combined).not.toContain(retiredUnownedShotRoot);
    expect(combined).not.toContain(retiredOpenAppScreenshot);
    expect(combined).not.toContain(retiredLegacyScreenshotPrefix);
    expect(combined).not.toContain(retiredLegacyScreenshotDir);
    expect(combined).not.toContain(retiredMcpPathRoot);
    expect(combined).not.toContain(retiredUserDataRoot);
    expect(combined).not.toContain(retiredLocalRuntimeLogRoot);
    expect(combined).not.toContain(retiredMainLogRoot);
    expect(combined).toContain('https://backend.example.com');
    expect(combined).toContain('agent-unowned-shot-');
    expect(combined).toContain('/tmp/agent-shot-test.jpg');
    expect(combined).toContain('agent-mcp-path-');
    expect(combined).toContain('/tmp/legacy-agent-data');
    expect(combined).toContain('agent-local-runtime-log-');
    expect(combined).toContain('agent-main-log-');
  });

  test('local-runtime launch option tests keep injected host fixtures product-neutral', async () => {
    const source = await read('tests/frontend/LocalRuntimeLaunchOptions.test.cjs');
    const retiredHostEnvPrefix = ['WINDIE', ''].join('_');

    expect(source).not.toContain('mainHostSkin');
    expect(source).not.toContain(retiredHostEnvPrefix);
    expect(source).toContain('sampleLocalRuntimeHostConfig');
    expect(source).toContain('SAMPLE_LOCAL_RUNTIME_SOURCE_PATH');
    expect(source).toContain('SAMPLE_VERBOSE_LOCAL_RUNTIME_STDERR');
  });

  test('IPC host option state tests keep local-runtime env fixtures product-neutral', async () => {
    const source = await read('tests/frontend/IpcHostOptionState.test.cjs');

    expect(source).not.toContain('WINDIE_TEST');
    expect(source).toContain('SAMPLE_TEST');
  });

  test('main IPC lifecycle explicit endpoint override fixtures stay product-neutral', async () => {
    const source = await read('tests/frontend/IpcMainBridge.lifecycle.test.cjs');
    const retiredOverrideHost = ['windie', 'example', 'com'].join('.');

    expect(source).not.toContain(retiredOverrideHost);
    expect(source).toContain('backend.example.com');
    expect(source).toContain('hosted.backend.example');
  });

  test('endpoint docs describe local backend origins as explicit overrides', async () => {
    const docs = await Promise.all([
      read('docs/architecture/communication_flow.md'),
      read('docs/getting-started/installation.md'),
      read('docs/getting-started/platform_setup_backend_frontend.md'),
      read('docs/getting-started/troubleshooting.md'),
      read('docs/install/local_backend_and_endpoint_setup.md'),
    ]);
    const docText = docs.join('\n');
    const staleLoopbackFallback = ['fall back to', ' `ws://127.0.0.1:8765/ws`'].join('');
    const staleFallbackLocal = ['fallback local:', ' `ws://127.0.0.1:8765/ws`'].join('');
    const staleLocalSecond = ['local-second', ' candidate order'].join('');
    const staleDevFallback = ['Dev fallback', ' (no overrides)'].join('');
    const stalePackagedFallback = ['Packaged fallback', ' default'].join('');
    const staleHostedFirstCandidates = ['hosted-first', ' endpoint candidates'].join('');
    const staleHostedFirstList = ['hosted-first', ' candidate list'].join('');

    expect(docText).toContain('Local backend origins are explicit');
    expect(docText).toContain('do not silently switch to a local backend');
    expect(docText).not.toContain(staleLoopbackFallback);
    expect(docText).not.toContain(staleFallbackLocal);
    expect(docText).not.toContain(staleLocalSecond);
    expect(docText).not.toContain(staleDevFallback);
    expect(docText).not.toContain(stalePackagedFallback);
    expect(docText).not.toContain(staleHostedFirstCandidates);
    expect(docText).not.toContain(staleHostedFirstList);
  });

  test('endpoint runtime tests keep arbitrary test hosts product-neutral', async () => {
    const source = await Promise.all([
      read('tests/frontend/IpcArtifactHandlers.test.cjs'),
      read('tests/frontend/IpcInstallAuthState.test.cjs'),
      read('tests/frontend/RuntimeEndpointStore.test.ts'),
    ]);
    const retiredHostSuffix = ['.', 'windieos', '.test'].join('');
    const combined = source.join('\n');

    expect(combined).not.toContain(retiredHostSuffix);
    expect(combined).toContain('https://runtime.backend.example.test');
    expect(combined).toContain('https://auth.backend.example.test');
  });

  test('backend user-query sanitization tests keep desktop context fixtures product-neutral', async () => {
    const source = await read('tests/backend/test_agent_executor_user_query_sanitization.py');

    expect(source).not.toContain('<active_window>WindieOS</active_window>');
    expect(source).toContain('<active_window>Project Alpha Notes</active_window>');
  });

  test('backend web-search tests keep query fixtures product-neutral', async () => {
    const source = await Promise.all([
      read('tests/backend/test_web_search_tool.py'),
      read('tests/backend/test_tool_sender.py'),
      read('tests/backend/test_gemini_provider.py'),
      read('tests/backend/test_openai_provider.py'),
    ]).then(sources => sources.join('\n'));

    const retiredLowercaseProductName = retiredProductName('OS').toLowerCase();
    expect(source).not.toContain(`latest ${retiredLowercaseProductName} news`);
    expect(source).not.toContain(`${retiredLowercaseProductName} latest`);
    expect(source).toContain('latest project alpha news');
    expect(source).toContain('project alpha latest');
  });

  test('landing docs track desktop runtime and local runtime public copy', async () => {
    const landingDocs = await Promise.all([
      read('docs/frontend/landing/landing_page_runtime_and_content_reference.md'),
      read('docs/frontend/landing/sections/hero_how_available_and_roadmap_section_content_contract_reference.md'),
      read('docs/frontend/landing/sections/why_privacy_cta_footer_and_shared_intro_component_contract_reference.md'),
    ]);
    const landingDocText = landingDocs.join('\n');

    expect(landingDocText).toContain('Desktop runtime for personal AI agents');
    expect(landingDocText).toContain('Desktop-Native');
    expect(landingDocText).toContain('desktop session as runtime');
    expect(landingDocText).toContain('local runtime tool execution');
    expect(landingDocText).toContain('documentation link (`https://github.com/buiilding/WindieOS/blob/main/docs/README.md`)');
    expect(landingDocText).not.toContain('Desktop assistant');
    expect(landingDocText).not.toContain('OS-level control');
    expect(landingDocText).not.toContain('local sidecar tool execution');
    expect(landingDocText).not.toContain('sidecar execution, memory');
    expect(landingDocText).not.toContain('documentation button placeholder');
    expect(landingDocText).not.toContain('mixed real/placeholder links');
  });

  test('first-read docs describe SDK local runtime as the public local contract', async () => {
    const docs = await Promise.all([
      read('README.md'),
      read('docs/architecture/architecture.md'),
      read('docs/backend/services/embedding_and_semantic_memory_runtime_reference.md'),
      read('docs/concepts/sessions_and_conversations.md'),
      read('docs/reference/api_reference.md'),
      read('docs/web/web_client_integration.md'),
      read('docs/web/web_surface_matrix.md'),
      read('docs/web/landing_page.md'),
      read('docs/getting-started/installation.md'),
      read('docs/getting-started/platform_setup_backend_frontend.md'),
      read('docs/getting-started/docs_directory.md'),
      read('docs/help/doctor_checklist.md'),
      read('docs/install/uninstall_reinstall_reset.md'),
      read('docs/frontend/contracts/events/tool_runtime/tool_call_and_tool_output_recovery_skip_execution_contract_reference.md'),
      read('docs/getting-started/docs_hub.md'),
      read('docs/frontend/README.md'),
      read('docs/frontend/sidecar/README.md'),
      read('docs/frontend/sidecar/python_sidecar_and_memory.md'),
      read('docs/architecture/python_sidecar.md'),
      read('docs/concepts/runtime_model.md'),
      read('docs/operations/deployment.md'),
      read('docs/security/credentials_and_tokens_matrix.md'),
      read('docs/security/README.md'),
      read('docs/development/agent_runtime_ownership_and_change_routing.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('SDK local runtime');
    expect(docText).toContain('local-runtime hosted helper services');
    expect(docText).toContain('local runtime-backed tool');
    expect(docText).toContain('local-runtime executed');
    expect(docText).toContain('local-runtime browser execution, local-runtime Python adapters');
    expect(docText).toContain('Local-Runtime Python Docs');
    expect(docText).toContain('bundled local-runtime Python packaging');
    expect(docText).toContain('System prompt emitted for SDK/renderer transparency display');
    expect(docText).toContain('Tool schemas emitted for SDK/renderer transparency display');
    expect(docText).toContain('Electron desktop app, local-runtime Python implementation');
    expect(docText).toContain('SDK local runtime (local-runtime Python daemon)');
    expect(docText).toContain('what local-runtime Python executes');
    expect(docText).not.toContain('hosted-backend plus local sidecar');
    expect(docText).not.toContain('local sidecar daemon');
    expect(docText).not.toContain('The local sidecar owns');
    expect(docText).not.toContain('call the local sidecar');
    expect(docText).not.toContain('local sidecar action');
    expect(docText).not.toContain('local sidecar tools');
    expect(docText).not.toContain('local sidecar state');
    expect(docText).not.toContain('hosted backend with a local sidecar');
    expect(docText).not.toContain('local sidecar-backed tool');
    expect(docText).not.toContain('local sidecar execution');
    expect(docText).not.toContain('sidecar-facing');
    expect(docText).not.toContain('sidecar-owned hosted helper services');
    expect(docText).not.toContain('Electron app + local Python sidecar + local backend');
    expect(docText).not.toContain('bundling the sidecar does not imply bundling a local backend');
    expect(docText).not.toContain('falls back to local backend candidates');
    expect(docText).not.toContain('client-local sidecar imports');
    expect(docText).not.toContain('Backend schema, shared browser contract, sidecar runtime, Electron bridge');
    expect(docText).not.toContain('Sidecar owns local execution');
    expect(docText).not.toContain('The sidecar owned local tool execution');
    expect(docText).not.toContain('routes local work through the sidecar');
    expect(docText).not.toContain('desktop sidecar owns local execution');
    expect(docText).not.toContain('SDK and sidecar runtime');
    expect(docText).not.toContain('sidecar ownership');
    expect(docText).not.toContain('sidecar tool execution');
    expect(docText).not.toContain('sidecar remote-client auth');
    expect(docText).not.toContain('sidecar auth headers');
    expect(docText).not.toContain('Sidecar Docs');
    expect(docText).not.toContain('# Python Sidecar');
    expect(docText).not.toContain('### Sidecar');
    expect(docText).not.toContain('Python Sidecar and Memory');
    expect(docText).not.toContain('sidecar output');
    expect(docText).not.toContain('Python sidecar runtime, memory');
    expect(docText).not.toContain('Electron frontend, Python sidecar');
    expect(docText).not.toContain('SDK local runtime (Python sidecar daemon)');
    expect(docText).not.toContain('SDK local runtime backed by the Python sidecar');
    expect(docText).not.toContain('what Python sidecar executes');
    expect(docText).not.toContain('desktop execution, backed by the Python sidecar implementation');
    expect(docText).not.toContain('SDK/main local-runtime execution, Python sidecar implementation');
    expect(docText).not.toContain('SDK/main local-runtime dispatch, Python sidecar implementation');
    expect(docText).not.toContain('local-runtime execution, Python sidecar adapters');
    expect(docText).not.toContain('Python sidecar implementation');
    expect(docText).not.toContain('sidecar runtime packaging');
    expect(docText).not.toContain('client, sidecar, and SDKs');
    expect(docText).not.toContain('Electron desktop app, React renderer, Python sidecar');
    expect(docText).not.toContain('Install sidecar dependencies');
    expect(docText).not.toContain('sidecar Python resolution');
    expect(docText).not.toContain('Local runtime sidecar Python environment');
    expect(docText).not.toContain('Local runtime sidecar Python setup');
    expect(docText).not.toContain('environment for sidecar dependencies');
    expect(docText).not.toContain('sidecar Python 3.11 environment');
    expect(docText).not.toContain('sidecar Python 3.11 interpreter');
    expect(docText).not.toContain('Python sidecar for hosted API calls');
    expect(docText).not.toContain('UI + sidecar + SDK');
    expect(docText).not.toContain('silently switch the sidecar');
    expect(docText).not.toContain('hosted URL fallback inside the sidecar');
    expect(docText).not.toContain('one shared sidecar helper');
    expect(docText).not.toContain('shared support for sidecar service scripts');
    expect(docText).not.toContain('bundling the sidecar does not imply bundling a backend server');
    expect(docText).not.toContain('If the sidecar doesn');
    expect(docText).not.toContain('Sidecar unit tests live');
    expect(docText).not.toContain('survive sidecar/agent exit');
    expect(docText).not.toContain('System prompt sent to frontend');
    expect(docText).not.toContain('Tool schemas sent to frontend');
  });

  test('architecture memory overview routes ownership through local runtime', async () => {
    const memorySystem = await read('docs/architecture/memory_system.md');
    const memoryDocs = await Promise.all([
      read('docs/memory/README.md'),
      read('docs/memory/memory_change_workflow.md'),
      read('docs/memory/sidecar_local_memory.md'),
    ]);
    const memoryDocText = memoryDocs.join('\n');

    expect(memorySystem).toContain('SDK local-runtime memory boundary');
    expect(memorySystem).toContain('Local-runtime memory implementation (local-runtime Python-backed)');
    expect(memorySystem).toContain('Local Runtime Memory (local-runtime Python-backed)');
    expect(memorySystem).toContain('local-runtime memory implementation treats those errors as non-fatal');
    expect(memorySystem).toContain('passes embeddings to the local-runtime memory store');
    expect(memorySystem).toContain('local-runtime JSON-RPC envelope');
    expect(memorySystem).not.toContain('frontend Python sidecar');
    expect(memorySystem).not.toContain('Frontend Python Sidecar');
    expect(memorySystem).not.toContain('The sidecar stores memory');
    expect(memorySystem).not.toContain('passes embeddings to the sidecar');
    expect(memorySystem).not.toContain('sidecar JSON-RPC envelope');
    expect(memoryDocText).toContain('desktop UI, local-runtime memory store, and hosted backend');
    expect(memoryDocText).toContain('current backing implementation runs in the\nlocal-runtime Python implementation');
    expect(memoryDocText).not.toContain('desktop/backend runtime');
    expect(memoryDocText).not.toContain('current backing implementation runs in the Python\nsidecar');
  });

  test('core architecture flow docs avoid mojibake in debug paths', async () => {
    const docs = await Promise.all([
      read('docs/architecture/communication_flow.md'),
      read('docs/architecture/memory_system.md'),
      read('docs/frontend/inventory/domains/frontend_domain_ownership_matrix_reference.md'),
    ]);
    const mojibakeMarkers = [0x00e2, 0x00c3, 0xfffd].map((code) =>
      String.fromCharCode(code),
    );

    for (const source of docs) {
      for (const marker of mojibakeMarkers) {
        expect(source).not.toContain(marker);
      }
    }
  });

  test('runtime trace and transcript docs describe stores through local runtime boundary', async () => {
    const docs = await Promise.all([
      read('docs/debug/runtime_traces.md'),
      read('docs/architecture/frontend_architecture.md'),
      read('docs/architecture/storage_persistence_change_workflow.md'),
      read('docs/frontend/contracts/memory_ipc_and_rpc_mapping_reference.md'),
      read('docs/frontend/contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md'),
      read('docs/frontend/renderer/dashboard_memory_management_and_resume_reference.md'),
      read('docs/frontend/renderer/transcript_session_and_rehydrate_reference.md'),
      read('docs/frontend/sidecar/local_backend_jsonrpc_reference.md'),
      read('docs/memory/README.md'),
      read('docs/memory/memory_change_workflow.md'),
      read('docs/memory/session_conversation_identity_change_workflow.md'),
      read('docs/memory/transcript_and_replay.md'),
      read('docs/memory/transcript_replay_change_workflow.md'),
      read('docs/operations/release_packaging_change_workflow.md'),
      read('docs/platforms/platform_change_workflow.md'),
      read('docs/platforms/packaging_runtime_matrix.md'),
      read('docs/reference/code_change_surface_index.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('local-runtime-backed `LocalRuntimeConversationStore`');
    expect(docText).toContain('local-runtime-backed chat-event store');
    expect(docText).toContain('local-runtime-backed store adapters');
    expect(docText).toContain('local-runtime-backed local tool');
    expect(docText).toContain('SDK/local-runtime camelCase to Python JSON-RPC snake_case conversions include');
    expect(docText).toContain('then calls local-runtime\n`store_memory_by_embedding`');
    expect(docText).toContain('SDK local-runtime store params sent to the local runtime');
    expect(docText).toContain('SDK then called local-runtime `store_memory_by_embedding`');
    expect(docText).toContain('canonical local-runtime events');
    expect(docText).toContain('SDK/local-runtime replay path does not write hidden replay rows');
    expect(docText).toContain('local-runtime backend-config tests');
    expect(docText).toContain('local-runtime conversation_events rows');
    expect(docText).toContain('local-runtime event store path');
    expect(docText).toContain('returns sanitized search metadata');
    expect(docText).toContain('SDK backend-event handling and main fan-out');
    expect(docText).toContain('Renderer SDK conversation-event consumption');
    expect(docText).toContain('SDK-normalized conversation events, current-turn projections');
    expect(docText).toContain('live-turn app-runtime client and SDK command path');
    expect(docText).toContain('renderer app-runtime continuity service');
    expect(docText).not.toContain('WindieOS SDK-backed transcript projections');
    expect(docText).not.toContain('Memory hub for ' + 'Windie' + 'OS transcript persistence');
    expect(docText).not.toContain('Windie' + 'OS has several memory-like systems');
    expect(docText).not.toContain('Workflow for changing ' + 'Windie' + 'OS transcript');
    expect(docText).not.toContain('Windie' + 'OS has multiple memory systems');
    expect(docText).not.toContain('Windie' + 'OS transcript replay is related to memory');
    expect(docText).not.toContain('sidecar-backed');
    expect(docText).not.toContain('canonical sidecar events');
    expect(docText).not.toContain('canonical sidecar chat-event log');
    expect(docText).not.toContain('canonical sidecar `conversation_events`');
    expect(docText).not.toContain('sidecar event store path');
    expect(docText).not.toContain('sidecar transcript storage');
    expect(docText).not.toContain('sidecar backend-config tests');
    expect(docText).not.toContain('SDK/local-runtime camelCase to sidecar snake_case conversions include');
    expect(docText).not.toContain('then calls sidecar\n`store_memory_by_embedding`');
    expect(docText).not.toContain('SDK local-runtime store params sent to the sidecar');
    expect(docText).not.toContain('SDK then called sidecar `store_memory_by_embedding`');
    expect(docText).not.toContain('desktop runtime does not write hidden replay rows');
    expect(docText).not.toContain('Electron relay | `src/main/ipc.cjs`');
    expect(docText).not.toContain('Backend receive and renderer broadcast logs');
    expect(docText).not.toContain('Before/after event handling and workspace state');
  });

  test('renderer runtime docs describe local tool execution through SDK local runtime', async () => {
    const docs = await Promise.all([
      read('docs/channels/README.md'),
      read('docs/channels/sidecar_and_tool_channels.md'),
      read('docs/channels/channel_routing_matrix.md'),
      read('docs/channels/websocket_event_contract_change_workflow.md'),
      read('docs/cli/validation_commands.md'),
      read('docs/debug/error_failure_change_workflow.md'),
      read('docs/debug/test_selection.md'),
      read('docs/development/agent_architecture_reference.md'),
      read('docs/README.md'),
      read('docs/frontend/README.md'),
      read('docs/frontend/contracts/ipc_channels_and_event_contracts.md'),
      read('docs/frontend/contracts/backend_event_consumer_matrix_reference.md'),
      read('docs/frontend/inventory/frontend_full_functionality_inventory_reference.md'),
      read('docs/frontend/runtime/tool_execution_and_streaming.md'),
      read('docs/frontend/renderer/chat_stream_and_tool_execution_reference.md'),
      read('docs/frontend/renderer/chat/chat_attachment_change_workflow.md'),
      read('docs/frontend/renderer/chat/message_send_surface_policy_and_screenshot_capture_reference.md'),
      read(
        'docs/frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md',
      ),
      read('docs/frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md'),
      read('docs/frontend/renderer/renderer_state_change_workflow.md'),
      read('docs/frontend/renderer/settings/settings_surface_change_workflow.md'),
      read('docs/frontend/renderer/transcript_session_and_rehydrate_reference.md'),
      read('docs/getting-started/docs_hub.md'),
      read('docs/operations/evidence_collection_runbook.md'),
      read('docs/frontend/local_runtime_tool_change_workflow.md'),
      read(
        'docs/frontend/renderer/providers/entrypoint_view_routing_and_provider_stack_reference.md',
      ),
      read(
        'docs/frontend/renderer/providers/contexts/chat_provider_bootstrap_flag_contract_reference.md',
      ),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('SDK local runtime');
    expect(docText).toContain('SDK/main local runtime');
    expect(docText).toContain('SDK/main local-runtime execution, local-runtime Python implementation');
    expect(docText).toContain('SDK tool coordinator uses request ids');
    expect(docText).toContain('renderer stream tracking uses `turn_ref` + stream phase');
    expect(docText).toContain(
      'AgentSdkConversationRuntime LocalRuntimeExecuteToolRuntime ToolOutputMessageState ToolCallMessageState',
    );
    expect(docText).toContain('SDK stream projection consumption, tool display');
    expect(docText).toContain('SDK projection event type, tool display state');
    expect(docText).toContain('chat stream projections, tool display');
    expect(docText).toContain('SDK result envelope and renderer tool display');
    expect(docText).toContain('SDK result envelope builder');
    expect(docText).toContain('SDK tool coordination');
    expect(docText).toContain('local runtime daemon startup/reuse');
    expect(docText).toContain('local-runtime `read_file` behavior');
    expect(docText).toContain('local-runtime/native result');
    expect(docText).toContain('Electron/local-runtime browser runtime');
    expect(docText).toContain('renderer app-runtime facade');
    expect(docText).toContain('renderer app runtime uses `ConversationContinuityService`');
    expect(docText).toContain('SDK desktop transport adapter maps');
    expect(docText).not.toContain('SDK desktop runtime');
    expect(docText).not.toContain('SDK agent runtime');
    expect(docText).not.toContain('tool runner uses `turn_ref`');
    expect(docText).not.toContain('Tool runner/result dispatch');
    expect(docText).not.toContain('ChatProvider` tool runner');
    expect(docText).not.toContain('tool runner/transcript flags');
    expect(docText).not.toContain('stream event consumption, tool runner');
    expect(docText).not.toContain('tool runner state');
    expect(docText).not.toContain('ToolRunnerHook.events.test.ts');
    expect(docText).not.toContain('frontend `ToolRunner`');
    expect(docText).not.toContain('Renderer tool failure UI/persistence');
    expect(docText).not.toContain('ToolRunnerFailureContracts ToolExecutionResultDispatch ToolResultEnvelope');
    expect(docText).not.toContain('chat stream, tool runner');
    expect(docText).not.toContain('frontend executable tools');
    expect(docText).not.toContain('Tool result envelope |');
    expect(docText).not.toContain('ToolResultEnvelope.test.ts');
    expect(docText).not.toContain('ToolResultContractParity.test.ts');
    expect(docText).not.toContain('`ToolResultEnvelope`');
    expect(docText).not.toContain('chat stream + tool runner hooks');
    expect(docText).not.toContain('websocket loop, tool runner');
    expect(docText).not.toContain('remaining endpoint/install-auth/session lifecycle wiring');
    expect(docText).not.toContain('keeps install-auth identity state through');
    expect(docText).not.toContain('ipc.cjs` keeps the latest pending-turn cache');
    expect(docText).not.toContain('ipc.cjs` keeps the Agent SDK host state and MCP startup');
    expect(docText).not.toContain('routes tool events to the sidecar daemon');
    expect(docText).not.toContain('through Electron main and the sidecar daemon');
    expect(docText).not.toContain('before sidecar execution');
    expect(docText).not.toContain('sidecar daemon startup/reuse');
    expect(docText).not.toContain('Python sidecar daemon execution');
    expect(docText).not.toContain('main-process SDK runtime and sidecar');
    expect(docText).not.toContain('sidecar `read_file`');
    expect(docText).not.toContain('sidecar/native result');
    expect(docText).not.toContain('Electron/sidecar browser runtime');
    expect(docText).not.toContain('Confirm sidecar deletes only the intended local store records');
    expect(docText).not.toContain('The desktop runtime uses `ConversationContinuityService`');
    expect(docText).not.toContain('desktop runtime facade');
    expect(docText).not.toContain('desktop runtime facades');
    expect(docText).not.toContain('desktop runtime clients');
    expect(docText).not.toContain('desktop runtime adapters');
    expect(docText).not.toContain('desktop runtime transport maps that SDK command');
    expect(docText).not.toContain('desktop live-turn runtime');
    expect(docText).not.toContain('desktop continuity service');
    expect(docText).not.toContain('Desktop runtime clients and SDK command facades');
    expect(docText).not.toContain('desktop live-turn runtime facade');
    expect(docText).not.toContain('desktop continuity runtime');
    expect(docText).not.toContain('renderer runtime facade');
    expect(docText).not.toContain('renderer runtime facades');
    expect(docText).not.toContain('desktop voice runtime facade');
  });

  test('runtime routing docs use Agent SDK boundary wording', async () => {
    const runtimeBoundaryDocs = [
      'docs/architecture/frontend_architecture.md',
      'docs/concepts/streaming_and_events.md',
      'docs/backend/api/http_and_ws_endpoint_reference.md',
      'docs/README.md',
      'docs/debug/README.md',
      'docs/debug/process_health_checklist.md',
      'docs/debug/symptom_playbooks.md',
      'docs/development/agent_architecture_reference.md',
      'docs/channels/websocket_event_contract_change_workflow.md',
      'docs/development/agent_routing_quick_cards.md',
      'docs/getting-started/docs_hub.md',
      'docs/frontend/ipc_change_workflow.md',
      'docs/frontend/contracts/ipc_channel_and_handler_reference.md',
      'docs/frontend/inventory/frontend_functionality_capability_catalog_reference.md',
      'docs/frontend/main/electron_main_and_ipc.md',
      'docs/frontend/main/ipc_helper_module_split_and_runtime_boundary_reference.md',
      'docs/frontend/main/query_payload_and_relay_reference.md',
      'docs/frontend/runtime/audio_chunk_playback_and_stop_semantics_reference.md',
      'docs/frontend/renderer/chat_stream_and_tool_execution_reference.md',
      'docs/frontend/renderer/desktop_runtime_transport_command_contract_reference.md',
      'docs/frontend/renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md',
      'docs/frontend/renderer/providers/app_provider_coordinator_and_save_status_runtime_reference.md',
      'docs/frontend/renderer/renderer_runtime.md',
      'docs/frontend/renderer/renderer_state_change_workflow.md',
      'docs/frontend/sidecar/browser_automation_stack.md',
      'docs/sdk/hosted_backend_clients.md',
      'docs/nodes/desktop_and_sidecar_node.md',
      'docs/nodes/runtime_node_matrix.md',
      'docs/reference/code_change_surface_index.md',
      'docs/reference/session_and_transcript_reference.md',
      'docs/reference/websocket_event_reference.md',
      'docs/tools/filesystem_shell_change_workflow.md',
      'docs/tools/tool_execution_lifecycle.md',
      'docs/tools/tool_schema_policy_change_workflow.md',
      'docs/tools/tool_troubleshooting.md',
      'src/renderer/folder_structure.md',
    ];
    const docText = (await Promise.all(runtimeBoundaryDocs.map((path) => read(path)))).join('\n');

    expect(docText).toContain('Agent SDK runtime');
    expect(docText).toContain('Agent SDK tool');
    expect(docText).toContain('SDK projection channels, typed backend side-channel events');
    expect(docText).toContain('Agent SDK normalization/projection path, and typed Electron fan-out channel');
    expect(docText).toContain('SDK transport/projection, typed fan-out channel');
    expect(docText).toContain('Agent SDK runtime receives the hosted backend WebSocket event');
    expect(docText).toContain('SDK projection events and typed backend side-channel events are consumed');
    expect(docText).toContain('SDK desktop transport adapter maps');
    expect(docText).toContain('shared SDK desktop transport pending-turn');
    expect(docText).toContain('SDK desktop transport channel names');
    expect(docText).toContain('SDK Desktop Transport Command Contract Reference');
    expect(docText).toContain('Client-to-backend transcription messages');
    expect(docText).toContain('renderer transcript/history side-effect handlers consume SDK conversation');
    expect(docText).toContain('agent display name');
    expect(docText).toContain('3. LOCAL-RUNTIME EXECUTION');
    expect(docText).not.toContain('???   ???   ?????????');
    expect(docText).not.toContain('SDK agent runtime');
    expect(docText).not.toContain('SDK agent-runtime');
    expect(docText).not.toContain('SDK agent runtime concern');
    expect(docText).not.toContain('SDK agent host');
    expect(docText).not.toContain('SDK agent startup');
    expect(docText).not.toContain('SDK agent connection');
    expect(docText).not.toContain('direct SDK agent');
    expect(docText).not.toContain('SDK agent ->');
    expect(docText).not.toContain('SDK agent/conversation runtime');
    expect(docText).not.toContain('SDK agent stream-event module');
    expect(docText).not.toContain('public SDK agent APIs');
    expect(docText).not.toContain('SDK agent name');
    expect(docText).not.toContain('SDK main runtime');
    expect(docText).not.toContain('SDK/main runtime');
    expect(docText).not.toContain('through backend, SDK/main runtime, sidecar');
    expect(docText).not.toContain('main runtime prepares the desktop surface');
    expect(docText).not.toContain('current non-dashboard main runtime');
    expect(docText).not.toContain('backend event consumers via main rebroadcast');
    expect(docText).not.toContain('Electron rebroadcast path');
    expect(docText).not.toContain('Electron rebroadcast, renderer guards');
    expect(docText).not.toContain('Electron rebroadcast, and renderer guards');
    expect(docText).not.toContain('transport rebroadcast');
    expect(docText).not.toContain('Electron main rebroadcast');
    expect(docText).not.toContain('Windie' + 'OS streaming');
    expect(docText).not.toContain('Windie' + 'OS websocket streaming events');
    expect(docText).not.toContain('Windie' + 'OS event names');
    expect(docText).not.toContain('Main process receives WebSocket event');
    expect(docText).not.toContain('Which renderer modules consume each `from-backend` event type');
    expect(docText).not.toContain('Sub-hub for `from-backend` event ingress typing boundaries');
    expect(docText).not.toContain('Main-process rebroadcast path, typed event-guard limits');
    expect(docText).not.toContain('`from-backend` events are consumed by the expected listener');
    expect(docText).not.toContain('Renderer-to-backend messages');
    expect(docText).not.toContain('Backend-to-renderer messages');
    expect(docText).not.toContain('renderer backend-wire stream handlers');
    expect(docText).not.toContain('renderer backend-wire handlers should not build duplicate');
    expect(docText).not.toContain('3. SIDECAR EXECUTION');
    expect(docText).not.toContain('Frontend/sidecar owner');
    expect(docText).not.toContain('Frontend-owned payloads:');
    expect(docText).not.toContain('Sidecar-owned payloads:');
    expect(docText).not.toContain('The desktop runtime transport maps');
    expect(docText).not.toContain('Desktop Runtime Transport Command Contract Reference');
    expect(docText).not.toContain('the desktop runtime transport adapter maps');
    expect(docText).not.toContain('desktop runtime transport\nadapter');
    expect(docText).not.toContain('desktop runtime transport\n  typed chat IPC payload shape');
    expect(docText).not.toContain('shared desktop runtime pending-turn');
    expect(docText).not.toContain('desktop runtime channel names directly');
  });

  test('renderer settings docs use renderer-local presentation wording', async () => {
    const source = (
      await Promise.all([
        read(
          'docs/frontend/renderer/settings/sections/settings_section_tabs_and_wakeword_toggle_runtime_reference.md',
        ),
        read('docs/frontend/renderer/settings/settings_surface_change_workflow.md'),
      ])
    ).join('\n');

    expect(source).toContain('renderer-local theme editor values');
    expect(source).not.toContain('frontend-local theme');
    expect(source).not.toContain('local-runtime-owned');
  });

  test('frontend architecture docs route tool prep through local execution wording', async () => {
    const docs = await Promise.all([
      read('docs/architecture/frontend_architecture.md'),
      read('docs/architecture/communication_flow.md'),
      read('docs/architecture/tool_system.md'),
      read('docs/architecture/failure_domain_map.md'),
      read('docs/architecture/data_flow_and_state_ownership.md'),
      read('docs/backend/api/runs_route_and_vm_control_service_reference.md'),
      read('docs/frontend/inventory/frontend_capability_to_file_matrix_reference.md'),
      read('docs/frontend/inventory/domains/frontend_domain_ownership_matrix_reference.md'),
      read('docs/frontend/inventory/frontend_full_functionality_inventory_reference.md'),
      read('docs/frontend/inventory/protocols/frontend_ipc_and_local_backend_protocol_surface_matrix_reference.md'),
      read('docs/frontend/main/local_backend/process_lifecycle_change_workflow.md'),
      read('docs/frontend/main/window_and_overlay_lifecycle.md'),
      read('docs/frontend/main/display_affinity_runtime_monitor_selection_and_screenshot_bounds_reference.md'),
      read('docs/frontend/main/main_process_lifecycle_overlay_ipc_and_window_visibility_runtime_reference.md'),
      read('docs/frontend/main/overlays/external_focus_snapshot_restore_and_query_capture_reference.md'),
      read('docs/frontend/main/main_process_change_workflow.md'),
      read('docs/frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md'),
      read('docs/frontend/main/local_backend/windows/window_resolver_shapes_and_linux_screenshot_hide_restore_orchestration_reference.md'),
      read('docs/frontend/renderer/app_startup_onboarding_change_workflow.md'),
      read('docs/frontend/sidecar/local_backend_process_lifecycle_reference.md'),
      read('docs/frontend/renderer/renderer_state_change_workflow.md'),
      read('docs/frontend/renderer/infrastructure/conversation_transcript_loader_and_display_bounds_storage_reference.md'),
      read('docs/frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md'),
      read('docs/platforms/window_input_matrix.md'),
      read('docs/platforms/platform_change_workflow.md'),
      read('docs/platforms/platform_validation_matrix.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('SDK/main local execution');
    expect(docText).toContain('SDK local-runtime bridge behavior');
    expect(docText).toContain('local tool calls to local-runtime execution');
    expect(docText).toContain('before local execution');
    expect(docText).toContain('SDK/local-runtime conversation store owns durable conversation history');
    expect(docText).toContain('renderer app-runtime send facade plus the Electron main agent host');
    expect(docText).toContain('Local-runtime Python implementation (tools, memory, system, browser)');
    expect(docText).toContain('synthetic SDK-normalized `web_search`');
    expect(docText).not.toContain('main-to-sidecar behavior');
    expect(docText).not.toContain('SDK sidecar `/rpc` failures');
    expect(docText).not.toContain('depends on the sidecar');
    expect(docText).not.toContain('sidecar daemon/local executor');
    expect(docText).not.toContain('sidecar execution');
    expect(docText).not.toContain('before sidecar execution');
    expect(docText).not.toContain('local tool calls to the sidecar runtime');
    expect(docText).not.toContain('Sidecar runtime (tools, memory, system, browser)');
    expect(docText).not.toContain('frontend + sidecar local store own conversation history');
    expect(docText).not.toContain('renderer API client');
    expect(docText).not.toContain('visible WindieOS surfaces');
    expect(docText).not.toContain('WindieOS surface');
    expect(docText).not.toContain('WindieOS windows');
    expect(docText).not.toContain('WindieOS overlay/main windows');
    expect(docText).not.toContain('Workflow for changing WindieOS SDK-owned local-runtime daemon lifecycle');
    expect(docText).not.toContain('synthetic Windie `web_search`');
    expect(docText).not.toContain('Windie-normalized history');
    expect(docText).not.toContain('synthetic paired Windie `web_search`');
    expect(docText).not.toContain('implemented in Electron main runtime');
    expect(docText).not.toContain('| Electron main runtime |');
    expect(docText).not.toContain('into main runtime state');
  });

  test('architecture docs route renderer IPC through SDK commands and typed event fan-out', async () => {
    const docs = await Promise.all([
      read('docs/architecture/architecture.md'),
      read('docs/architecture/communication_flow.md'),
      read('docs/frontend/ipc_change_workflow.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('`windie:invoke`: Renderer -> Electron main SDK command bridge');
    expect(docText).toContain('`windie:conversation-event`: SDK-normalized conversation side-effect events');
    expect(docText).toContain('Electron Main / Agent Host');
    expect(docText).toContain('Electron Agent Host');
    expect(docText).not.toContain('Agent SDK Host');
    expect(docText).toContain('Agent SDK runtime -> WebSocket -> Backend');
    expect(docText).toContain('Runtime Clients');
    expect(docText).toContain('SDK command facades');
    expect(docText).toContain('Inspect `windie:invoke` SDK commands, typed SDK/backend-event fan-out');
    expect(docText).toMatch(/typed\s+backend side-channel event fan-out/);
    expect(docText).not.toContain('**API Client**: Typed API client for backend communication');
    expect(docText).not.toContain('`to-backend`: Renderer');
    expect(docText).not.toContain('`from-backend`: Backend');
    expect(docText).not.toContain('**`from-backend`**');
    expect(docText).not.toContain('Receive messages from backend and local query-mirror events');
    expect(docText).not.toContain('remaining non-chat `to-backend` send path');
    expect(docText).not.toContain('WebSocket Client');
    expect(docText).not.toContain('Main Process -> WebSocket -> Backend');
    expect(docText).not.toContain('Main Process → WebSocket → Backend');
  });

  test('channel docs route desktop chat through the Agent SDK runtime', async () => {
    const docs = await Promise.all([
      read('docs/channels/README.md'),
      read('docs/channels/channel_routing_matrix.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('renderer SDK command -> Electron agent host -> Agent SDK backend transport -> backend `/ws`');
    expect(docText).toContain('overlay renderer SDK command -> Electron agent host -> Agent SDK backend transport -> backend `/ws`');
    expect(docText).toContain('overlay renderer `windie:invoke` command `conversation.send` -> Electron main agent host -> Agent SDK backend transport -> `/ws` `query`');
    expect(docText).toContain('SDK command path or backend websocket');
    expect(docText).not.toContain('renderer -> Electron IPC -> backend `/ws`');
    expect(docText).not.toContain('overlay renderer -> Electron IPC -> backend `/ws`');
    expect(docText).not.toContain('overlay renderer IPC -> Electron main -> `/ws` `query`');
    expect(docText).not.toContain('desktop IPC or `/ws`');
  });

  test('local runtime conversation store keeps diagnostic collection naming generic', async () => {
    const source = await read('packages/windie-sdk-js/src/stores/LocalRuntimeConversationStore.ts');

    expect(source).toContain('const localRuntimeEvents');
    expect(source).not.toContain('sidecarEvents');
    expect(source).not.toContain("producerSource === 'sidecar'");
  });

  test('tool and security docs describe local tools through local runtime boundary', async () => {
    const docs = await Promise.all([
      read('docs/architecture/backend_architecture.md'),
      read('docs/architecture/agent_visible_data_pipeline.md'),
      read('docs/architecture/storage_persistence_change_workflow.md'),
      read('docs/channels/README.md'),
      read('docs/channels/sidecar_and_tool_channels.md'),
      read('docs/concepts/agent_loop.md'),
      read('docs/concepts/prompt_and_tool_context.md'),
      read('docs/concepts/safety_boundaries.md'),
      read('docs/debug/runtime_traces.md'),
      read('docs/desktop/artifact_change_workflow.md'),
      read('docs/backend/agent/tool_turn_change_workflow.md'),
      read('docs/development/agent_architecture_reference.md'),
      read('docs/development/agent_development_workflow.md'),
      read('docs/development/agent_routing_quick_cards.md'),
      read('docs/development/agent_runtime_ownership_and_change_routing.md'),
      read('docs/development/README.md'),
      read('docs/development/test_failure_triage.md'),
      read('docs/development/mcp.md'),
      read('docs/development/extensions.md'),
      read('docs/development/tool_development.md'),
      read('docs/frontend/ipc_change_workflow.md'),
      read('docs/frontend/inventory/domains/frontend_change_path_playbook_reference.md'),
      read('docs/frontend/inventory/protocols/state/frontend_protocol_session_and_conversation_state_propagation_reference.md'),
      read('docs/frontend/main/local_backend/rpc_handler_registry_and_payload_mapper_reference.md'),
      read('docs/frontend/renderer/infrastructure/tool_execution_backend_envelope_builder_and_payload_gating_reference.md'),
      read('docs/frontend/renderer/renderer_state_change_workflow.md'),
      read('docs/frontend/local_runtime_tool_change_workflow.md'),
      read('docs/frontend/sidecar/local_runtime_python_change_workflow.md'),
      read('docs/frontend/sidecar/tool_catalog_and_execution_model.md'),
      read('docs/frontend/sidecar/sidecar_daemon_runtime_reference.md'),
      read('docs/gateway/gateway_troubleshooting.md'),
      read('docs/gateway/websocket_connection_lifecycle.md'),
      read('docs/getting-started/docs_directory.md'),
      read('docs/getting-started/docs_hub.md'),
      read('docs/help/diagnostics.md'),
      read('docs/memory/memory_change_workflow.md'),
      read('docs/plugins/README.md'),
      read('docs/plugins/current_vs_future_plugin_boundary.md'),
      read('docs/plugins/extension_surface_matrix.md'),
      read('docs/README.md'),
      read('docs/reference/code_change_surface_index.md'),
      read('docs/reference/openclaw_docs_structure_reference.md'),
      read('docs/reference/session_and_transcript_reference.md'),
      read('docs/tools/README.md'),
      read('docs/tools/tool_troubleshooting.md'),
      read('docs/tools/tool_schema_policy_change_workflow.md'),
      read('docs/tools/tool_policy_profiles_and_capabilities.md'),
      read('docs/tools/tool_contracts.md'),
      read('docs/tools/tool_catalog_matrix.md'),
      read('docs/tools/tool_execution_lifecycle.md'),
      read('docs/tools/filesystem_shell.md'),
      read('docs/tools/filesystem_shell_change_workflow.md'),
      read('docs/tools/web_search.md'),
      read('docs/tools/browser.md'),
      read('docs/tools/computer.md'),
      read('docs/sdk/conversation_runtime.md'),
      read('docs/security/README.md'),
      read('docs/operations/security.md'),
      read('docs/security/security_boundary_matrix.md'),
      read('docs/security/security_change_playbook.md'),
      read('docs/security/permissions_and_local_authority_workflow.md'),
      read('docs/architecture/extension_points.md'),
    ]);
    const docText = docs.join('\n');
    const toolRoutingDocText = (await Promise.all([
      read('docs/adr/005-frontend-tool-schema-source-of-truth.md'),
      read('docs/architecture/agent_system.md'),
      read('docs/architecture/backend_architecture.md'),
      read('docs/architecture/python_sidecar.md'),
      read('docs/architecture/agent_visible_data_pipeline.md'),
      read('docs/architecture/tool_system.md'),
      read('docs/backend/agent/tool_turn_change_workflow.md'),
      read('docs/backend/llm/prompts/prompt_context_change_workflow.md'),
      read('docs/backend/tools/browser/browser_remote_schema_surface_reference.md'),
      read('docs/backend/tools/local_runtime_tool_bridge_and_policy.md'),
      read('docs/backend/tools/registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md'),
      read('docs/backend/tools/remote/remote_tool_domain_payload_and_request_id_semantics_reference.md'),
      read('docs/channels/channel_routing_matrix.md'),
      read('docs/channels/sidecar_and_tool_channels.md'),
      read('docs/concepts/agent_loop.md'),
      read('docs/concepts/prompt_and_tool_context.md'),
      read('docs/concepts/safety_boundaries.md'),
      read('docs/cli/validation_commands.md'),
      read('docs/debug/runtime_traces.md'),
      read('docs/development/agent_architecture_reference.md'),
      read('docs/development/agent_routing_quick_cards.md'),
      read('docs/development/agent_runtime_ownership_and_change_routing.md'),
      read('docs/development/extensions.md'),
      read('docs/development/mcp.md'),
      read('docs/development/tool_development.md'),
      read('docs/README.md'),
      read('docs/frontend/renderer/renderer_state_change_workflow.md'),
      read('docs/frontend/local_runtime_tool_change_workflow.md'),
      read('docs/frontend/sidecar/README.md'),
      read('docs/frontend/sidecar/sidecar_daemon_runtime_reference.md'),
      read('docs/frontend/sidecar/local_runtime_python_change_workflow.md'),
      read('docs/frontend/sidecar/local_backend_jsonrpc_change_workflow.md'),
      read('docs/frontend/sidecar/tool_catalog_and_execution_model.md'),
      read('docs/frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md'),
      read('docs/gateway/websocket_connection_lifecycle.md'),
      read('docs/getting-started/docs_directory.md'),
      read('docs/getting-started/docs_hub.md'),
      read('docs/help/diagnostics.md'),
      read('docs/memory/memory_change_workflow.md'),
      read('docs/plugins/extension_surface_matrix.md'),
      read('docs/reference/openclaw_docs_structure_reference.md'),
      read('docs/reference/session_and_transcript_reference.md'),
      read('docs/security/README.md'),
      read('docs/operations/security.md'),
      read('docs/security/security_boundary_matrix.md'),
      read('docs/security/security_change_playbook.md'),
      read('docs/tools/README.md'),
      read('docs/tools/tool_troubleshooting.md'),
      read('docs/tools/tool_schema_policy_change_workflow.md'),
      read('docs/tools/tool_policy_profiles_and_capabilities.md'),
      read('docs/tools/tool_contracts.md'),
      read('docs/tools/tool_execution_lifecycle.md'),
      read('docs/tools/tool_catalog_matrix.md'),
      read('docs/tools/filesystem_shell.md'),
      read('docs/tools/filesystem_shell_change_workflow.md'),
      read('docs/tools/web_search.md'),
      read('docs/web/landing_page_change_workflow.md'),
      read('docs/tools/browser.md'),
      read('docs/tools/computer.md'),
      read('docs/sdk/conversation_runtime.md'),
      read('docs/architecture/extension_points.md'),
    ])).join('\n');
    const toolAuthoringRegistryDocText = (await Promise.all([
      read('docs/development/mcp.md'),
      read('docs/development/tool_development.md'),
      read('docs/frontend/sidecar/local_backend_jsonrpc_change_workflow.md'),
      read('docs/tools/tool_catalog_matrix.md'),
    ])).join('\n');
    const toolPolicyValidationDocText = (await Promise.all([
      read('docs/development/validation_matrix.md'),
      read('docs/tools/tool_policy_profiles_and_capabilities.md'),
    ])).join('\n');
    const localRuntimePayloadDocText = (await Promise.all([
      read('docs/architecture/agent_visible_data_pipeline.md'),
      read('docs/architecture/storage_persistence_change_workflow.md'),
      read('docs/backend/agent/tool_turn_change_workflow.md'),
      read('docs/frontend/contracts/ipc_channel_and_handler_reference.md'),
      read('docs/frontend/ipc_change_workflow.md'),
      read('docs/frontend/inventory/domains/frontend_change_path_playbook_reference.md'),
      read('docs/frontend/inventory/protocols/state/frontend_protocol_session_and_conversation_state_propagation_reference.md'),
      read('docs/frontend/main/local_backend/rpc_handler_registry_and_payload_mapper_reference.md'),
      read('docs/security/permissions_and_local_authority_workflow.md'),
      read('docs/tools/tool_troubleshooting.md'),
      read('docs/tools/tool_schema_policy_change_workflow.md'),
    ])).join('\n');
    const browserToolOverviewText = (await Promise.all([
      read('docs/tools/README.md'),
      read('docs/tools/browser.md'),
    ])).join('\n');
    const browserRouteDocText = (await Promise.all([
      read('docs/README.md'),
      read('docs/browser/README.md'),
      read('docs/getting-started/docs_hub.md'),
    ])).join('\n');
    const runtimeTraceText = await read('docs/debug/runtime_traces.md');
    const architectureToolSystemText = await read('docs/architecture/tool_system.md');
    const architectureOverviewText = (await Promise.all([
      read('docs/architecture/architecture.md'),
      read('docs/architecture/backend_architecture.md'),
    ])).join('\n');

    expect(docText).toContain('client/local-runtime tool');
    expect(docText).toContain('local-runtime executable tool');
    expect(docText).toContain('local-runtime plugins under `plugins/*/plugin.json`');
    expect(docText).toContain('local-runtime plugin tools');
    expect(docText).toContain('execute through the SDK local runtime');
    expect(docText).toContain('SDK local-runtime tools');
    expect(docText).toContain('Agent SDK/local-runtime manifest');
    expect(docText).toContain('Local Runtime Plugin Tool Registration');
    expect(docText).toContain('SDK local runtime/local executor');
    expect(docText).toContain('local execution contracts');
    expect(docText).toContain('SDK/main local execution');
    expect(docText).toContain('local-runtime result');
    expect(docText).toContain('local-runtime executable args/result');
    expect(docText).toContain('executable local-runtime payload');
    expect(docText).toContain('local-runtime validation');
    expect(docText).toContain('SDK local runtime');
    expect(docText).toContain('local-runtime MCP discovery');
    expect(docText).toContain('local-runtime MCP registration');
    expect(docText).toContain('local-runtime MCP `tools/call` execution');
    expect(docText).toContain('Local-runtime Python tool implementation');
    expect(docText).toContain('local-runtime registry dispatch backed by Python modules');
    expect(docText).toContain('backend/local-runtime contracts');
    expect(docText).toContain('SDK/main local-runtime migration');
    expect(docText).toContain('local-runtime transcript store backed by local-runtime Python modules');
    expect(docText).toContain('SDK/main local-runtime dispatch, local-runtime executable registry implementation');
    expect(docText).toContain('local-runtime Python tests for implementation parity');
    expect(docText).toContain('The local runtime owns local tool execution');
    expect(docText).toContain('Local runtime implementation');
    expect(docText).toContain('backend/renderer/local-runtime change routing');
    expect(docText).toContain('Local Runtime Python Implementation Docs Hub');
    expect(docText).toContain('Local-runtime boundaries should');
    expect(docText).toContain('Tool Policy or Local-Runtime Execution');
    expect(docText).toContain('Local-Runtime Python Tools');
    expect(docText).toContain('SDK/main local-runtime dispatch');
    expect(docText).toContain('Electron main agent host');
    expect(docText).toContain('SDK backend transport traces');
    expect(docText).toContain('Tool result reaches SDK/main but model does not continue');
    expect(docText).toContain('SDK tool-result relay plus backend tool-result ingestion/waiting/processing modules');
    expect(architectureToolSystemText).toContain('Client Manifest + Local Runtime');
    expect(architectureToolSystemText).toContain('Electron client manifest builder');
    expect(architectureToolSystemText).toContain('local-runtime exposed-tool parity');
    expect(architectureToolSystemText).toContain('client/local-runtime and backend schema pairing');
    expect(architectureOverviewText).toContain('renderer UI, Electron main agent host, SDK local runtime');
    expect(architectureOverviewText).toContain('SDK local runtime backed by the local-runtime Python implementation');
    expect(architectureOverviewText).toContain('Local-runtime Python implementation executes local tools');
    expect(architectureOverviewText).toContain('Electron Agent Host + SDK Runtime');
    expect(architectureOverviewText).not.toContain('Desktop Client / SDK Host');
    expect(architectureOverviewText).toContain('Sanitized message sent to SDK/renderer consumers');
    expect(architectureOverviewText).toContain('not enforced in the local-runtime Python implementation by default');
    expect(architectureOverviewText).toContain('SDK local-runtime memory backed by local-runtime Python modules');
    expect(runtimeTraceText).toContain('## Local-Runtime Python JSON-RPC Trace');
    expect(runtimeTraceText).toContain('Local-runtime Python protocol');
    expect(browserToolOverviewText).toContain('local-runtime execution, local-runtime Python adapters');
    expect(browserRouteDocText).toContain('local-runtime execution, local-runtime Python adapters');
    expect(docText).not.toContain('SDK desktop agent');
    expect(docText).not.toContain(`SDK desktop-${'agent'}`);
    expect(docText).not.toContain('frontend/sidecar-owned local schemas');
    expect(docText).not.toContain('frontend manifest builder tests');
    expect(docText).not.toContain(
      'frontend/sidecar owns built-in local tool schemas',
    );
    expect(docText).not.toContain('client-local sidecar tool');
    expect(docText).not.toContain('built-in sidecar tools');
    expect(docText).not.toContain('sidecar plugins under `plugins/*/plugin.json`');
    expect(docText).not.toContain('local sidecar tools');
    expect(docText).not.toContain('local sidecar execution');
    expect(docText).not.toContain('SDK/sidecar local runtime');
    expect(docText).not.toContain('The sidecar starts each enabled MCP server');
    expect(docText).not.toContain('The sidecar sends MCP');
    expect(docText).not.toContain('The sidecar calls `tools/list`');
    expect(docText).not.toContain('the sidecar calls the entrypoint');
    expect(docText).not.toContain('backend/renderer/sidecar change routing');
    expect(docText).not.toContain('### Python Sidecar Rejects a Payload');
    expect(docText).not.toContain('Python sidecar `entrypoint`');
    expect(docText).not.toContain('Local-runtime helper behavior implemented only inside the Python sidecar');
    expect(docText).not.toContain('Main ' + 'Windie' + 'OS websocket connection lifecycle');
    expect(docText).not.toContain('Python sidecar execute_tool JSON-RPC');
    expect(docText).not.toContain('Python sidecar remote client base');
    expect(docText).not.toContain('Python sidecar remote clients');
    expect(docText).not.toContain('not a sidecar executable tool');
    expect(docText).not.toContain('local sidecar state');
    expect(docText).not.toContain('Local Runtime Sidecar Hub');
    expect(docText).not.toContain('executable sidecar local tools');
    expect(docText).not.toContain('Python sidecar local tool');
    expect(docText).not.toContain('sidecar transcript store');
    expect(docText).not.toContain('sidecar local transcript DB');
    expect(docText).not.toContain('backend schema, sidecar registry, renderer result handling');
    expect(docText).not.toContain('routes it to the sidecar');
    expect(docText).not.toContain('routes local calls to the sidecar');
    expect(docText).not.toContain('Plugin tools execute in the Python sidecar');
    expect(docText).not.toContain('| Sidecar built-in tools |');
    expect(docText).not.toContain('| A built-in ' + 'Windie' + 'OS tool |');
    expect(docText).not.toContain('sidecar registry dispatch');
    expect(docText).not.toContain('SDK main-runtime migration');
    expect(docText).not.toContain('Tool result reaches frontend but model does not continue');
    expect(docText).not.toContain('The sidecar sends MCP `tools/call`');
    expect(docText).not.toContain('sidecar, or SDK trust boundaries');
    expect(docText).not.toContain('tool, or sidecar change');
    expect(docText).not.toContain('Sidecar boundaries should');
    expect(docText).not.toContain('Tool Policy or Sidecar Execution');
    expect(docText).not.toContain('Frontend Python Sidecar Tools');
    expect(docText).not.toContain('These are executed via IPC from the Electron main process');
    expect(docText).not.toContain('platform-specific main/sidecar adapters');
    expect(architectureToolSystemText).not.toContain('Frontend (Electron)');
    expect(architectureToolSystemText).not.toContain('live sidecar registry');
    expect(architectureToolSystemText).not.toContain('sidecar exposed-tool set');
    expect(architectureToolSystemText).not.toContain('frontend/local execution path');
    expect(architectureToolSystemText).not.toContain('frontend/local runtime');
    expect(architectureToolSystemText).not.toContain('sidecar/local-runtime path');
    expect(architectureToolSystemText).not.toContain('not enforced in sidecar by default');
    expect(architectureOverviewText).not.toContain('frontend (Electron/React)');
    expect(architectureOverviewText).not.toContain('Electron Frontend');
    expect(architectureOverviewText).not.toContain('SDK local runtime backed by the Python sidecar');
    expect(architectureOverviewText).not.toContain('Python sidecar executes local tools');
    expect(architectureOverviewText).not.toContain('Python sidecar executes tool');
    expect(architectureOverviewText).not.toContain('Tool dispatched to Python sidecar through the sidecar daemon bridge');
    expect(architectureOverviewText).not.toContain('Sanitized message sent to frontend');
    expect(architectureOverviewText).not.toContain('not enforced in sidecar by default');
    expect(architectureOverviewText).not.toContain('Conversation history and memory stored locally via the Python sidecar');
    expect(runtimeTraceText).not.toContain('## Sidecar JSON-RPC Trace');
    expect(runtimeTraceText).not.toContain('Sidecar executed a registered tool');
    expect(docText).not.toMatch(/(?<!Python )sidecar computer\/browser tool implementations/);
    expect(browserToolOverviewText).not.toContain('sidecar runtime execution');
    expect(browserToolOverviewText).not.toContain('sidecar runtime, CDP launch');
    expect(browserToolOverviewText).not.toContain('Update sidecar runtime argument handling');
    expect(browserToolOverviewText).not.toContain('sidecar-owned Browser Use engine adapter');
    expect(docText).not.toContain('sidecar runtime argument handling');
    expect(docText).not.toContain('sidecar runtime args/result');
    expect(docText).not.toContain('sidecar-owned adapter over the maintained Browser Use CLI');
    expect(docText).not.toContain('sidecar-owned schema/result adapters');
    expect(browserRouteDocText).not.toContain('sidecar runtime, CDP launch');
    expect(browserRouteDocText).not.toContain('sidecar runtime action tests');
    expect(toolRoutingDocText).not.toContain('sidecar execution');
    expect(toolRoutingDocText).not.toContain('sidecar-executed');
    expect(toolRoutingDocText).not.toContain('sidecar results');
    expect(toolRoutingDocText).not.toContain('sidecar result');
    expect(toolRoutingDocText).not.toContain('what the sidecar executed');
    expect(toolRoutingDocText).toContain('SDK/main local-runtime dispatch');
    expect(toolRoutingDocText).toContain('Renderer-managed client settings');
    expect(toolRoutingDocText).toContain('tool calls/bundles through SDK/main local-runtime dispatch');
    expect(toolRoutingDocText).toContain('wait for tool results from SDK/main local-runtime dispatch');
    expect(toolRoutingDocText).toContain('stay behind the local-runtime boundary');
    expect(toolRoutingDocText).toContain('local-runtime/provider routes decide where work executes');
    expect(toolRoutingDocText).toContain('The local-runtime Python executor runs the local action');
    expect(toolRoutingDocText).toContain('routes visibility, schema, dispatch, local-runtime execution, result, artifact, and replay failures');
    expect(toolRoutingDocText).toContain('Local-runtime tool execution uses the Python implementation');
    expect(toolRoutingDocText).toContain('local-runtime Python tests for the changed boundary');
    expect(toolRoutingDocText).toContain('local runtime owns executable desktop actions');
    expect(toolRoutingDocText).toContain('local runtime owns actual mouse');
    expect(toolRoutingDocText).toContain('concrete executable tool implementations and dynamic tool registry behind the local-runtime boundary');
    expect(toolRoutingDocText).toContain('local-runtime host own client/local-runtime tool schemas and local executable authority');
    expect(toolRoutingDocText).toContain('The local runtime owns what can actually run locally');
    expect(toolRoutingDocText).toContain('Local-runtime implementation payloads');
    expect(toolRoutingDocText).toContain('Local-runtime tool');
    expect(toolRoutingDocText).toContain('Local-Runtime Tool Catalog and Execution Model');
    expect(toolRoutingDocText).toContain('SDK/main local-runtime tool router');
    expect(toolRoutingDocText).toContain('executable local-runtime tool manifest');
    expect(toolRoutingDocText).toContain('local-runtime executable registry backed by local-runtime Python modules');
    expect(toolRoutingDocText).toContain('local-runtime executable registry logs backed by local-runtime Python modules');
    expect(toolRoutingDocText).toContain('local-runtime computer-control implementation');
    expect(toolRoutingDocText).toContain('local-runtime executable parity tests');
    expect(toolRoutingDocText).toContain('executable local-runtime arguments');
    expect(toolRoutingDocText).toContain('local-runtime exposed-tool registry backed by local-runtime Python modules');
    expect(toolRoutingDocText).toContain('local-runtime exposed-tool parity backed by `src/main/python/tools/registry.py`');
    expect(toolRoutingDocText).toContain('live backend catalog and local-runtime exposed-tool set backed by local-runtime Python modules');
    expect(toolRoutingDocText).toContain('parity tests against local-runtime exposed tools');
    expect(toolRoutingDocText).toContain('live local-runtime exposed set backed by the Python registry');
    expect(toolRoutingDocText).toContain('local-runtime exposed tool set backed by the local-runtime executable registry');
    expect(toolRoutingDocText).toContain('local-runtime executable registry contains `browser`');
    expect(toolRoutingDocText).toContain('backend/local-runtime tool-name parity contracts');
    expect(toolRoutingDocText).not.toContain('backend client-executable built-in tool names');
    expect(toolRoutingDocText).not.toContain('backend/client-local tool-name parity contracts');
    expect(toolRoutingDocText).not.toContain('backend/client-local exposed-tool parity tests');
    expect(toolRoutingDocText).not.toContain('client-local tool');
    expect(toolRoutingDocText).not.toContain('client-local schema');
    expect(toolRoutingDocText).not.toContain('client-local runtime');
    expect(toolAuthoringRegistryDocText).toContain('not local-runtime executable actions');
    expect(toolAuthoringRegistryDocText).toContain('For built-in local-runtime executable tools');
    expect(toolAuthoringRegistryDocText).toContain('local-runtime executable registry');
    expect(toolAuthoringRegistryDocText).toContain('local-runtime executable registry backed by local-runtime Python modules');
    expect(toolAuthoringRegistryDocText).toContain('local-runtime executable tool registries backed by local-runtime Python modules');
    expect(toolPolicyValidationDocText).toContain('confirm the local-runtime built-in tool set');
    expect(toolPolicyValidationDocText).toContain('executable registry registration');
    expect(toolPolicyValidationDocText).toContain('Local runtime / local-runtime Python implementation:');
    expect(toolRoutingDocText).toContain('Local-runtime Python adapters must remain synchronized');
    expect(toolRoutingDocText).not.toContain('sidecar runtime implementations');
    expect(toolRoutingDocText).not.toContain('backend schemas and sidecar runtime');
    expect(toolRoutingDocText).not.toContain('dispatches to the sidecar');
    expect(toolRoutingDocText).not.toContain('Frontend settings are sent');
    expect(toolRoutingDocText).not.toContain('tool calls/bundles to the frontend');
    expect(toolRoutingDocText).not.toContain('wait for tool results from the sidecar');
    expect(toolRoutingDocText).not.toContain('stay in the sidecar');
    expect(toolRoutingDocText).not.toContain('sidecar/provider routes decide where work executes');
    expect(toolRoutingDocText).not.toContain('routes visibility, schema, dispatch, sidecar, result, artifact, and replay failures');
    expect(toolRoutingDocText).not.toContain('Tool execution happens in the Python sidecar');
    expect(toolRoutingDocText).not.toContain('The Python sidecar executes the local action');
    expect(toolRoutingDocText).not.toContain('backend, SDK/main, renderer, and sidecar tests');
    expect(toolRoutingDocText).not.toContain('Keep local execution and local storage mechanics in the Python sidecar');
    expect(toolRoutingDocText).not.toContain('the sidecar performs local execution');
    expect(toolRoutingDocText).not.toContain('Add built-in sidecar implementation + sidecar registry wiring');
    expect(toolRoutingDocText).not.toContain('mismatched between backend and sidecar schemas');
    expect(toolRoutingDocText).not.toContain('No sidecar parity is needed');
    expect(toolRoutingDocText).not.toContain('Python sidecar runtime arguments');
    expect(toolRoutingDocText).not.toContain('parity with sidecar exposure');
    expect(toolRoutingDocText).not.toContain('sidecar runtime argument models');
    expect(toolRoutingDocText).not.toContain('sidecar-only executable helper');
    expect(toolRoutingDocText).not.toContain('sidecar executable payload need different fields');
    expect(toolRoutingDocText).not.toContain('Update sidecar parity docs/tests');
    expect(toolRoutingDocText).not.toContain('sidecar-executable manifest entries');
    expect(toolRoutingDocText).not.toContain('executable sidecar tools');
    expect(toolRoutingDocText).not.toContain('the sidecar owns executable desktop actions');
    expect(toolRoutingDocText).not.toContain('the sidecar owns actual mouse');
    expect(toolRoutingDocText).not.toContain('Python sidecar owns executable local machine actions');
    expect(toolRoutingDocText).not.toContain('The Python sidecar owns what can actually run locally');
    expect(toolRoutingDocText).not.toContain('Python sidecar owns the concrete local tool implementations');
    expect(toolRoutingDocText).not.toContain('Python sidecar owns local executable tool registry entries');
    expect(toolRoutingDocText).not.toContain('Python sidecar-owned payloads');
    expect(toolRoutingDocText).not.toContain('backend, Electron main, renderer, preload, and Python sidecar');
    expect(toolRoutingDocText).not.toContain('renderer, Python sidecar, trusted/untrusted');
    expect(toolRoutingDocText).not.toContain('| Sidecar runtime |');
    expect(toolRoutingDocText).not.toContain('Local sidecar tool');
    expect(toolRoutingDocText).not.toContain('Sidecar owner');
    expect(toolRoutingDocText).not.toContain('filesystem/system sidecar tool');
    expect(toolRoutingDocText).not.toContain('sidecar shell execution');
    expect(toolRoutingDocText).not.toContain('Sidecar shell runtime');
    expect(toolRoutingDocText).not.toContain('Sidecar filesystem reader');
    expect(toolRoutingDocText).not.toContain('Sidecar runtime argument models');
    expect(toolRoutingDocText).not.toContain('Sidecar executable implementations');
    expect(toolRoutingDocText).not.toContain('Tool is visible but never reaches the sidecar');
    expect(toolRoutingDocText).not.toContain('start in the sidecar implementation');
    expect(toolRoutingDocText).not.toContain('Verify sidecar executable registration and schema');
    expect(toolRoutingDocText).not.toContain('Sidecar tools:');
    expect(toolRoutingDocText).not.toContain('Sidecar tool registry');
    expect(toolRoutingDocText).not.toContain('Sidecar diagnostic schema export');
    expect(toolRoutingDocText).not.toContain('Sidecar extension tool loader');
    expect(toolRoutingDocText).not.toContain('Register built-in sidecar handler');
    expect(toolRoutingDocText).not.toContain('Sidecar Result Contract');
    expect(toolRoutingDocText).not.toContain('Tool executes but fails in sidecar');
    expect(toolRoutingDocText).not.toContain('executable sidecar tool manifest');
    expect(toolRoutingDocText).not.toContain('owned by the sidecar runtime');
    expect(toolRoutingDocText).not.toContain('Sidecar Tool Catalog and Execution Model');
    expect(toolRoutingDocText).not.toContain('registered sidecar tools');
    expect(toolRoutingDocText).not.toContain('proof that the sidecar directly accepts');
    expect(toolRoutingDocText).not.toContain('sidecar registry implementation');
    expect(toolRoutingDocText).not.toContain('sidecar registry contains `browser`');
    expect(toolRoutingDocText).not.toContain('sidecar-executable');
    expect(toolRoutingDocText).not.toContain('sidecar executable manifest');
    expect(toolRoutingDocText).not.toContain('executable sidecar arguments');
    expect(toolRoutingDocText).not.toContain('no sidecar parity');
    expect(toolRoutingDocText).not.toContain('sidecar parity tests');
    expect(toolRoutingDocText).not.toContain('sidecar exposed-tool registry');
    expect(toolRoutingDocText).not.toContain('sidecar exposed-tool parity');
    expect(toolRoutingDocText).not.toContain('sidecar exposed tools');
    expect(toolRoutingDocText).not.toContain('SDK main-runtime tool router');
    expect(toolRoutingDocText).not.toContain('Python sidecar registry');
    expect(toolRoutingDocText).not.toContain('live sidecar exposed set');
    expect(toolRoutingDocText).not.toContain('Python sidecar exposed-tool set');
    expect(toolRoutingDocText).not.toContain('Python sidecar exposed set');
    expect(toolAuthoringRegistryDocText).not.toContain('sidecar local actions');
    expect(toolAuthoringRegistryDocText).not.toContain('built-in Python sidecar tools');
    expect(toolAuthoringRegistryDocText).not.toContain('sidecar `ToolRegistry`');
    expect(toolAuthoringRegistryDocText).not.toContain('Python sidecar tool registry');
    expect(toolAuthoringRegistryDocText).not.toContain('Python sidecar tool registries');
    expect(toolPolicyValidationDocText).not.toContain('confirm sidecar `LOCAL_RUNTIME_BUILTIN_TOOL_NAMES`');
    expect(toolPolicyValidationDocText).not.toContain('\nSidecar:\n');
    expect(localRuntimePayloadDocText).not.toContain('sidecar payload');
    expect(localRuntimePayloadDocText).not.toContain('sidecar validation');
    expect(localRuntimePayloadDocText).not.toContain('executable sidecar payload');
    expect(localRuntimePayloadDocText).toContain('local-runtime Python `ToolResult`');
    expect(localRuntimePayloadDocText).toContain('owned by the local-runtime shell tool');
    expect(localRuntimePayloadDocText).toContain('calls local-runtime `search_memory_by_embedding`');
    expect(localRuntimePayloadDocText).not.toContain('Frontend/sidecar must not import');
    expect(localRuntimePayloadDocText).not.toContain('Sidecar `ToolResult`');
    expect(localRuntimePayloadDocText).not.toContain('the sidecar execute another');
    expect(localRuntimePayloadDocText).not.toContain('sidecar tools');
    expect(localRuntimePayloadDocText).not.toContain('sidecar tool behavior');
    expect(localRuntimePayloadDocText).not.toContain('Sidecar/platform runtime');
    expect(localRuntimePayloadDocText).not.toContain('Sidecar shell sudo rewrite');
    expect(localRuntimePayloadDocText).not.toContain('owned by the sidecar shell tool');
    expect(localRuntimePayloadDocText).not.toContain('calls sidecar `search_memory_by_embedding`');
    expect(docText).not.toContain('Windie Agent owns client-local');
    expect(docText).not.toContain('Sidecar Plugin Tool Registration');
    expect(docText).not.toContain('sidecar plugin');
    expect(docText).not.toContain(
      'Remote tools are dispatched through the SDK/main local runtime',
    );
  });

  test('tool routing docs qualify sidecar executor ownership', async () => {
    const docs = await Promise.all([
      read('docs/README.md'),
      read('docs/architecture/tool_system.md'),
      read('docs/channels/channel_routing_matrix.md'),
      read('docs/frontend/renderer/renderer_state_change_workflow.md'),
      read('docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md'),
      read('docs/gateway/gateway_troubleshooting.md'),
      read('docs/reference/code_change_surface_index.md'),
      read('docs/tools/README.md'),
      read('docs/tools/tool_catalog_matrix.md'),
      read('docs/tools/tool_execution_lifecycle.md'),
      read('docs/tools/tool_schema_policy_change_workflow.md'),
      read('docs/tools/tool_troubleshooting.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('local-runtime Python executor');
    expect(docText).toContain('local-runtime executable registry');
    expect(docText).toContain('Local-runtime registry/schema implementation');
    expect(docText).toContain('relative `directory` values resolve from the selected workspace folder when configured');
    expect(docText).not.toContain(' or sidecar executor');
    expect(docText).not.toContain('and sidecar executor');
    expect(docText).not.toContain('vs sidecar executor');
    expect(docText).not.toContain('schema owners, sidecar executors');
    expect(docText).not.toContain('selected workspace folder when one has been opened in WindieOS');
    expect(docText).not.toContain('backend owners, sidecar executors');
    expect(docText).not.toContain('Built-in sidecar executors');
    expect(docText).not.toContain('Plugin sidecar executors');
    expect(docText).not.toContain('local-runtime sidecar executor');
    expect(docText).not.toMatch(/(?<!Python )sidecar registry parity or SDK dispatch map/);
    expect(docText).not.toMatch(/(?<!Python )sidecar registry\/schema\/runtime/);
    expect(docText).not.toMatch(/(?<!Python )sidecar says missing tool/);
    expect(docText).not.toMatch(/(?<!Python )sidecar registry\/exposed-name parity/);
    expect(docText).not.toMatch(/(?<!Python )sidecar executable args/);
    expect(docText).not.toContain('Sidecar tests cover executable behavior');
  });

  test('debug error docs route local failures through local runtime owners', async () => {
    const docs = await Promise.all([
      read('docs/debug/README.md'),
      read('docs/debug/diagnostic_flags.md'),
      read('docs/debug/error_failure_change_workflow.md'),
      read('docs/debug/observability_change_workflow.md'),
      read('docs/debug/process_health_checklist.md'),
      read('docs/debug/runtime_traces.md'),
      read('docs/debug/symptom_playbooks.md'),
      read('docs/README.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('Local Runtime Process Lifecycle Change Workflow');
    expect(docText).toContain('Local-Runtime Registry and Result Contract');
    expect(docText).toContain('local-runtime tool registration backed by the Python implementation registry');
    expect(docText).toContain('local-runtime wakeword service backed by Python');
    expect(docText).toContain('local-runtime browser adapter backed by the Browser Use CLI');
    expect(docText).toContain('local-runtime trace paths');
    expect(docText).toContain('local-runtime backend URL failures');
    expect(docText).toContain('Enable local-runtime Python debug');
    expect(docText).toContain('local-runtime Python stderr');
    expect(docText).toContain('local-runtime Python logs');
    expect(docText).toContain('local-runtime Python process');
    expect(docText).toContain('local-runtime Python readiness');
    expect(docText).toContain('Local-runtime Python stdout is protocol traffic');
    expect(docText).toContain('Local-Runtime Python Logging Changes');
    expect(docText).toContain('local-runtime screenshot capture');
    expect(docText).toContain('<windie> diagnostics paths');
    expect(docText).not.toContain('~/Library/Application Support/windieos/diagnostics/diagnostics.db');
    expect(docText).not.toContain('or sidecar registry');
    expect(docText).not.toContain('sidecar wakeword service');
    expect(docText).not.toContain('sidecar Browser Use CLI adapter');
    expect(docText).not.toContain('sidecar trace paths');
    expect(docText).not.toContain('sidecar backend URL failures');
    expect(docText).not.toContain('Enable sidecar debug');
    expect(docText).not.toContain('renderer URL traces, sidecar stderr');
    expect(docText).not.toContain('renderer, sidecar, wakeword service');
    expect(docText).not.toContain('Backend, Electron, renderer, sidecar');
    expect(docText).not.toContain('renderer, sidecar, VM worker');
    expect(docText).not.toContain('renderer, sidecar, wakeword');
    expect(docText).not.toContain('sidecar browser feature-pack');
    expect(docText).not.toContain('sidecar stderr handling');
    expect(docText).not.toContain('Python sidecar stderr logs');
    expect(docText).not.toContain('packaged app, sidecar readiness');
    expect(docText).not.toContain('Sidecar stdout is protocol traffic');
    expect(docText).not.toContain('## Sidecar Logging Changes');
    expect(docText).not.toContain('Use sidecar logs for local JSON-RPC execution');
    expect(docText).not.toContain('SDK tool routing and sidecar capture');
    expect(docText).not.toContain('Sidecar stdout remains protocol-only');
    expect(docText).not.toContain('[Sidecar Runtime Change Workflow]');
    expect(docText).not.toContain('[Tool Registry Result Contract Reference]');
    expect(docText).not.toContain('| Sidecar ToolResult/registry |');
  });

  test('workflow route docs use local-runtime labels for sidecar-backed implementation docs', async () => {
    const docs = await Promise.all([
      read('docs/backend/agent/tool_turn_change_workflow.md'),
      read('docs/backend/tools/registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md'),
      read('docs/backend/tools/remote/remote_tool_domain_payload_and_request_id_semantics_reference.md'),
      read('docs/browser/browser_change_workflow.md'),
      read('docs/channels/sidecar_and_tool_channels.md'),
      read('docs/debug/README.md'),
      read('docs/README.md'),
      read('docs/frontend/README.md'),
      read('docs/frontend/inventory/README.md'),
      read('docs/frontend/inventory/frontend_ipc_and_sidecar_contract_touchpoints_reference.md'),
      read('docs/frontend/main/local_backend/process_lifecycle_change_workflow.md'),
      read('docs/frontend/main/local_backend/process_lifecycle_readiness_and_request_correlation_reference.md'),
      read('docs/frontend/renderer/renderer_state_change_workflow.md'),
      read('docs/frontend/sidecar/README.md'),
      read('docs/frontend/sidecar/local_backend_jsonrpc_change_workflow.md'),
      read('docs/frontend/sidecar/local_backend_process_lifecycle_reference.md'),
      read('docs/frontend/sidecar/python_sidecar_and_memory.md'),
      read('docs/frontend/sidecar/local_runtime_python_change_workflow.md'),
      read('docs/frontend/sidecar/core/README.md'),
      read('docs/frontend/sidecar/services/README.md'),
      read('docs/frontend/sidecar/services/protocols/README.md'),
      read('docs/frontend/sidecar/source_maps/README.md'),
      read('docs/frontend/sidecar/system_state/README.md'),
      read('docs/frontend/sidecar/system_state/platform/README.md'),
      read('docs/frontend/sidecar/system_state/system_state_collection_and_platform_adapter_reference.md'),
      read('docs/frontend/sidecar/browser/README.md'),
      read('docs/frontend/sidecar/browser/contracts/README.md'),
      read('docs/frontend/sidecar/browser/chrome/README.md'),
      read('docs/frontend/sidecar/tools/README.md'),
      read('docs/frontend/sidecar/tools/computer/README.md'),
      read('docs/frontend/sidecar/tools/system/README.md'),
      read('docs/frontend/sidecar/tools/filesystem/README.md'),
      read('docs/frontend/sidecar/tools/registry/README.md'),
      read('docs/frontend/local_runtime_tool_change_workflow.md'),
      read('docs/getting-started/docs_hub.md'),
      read('docs/nodes/README.md'),
      read('docs/nodes/desktop_and_sidecar_node.md'),
      read('docs/nodes/runtime_node_matrix.md'),
      read('docs/operations/evidence_collection_runbook.md'),
      read('docs/providers/inference_capability_change_workflow.md'),
      read('docs/reference/configuration_reference.md'),
      read('docs/security/credential_token_change_workflow.md'),
      read('docs/security/README.md'),
      read('docs/tools/README.md'),
      read('docs/tools/browser.md'),
      read('docs/tools/computer.md'),
      read('docs/tools/filesystem_shell.md'),
      read('docs/tools/tool_execution_lifecycle.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('Local-Runtime Tool Change Workflow');
    expect(docText).toContain('Local-Runtime Python Implementation Change Workflow');
    expect(docText).toContain('Local-Runtime Registry and Result Contract');
    expect(docText).toContain('Local-Runtime Tool Registry Docs Hub');
    expect(docText).toContain('Local-Runtime Tools Docs Hub');
    expect(docText).toContain('Local-Runtime Computer Tools Docs Hub');
    expect(docText).toContain('Local-Runtime System Tools Docs Hub');
    expect(docText).toContain('Local-Runtime Browser Docs Hub');
    expect(docText).toContain('Local-Runtime Browser Contracts Docs Hub');
    expect(docText).toContain('local-runtime bridge readiness');
    expect(docText).toContain('local-runtime readiness');
    expect(docText).toContain('local-runtime diagnostic status');
    expect(docText).toContain('Local-runtime Python implementation');
    expect(docText).toContain('SDK/main local-runtime dispatch or local-runtime Python implementation');
    expect(docText).toContain('Local-Runtime Browser Chrome Docs Hub');
    expect(docText).toContain('Local-Runtime System-State Docs Hub');
    expect(docText).toContain('Local-Runtime System-State Platform Docs Hub');
    expect(docText).toContain('Local-Runtime Core Docs Hub');
    expect(docText).toContain('Local-Runtime Services Docs Hub');
    expect(docText).toContain('Local-Runtime Source Maps Docs Hub');
    expect(docText).toContain('Local-Runtime Service Protocol Docs Hub');
    expect(docText).toContain('SDK-Owned Local-Runtime Lifecycle Reference');
    expect(docText).toContain('SDK-Owned Local-Runtime Readiness and Helper RPC Reference');
    expect(docText).toContain('Local Runtime Python Implementation Docs Hub');
    expect(docText).toContain('local-runtime Python implementation folder topology maps');
    expect(docText).toContain('Local-Runtime Process Lifecycle');
    expect(docText).toContain('Local-Runtime JSON-RPC Protocol');
    expect(docText).toContain('Local-Runtime Python Folder Topology');
    expect(docText).toContain('local-runtime Python implementation service/tool topology flow');
    expect(docText).toContain('Local-Runtime Wakeword Service Model');
    expect(docText).toContain('Frontend IPC and Local-Runtime Contract Touchpoints Reference');
    expect(docText).toContain('Local-Runtime Summarizer Watermark and Conversation Batch Reference');
    expect(docText).toContain('Frontend Main/Renderer/Contracts/Local-Runtime Hubs');
    expect(docText).toContain('Local-Runtime Python Implementation Change Workflow');
    expect(docText).toContain('Local-runtime Python implementation node');
    expect(docText).toContain('SDK/main local runtime owns local executable authority');
    expect(docText).toContain('behind SDK local-runtime ownership');
    const runtimeConfigMatrix = await read('docs/operations/runtime_configuration_matrix.md');
    expect(runtimeConfigMatrix).toContain(
      '`AGENT_INTERACTIVE_WORKERS` (`WINDIE_INTERACTIVE_WORKERS` in WindieOS launches)',
    );
    expect(runtimeConfigMatrix).toContain(
      'WindieOS launches preserve matching `WINDIE_BROWSER_*` aliases.',
    );
    expect(runtimeConfigMatrix).not.toContain('Generic host fallback: `AGENT_');
    expect(runtimeConfigMatrix).not.toContain('Generic host fallbacks use matching `AGENT_');
    expect(docText).not.toContain('[Sidecar Tool Change Workflow]');
    expect(docText).not.toContain('[Sidecar Runtime Change Workflow]');
    expect(docText).not.toContain('websocket state, sidecar readiness');
    expect(docText).not.toContain('sidecar readiness, long-running handler');
    expect(docText).not.toContain('sidecar status never becomes ready');
    expect(docText).not.toContain('Returns sidecar diagnostic status');
    expect(docText).not.toContain('| Sidecar | JSON-RPC method');
    expect(docText).not.toContain('| Sidecar tool/runtime |');
    expect(docText).not.toContain('| Query streams but local tool fails | Electron bridge or Python sidecar |');
    expect(docText).not.toContain('Frontend Main/Renderer/Contracts/Sidecar Hubs');
    expect(docText).not.toContain('Local Runtime Sidecar Process Workflow');
    expect(docText).not.toContain('Sidecar Tool Change Workflow');
    expect(docText).not.toContain('Sidecar Runtime Change Workflow');
    expect(docText).not.toContain('[Sidecar Registry]');
    expect(docText).not.toContain('Sidecar Tool Registry Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar Tool Registry Docs Hub');
    expect(docText).not.toContain('sidecar ToolResult failures');
    expect(docText).not.toContain('## Sidecar Tool Registry');
    expect(docText).not.toContain('missing in sidecar runtime');
    expect(docText).not.toContain('Sidecar Tool Registry Exposed Schema');
    expect(docText).not.toContain('Local Runtime Sidecar Tool Registry Exposed Schema');
    expect(docText).not.toContain('sidecar contract drift');
    expect(docText).not.toContain('sidecar expectations');
    expect(docText).not.toContain('Python sidecar remote client base');
    expect(docText).not.toContain('environment for Python sidecar remote clients');
    expect(docText).not.toContain('sidecar actions');
    expect(docText).not.toContain('sidecar action without losing ids');
    expect(docText).not.toContain('sidecar action adapter defaulting assumptions');
    expect(docText).not.toContain('backend/sidecar remote parity tests');
    expect(docText).not.toContain('compares backend and sidecar');
    expect(docText).not.toContain('put local execution in sidecar JSON-RPC');
    expect(docText).not.toContain('sidecar JSON-RPC response shape');
    expect(docText).not.toContain('build sidecar JSON-RPC params');
    expect(docText).not.toContain('owns the sidecar JSON-RPC calls');
    expect(docText).not.toContain('Modify sidecar JSON-RPC method payload');
    expect(docText).not.toContain('map to sidecar JSON-RPC params');
    expect(docText).not.toContain('Sidecar Tools Docs Hub');
    expect(docText).not.toContain('Sidecar Computer Tools Docs Hub');
    expect(docText).not.toContain('Sidecar System Tools Docs Hub');
    expect(docText).not.toContain('Sidecar Browser Docs Hub');
    expect(docText).not.toContain('Sidecar Browser Contracts Docs Hub');
    expect(docText).not.toContain('Sidecar Browser Chrome Docs Hub');
    expect(docText).not.toContain('Sidecar runtime reference');
    expect(docText).not.toContain('Sidecar Tool Catalog and Execution Model');
    expect(docText).not.toContain('Sidecar Shell and Process Session Runtime Reference');
    expect(docText).not.toContain('Sidecar Filesystem Read and Replace Runtime Reference');
    expect(docText).not.toContain('Sidecar Mouse, Keyboard, Scroll, and Screenshot Runtime Reference');
    expect(docText).not.toContain('Sidecar Wait, Window, and Stats Runtime Reference');
    expect(docText).not.toContain('Local Runtime Sidecar Tools Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar Tools Hub');
    expect(docText).not.toContain('Local Runtime Sidecar Computer Tools Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar System Tools Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar Filesystem Tools Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar Browser Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar Browser Contracts Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar Browser Chrome Docs Hub');
    expect(docText).not.toContain('Sidecar System-State Docs Hub');
    expect(docText).not.toContain('Sidecar System-State Platform Docs Hub');
    expect(docText).not.toContain('Sidecar System-State Collection and Platform Adapter Reference');
    expect(docText).not.toContain('Sidecar Core Docs Hub');
    expect(docText).not.toContain('Sidecar Services Docs Hub');
    expect(docText).not.toContain('Sidecar Source Maps Docs Hub');
    expect(docText).not.toContain('Sidecar Service Protocol Docs Hub');
    expect(docText).not.toContain('Python sidecar node | implemented | Local subprocess owns');
    expect(docText).not.toContain('Python sidecar node | local Python sidecar daemon managed');
    expect(docText).not.toContain('Python sidecar implementation | local executable tools');
    expect(docText).not.toContain('Owns the app-session `LocalRuntimeService`, `/rpc` endpoint, local tools, memory, and chat-event storage.');
    expect(docText).not.toContain('Local Runtime Sidecar Core Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar Services Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar Source Maps Docs Hub');
    expect(docText).not.toContain('SDK-Owned Sidecar Lifecycle Reference');
    expect(docText).not.toContain('SDK-Owned Sidecar Readiness and Helper RPC Reference');
    expect(docText).not.toContain('Local Runtime Sidecar Browser Stack');
    expect(docText).not.toContain('Local Runtime Sidecar Docs Hub');
    expect(docText).not.toContain('Sidecar Docs Hub');
    expect(docText).not.toContain('Frontend IPC and Sidecar Contract Touchpoints');
    expect(docText).not.toContain('Sidecar Summarizer Watermark');
    expect(docText).not.toContain('Sidecar Process Lifecycle');
    expect(docText).not.toContain('Sidecar JSON-RPC Protocol');
    expect(docText).not.toContain('Sidecar Python Folder Topology');
    expect(docText).not.toContain('Python sidecar implementation service/tool topology flow');
    expect(docText).not.toContain('Python sidecar implementation folder topology maps');
    expect(docText).not.toContain('Sidecar Wakeword Service Model');
    expect(docText).not.toContain('title: "Sidecar Tool Change Workflow"');
    expect(docText).not.toContain('title: "Sidecar Runtime Change Workflow"');
  });

  test('main local-runtime lifecycle workflow keeps daemon ownership generic', async () => {
    const lifecycleWorkflow = await read('docs/frontend/main/local_backend/process_lifecycle_change_workflow.md');

    expect(lifecycleWorkflow).toContain('configured local-runtime daemon');
    expect(lifecycleWorkflow).toContain('The SDK owns local-runtime daemon lifetime');
    expect(lifecycleWorkflow).toContain('packaged local-runtime Python launch options');
    expect(lifecycleWorkflow).toContain('Packaged local-runtime behavior');
    expect(lifecycleWorkflow).toContain('| Local-runtime binary path |');
    expect(lifecycleWorkflow).not.toContain('packaged Python sidecar launch');
    expect(lifecycleWorkflow).not.toContain('start/reuse the Python sidecar daemon');
    expect(lifecycleWorkflow).not.toContain('The SDK owns sidecar daemon lifetime');
    expect(lifecycleWorkflow).not.toContain('Packaged sidecar behavior');
    expect(lifecycleWorkflow).not.toContain('| Sidecar binary path |');
    expect(lifecycleWorkflow).not.toContain('before changing Python sidecar code');
  });

  test('browser contract docs route shared validation through the local runtime boundary', async () => {
    const docs = await Promise.all([
      read('docs/README.md'),
      read('docs/backend/README.md'),
      read('docs/backend/tools/README.md'),
      read('docs/backend/tools/browser/browser_remote_schema_surface_reference.md'),
      read('docs/backend/tools/browser/schema/backend_local_runtime_browser_schema_parity_and_validation_boundary_reference.md'),
      read('docs/browser/browser_action_surface.md'),
      read('docs/browser/browser_control.md'),
      read('docs/browser/browser_control_run.md'),
      read('docs/browser/browser_change_workflow.md'),
      read('docs/browser/dedicated_browser_runtime.md'),
      read('docs/browser/browser_troubleshooting.md'),
      read('docs/frontend/main/permission_manifest_probe_and_request_ipc_reference.md'),
      read('docs/frontend/sidecar/browser/contracts/README.md'),
      read('docs/frontend/sidecar/browser/chrome/chrome_detection_launcher_and_cdp_session_reference.md'),
      read('docs/frontend/sidecar/browser_action_runtime_reference.md'),
      read('docs/frontend/sidecar/browser_automation_stack.md'),
      read('docs/frontend/sidecar/tools/browser_runtime_contract_and_windie_runtime_reference.md'),
      read('docs/getting-started/docs_hub.md'),
      read('docs/tools/README.md'),
      read('docs/tools/browser.md'),
      read('docs/tools/tool_catalog_matrix.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('local-runtime validation');
    expect(docText).toContain('local-runtime validation backed by local-runtime');
    expect(docText).toContain('Python adapters');
    expect(docText).toContain('Backend-Local Runtime Browser Schema Parity');
    expect(docText).toContain('backend/local-runtime parity');
    expect(docText).toContain('local-runtime browser execution');
    expect(docText).toContain('local-runtime Python Browser Use adapters');
    expect(docText).toContain('local-runtime Python browser adapter');
    expect(docText).toContain('hosted backend keeps agent orchestration');
    expect(docText).toContain('The hosted backend exposes the canonical browser tool contract');
    expect(docText).toContain('local-runtime Python browser adapter normalizes Browser');
    expect(docText).toContain('local-runtime browser adapter now targets the named Browser Use');
    expect(docText).toContain('Local-Runtime Browser State');
    expect(docText).toContain('dedicated browser runtime');
    expect(docText).toContain('controlled browser session');
    expect(docText).toContain('dedicated browser Chrome/CDP startup policy');
    expect(docText).toContain('The local-runtime Python browser adapter owns the dedicated Chrome profile launch');
    expect(docText).toContain('When you issue a browser request, the `connect` action will');
    expect(docText).toContain('The local-runtime Browser Use adapter passes them only when starting');
    expect(docText).toContain('The desktop/local-runtime browser path should keep only adapter state');
    expect(docText).toContain('Host-skinned desktop launches may inject a product-specific user-data root');
    expect(docText).toContain('dedicated desktop connect path');
    expect(docText).toContain('Client/local-runtime manifest');
    expect(docText).toContain('local-runtime executable registry backed by local-runtime Python modules');
    expect(docText).not.toContain('dedicated Windie browser runtime');
    expect(docText).not.toContain('Dedicated Windie browser navigation');
    expect(docText).not.toContain('Windie browser actions');
    expect(docText).not.toContain('dedicated WindieOS Chrome/CDP startup policy');
    expect(docText).not.toContain('dedicated WindieOS browser');
    expect(docText).not.toContain('WindieOS browser session');
    expect(docText).not.toContain('WindieOS desktop launches');
    expect(docText).not.toContain('WindieOS connects to or starts');
    expect(docText).not.toContain(retiredProductName('OS connect now targets'));
    expect(docText).not.toContain(retiredProductName('OS connect, snapshots'));
    expect(docText).not.toContain('dedicated Windie connect path');
    expect(docText).not.toContain('WindieOS passes them only when starting');
    expect(docText).not.toContain('WindieOS does not call Browser Use CLI');
    expect(docText).not.toContain('WindieOS should keep only adapter state');
    expect(docText).not.toContain('WindieOS owns the dedicated Chrome profile launch');
    expect(docText).not.toContain('WindieOS launches or reuses its dedicated persistent Chrome profile');
    expect(docText).not.toContain('WindieOS connect will');
    expect(docText).not.toContain('Cannot Connect to Windie Browser');
    expect(docText).not.toContain('WindieOS browser profile');
    expect(docText).not.toContain('WindieOS owns the agent loop and policy');
    expect(docText).not.toContain('WindieOS owns the agent loop, policy, transport, and result normalization');
    expect(docText).not.toContain('WindieOS keeps agent orchestration');
    expect(docText).not.toContain('WindieOS should only own adapter/result boundaries');
    expect(docText).not.toContain('WindieOS result normalization');
    expect(docText).not.toContain(retiredProductName('OS Browser Use session'));
    expect(docText).not.toContain(retiredProductName(' browser CDP port'));
    expect(docText).not.toContain(retiredProductName(' Dedicated Browser'));
    expect(docText).not.toContain(`${retiredProductName('OS')} browser automation`);
    expect(docText).not.toContain(`Workflow for changing ${retiredProductName('OS')} browser automation`);
    expect(docText).not.toContain(`${retiredProductName('OS')} currently routes the canonical \`browser\` tool`);
    expect(docText).not.toContain('Backend-Sidecar Browser Schema');
    expect(docText).not.toContain('Frontend/sidecar manifest');
    expect(docText).not.toContain('Python sidecar registry');
    expect(docText).not.toContain('Sidecar registry:');
    expect(docText).not.toContain('Sidecar executable owner:');
    expect(docText).not.toContain('shared contract, Python sidecar runtime, CDP launch');
    expect(docText).not.toContain('sidecar action runtime');
    expect(docText).not.toContain('Sidecar Browser Use engine adapter');
    expect(docText).not.toContain('Sidecar Chrome launcher/detection');
    expect(docText).not.toContain('Sidecar Runtime State');
    expect(docText).not.toContain('The sidecar invokes Browser Use');
    expect(docText).not.toContain('**Sidecar**: Adapts browser actions');
    expect(docText).not.toContain('SDK local-runtime bridge and sidecar browser execution');
    expect(docText).not.toMatch(/(?<!Python )sidecar validation entrypoint/);
    expect(docText).not.toMatch(/(?<!Python )sidecar runtime validation/);
    expect(docText).not.toMatch(/(?<!Python )sidecar runtime supported-action registry/);
    expect(docText).not.toMatch(/(?<!Python )sidecar runtime handler/);
    expect(docText).not.toMatch(/(?<!Python )sidecar runtime action/);
    expect(docText).not.toMatch(/(?<!Python )sidecar JSON-RPC availability/);
    expect(docText).not.toContain('fails in the sidecar');
  });

  test('local runtime diagnostics avoid sidecar payload wording', async () => {
    const docs = await Promise.all([
      read('docs/frontend/sidecar/README.md'),
      read('src/main/python/windie/_unicode_sanitizer.py'),
    ]);
    const text = docs.join('\n');

    expect(text).toContain('local-runtime JSON-RPC payloads');
    expect(text).toContain('local-runtime payloads');
    expect(text).not.toContain('sidecar payload');
    expect(text).not.toContain('sidecar payloads');
  });

  test('docs avoid frontend sidecar and local-runtime sidecar owner labels', async () => {
    const docs = await listMarkdownFiles('docs');
    const offenders: Record<string, string[]> = {};

    for (const relativePath of docs) {
      const normalizedRelativePath = relativePath.replaceAll('\\', '/');
      if (normalizedRelativePath.startsWith('docs/plans/')) {
        continue;
      }
      const source = await read(relativePath);
      const staleMentions = [
        'Frontend Sidecar',
        'Frontend sidecar',
        'local-runtime sidecar',
        'Local Runtime Sidecar',
        'Sidecar registry',
        'Sidecar Method Registry',
        'local SDK sidecar process/readiness status',
        'Local SDK sidecar process/readiness status',
        'Python sidecar-backed tool registry',
        'sidecar-local',
        'sidecar remote title client',
        'explicit Python executable path for sidecar processes',
        'Python sidecar process exit/error',
        'active sidecar daemon',
        'Python sidecar process lifecycle/readiness',
        'sidecar process/request failures',
        'The canonical local executor is the token-auth sidecar daemon',
        'After local execution through the Python sidecar daemon',
        'SDK/main local runtime -> Electron local adapter -> Python sidecar daemon',
        'SDK/main local runtime executes via Python sidecar daemon',
        'SDK/main local-runtime path and Python sidecar executor',
        'preload bridge, local Python sidecar, wakeword subprocess',
        'SDK local-runtime RPC between the desktop app and the local Python sidecar',
        'the sidecar performs local execution on the user',
        'main/python/           # local Python sidecar: tools, memory, browser, system',
        'sidecar platform tests',
        'focused sidecar shell probe',
        'sidecar switching logic',
        'sidecar computer tools',
        '| sidecar focused tests |',
        '| sidecar suite |',
        '| Sidecar tests |',
        '| sidecar mouse control |',
        '| sidecar keyboard control |',
        '| sidecar scroll control |',
        '| sidecar window manager |',
        'sidecar log lines for computer tool or window manager execution',
        'backend + sidecar + frontend CI when dependencies exist',
        'Run sidecar tests.',
        'Run sidecar pytest.',
        'Run backend, sidecar, and frontend',
        'local-runtime executable plus sidecar tests',
        'sidecar: `./scripts/python-in-env sidecar',
        'tool-specific sidecar tests',
        'related sidecar tests',
        'Add a sidecar test',
        'platform-specific sidecar tests',
        'focused sidecar tests',
        'Sidecar tests:',
        'focused frontend/sidecar tests',
        'sidecar computer-tool tests',
        'memory runtime/sidecar tests',
        'sidecar pytest tests for executable local tool behavior',
        'focused sidecar pytest.',
        'sidecar computer-use tools',
        'Local runtime implementation (Python sidecar)',
        'starts/reuses the sidecar from bundled runtime paths',
        'Sidecar now has a matching hosted SDK transport client',
        'Python sidecar dependency install',
        'sidecar chat-event RPC channels',
        'Sidecar chat-event RPC names',
        'Sidecar rewrites persist',
        'sidecar must not construct backend prompt context',
        'sidecar conversation revision metadata',
        'only sidecar daemon lifecycle and RPC transport path',
        'sidecar screenshot capture',
        'sidecar screenshot task directly',
        'The sidecar screenshot runs',
        'The sidecar screenshot tool',
        '| sidecar screenshot |',
        'sidecar screenshot result included',
        'sidecar screenshot data handling',
        'owns sidecar screenshot invocation',
        'sidecar screenshot tool execution',
        'screenshot sidecar returns',
        'sidecar screenshot/computer tests',
        'Python sidecar screenshot tests',
        'Python sidecar local-runtime implementation',
        'Client header code in Electron, SDK, or sidecar',
        'tool execution orchestration from UI',
        'Patching sidecar service logic for renderer state race conditions',
        '`sidecar-event` title updates',
        'SDK runtime in Electron main and the sidecar daemon',
        'Canonical sidecar-exposed tool surface',
        'sidecar-exposed tools through scoped host helpers',
        'Sidecar spawn env',
        'Sidecar readiness checks',
        'SDK-owned sidecar daemon',
        'inside the sidecar daemon',
        'Python sidecar daemon lifecycle',
        'Arg validation fails on sidecar',
        'sidecar daemon-backed local-runtime bridge',
        'sidecar daemon, which dispatches',
        'sidecar chat-event RPC names remain',
        'through the SDK/main local runtime into the Python sidecar daemon',
        'Python sidecar daemon: executable tools',
        'routes the local call to the Python sidecar daemon/tool bridge',
        'Python sidecar executes the tool',
        'invokes the Python sidecar daemon',
        '| local-runtime JSON-RPC | SDK `LocalRuntime` with Electron host context | Python sidecar daemon |',
        'Did the local runtime start the Python sidecar daemon',
        'sidecar daemon fails to start',
        'same sidecar daemon contract',
        'between Electron and Python sidecar',
        'to the sidecar daemon `/rpc` endpoint',
        'provider to the sidecar daemon',
        'Python sidecar returns `INVALID_PARAMS`',
        'Python sidecar process exits and requests fail',
        'Python stdout pollution',
        'cannot reach the Python sidecar daemon',
        'without sidecar dispatch',
        'sidecar daemon client/lifecycle ownership',
        'sidecar screenshot/computer tests',
        'Python sidecar screenshot tests',
        'sidecar task directly',
        'screenshot sidecar returns',
        'after sidecar screenshot tool execution',
        'Python sidecar local-runtime implementation',
        'Choose the owner first: backend, Electron main, renderer, sidecar, or release CI',
        'Python sidecar is executor',
        'Python sidecar JSON-RPC dispatcher',
        'Python sidecar `ToolResult` dict',
        'Python sidecar JSON-RPC stdout/stderr',
        'Python sidecar JSON-RPC protocol tests',
        'corrupting Python sidecar JSON-RPC stdout',
        'Python sidecar JSON-RPC availability',
        'Python sidecar browser adapter',
        'local-runtime executors backed by the Python sidecar',
        'Python sidecar daemon | concrete executable tool implementations',
        'SDK/main local runtime -> Python sidecar executor',
        'SDK runtime tool router or Python sidecar executor',
        'SDK local-runtime vs Python sidecar executor split',
        'relay execution to the Python sidecar executor',
        'local-runtime tool validation or Python sidecar executor',
        'desktop execution, backed by the Python sidecar implementation',
        'SDK/main local-runtime execution, Python sidecar implementation',
        'SDK/main local-runtime dispatch, Python sidecar implementation',
        'local-runtime execution, Python sidecar adapters',
        'process startup and reuse, Python sidecar implementation',
        'local execution through the current Python sidecar implementation',
        "local execution on the user's computer through its Python sidecar implementation",
        'Python sidecar implementation does local work',
        'The Python sidecar implementation returns local tool results',
        'desktop actions through the Python sidecar implementation',
        'through the Python sidecar implementation',
        'backed by the Python sidecar implementation',
        'local-runtime executable implementation backed by the Python sidecar',
        'Local runtime, currently backed by Python sidecar tool implementations',
        'Local-runtime registry/exposed-name parity backed by Python sidecar implementation',
        'SDK local-runtime contracts plus the current Python sidecar implementation',
        'local-runtime executable registry/tool implementation backed by Python sidecar modules',
        'The local runtime executes local actions through the Python sidecar implementation',
        'SDK/main local-runtime dispatch or Python sidecar implementation',
        'Electron bridge, or Python sidecar implementation',
        "local runtime's Python sidecar implementation",
        'Python sidecar provides the current concrete local tool implementations',
        'actual local machine actions through the Python sidecar implementation',
        'Add the Python sidecar implementation and register it',
        'configured stdio servers through the Python sidecar implementation',
        'entrypoint through the Python sidecar implementation',
        '| Tool | Backend name | Python sidecar implementation |',
        'through the sidecar SDK local-runtime client',
        'never go through the sidecar',
        'Local runtime / Python sidecar implementation',
        'sidecar implementation boundaries',
        'Core backend, desktop local-runtime, and Python sidecar implementation files',
        'Python sidecar implementation tests',
        'Python sidecar implementation code import backend',
        'Local Runtime Python Sidecar Folder Structure',
        'local-runtime Python sidecar provides',
        'Python Sidecar Runtime Flow',
        'Sidecar receives content + embedding',
        'SDK local runtime invokes the Python sidecar daemon',
        'Python sidecar RPC names stay',
        'SDK local runtime backed by the Python sidecar',
        'Python Sidecar Folder Topology',
        'sidecar package import surfaces',
        'sidecar package public exports',
        'Python sidecar services',
        'The sidecar invokes Browser Use',
        '## Sidecar Runtime State',
        'window operations through the Python sidecar implementation',
        'host OS automation and local tool execution through the current Python sidecar implementation',
        'Python sidecar implementation folder topology maps',
        'Python sidecar implementation service/tool topology flow',
        "make the Python sidecar implementation guess the app's endpoint policy",
        'Do not make desktop client or local-runtime Python implementation code import',
        'do not make desktop client or Python sidecar implementation code import backend code',
        'do not make desktop client or local-runtime Python implementation code import backend code',
        'do not make desktop client or local-runtime Python implementation code import',
        'Do not let desktop client or local-runtime Python implementation code import',
        'Keep desktop client and local-runtime Python implementation imports',
        'Hard rule: do not make desktop client or local-runtime Python implementation code import',
        '| Python sidecar | Local executable tools',
        'Python sidecar browser tests',
        'Python sidecar computer tests',
        'desktop client or Python sidecar implementation code import',
        'desktop client or local-runtime Python implementation code import',
        'desktop client and local-runtime Python implementation imports',
        'Python sidecar implementation import backend schemas',
        'the Python sidecar implementation must not import',
        'Python sidecar implementation performs the local action',
        '| Python sidecar implementation | concrete implementation',
        'preload, Python sidecar implementation, wakeword subprocess',
        'Python sidecar implementation details',
        'local-runtime, Python sidecar implementation, and SDK boundaries',
        'when the Python sidecar implementation is involved behind the SDK local runtime',
        'Python sidecar implementation change',
        'Python sidecar implementation modules',
        'Python sidecar implementation contracts',
        'the Python sidecar implementation, main-process bridge',
        'Python sidecar implementation logs to stderr',
        'Add Python sidecar implementation + arg schema',
        'Python sidecar tool catalogs',
        'backed by Python sidecar modules',
        'Python sidecar modules back',
        'the Python sidecar modules own',
        'Python sidecar-backed',
        'Python sidecar implementations',
        'Python sidecar tool entrypoint',
        'Python sidecar tool result models',
        'concrete Python sidecar tool',
        'executable Python sidecar tools',
        'sidecar tool registration/exposure behavior',
        'sidecar computer/system/filesystem/shell tool behavior',
        'The `browser` sidecar tool',
        'sidecar tool validation and engine mapping',
        'platform-specific sidecar tool test',
        'sidecar tool payloads or result shapes changed',
        'sidecar tooling/tests',
        'sidecar tools evolved',
        'sidecar becomes sole source for all model-facing behavior',
        'backed by the Python sidecar',
        'backed by Python sidecar',
        'backed by Python sidecar Browser Use engine',
        'backed by Python sidecar Chrome detection',
        'Python sidecar entrypoint',
        'Python sidecar protocol',
        'Python sidecar wakeword service',
        'desktop client/Python sidecar code',
        'Did any desktop client or local-runtime Python code start',
        'desktop client or local-runtime Python code',
        'desktop client websocket/endpoint tests',
        'desktop client websocket/main IPC tests',
        'desktop client must provide the field',
        'desktop client contract tests',
        'desktop client/session snapshot',
        'desktop client-session runtime client',
        'desktop client OS/capability overrides',
        'desktop client operating-system prompt rewrites',
        'desktop client operating-system override',
        'desktop client operating-system + workspace',
        'desktop client OS remains user-scoped session context',
        'Hosted desktop clients bootstrap identity',
        'packaged desktop clients',
        'desktop-host assumptions outside host skin/config boundaries',
        'desktop-hosted mode consistency',
        'hosted desktop runtimes supply pre-resolved',
        'Desktop host, renderer, and Python sidecar code',
        'Desktop host, renderer, and local-runtime Python code',
        'Python sidecar code owns concrete executable implementations',
        'backed by Python sidecar code',
        'Do not make the sidecar import backend schemas',
        'Do not import backend code into sidecar to mirror model-facing schemas',
        'Renderer, Electron main, and Python sidecar code',
        'desktop client or Python sidecar code',
        'Desktop client and Python sidecar code',
        'Sidecar tool call returns unexpected payload',
        'Python Sidecar Runtime Inventory',
        'Sidecar tool modules',
        'Sidecar browser stack',
        'Sidecar tool schema/registry tests',
        'sidecar backend-bound clients',
        'launching the sidecar',
        'the sidecar consumes the resolved `AGENT_BACKEND_HTTP_URL`',
        'missing sidecar endpoint config',
        'primary sidecar endpoint override',
        '`BACKEND_HTTP_URL` is ignored in the sidecar',
        'sidecar routing',
        'Missing sidecar endpoint config',
        'wrong endpoint in sidecar',
        'sidecar defaults',
        'Sidecar storage RPC names',
        'sidecar ToolResult tests',
      ].filter((needle) => source.includes(needle));
      if (staleMentions.length > 0) {
        offenders[relativePath] = staleMentions;
      }
    }

    expect(offenders).toEqual({});
  });

  test('renderer docs and contract tests use sdk source-event boundary wording', async () => {
    const boundaryFiles = [
      'docs/frontend/renderer/chat_stream_and_tool_execution_reference.md',
      'docs/frontend/renderer/chat/stream/conversation_event_ingress_failsafe_and_dispatch_order_reference.md',
      'docs/frontend/renderer/chat/stream/conversation_gate_and_active_turn_filtering_reference.md',
      'docs/frontend/renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md',
      'docs/concepts/streaming_and_events.md',
      'docs/frontend/runtime/stream_event_state_machine.md',
      'docs/architecture/frontend_architecture.md',
      'docs/frontend/inventory/frontend_capability_to_file_matrix_reference.md',
      'docs/frontend/contracts/ipc_channels_and_event_contracts.md',
      'docs/frontend/main/query_payload_and_relay_reference.md',
      'tests/frontend/BackendSdkWebsocketContract.test.cjs',
      'tests/frontend/RendererChatRuntimeBoundary.test.ts',
      'tests/frontend/ChatInterfaceWiring.test.jsx',
      'tests/frontend/ChatStreamThinkingStatus.state.test.tsx',
      'tests/frontend/ConversationSessionRuntime.test.ts',
      'tests/frontend/WindieDocsIndex.test.cjs',
    ];
    const offenders: Record<string, string[]> = {};

    for (const relativePath of boundaryFiles) {
      const source = await read(relativePath);
      const staleMentions = [
        'raw backend',
        'frontend/backend websocket incoming contract',
        'frontend outbound payload filter',
        'frontend command family',
        'FrontendBackendWebsocketContract',
        'WindieSdkContextEnrichment',
      ].filter((needle) => source.includes(needle));
      if (staleMentions.length > 0) {
        offenders[relativePath] = staleMentions;
      }
    }

    expect(offenders).toEqual({});
  });

  test('current frontend inventory docs do not route work to deleted renderer runtimes', async () => {
    const currentInventoryDocs = [
      'docs/frontend/inventory/README.md',
      'docs/frontend/inventory/domains/README.md',
      'docs/frontend/inventory/frontend_runtime_surface_matrix_reference.md',
      'docs/frontend/inventory/frontend_capability_to_file_matrix_reference.md',
      'docs/frontend/inventory/frontend_functionality_capability_catalog_reference.md',
      'docs/frontend/renderer/chat/README.md',
      'docs/frontend/contracts/events/README.md',
      'docs/frontend/contracts/events/tool_runtime/README.md',
      'docs/frontend/inventory/domains/frontend_change_path_playbook_reference.md',
      'docs/frontend/inventory/domains/frontend_domain_ownership_matrix_reference.md',
      'docs/frontend/inventory/frontend_module_file_index_reference.md',
      'docs/frontend/main/ipc_event_replay_and_transcript_session_sync_reference.md',
      'docs/frontend/main/query_send_and_stream_relay_change_workflow.md',
      'docs/frontend/contracts/memory_ipc_and_rpc_mapping_reference.md',
      'docs/frontend/contracts/events/schema/README.md',
      'docs/frontend/contracts/events/tool_runtime/tool_call_and_tool_output_recovery_skip_execution_contract_reference.md',
      'docs/frontend/contracts/events/from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md',
      'docs/frontend/contracts/backend_event_consumer_matrix_reference.md',
      'docs/frontend/renderer/chat/chat_store_state_and_new_session_rotation_reference.md',
      'docs/frontend/renderer/dashboard/dashboard_change_workflow.md',
      'docs/frontend/renderer/dashboard/README.md',
      'docs/frontend/renderer/dashboard/shell/dashboard_section_router_and_placeholder_panel_contract_reference.md',
      'docs/frontend/renderer/dashboard/shell/dashboard_conversation_hook_search_polling_and_group_bucket_contract_reference.md',
      'docs/frontend/renderer/dashboard/shell/dashboard_recent_conversation_loader_retry_and_title_visibility_poll_runtime_reference.md',
      'docs/frontend/renderer/dashboard_memory_management_and_resume_reference.md',
      'docs/frontend/renderer/feature_module_matrix.md',
      'docs/frontend/renderer/renderer_runtime.md',
      'docs/frontend/renderer/transcript/README.md',
      'docs/frontend/renderer/transcript/contracts/README.md',
      'docs/frontend/renderer/transcript/contracts/transcript_entry_type_contract_reference.md',
      'docs/frontend/inventory/protocols/state/frontend_protocol_session_and_conversation_state_propagation_reference.md',
      'docs/frontend/inventory/protocols/state/README.md',
      'docs/frontend/inventory/frontend_ipc_and_sidecar_contract_touchpoints_reference.md',
      'docs/frontend/inventory/frontend_full_functionality_inventory_reference.md',
      'docs/architecture/storage_persistence_change_workflow.md',
      'docs/reference/code_change_surface_index.md',
      'docs/frontend/renderer/infrastructure/conversation_transcript_loader_and_display_bounds_storage_reference.md',
      'docs/frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md',
      'docs/frontend/runtime/tool_execution_and_streaming.md',
      'docs/frontend/runtime/frontend_runtime_surface_main_renderer_sidecar_and_vm_worker_reference.md',
      'docs/architecture/README.md',
      'docs/architecture/data_flow_and_state_ownership.md',
      'docs/architecture/agent_visible_data_pipeline.md',
      'docs/architecture/tool_system.md',
      'docs/architecture/storage_persistence_change_workflow.md',
      'docs/automation/vm_run_control_change_workflow.md',
      'docs/frontend/local_runtime_tool_change_workflow.md',
      'docs/frontend/main/local_backend/process_lifecycle_change_workflow.md',
      'docs/frontend/runtime/settings_sync_change_workflow.md',
      'docs/frontend/sidecar/memory_pipeline_and_summarization.md',
      'docs/frontend/renderer/README.md',
      'docs/frontend/renderer/renderer_state_change_workflow.md',
      'docs/frontend/README.md',
      'docs/frontend/renderer/chat/payloads/README.md',
      'docs/frontend/renderer/infrastructure/README.md',
      'docs/frontend/renderer/chat_stream_and_tool_execution_reference.md',
      'docs/frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md',
      'docs/frontend/renderer/providers/entrypoint_view_routing_and_provider_stack_reference.md',
      'docs/frontend/sidecar/local_backend_jsonrpc_change_workflow.md',
      'docs/frontend/preload/preload_channel_allowlist_and_renderer_bridge_reference.md',
      'docs/concepts/agent_loop.md',
      'docs/concepts/runtime_model.md',
      'docs/concepts/prompt_and_tool_context.md',
      'docs/getting-started/docs_hub.md',
      'docs/desktop/artifact_change_workflow.md',
      'docs/desktop/dashboard.md',
      'docs/desktop/onboarding_permissions.md',
      'docs/platforms/README.md',
      'docs/platforms/windows.md',
      'docs/security/permissions_and_local_authority_workflow.md',
      'docs/browser/browser_troubleshooting.md',
      'docs/browser/browser_change_workflow.md',
      'docs/backend/agent/tool_turn_change_workflow.md',
      'docs/backend/runtime/agent_and_tool_runtime.md',
      'docs/backend/runtime/query_lifecycle_change_workflow.md',
      'docs/backend/agent/interaction_loop_and_tool_turn_orchestration_reference.md',
      'docs/backend/agent/llm/conversation_context_and_event_presenter_prompt_metadata_reference.md',
      'docs/backend/agent/history_compaction_engine_decision_strategy_and_event_contract_reference.md',
      'docs/backend/agent/history/history_committer_and_result_processor_boundary_reference.md',
      'docs/backend/tools/tool_result_ingress_and_storage_reference.md',
      'docs/backend/tools/execution/tool_sender_local_runtime_dispatch_and_synthetic_error_result_reference.md',
      'docs/backend/tools/execution/sender/request_id_extraction_and_failed_bundle_result_storage_reference.md',
      'docs/backend/api/api_route_change_workflow.md',
      'docs/backend/services/backend_service_change_workflow.md',
      'docs/backend/api/handlers/non_query_handler_dispatch_and_payload_normalization_reference.md',
      'docs/backend/contracts/message_types/message_type_constants_schema_subset_and_handler_ack_reference.md',
      'docs/backend/api/processing/formatters/messages/assistant_user_system_and_complete_formatter_payload_contract_reference.md',
      'docs/backend/api/processing/formatters/messages/error_formatter_guard_and_schema_mapping_reference.md',
      'docs/backend/api/processing/formatters/signals/chunk_and_thinking_formatter_required_content_and_skip_contract_reference.md',
      'docs/backend/api/processing/formatter_dispatch_and_schema_alignment_reference.md',
      'docs/backend/llm/providers/base_request_stream_and_normalization_reference.md',
      'docs/backend/inventory/protocols/observability/backend_protocol_correlation_logging_and_telemetry_signal_reference.md',
      'docs/debug/error_failure_change_workflow.md',
      'docs/debug/observability_change_workflow.md',
      'docs/debug/runtime_traces.md',
      'docs/debug/logging.md',
      'docs/debug/symptom_playbooks.md',
      'docs/development/review_and_risk_checklist.md',
      'docs/debug/endpoint_and_network_debugging.md',
      'docs/debug/test_selection.md',
      'docs/getting-started/troubleshooting.md',
      'docs/help/diagnostics.md',
      'docs/help/faq.md',
      'docs/help/troubleshooting.md',
      'docs/help/triage_routes.md',
      'docs/security/credential_token_change_workflow.md',
      'docs/security/credentials_and_tokens_matrix.md',
      'docs/security/security_boundary_matrix.md',
      'docs/security/security_change_playbook.md',
      'docs/development/mcp.md',
      'docs/memory/sidecar_local_memory.md',
      'docs/memory/session_conversation_identity_change_workflow.md',
      'docs/memory/memory_change_workflow.md',
      'docs/memory/memory_troubleshooting.md',
      'docs/channels/sidecar_and_tool_channels.md',
      'docs/channels/README.md',
      'docs/channels/channel_routing_matrix.md',
      'docs/concepts/model_provider_selection.md',
      'docs/concepts/safety_boundaries.md',
      'docs/nodes/README.md',
      'docs/nodes/runtime_node_matrix.md',
      'docs/operations/performance.md',
      'docs/operations/configuration_change_workflow.md',
      'docs/providers/provider_change_workflow.md',
      'docs/providers/credentials.md',
      'docs/providers/model_catalog_change_workflow.md',
      'docs/providers/openai.md',
      'docs/providers/anthropic.md',
      'docs/providers/openrouter.md',
      'docs/providers/mistral.md',
      'docs/providers/kimi_coding.md',
      'docs/backend/config/backend_config_and_container_change_workflow.md',
      'docs/backend/config/config_fields_and_runtime_policy.md',
      'docs/frontend/inventory/domains/frontend_domain_ownership_matrix_reference.md',
      'docs/frontend/renderer/settings/README.md',
      'docs/frontend/renderer/settings/config/frontend_config_filter_storage_and_provider_merge_runtime_reference.md',
      'docs/frontend/renderer/settings/model_settings_change_workflow.md',
      'docs/frontend/renderer/settings/sections/settings_section_tabs_and_wakeword_toggle_runtime_reference.md',
      'docs/frontend/renderer/app_startup_vm_mode_and_permission_onboarding_runtime_reference.md',
      'docs/planning/windieos_self_edit_config_plan.md',
      'docs/planning/windieos_cli_os_control_plan.md',
      'docs/development/testing.md',
      'docs/development/validation_matrix.md',
      'docs/development/agent_development_workflow.md',
      'docs/development/README.md',
      'docs/development/developer_guide.md',
      'docs/frontend/sidecar/browser/contracts/schema_registry_and_action_validation_boundary_reference.md',
      'docs/sdk/windie_client_runtime.md',
      'docs/backend/simulation/simulation_backend_and_mock_llm_runtime_reference.md',
      'docs/backend/inventory/backend_cross_layer_contract_touchpoints_reference.md',
      'docs/backend/inventory/protocols/README.md',
      'docs/backend/tools/contracts/tool_domain_and_category_enum_contract_reference.md',
      'docs/backend/tools/registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md',
      'docs/sdk/agent_definition.md',
      'docs/architecture/README.md',
      'docs/architecture/agent_visible_data_pipeline.md',
      'docs/architecture/architecture.md',
      'docs/architecture/failure_domain_map.md',
      'docs/architecture/memory_system.md',
      'docs/architecture/tool_system.md',
      'docs/automation/automation_boundaries.md',
      'docs/automation/vm_run_control_change_workflow.md',
      'docs/concepts/README.md',
      'docs/concepts/context_and_memory.md',
      'docs/concepts/prompt_and_tool_context.md',
      'docs/concepts/runtime_model.md',
      'docs/concepts/sessions_and_conversations.md',
      'docs/README.md',
      'docs/tools/computer.md',
      'docs/tools/tool_execution_lifecycle.md',
      'docs/tools/README.md',
      'docs/tools/tool_troubleshooting.md',
      'docs/tools/filesystem_shell.md',
      'docs/tools/tool_schema_policy_change_workflow.md',
      'docs/tools/tool_catalog_matrix.md',
      'docs/tools/tool_contracts.md',
      'docs/backend/tools/registry/README.md',
      'docs/development/tool_development.md',
      'docs/development/extensions.md',
      'docs/adr/004-browser-extension-auto-attach.md',
      'docs/adr/README.md',
      'docs/adr/005-frontend-tool-schema-source-of-truth.md',
      'docs/getting-started/docs_hub.md',
      'docs/getting-started/overview.md',
      'docs/getting-started/docs_directory.md',
      'docs/help/faq.md',
      'docs/help/README.md',
      'docs/help/evidence_packet.md',
      'docs/help/doctor_checklist.md',
      'docs/install/README.md',
      'docs/install/install_decision_matrix.md',
      'docs/install/local_backend_and_endpoint_setup.md',
      'docs/install/local_development.md',
      'docs/install/install_troubleshooting.md',
      'docs/desktop/README.md',
      'docs/desktop/dashboard.md',
      'docs/desktop/minimal_chat_pill.md',
      'docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md',
      'docs/getting-started/installation.md',
      'docs/operations/packaging_and_reinstall_runbooks.md',
      'docs/operations/evidence_collection_runbook.md',
      'docs/operations/incident_triage_runbook.md',
      'docs/platforms/platform_change_workflow.md',
      'docs/platforms/linux.md',
      'docs/platforms/windows.md',
      'docs/platforms/window_input_matrix.md',
      'docs/reference/openclaw_docs_structure_reference.md',
      'docs/reference/session_and_transcript_reference.md',
      'docs/security/security_boundary_matrix.md',
      'docs/frontend/landing/landing_page_runtime_and_content_reference.md',
      'docs/frontend/landing/sections/hero_how_available_and_roadmap_section_content_contract_reference.md',
      'docs/frontend/landing/sections/why_privacy_cta_footer_and_shared_intro_component_contract_reference.md',
      'docs/README.md',
      'docs/architecture/architecture.md',
      'docs/architecture/communication_flow.md',
      'docs/architecture/frontend_architecture.md',
      'docs/backend/inventory/backend_cross_layer_contract_touchpoints_reference.md',
      'docs/backend/inventory/domains/backend_change_path_playbook_reference.md',
      'docs/development/agent_runtime_ownership_and_change_routing.md',
      'docs/frontend/inventory/protocols/frontend_ipc_and_local_backend_protocol_surface_matrix_reference.md',
      'docs/frontend/main/main_process_change_workflow.md',
      'docs/frontend/contracts/backend_websocket_command_contract.md',
      'docs/frontend/inventory/frontend_ipc_and_sidecar_contract_touchpoints_reference.md',
      'docs/frontend/runtime/workspace_context_change_workflow.md',
      'docs/frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md',
      'docs/nodes/runtime_node_matrix.md',
      'docs/security/credential_token_change_workflow.md',
      'docs/operations/configuration_change_workflow.md',
      'docs/operations/operational_troubleshooting.md',
      'docs/operations/runtime_configuration_matrix.md',
      'docs/backend/api/processing/formatters/signals/chunk_and_thinking_formatter_required_content_and_skip_contract_reference.md',
      'docs/gateway/websocket_connection_change_workflow.md',
      'docs/frontend/sidecar/browser/browser_runtime_deterministic_extraction_contract_reference.md',
      'docs/memory/backend_history_and_semantic_routes.md',
      'docs/memory/session_conversation_identity_change_workflow.md',
      'docs/frontend/renderer/dashboard/dashboard_change_workflow.md',
      'docs/frontend/renderer/dashboard_memory_management_and_resume_reference.md',
      'docs/frontend/renderer/dashboard/sections/memory_section_data_normalization_and_semantic_delete_contract_reference.md',
      'docs/frontend/renderer/settings/settings_surface_change_workflow.md',
      'docs/frontend/main/query_send_and_stream_relay_change_workflow.md',
      'docs/frontend/main/query_payload_and_relay_reference.md',
      'docs/frontend/sidecar/README.md',
      'docs/frontend/sidecar/python_sidecar_and_memory.md',
      'docs/frontend/sidecar/local_runtime_python_change_workflow.md',
      'docs/frontend/sidecar/local_backend_jsonrpc_reference.md',
      'docs/frontend/sidecar/local_backend_jsonrpc_change_workflow.md',
      'docs/frontend/sidecar/memory/README.md',
      'docs/frontend/sidecar/memory/storage/README.md',
      'docs/frontend/sidecar/memory_pipeline_and_summarization.md',
      'docs/frontend/sidecar/memory/summarizer_watermark_and_conversation_batch_reference.md',
      'docs/frontend/sidecar/memory/storage/conversation_search_helper_term_snippet_grouping_and_timestamp_contract_reference.md',
      'docs/frontend/sidecar/memory/storage/local_memory_store_embedding_search_and_memory_type_routing_reference.md',
      'docs/frontend/sidecar/memory/storage/sqlite_schema_migration_faiss_index_and_watermark_state_reference.md',
      'docs/architecture/agent_visible_data_pipeline.md',
      'docs/cli/validation_commands.md',
      'docs/debug/observability_change_workflow.md',
      'docs/frontend/contracts/memory_ipc_and_rpc_mapping_reference.md',
      'docs/frontend/contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md',
      'docs/frontend/inventory/domains/frontend_domain_ownership_matrix_reference.md',
      'docs/frontend/inventory/domains/frontend_change_path_playbook_reference.md',
      'docs/frontend/inventory/frontend_full_functionality_inventory_reference.md',
      'docs/frontend/inventory/frontend_ipc_and_sidecar_contract_touchpoints_reference.md',
      'docs/frontend/inventory/frontend_runtime_surface_matrix_reference.md',
      'docs/frontend/ipc_change_workflow.md',
      'docs/browser/README.md',
      'docs/development/README.md',
      'docs/development/agent_architecture_reference.md',
      'docs/development/extensions.md',
      'docs/install/install_decision_matrix.md',
      'docs/nodes/desktop_and_sidecar_node.md',
      'docs/planning/windieos_mobile_app_plan.md',
      'docs/plugins/README.md',
      'docs/providers/inference_capability_change_workflow.md',
      'docs/sdk/sdk_route_change_workflow.md',
      'docs/tools/tool_execution_lifecycle.md',
      'src/renderer/folder_structure.md',
    ];

    const offenders: Record<string, string[]> = {};
    for (const relativePath of currentInventoryDocs) {
      const source = await read(relativePath);
      const staleMentions = [
        'src/renderer/features/chat/hooks/useToolRunner.ts',
        'src/renderer/infrastructure/services/ToolExecutionService.ts',
        'src/renderer/infrastructure/transcript/TranscriptWriter.ts',
        'src/renderer/infrastructure/transcript/conversationReplayState.ts',
        'renderer/useToolRunner.ts',
        'Tool runner service',
        'Transcript writer queues',
        'TranscriptWriter',
        'conversationReplayState.ts',
        'backward compatibility',
        'compatibility path',
        'Main process backend bridge',
        'revived generic backend bridge',
        `${retiredProductName('OS')} frontend is a multi-runtime desktop stack`,
        `${retiredProductName('OS')} frontend has four live runtimes`,
        `Current ${retiredProductName('OS')} frontend architecture across Electron main`,
        `${retiredProductName('OS')} frontend implementation details across Electron main process`,
        ['Electron main owns desktop', 'shell policy'].join(' '),
        ['sidecar supervision,', 'wakeword supervision'].join(' '),
        `${retiredProductName('OS')} owns schema validation, local transport, Chrome/CDP launch policy, browser-local files, and result normalization`,
        `${retiredProductName('OS')} dedicated browser control`,
        `${retiredProductName('OS')} dedicated browser runtime`,
        `Workflow for safely adding, changing, or removing ${retiredProductName('OS')} Electron IPC channels`,
        `Workflow for changing ${retiredProductName('OS')} Electron main-process behavior`,
        `${retiredProductName('OS')} IPC is a trust boundary`,
        `Workflow for changing ${retiredProductName('OS')} local-runtime tools`,
        `${retiredProductName('OS')} tool execution crosses four layers`,
        `Workflow for changing ${retiredProductName('OS')} local-runtime Python implementation behavior`,
        `Workflow for adding, changing, or debugging ${retiredProductName('OS')} local-runtime JSON-RPC methods`,
        `Workflow for changing ${retiredProductName('OS')} dashboard behavior`,
        `Desktop shell surfaces hub for ${retiredProductName('OS')} dashboard`,
        `main ${retiredProductName('OS')} desktop workspace`,
        `${retiredProductName('OS')} is not only a chat UI`,
        `Workflow for changing ${retiredProductName('OS')} dashboard settings surfaces`,
        `Workflow for changing ${retiredProductName('OS')} settings model selection`,
        `Workflow for changing ${retiredProductName('OS')} chat attachments`,
        `Workflow for changing ${retiredProductName('OS')} overlay phase`,
        `Workflow for changing ${retiredProductName('OS')} websocket event contracts`,
        `build a ${retiredProductName('OS')} UI on top of the SDK`,
        `Workflow for adding or changing ${retiredProductName('OS')} logs`,
        `Workflow for changing ${retiredProductName('OS')} error and failure surfaces`,
        `how ${retiredProductName('OS')} fails`,
        `Workflow for changing ${retiredProductName('OS')} model-visible tool schemas`,
        `model-visible ${retiredProductName('OS')} tool`,
        `${retiredProductName('OS')} tool behavior is split`,
        `End-to-end ${retiredProductName('OS')} tool execution lifecycle`,
        `${retiredProductName('OS')} tools run through a distributed pipeline`,
        `into ${retiredProductName('OS')} tool-call shapes`,
        `Local tools cross every ${retiredProductName('OS')} runtime boundary`,
        'screenshots that include WindieOS UI',
        'Screenshot captures WindieOS UI',
        'Screenshot includes WindieOS UI',
        'Screenshot hides WindieOS UI',
        `Cross-platform screenshot, overlay visibility, and content-protection policy for ${retiredProductName('OS')} chat pill`,
        `hide ${retiredProductName('OS')} overlays for screenshot capture`,
        `${retiredProductName('OS')} overlay windows`,
        `${retiredProductName('OS')} overlay surfaces`,
        `${retiredProductName('OS')} appears in screenshots`,
        `screenshot excludes ${retiredProductName('OS')} UI`,
        `screenshot includes ${retiredProductName('OS')} UI`,
        `Linux hides visible ${retiredProductName('OS')}`,
        'Sidecar roots',
        'sidecar platform tools',
        'Do not make sidecar depend on conda',
        'import backend code into the sidecar to reuse those schemas',
        'SDK local runtime + sidecar callback wiring',
        'Frontend Tool Execution Service',
        'Electron Frontend',
        'Renderer invokes tool',
        'renderer dispatch',
        'renderer tool-runner',
        'renderer-tool-runner',
        'tool-runner-result',
        'Did renderer send `tool-result`',
        'Retired Renderer Tool Execution Runtime',
        'renderer orchestration',
        'frontend tool execution',
        'renderer result relay',
        'tool_execution_service_and_hook_runtime',
        'Tool Execution Service and Hook Runtime',
        'Frontend Tool Execution Service',
        'frontend-facing transparency',
        'frontend request/response state',
        'frontend stream consumer',
        'frontend stream consumers',
        'frontend stream docs',
        'frontend stream tests',
        'frontend token display/tracking',
        'frontend tracking consumers',
        'frontend persistence uses',
        'frontend thinking-status',
        'frontend-preformatted',
        'frontend stop payload',
        'Frontend-managed provider',
        'frontend-managed provider',
        'frontend-managed key',
        'frontend-config patch',
        'frontend config filtering',
        'frontend config ownership',
        'frontend settings a broad',
        'frontend settings fields',
        'frontend settings docs',
        'frontend settings/picker',
        'frontend settings ACK',
        'frontend settings reconciliation',
        'Frontend settings can',
        'Frontend settings:',
        'local frontend config',
        'persisted frontend config',
        'frontend model picker',
        'frontend overrides',
        'frontend patch',
        'frontend config state',
        'frontend config to',
        'frontend config with',
        'syncs frontend config',
        'resyncs frontend config',
        'frontend-config persistence',
        'frontend config handlers',
        'frontend-patch validation',
        'Frontend Setting Is Ignored',
        'Electron frontend-config persistence',
        'Existing frontend config persistence',
        'Inspect frontend config persistence',
        'remain in frontend config',
        'frontend consumers',
        'frontend consumer',
        'frontend-visible',
        'frontend display paths',
        'frontend settings surface',
        'frontend model-settings',
        'frontend settings sync',
        'generic desktop-' + 'agent Browser Use',
        'Desktop ' + 'Agent Browser Use Session',
        'tool_execution_backend_envelope',
        'Tool Execution Backend Envelope Builder',
        'Retired Renderer Tool Result Envelope',
        'Renderer tool execution:',
        'useToolRunner',
        'ToolExecutionService',
        'renderer tool execution',
        'backend callback fanout',
        'broadcasts `local-user-message`',
        '`local-user-message` for cross-window/replay parity',
        'main synthetic `local-user-message`',
        'Add a new renderer -> backend command',
        'backend transport mapping under `renderer/app/runtime`',
        'Request models list from backend',
        'backend communication (dependency injection)',
        'Handles model listing events from backend',
        'Backend sends audio-chunk event',
        'frontend-completed result futures',
        'Transforms frontend tool outputs',
        'Tool Result Ingress from Frontend',
        'delegates to `session.process_local_tool_result(...)`',
        'delegates to `session.process_local_tool_bundle_result(...)`',
        'Tool events execute in frontend/sidecar',
        'Frontend/sidecar executable tools run local actions',
        'backend/frontend tool-name',
        'frontend/sidecar-authored executable',
        'frontend sidecar executor',
        'Frontend sidecar (execution)',
        'sidecar manifest entry enables this tool',
        'Core backend/frontend/sidecar tool files',
        'Frontend Tool Schema Source of Truth',
        'frontend-config atomic',
        'backend/frontend/sidecar',
        'backend/frontend exposed-tool',
        'backend/frontend drift',
        'frontend/backend contract drift',
        'frontend/backend code boundary',
        'backend/frontend contract surface',
        'backend/frontend runtime changes',
        'frontend/backend consumers',
        'frontend websocket client header construction',
        'frontend websocket/endpoint tests',
        'frontend-tool-schemas',
        'planned post-handshake frontend tool schema',
        'frontend tool schemas',
        'default ' + 'Windie' + 'OS agent',
        'backend/default ' + 'Windie' + 'OS tools',
        'Windie' + 'OS built-in tools',
        'hosted ' + 'Windie' + 'OS usable',
        'Windie' + 'OS agents without the Electron desktop app',
        'frontend endpoint/auth code',
        'frontend websocket/main IPC tests',
        'frontend contract updates',
        'frontend runtime services after execution',
        'frontend runtime event guards',
        'features/dashboard/utils/*',
        'src/renderer/features/dashboard/utils/*',
        'dashboard utility ownership',
        'Windie' + 'OS onboarding is a first-run gate',
        'Windie' + 'OS streaming events',
        'Windie' + 'OS turn executes',
        'Windie' + 'OS agent loop is backend-owned',
        'Windie' + ' reports conversation metadata invalidation',
        'renderer owns turn-level UI/send/stream behavior',
        'useChatStream.ts` remains the canonical stream-event state machine',
        'src/renderer/features/permissions/utils/*',
        'frontend or sidecar impact',
        'Frontend consumer',
        'Frontend/sidecar owners',
        'Renderer tool runner, Electron bridge, or sidecar',
        'Renderer correlation IDs from tool runner',
        'frontend sidecar adapts',
        'Electron frontend owns desktop windows',
        'Frontend and sidecar code must not import backend code',
        'frontend/sidecar must not import backend schema code',
        'frontend/sidecar Python must never import backend Python modules',
        'Python sidecar runtime modules do not import backend Python packages',
        'Python sidecar runtime imports independent',
        'frontend/sidecar runtime imports independent',
        'Sidecar runtime and shared modules',
        'sidecar browser runtime modules do not import',
        'sidecar runtime imports reach into backend packages',
        'backend imports sidecar runtime code',
        'backend browser schema + sidecar browser runtime',
        'backend/sidecar browser schema parity',
        'The shared backend/sidecar schema',
        'sidecar boundary used by',
        'Backend vs Sidecar Validation Split',
        'backend/sidecar dependencies',
        'Sidecar runtime requirement/build change',
        'Sidecar runtime build:',
        'macOS sidecar adapter',
        'Electron + sidecar adapters',
        'Main/sidecar boundary:',
        'sidecar remains tool executor',
        'sidecar JSON-RPC call behind',
        'sidecar requests targeting the wrong backend URL',
        'Did Electron main route JSON-RPC to the Python sidecar process',
        'Confirm Electron main can reach the sidecar process',
        'Python sidecar schema together',
        'sidecar docs when executable behavior changes',
        'backend-vs-sidecar schema parity',
        'sidecar schema validation remains authoritative',
        'Sync sidecar schema',
        'main/sidecar transcript RPC mapping',
        'SDK/main -> sidecar',
        'sidecar launch path',
        'packaged sidecar uses `resources/python-runtime`',
        'sidecar plaintext Python sources are removed before packaging',
        'cannot launch the sidecar',
        'sidecar launch code',
        'Packaged POSIX sidecar launches',
        'sidecar processes resolve',
        'Electron sidecar launch environment',
        'Main process or sidecar launch environment points the sidecar',
        'standalone sidecar launches default',
        'packaged-sidecar python path lookup',
        'packaged sidecar launch behavior',
        'SDK sidecar launch plan',
        'SDK sidecar launch planning',
        'SDK sidecar launch helpers',
        'SDK sidecar launch options',
        'focused wakeword, sidecar launch',
        'If sidecar shows ready=false indefinitely',
        'Python sidecar launch/result boundaries',
        'changing sidecar Browser Use engine routing',
        'Main/sidecar screenshot behavior',
        'main/sidecar behavior',
        'reaches the Python sidecar',
        'Python sidecar bridge',
        'packaged app cannot launch sidecar',
        'Proxies to sidecar `get_system_state`',
        'Local SDK sidecar process/readiness status',
        'Runtime-aware sidecar launch path',
        'main/sidecar route',
        'sidecar response is unsuccessful',
        'Python sidecar response shape',
        'sidecar API token forwarding',
        'new sidecar surfaces',
        'snake_case sidecar params',
        'sidecar protocol files',
        'Main-to-sidecar scoped host bridge',
        'Installed app cannot start sidecar',
        'Endpoint resolution and sidecar backend config',
        'desktop and sidecar trees expose',
        'two sidecar service entrypoints',
        'sidecar folder ownership',
        'When moving sidecar modules',
        'When adding/changing sidecar JSON-RPC methods',
        'daemon-backed sidecar calls',
        'sidecar startup failure',
        'sidecar startup env/path resolution',
        'malformed sidecar request handling',
        'Sidecar request parsing',
        'packaged app cannot start sidecar',
        'sidecar startup and JSON-RPC hot paths',
        'Local-runtime sidecar startup times out',
        'sidecar JSON-RPC/tool',
        'Python sidecar JSON-RPC handlers',
        'sidecar JSON-RPC internals',
        'sidecar JSON-RPC `get_system_state`',
        'sidecar call fails before reaching Python',
        'frontend/sidecar code import backend modules',
        'frontend/sidecar code must never import backend code',
        'Client-local runtime and sidecar code must not import',
        'plus sidecar method registry',
        'tests, sidecar handler tests',
        'provider tests, sidecar daemon tests',
        'tests, sidecar memory/conversation tests',
        'dispatch tests, sidecar tool tests',
        'router tests, sidecar tool tests',
        'focused sidecar tool tests',
        'Add sidecar protocol tests',
        'main bridge tests, sidecar protocol tests',
        'focused sidecar tests',
        'Add or change a sidecar JSON-RPC method',
        'Sidecar process lifecycle/readiness',
        'sidecar process launch parameters',
        'sidecar process launch path from Electron logs',
        'sidecar process startup failures',
        'IPC bridge, sidecar process, windows',
        'launches the Python sidecar process from that bundle',
        '- sidecar process starts',
        'Sidecar transcript store methods',
        'Main IPC, Backend Relay, and Sidecar Bridge',
        'Sidecar scoped host bridge',
        'Main-to-sidecar JSON-RPC',
        'Electron-to-sidecar JSON-RPC methods',
        'Use sidecar JSON-RPC when',
        'sidecar JSON-RPC, SDK, voice',
        'sidecar JSON-RPC, local tools',
        'sidecar propagation',
        'sidecar backend URL propagation',
        '## Local Backend',
        'local backend mode',
        'force Electron dev to use the local backend',
        'renderer, sidecar, providers, and tools',
        'maps the request to sidecar JSON-RPC',
        'sidecar action compatibility',
        'then sidecar browser runtime',
        'sidecar browser logs',
        'Backend Emits Browser Tool But Sidecar Does Nothing',
        'hosted backend, Electron main, renderer, preload, or sidecar',
        'sidecar requirements, install auth',
        'desktop UI, SDK, sidecar, and backend',
        'sidecar local storage',
        'sidecar JSON-RPC execution',
        'sidecar, and landing',
        'sidecar services',
        'sidecar Python services',
        'Sidecar python files',
        'Sidecar runtime (`src/main/python`, `.py`)',
        'Sidecar Python (`src/main/python`, `.py`)',
        'Sidecar Python File Index',
        'Local Runtime Sidecar Implementation Domains',
        'Local Runtime Sidecar Capability Catalog',
        'Sidecar backend HTTP clients',
        'what the sidecar executes',
        'what sidecar executes',
        'the same names the sidecar executes',
        'after sidecar executes',
        'Electron bridge or sidecar',
        'Sidecar local memory/search',
        'transcript/replay/local memory | renderer plus sidecar memory',
        'transcript row id/index | sidecar memory store',
        'sidecar memory search via Electron main',
        'Sidecar transcript/memory SQLite',
        'Change sidecar memory SQLite schema',
        'Sidecar SQLite/memory schema',
        'Transcript persistence, replay, sidecar local memory',
        'Route transcript, replay, sidecar memory',
        'Backend history plus SDK transcript projection plus sidecar memory',
        'Sidecar local memory storage and retrieval',
        'sidecar memory calls store under fallback users',
        'sidecar memory/API calls hit',
        'sidecar memory route hits wrong backend',
        'backend URL used by sidecar memory/API clients',
        'sidecar env, SDK helpers',
        'sidecar receives `WINDIE_BACKEND_HTTP_URL`',
        'executable local tool implementation | sidecar',
        'sidecar transcript/memory',
        'sidecar local store during migration',
        'sidecar path/tool decisions',
        'sidecar path handling',
        'IPC/backend/sidecar path',
        'right sidecar method',
        'Sidecar should delete',
        'sidecar shell tool',
        'sidecar runtime enforcement',
        'sidecar runtime keeps',
        'Primary sidecar runtime implementation',
        'sidecar runtime maps',
        'sidecar method registration',
        'expected sidecar method',
        'Python sidecar method registry',
        'chat or memory sidecar methods',
        'Register the sidecar method',
        'sidecar method not found',
        'sidecar method names',
        'Sidecar method names may still exist',
        'sidecar method contracts',
        'sidecar method params',
        'sidecar method signature',
        'Sidecar method tests',
        'sidecar method, and docs',
        'Use `runtime.rpc(...)` for sidecar methods',
        'renderer/main/sidecar protocol boundaries',
        'sidecar/landing ownership boundaries',
        '| Sidecar execution | Python tool registry',
        'sidecar runtime starts without system Python/conda',
        'sidecar browser runtime and CDP profile ownership',
        'Browser Use sidecar adapter',
        'strict backend/sidecar browser action schema',
        'browser action execution in the sidecar/browser runtime',
        'debug sidecar runtime, CDP',
        'sidecar points to different backend than websocket',
        'sidecar URL drift checks',
        'sidecar auth headers',
        'sidecar remote-client auth',
        'sidecar auth-state path, sidecar bearer header',
        'sidecar remote client base or Electron sidecar env',
        'sidecar parity, SDK/main dispatch',
        'Local-runtime sidecar tool arg schemas',
        'sidecar clients',
        'sidecar env propagation',
        'sidecar sees backend URL changes',
        'sidecar runtime, not hosted backend',
        'renderer settings, sidecar env, or Electron endpoint code',
        'Sidecar receives only normalized env values',
        'endpoint, sidecar, signing, or bundled runtime',
        'environment, endpoint, sidecar, permission',
        'SDK-owned sidecar daemon lifecycle',
        'Packaged app, sidecar runtime, reinstall',
        'Electron packaging, sidecar bundling',
        'Sidecar or Electron tool bridge issue',
        'main sidecar env injection',
        '`WINDIE_BACKEND_HTTP_URL` in sidecar env',
        'sidecar endpoint drift',
        'Sidecar owns local execution variables and backend URLs needed by sidecar memory/API clients',
        'Check sidecar memory store',
        'sidecar memory store, backend history',
        'sidecar local memory, backend history',
        'Memory/search/title issue | sidecar memory store',
        'for transcript, replay, sidecar memory',
        'routing transcript, replay, sidecar memory',
        'Validate renderer transcript tests, sidecar memory tests',
        'Sidecar Local Memory',
        'Verify the sidecar memory directory',
        'support sidecar memory retrieval',
        'sidecar memory search results',
        'renderer transcript, sidecar memory, backend history',
        'local-runtime sidecar memory admin',
        'asks the sidecar memory index',
        'sidecar local memory files',
        'sidecar memory store/search pipeline',
        'Python sidecar local memory/search',
        '| Sidecar memory |',
        'Sidecar memory retrieval plus backend prompt constructor',
        'sidecar memory search, Electron query payload',
        'Electron query payload, sidecar memory',
        'sidecar memory or clients use it',
        'sidecar memory may treat embedding unavailability',
        'sidecar memory docs if the route response',
        'sidecar semantic memory indexing quality',
        'sidecar memory service',
        'state, sidecar memory JSON-RPC',
        'mutate sidecar memory files directly',
        'transcript storage, sidecar memory',
        'relevant sidecar memory tests',
        'performs sidecar memory search',
        'Changing sidecar memory payload shape',
        'SDK conversation/memory store tests plus related sidecar memory tests',
        'may call sidecar memory helpers',
        'Sidecar memory/system-state enrichment change',
        'sidecar memory RPC handlers',
        'If sidecar memory operations return wrong filters',
        'Renderer/main/sidecar memory',
        'Sidecar memory RPC names',
        'Sidecar memory handlers return',
        'verify sidecar memory store is initialized',
        'sidecar memory actions',
        'sidecar memory admin/store',
        'sidecar admin path',
        'sidecar memory admin',
        'main/sidecar memory actions',
        'Sidecar memory operation tests',
        'Sidecar memory runtime',
        'Sidecar memory handlers',
        'Sidecar Memory Docs Hub',
        'Sidecar Memory Storage Docs Hub',
        'Local Runtime Sidecar Memory Docs Hub',
        'Local Runtime Sidecar Memory Storage Docs Hub',
        'Detailed sidecar memory pipeline',
        'sidecar memory persistence helpers',
        'When changing sidecar memory table',
        'all sidecar memory and summarizer behavior',
        'Sidecar memory handler mixin',
        'sidecar JSON-RPC methods directly behind',
        'calls the sidecar directly through',
        'sidecar JSON-RPC method and params',
        'sidecar JSON-RPC method params stay snake_case',
        'sidecar memory handler defaults',
        'sidecar search path applies',
        '`search_memory_by_embedding` sidecar RPC',
        'sidecar episodic grouping',
        'backed by sidecar episodic',
        'When changing sidecar memory:',
        'sidecar memory starts calling',
        'Local Runtime Sidecar Memory Hub',
        'Local Runtime Sidecar Memory Storage Hub',
        'SDK owns sidecar RPC unwrapping',
        'sidecar memory implementation details',
        'sidecar RPC mappers',
        'Local sidecar RPC request timeout',
        'Sidecar memory summarizer deep reference',
        'The sidecar summarizer periodically',
        'Renderer code must not call sidecar RPC names',
        '| sidecar local tool runtime variable changed',
        'and sidecar runtime reader',
        '| Python sidecar | local tool env flags',
        '| sidecar runtime |',
        'Sidecar receives the active backend URL',
        'Sidecar env injected by Electron main',
        'Sidecar env |',
        'sidecar env, provider credentials',
        '## Sidecar Env Changes',
        'Sidecar env changes must be validated',
        'sidecar daemon env',
        'Sidecar daemon env',
        'Sidecar daemon test env',
        'or sidecar env.',
        'Python sidecar env should change from a setting',
        'Sidecar owns local tool runtime env',
        'sidecar env, or release/packaging config',
        'Python sidecar env changes are validated',
        'sidecar env propagation',
        'main sidecar env injection',
        'in sidecar env',
        'Sidecar or Electron tool bridge issue',
        'sidecar sees backend URL changes',
        'sidecar tools, or VM run control flows',
        'sidecar executable tool under',
        'sidecar daemon routing',
        'Sidecar-facing IPC channels',
        'sidecar returns error before action',
        'sidecar tool validation/runtime',
        'sidecar executable payloads',
        'sidecar tool, SDK/IPC router tests',
        'sidecar tool runtime',
        'sidecar tool registry -> platform action',
        'sidecar tool modules',
        'sidecar tool argument shape issues',
        'sidecar tool logic',
        'sidecar tool schema/registry',
        'sidecar tool path',
        'sidecar tool internals',
        'generic sidecar tools',
        'sidecar tool ran',
        '| sidecar tool implementation |',
        'sidecar tool files',
        'sidecar tools expected by backend schemas',
        'Python sidecar tool schemas through explicit parity tests',
        'existing sidecar control tools',
        'CLI -> sidecar UI action tests',
        'sidecar assumptions',
        'sidecar parity for V1',
        'supports_local_sidecar',
        'Local sidecar memory/tool runtime',
        'hosted SDK vs sidecar split',
        '[Sidecar and Tool Channels]',
        'Python sidecar tools | schema parity',
        'voice, sidecar tools, SDK',
        '[**Sidecar and Tool Channels**]',
        'execution in sidecar tools',
        'use sidecar tools.',
        '| local computer/filesystem/shell/browser execution | sidecar tools |',
        'belongs in the sidecar tool implementation',
        'preload, sidecar, platform',
        'preload, sidecar, wakeword',
        'belongs in backend, Electron main, renderer, preload, sidecar',
        '| sidecar process |',
        'sidecar tool registry/tool',
        'sidecar platform adapter',
        'sidecar platform code',
        'websocket, sidecar tool, SDK',
        'packaged app sidecar fails',
        '| Python sidecar | local tools',
        '| sidecar tool | sidecar pytest',
        'hosted backend websocket primitives, sidecar tool implementation',
        '| Python sidecar | local tool execution',
        'sidecar or Electron main',
        'sidecar tool schemas are paired contracts',
        'client manifest and sidecar schema',
        'renderer/main/sidecar ownership boundaries',
        'Sidecar (Python): local tool execution',
        'Local sidecar calls',
        'Python sidecar tool runtime',
        'sidecar/backend config propagation',
        'Workspace permission and sidecar tool runtime',
        'Route to the backend, SDK/main, renderer, or sidecar owner',
        'Validate tool result path and sidecar JSON-RPC before changing backend schema',
        'sidecar local runtime',
        'sidecar tool arg schemas',
        'sidecar tool runtime issues',
        'participant L as Local sidecar',
        'preserve request correlation and sidecar ownership',
        'Renderer/main/sidecar ownership bug',
        'sidecar tool execution',
        'Sidecar browser runtime is feature-pack aware',
        'Sidecar tool contract is direct-name based',
        'Wrapper artifacts are not live sidecar tool names',
        'Frontend documentation hub covering Electron main process, renderer runtime, tool execution services, and Python sidecar behavior',
        'main/renderer/sidecar boundaries',
        'frontend/sidecar: `frontend_jarvis`',
        'edit renderer/main/sidecar behavior quickly',
        'Electron main, sidecar process',
        'Electron main, sidecar, packaged app',
        'desktop/sidecar traffic',
        'owning main/renderer/sidecar tests',
        'Current exhaustive frontend functionality inventory across Electron main, preload bridge, renderer runtime, and Python sidecar services.',
        'When auditing frontend behavior ownership across main/renderer/sidecar.',
        'backend, Electron main, renderer, preload, and sidecar boundaries',
        'hosted auth, IPC isolation, validation, credentials, tools, and sidecar boundaries',
        'sidecar parity when executable fields change',
        'prepared sidecar arguments',
        'web_search` is backend-owned and does not participate in sidecar parity tests',
        'sidecar parity tests |',
        'frontend implementation details across Electron main process, React renderer, and Python sidecar runtime',
        '| Python sidecar | Local JSON-RPC',
        'Python sidecar executable implementations',
        'Python sidecar executors',
        'Sidecar executable tools',
        'sidecar executable manifest evidence',
        'Python sidecar executable owner',
        '| Sidecar executor |',
        'expected by the sidecar exists',
        'Add Python sidecar executable registration',
        'Python sidecar runtime bug',
        'Python sidecar says tool not found',
        'Python sidecar registry/schema/runtime',
        'Python sidecar startup owns local execution variables',
        'Python sidecar browser validation',
        'through the Python sidecar',
        'current Python sidecar adapters',
        'the Python sidecar normalizes',
        'Python sidecar browser registry tests',
        'Python sidecar browser handler',
        'Python sidecar Chrome launcher',
        'Python sidecar Chrome launcher/controller',
        'Python sidecar snapshot/ref/action executor',
        'Python sidecar enhanced CDP pipeline',
        'Python sidecar browser action',
        'Python sidecar Browser Use engine adapter',
        'Python sidecar Browser Use handler bindings',
        'Python sidecar computer tools and platform adapter',
        'Local-runtime implementation node (Python sidecar)',
        'sidecar pytest coverage',
        'preload, Python sidecar',
        'Python sidecar subprocess',
        'focused Python sidecar pytest',
        'the Python sidecar implements the current SQLite backing store',
        'Sidecar transcript storage/list/window/delete',
        'Sidecar conversation search',
        'implemented by the Python sidecar',
        'Current implementation: Python sidecar',
        'the Python sidecar is the current concrete implementation',
        '[Python Sidecar]',
        'Python sidecar stdout',
        'Python sidecar stderr',
        'Python sidecar spawn env/readiness',
        'Python sidecar platform dependency warnings',
        'plugin Python entrypoints are loaded by the sidecar',
        'Stop Electron/sidecar first',
        'sidecar should not mutate it directly',
        'sidecar wrapper router',
        'Bundled wakeword and sidecar reinstall guidance',
        'hard-coding WindieOS wording and sidecar/backend',
        '## Sidecar Responsibilities (`src/main/python`)',
        '# local runtime bridge, daemon manager',
        'Sidecar daemon entrypoint',
        'Python sidecar hosted-helper HTTP clients',
        'Python sidecar handler exception',
        'sidecar handler signatures',
        'sidecar handler/protocol tests',
        'Implement and test the sidecar handler',
        'main bridge calls sidecar `get_system_state`',
        'sidecar handler returns',
        'if sidecar fails or bridge errors',
        'normalizes sidecar success/error responses',
        'sidecar snake_case params',
        'sidecar env, or Electron endpoint',
        'endpoint, sidecar, signing',
        'sidecar storage',
        'sidecar handler, and SQLite',
        'dashboard asks sidecar for conversations',
        'sidecar storage boundary',
        'Sidecar `conversation.append_event`',
        'sidecar search SQL',
        'sidecar DB',
        'sidecar storage internals',
        'sidecar chat event handler',
        'sidecar `conversation.append_event` tests',
        'sidecar transcript tests',
        'sidecar conversation list/search/title tests',
        'sidecar conversation storage/list/search/title',
        'Sidecar conversation list/search/title/delete behavior',
        'sidecar conversation-store payload shape',
        'sidecar write/read RPCs',
        'sidecar authority',
        'Sidecar executes local tools',
        'sidecar executes the drag',
        'Python sidecar split',
        'Install Python sidecar dependencies',
        'starts the Python sidecar',
        'Install Python Sidecar Dependencies',
        'Verify Python sidecar running',
        'Check sidecar logs',
        'standalone sidecar service startup/shutdown',
        'sidecar service scripts',
        'for the sidecar daemon, tool catalog',
        'Python sidecar unit test for the executable tool',
        'Python sidecar computer implementations',
        'Python sidecar scoped host bridge',
        'current Python sidecar read/edit internals',
        'current Python sidecar shell/session internals',
        'Python sidecar `ToolRegistry.execute_tool`',
        'Python sidecar executes',
        'local-runtime Python sidecar process',
        'local-runtime Python sidecar',
        'Local-runtime Python sidecar',
        'Local-Runtime Python Sidecar',
        'sidecar stderr handling',
        'Prevents sidecar browser feature-pack auto-install',
        'local-runtime Python sidecar, wakeword service',
        'Python sidecar stderr logs',
        'sidecar stderr logging or system metrics',
        '| Python sidecar runtime |',
        'The sidecar owns host OS automation',
        'The sidecar owns host-window discovery',
        'The sidecar owns local-machine actions',
        'The Python sidecar owns host OS automation',
        'The Python sidecar owns host-window discovery',
        'Python sidecar owns method registration',
        'Python sidecar owns local authority',
        'Python sidecar owns local execution',
        'The sidecar owns local episodic',
        'The sidecar owns local SQLite/FAISS',
        'The sidecar owns what can actually run locally',
        '| sidecar env should change from a setting',
        'Electron frontend, renderer, preload',
        'split across backend, frontend, and sidecar',
        'without the Electron frontend',
        'run the Electron frontend',
        'SDK/Electron frontend sends',
        'SDK/main dispatches executable tool calls through Electron main to the sidecar',
        'Local execution belongs in renderer/Electron/sidecar code',
        'ipc.cjs keeps backend transport and frontend session state',
        'sidecar owns local execution + memory/runtime dependency bootstrap',
        'sidecar owns execution',
        'sidecar-owned hosted helper services',
        'sidecar-owned source topology map',
        'sidecar-owned diagnostic/execution shape',
        'sidecar runtime tool',
        'Sidecar owner',
        'Wakeword sidecar service',
        'If sidecar-owned, inspect sidecar launch env or JSON-RPC action path',
        'sidecar-owned config fields',
        'Local sidecar JSON-RPC host',
        'Sidecar core remote clients',
        'Sidecar local runtime',
        'Sidecar wakeword service',
        'Sidecar request dispatch',
        'Sidecar tool execution',
        '| Sidecar runtime core |',
        '| Sidecar tool runtime |',
        'sidecar `tools/schemas.py`',
        'sidecar browser adapter/runtime',
        'sidecar-owned schema/result adapters',
        'sidecar-owned MCP discovery',
        'sidecar-owned SDK/local-runtime MCP registration',
        'sidecar-owned MCP `tools/call` execution',
        'SDK/sidecar local runtime',
        'SDK local runtime and local Python sidecar',
        'The sidecar starts each enabled MCP server',
        'The sidecar sends MCP',
        'The sidecar calls `tools/list`',
        'executable sidecar local tools',
        'routes it to the sidecar',
        'routes local calls to the sidecar',
        'Plugin tools execute in the Python sidecar',
        '| Sidecar built-in tools |',
        'The sidecar sends MCP `tools/call`',
        'backend bridge logic',
        'Tool runtime services',
        'Tool execution stack',
        'tool execution and capture',
        'Tool execution bundling, payload normalization, capture orchestration',
        'sidecar direct-tool exposure contract used for backend parity',
        'live sidecar registry exposes concrete tool names only',
        'Sidecar tools are not permission-gated by default',
        'Sidecar tool result failures',
        'Sidecar tools should return',
        'sidecar tools should return',
        'Sidecar Runtime and Tool Domains',
        'Sidecar Tool Registration Surface',
        'Sidecar Tool Schemas',
        'Python Sidecar Runtime and Memory',
        'Sidecar tool catalog',
        'Change sidecar tool failure behavior',
        'Tool call hangs after sidecar failure',
        'sidecar tool or backend tool-result ingress',
        'generic sidecar tool channel',
        'sidecar tool screenshots',
        'sidecar browser tools',
        'Cover sidecar behavior',
        '| Sidecar daemon |',
        'Sidecar computer tools:',
        'model-visible sidecar tool',
        'If a Python sidecar tool cannot execute a visible tool',
        'the Python sidecar execute another',
        '| Python sidecar executed but model never continued |',
        'backend tool-turn tests, SDK coordinator/runtime tests, main IPC tool-router tests, Python sidecar tool tests',
        '| sidecar tool |',
        'backend browser schema tests plus sidecar browser tests',
        'Frontend/sidecar conda env name',
        'backend, renderer, and sidecar implementation',
        'backend, renderer, and sidecar runtimes run from the checkout',
        'SDK sidecar outputs',
        'invoking the sidecar without a result id',
        'Python sidecar says missing tool',
        '| Python sidecar succeeds but model never sees result |',
        'SDK-owned local tool dispatch, sidecar routing',
        'Sidecar browser runtime and Electron session UI',
        'sidecar screenshot/input',
        '| Sidecar local tools,',
        'Sidecar Registry and Result Contract',
        'Sidecar Computer Runtime',
        'SDK-owned sidecar daemon lifecycle',
        'sidecar call forwarding',
        'built-in Python sidecar tool behavior',
        'sidecar tools docs for built-in',
        'Check sidecar `ToolRegistry.execute_tool`',
        '| Packaged app, sidecar runtime,',
        'Electron packaging, sidecar bundling',
        'sidecar runtime bundling',
        'sidecar runtime packaging',
        'sidecar runtime builds',
        'sidecar runtime build',
        'sidecar runtime dependencies',
        'sidecar runtime deps',
        'Sidecar runtime build, Electron package',
        'Sidecar Chrome Detection + Launcher',
        'Sidecar Runtime Packaging',
        'bundled sidecar runtime packaging',
        'bundled sidecar runtime',
        'Bundled sidecar runtime',
        'missing sidecar runtime',
        'package build, sidecar runtime',
        'bundled Python sidecar runtime',
        'Build Sidecar Runtime',
        'Build the bundled Python sidecar runtime',
        'Build bundled Python sidecar runtime',
        'Sidecar processes run from',
        'Packaged sidecar runtime',
        'packaged sidecar runtime',
        'Packaged sidecar uses `resources/python-runtime`',
        'verify sidecar starts',
        'Packaged app cannot start sidecar',
        'exercises the sidecar',
        'deterministic markdown extraction in sidecar',
        'desktop sidecar daemon',
        'bytecode-only sidecar sources',
        'features/dashboard/utils/modelSelectionUtils.js',
        'dashboard/utils/modelSelectionUtils',
        'modelSelectionUtils.js',
        'Workflow for changing WindieOS renderer state',
      ].filter((needle) => source.includes(needle));
      if (staleMentions.length > 0) {
        offenders[relativePath] = staleMentions;
      }
    }

    expect(offenders).toEqual({});

    const frontendArchitectureText = await read('docs/architecture/frontend_architecture.md');
    expect(frontendArchitectureText).toContain('Current WindieOS desktop app architecture');
    expect(frontendArchitectureText).toContain('desktop app implementation is a multi-runtime stack');

    const frontendReadmeText = await read('docs/frontend/README.md');
    expect(frontendReadmeText).toContain('Desktop app implementation hub');
    expect(frontendReadmeText).toContain('WindieOS desktop app implementation details');

    const agentArchitectureReferenceText = await read('docs/development/agent_architecture_reference.md');
    expect(agentArchitectureReferenceText).toContain('## Desktop App Architecture');
    expect(agentArchitectureReferenceText).toContain('desktop app has four live runtime surfaces');
    expect(agentArchitectureReferenceText).toContain('Electron main owns agent host policy plus OS/window/permission adapters');

    const moduleFileIndexText = await read('docs/frontend/inventory/frontend_module_file_index_reference.md');
    expect(moduleFileIndexText).toContain('Hosted backend owns model-facing browser policy and schema exposure.');
    expect(moduleFileIndexText).toContain('The local-runtime Python browser adapter owns Chrome/CDP launch policy');

    const codeSurfaceIndexText = await read('docs/reference/code_change_surface_index.md');
    expect(codeSurfaceIndexText).toContain('SDK-owned local-runtime daemon lifecycle');
    expect(codeSurfaceIndexText).toContain('Electron packaging, bundled Python runtime');
  });

  test('voice routing docs use renderer and electron owner labels', async () => {
    const docs = await Promise.all([
      read('docs/channels/voice_audio_change_workflow.md'),
      read('docs/channels/README.md'),
      read('docs/channels/voice_and_audio_channels.md'),
      read('docs/desktop/voice_and_wakeword.md'),
      read('docs/frontend/runtime/audio_chunk_playback_and_stop_semantics_reference.md'),
      read('docs/frontend/renderer/infrastructure/audio/player_service_queue_generation_and_error_recovery_reference.md'),
      read('docs/frontend/renderer/voice_capture_and_wakeword_controller_reference.md'),
      read('docs/frontend/renderer/voice/README.md'),
      read('docs/frontend/renderer/voice/wakeword_detection_ipc_capture_and_cooldown_reference.md'),
      read('docs/getting-started/docs_hub.md'),
      read('docs/help/triage_routes.md'),
      read('docs/architecture/frontend_architecture.md'),
      read('docs/nodes/runtime_node_matrix.md'),
      read('docs/README.md'),
      read('src/renderer/folder_structure.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('Renderer Voice Capture');
    expect(docText).toContain('Electron Wakeword Bridge');
    expect(docText).toContain('local-runtime wakeword helper');
    expect(docText).toContain('local-runtime wakeword helper backed by the Python service');
    expect(docText).toContain('local-runtime wakeword helper backed by the Python wakeword service');
    expect(docText).toContain('local-runtime wakeword helper backed by the Python wakeword subprocess');
    expect(docText).toContain('typed `audio-chunk` side-channel');
    expect(docText).toContain('DesktopAudioRuntimeClient');
    expect(docText).not.toContain('Frontend Voice Capture');
    expect(docText).not.toContain('Frontend Wakeword Bridge');
    expect(docText).not.toContain('Sidecar wakeword service');
    expect(docText).not.toContain('Python sidecar owns wakeword model bootstrap');
    expect(docText).not.toContain('Electron bridge to the sidecar wakeword service');
    expect(docText).not.toContain('renderer microphone chunks -> Electron main -> Python sidecar wakeword service');
    expect(docText).not.toContain('wakeword path: renderer -> Electron IPC -> main wakeword bridge -> Python wakeword service');
    expect(docText).not.toContain('wakeword chunks do not reach sidecar');
    expect(docText).not.toContain('microphone chunk framing into sidecar');
    expect(docText).not.toContain('sidecar wakeword service, backend transcription');
    expect(docText).not.toContain('Main process forwards to Python wakeword service');
    expect(docText).not.toContain('Main wakeword bridge forwards framed audio to Python wakeword subprocess');
    expect(docText).not.toContain('openWakeWord integration via Python subprocess with audio chunk streaming');
    expect(docText).not.toContain('wakeword detection via openWakeWord');
    expect(docText).not.toContain('Local Runtime Sidecar Wakeword Bridge and Audio Framing Reference');
    expect(docText).not.toContain('Sidecar wakeword service:');
    expect(docText).not.toContain('Electron main relays them to renderer through `from-backend`');
    expect(docText).not.toContain('renderer `from-backend` guards');
    expect(docText).not.toContain('Electron wakeword bridge -> sidecar subprocess');
  });
});
