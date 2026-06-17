/** @jest-environment node */

const fs = require('node:fs');
const path = require('node:path');

function loadCjs(relativePath) {
  return require(path.resolve(__dirname, relativePath));
}

describe('@windie/sdk private helper exports', () => {
  test('transport compatibility module is removed and websocket URL normalization stays private', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/transport/AgentSession.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/transport/WindieAgentSession.js',
    );

    expect(canonicalModule.AgentSession).toBeDefined();
    expect(canonicalModule.WindieAgentSession).toBeUndefined();
    expect(canonicalModule.createWindieAgentSession).toBeUndefined();
    expect(canonicalModule.createWindieAgentBackendTransport).toBeUndefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
    expect(canonicalModule.deriveWsUrl).toBeDefined();
    expect(canonicalModule.normalizeWsUrl).toBeUndefined();
  });

  test('compacted replay store module exports only the public snapshot helper', () => {
    const replayModule = loadCjs('../../packages/windie-sdk-js/cjs/stores/compactedReplayEvents.js');

    expect(replayModule.latestCompactedReplayFromEvents).toBeDefined();
    expect(replayModule.compactedReplayFromEvent).toBeUndefined();
  });

  test('sidecar store compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/stores/LocalRuntimeConversationStore.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/stores/SidecarConversationStore.js',
    );

    expect(canonicalModule.LocalRuntimeConversationStore).toBeDefined();
    expect(canonicalModule.SidecarConversationStore).toBeUndefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('managed Windie session compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/transport/ManagedAgentSession.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/transport/ManagedWindieAgentSession.js',
    );

    expect(canonicalModule.ManagedAgentSession).toBeDefined();
    expect(canonicalModule.ManagedWindieAgentSession).toBeUndefined();
    expect(canonicalModule.createManagedWindieAgentSession).toBeUndefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('Windie chat session compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/AgentChatSession.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/runtime/WindieChatSession.js',
    );

    expect(canonicalModule.AgentChatSession).toBeDefined();
    expect(canonicalModule.WindieChatSession).toBeUndefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('Windie client module remains a compatibility wrapper for agent client runtime', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/AgentClient.js');
    const compatibilityModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/WindieClient.js');

    expect(canonicalModule.AgentClient).toBeDefined();
    expect(canonicalModule.WindieClient).toBeUndefined();
    expect(compatibilityModule.AgentClient).toBe(canonicalModule.AgentClient);
    expect(compatibilityModule.WindieClient).toBe(canonicalModule.AgentClient);
  });

  test('Windie local sidecar runtime compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/LocalSidecarRuntime.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/runtime/WindieLocalSidecarRuntime.js',
    );

    expect(canonicalModule.createAgentLocalRuntimeProvider).toBeDefined();
    expect(canonicalModule.createWindieLocalRuntimeProvider).toBeUndefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('Windie agent module remains a compatibility wrapper for agent runtime', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/Agent.js');
    const compatibilityModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/WindieAgent.js');

    expect(canonicalModule.Agent).toBeDefined();
    expect(canonicalModule.WindieAgent).toBeUndefined();
    expect(compatibilityModule.Agent).toBe(canonicalModule.Agent);
    expect(compatibilityModule.WindieAgent).toBe(canonicalModule.Agent);
  });

  test('Windie agent stream events compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/AgentStreamEvents.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/runtime/WindieAgentStreamEvents.js',
    );

    expect(canonicalModule.toAgentStreamEvents).toBeDefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('Windie backend socket factory compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/transport/BackendSocketFactory.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/transport/WindieBackendSocketFactory.js',
    );

    expect(canonicalModule.createAgentBackendSocket).toBeDefined();
    expect(canonicalModule.createWindieSdkBackendSocket).toBeUndefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('Windie hosted backend client compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/transport/HostedBackendHttpClient.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/transport/WindieHostedBackendHttpClient.js',
    );

    expect(canonicalModule.AgentHostedBackendClient).toBeDefined();
    expect(canonicalModule.WindieSdkClient).toBeUndefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('Windie conversation runtime compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/runtime/ConversationRuntime.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/runtime/WindieConversationRuntime.js',
    );

    expect(canonicalModule.SdkConversationRuntime).toBeDefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('Windie builtins compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/tools/builtins.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/tools/WindieBuiltins.js',
    );

    expect(canonicalModule.agentBuiltins).toBeDefined();
    expect(canonicalModule.windieBuiltins).toBeUndefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('Windie model selection compatibility module is removed', () => {
    const canonicalModule = loadCjs('../../packages/windie-sdk-js/cjs/settings/modelSelection.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/settings/WindieModelSelection.js',
    );

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
