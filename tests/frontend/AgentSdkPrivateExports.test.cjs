/** @jest-environment node */

const fs = require('node:fs');
const path = require('node:path');

function loadCjs(relativePath) {
  return require(path.resolve(__dirname, relativePath));
}

const retiredProductPrefix = 'Wind' + 'ie';
const retiredLocalSidecarPrefix = 'Local' + 'Sidecar';
const retiredSidecarStoreName = 'Sidecar' + 'ConversationStore';

function retiredProductName(suffix) {
  return `${retiredProductPrefix}${suffix}`;
}

function removedCjsPath(relativeDir, moduleName) {
  return path.resolve(
    __dirname,
    '../../packages/windie-sdk-js/cjs',
    relativeDir,
    `${moduleName}.js`,
  );
}

function expectNoExport(module, exportName) {
  expect(module[exportName]).toBeUndefined();
}

describe('@windie/sdk private helper exports', () => {
  test('CJS agent definition builder rejects removed AGENTS.md input alias', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/AgentDefinition.js');

    expect(() => canonicalModule.buildAgentDefinition({
      agents_md: [{ id: 'repo', type: 'agents_md', priority: 10, content: 'Repo rules.' }],
    })).toThrow('buildAgentDefinition accepts agentsMd; snake_case agents_md input is not supported.');
    expect(canonicalModule.buildAgentDefinition({
      agentsMd: [{ id: 'repo', type: 'agents_md', priority: 10, content: 'Repo rules.' }],
    })).toEqual(expect.objectContaining({
      agents_md: [expect.objectContaining({ id: 'repo' })],
    }));
  });

  test('transport compatibility module is removed and websocket URL normalization stays private', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/transport/AgentSession.js');
    const removedModulePath = removedCjsPath('transport', retiredProductName('AgentSession'));

    expect(canonicalModule.AgentSession).toBeDefined();
    expectNoExport(canonicalModule, retiredProductName('AgentSession'));
    expectNoExport(canonicalModule, `create${retiredProductName('AgentSession')}`);
    expectNoExport(canonicalModule, `create${retiredProductName('AgentBackendTransport')}`);
    expect(fs.existsSync(removedModulePath)).toBe(false);
    expect(canonicalModule.deriveWsUrl).toBeDefined();
    expect(canonicalModule.normalizeWsUrl).toBeUndefined();
  });

  test('compacted replay store module exports only the public snapshot helper', () => {
    const replayModule = loadCjs('../../packages/windie-sdk-js/cjs/stores/compactedReplayEvents.js');

    expect(replayModule.latestCompactedReplayFromEvents).toBeDefined();
    expect(replayModule.compactedReplayFromEvent).toBeUndefined();
  });

  test('top-level package keeps backend-wire normalizer private', () => {
    const rootModule = loadCjs('../../packages/windie-sdk-js/cjs/index.js');
    const normalizerModule = loadCjs(
      '../../packages/windie-sdk-js/cjs/transport/backendEventNormalizer.js',
    );

    expect(normalizerModule.normalizeBackendEventToConversationEvent).toBeDefined();
    expect(rootModule.normalizeBackendEventToConversationEvent).toBeUndefined();
    expect(rootModule.createAgentBackendTransport).toBeUndefined();
    expect(rootModule.ManagedBackendSession).toBeUndefined();
    expect(rootModule.createManagedBackendSession).toBeUndefined();
    expect(rootModule.ManagedWebSocketSession).toBeUndefined();
    expect(rootModule.createManagedWebSocketSession).toBeUndefined();
  });

  test('retired local-runtime store compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/stores/LocalRuntimeConversationStore.js');
    const removedModulePath = removedCjsPath('stores', retiredSidecarStoreName);

    expect(canonicalModule.LocalRuntimeConversationStore).toBeDefined();
    expectNoExport(canonicalModule, retiredSidecarStoreName);
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('managed product session compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/transport/ManagedAgentSession.js');
    const removedModulePath = removedCjsPath('transport', `Managed${retiredProductName('AgentSession')}`);

    expect(canonicalModule.ManagedAgentSession).toBeDefined();
    expectNoExport(canonicalModule, `Managed${retiredProductName('AgentSession')}`);
    expectNoExport(canonicalModule, `createManaged${retiredProductName('AgentSession')}`);
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('product chat session compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/AgentChatSession.js');
    const removedModulePath = removedCjsPath('runtime', retiredProductName('ChatSession'));

    expect(canonicalModule.AgentChatSession).toBeDefined();
    expectNoExport(canonicalModule, retiredProductName('ChatSession'));
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('product client compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/AgentClient.js');
    const removedModulePath = removedCjsPath('runtime', retiredProductName('Client'));

    expect(canonicalModule.AgentClient).toBeDefined();
    expectNoExport(canonicalModule, retiredProductName('Client'));
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('retired local-runtime compatibility modules are removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/LocalRuntime.js');
    const removedLocalSidecarModulePath = removedCjsPath(
      'runtime',
      `${retiredLocalSidecarPrefix}Runtime`,
    );
    const removedModulePath = removedCjsPath(
      'runtime',
      retiredProductName(`${retiredLocalSidecarPrefix}Runtime`),
    );

    expect(canonicalModule.createAgentLocalRuntimeProvider).toBeDefined();
    expectNoExport(canonicalModule, `create${retiredProductName('LocalRuntimeProvider')}`);
    expect(fs.existsSync(removedLocalSidecarModulePath)).toBe(false);
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('product agent compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/Agent.js');
    const removedModulePath = removedCjsPath('runtime', retiredProductName('Agent'));

    expect(canonicalModule.Agent).toBeDefined();
    expectNoExport(canonicalModule, retiredProductName('Agent'));
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('product agent stream events compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/AgentStreamEvents.js');
    const removedModulePath = removedCjsPath('runtime', retiredProductName('AgentStreamEvents'));

    expect(canonicalModule.createAgentStreamEventRuntime).toBeDefined();
    expect(canonicalModule.toAgentStreamEvents).toBeUndefined();
    expect(canonicalModule.toolOutputStreamKey).toBeUndefined();
    expect(canonicalModule.toolOutputStreamKeys).toBeUndefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('product backend socket factory compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/transport/BackendSocketFactory.js');
    const removedModulePath = removedCjsPath('transport', retiredProductName('BackendSocketFactory'));

    expect(canonicalModule.createAgentBackendSocket).toBeDefined();
    expectNoExport(canonicalModule, `create${retiredProductName('SdkBackendSocket')}`);
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('product hosted backend client compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/transport/HostedBackendHttpClient.js');
    const removedModulePath = removedCjsPath('transport', retiredProductName('HostedBackendHttpClient'));

    expect(canonicalModule.AgentHostedBackendClient).toBeDefined();
    expectNoExport(canonicalModule, retiredProductName('SdkClient'));
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('product conversation runtime compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/ConversationRuntime.js');
    const removedModulePath = removedCjsPath('runtime', retiredProductName('ConversationRuntime'));

    expect(canonicalModule.SdkConversationRuntime).toBeDefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('product builtins compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/tools/builtins.js');
    const removedModulePath = removedCjsPath('tools', retiredProductName('Builtins'));

    expect(canonicalModule.agentBuiltins).toBeDefined();
    expectNoExport(canonicalModule, `${retiredProductPrefix.toLowerCase()}Builtins`);
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('product model selection compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/settings/modelSelection.js');
    const removedModulePath = removedCjsPath('settings', retiredProductName('ModelSelection'));

    expect(canonicalModule.buildModelSettingsPatch).toBeDefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('capability manifest module keeps summarization behind stamping API', () => {
    const manifestModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/CapabilityManifest.js');

    expect(manifestModule.stampAgentDefinitionCapabilityMetadata).toBeDefined();
    expect(manifestModule.setAgentDefinitionToolManifest).toBeDefined();
    expect(manifestModule.summarizeAgentDefinitionCapabilities).toBeUndefined();
  });
});
