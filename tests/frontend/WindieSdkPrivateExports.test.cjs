/** @jest-environment node */

const fs = require('node:fs');
const path = require('node:path');

describe('@windie/sdk private helper exports', () => {
  test('transport module keeps websocket URL normalization private', () => {
    const canonicalModule = require('../../packages/windie-sdk-js/cjs/transport/AgentSession.js');
    const sessionModule = require('../../packages/windie-sdk-js/cjs/transport/WindieAgentSession.js');

    expect(canonicalModule.AgentSession).toBeDefined();
    expect(canonicalModule.WindieAgentSession).toBeUndefined();
    expect(canonicalModule.createWindieAgentSession).toBeUndefined();
    expect(canonicalModule.createWindieAgentBackendTransport).toBeUndefined();
    expect(sessionModule.WindieAgentSession).toBe(canonicalModule.AgentSession);
    expect(sessionModule.createWindieAgentSession).toBe(canonicalModule.createAgentSession);
    expect(sessionModule.createWindieAgentBackendTransport).toBe(canonicalModule.createAgentBackendTransport);
    expect(sessionModule.createWindieAgentSession).toBeDefined();
    expect(sessionModule.deriveWsUrl).toBeDefined();
    expect(sessionModule.normalizeWsUrl).toBeUndefined();
  });

  test('compacted replay store module exports only the public snapshot helper', () => {
    const replayModule = require('../../packages/windie-sdk-js/cjs/stores/compactedReplayEvents.js');

    expect(replayModule.latestCompactedReplayFromEvents).toBeDefined();
    expect(replayModule.compactedReplayFromEvent).toBeUndefined();
  });

  test('sidecar store compatibility module is removed', () => {
    const canonicalModule = require('../../packages/windie-sdk-js/cjs/stores/LocalRuntimeConversationStore.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/stores/SidecarConversationStore.js',
    );

    expect(canonicalModule.LocalRuntimeConversationStore).toBeDefined();
    expect(canonicalModule.SidecarConversationStore).toBeUndefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('managed Windie session module remains a compatibility wrapper for managed agent session', () => {
    const canonicalModule = require('../../packages/windie-sdk-js/cjs/transport/ManagedAgentSession.js');
    const compatibilityModule = require('../../packages/windie-sdk-js/cjs/transport/ManagedWindieAgentSession.js');

    expect(canonicalModule.ManagedAgentSession).toBeDefined();
    expect(canonicalModule.ManagedWindieAgentSession).toBeUndefined();
    expect(canonicalModule.createManagedWindieAgentSession).toBeUndefined();
    expect(compatibilityModule.ManagedAgentSession).toBe(canonicalModule.ManagedAgentSession);
    expect(compatibilityModule.ManagedWindieAgentSession).toBe(canonicalModule.ManagedAgentSession);
    expect(compatibilityModule.createManagedAgentSession).toBe(canonicalModule.createManagedAgentSession);
    expect(compatibilityModule.createManagedWindieAgentSession).toBe(canonicalModule.createManagedAgentSession);
  });

  test('Windie chat session module remains a compatibility wrapper for agent chat session', () => {
    const canonicalModule = require('../../packages/windie-sdk-js/cjs/runtime/AgentChatSession.js');
    const compatibilityModule = require('../../packages/windie-sdk-js/cjs/runtime/WindieChatSession.js');

    expect(canonicalModule.AgentChatSession).toBeDefined();
    expect(canonicalModule.WindieChatSession).toBeUndefined();
    expect(compatibilityModule.AgentChatSession).toBe(canonicalModule.AgentChatSession);
    expect(compatibilityModule.WindieChatSession).toBe(canonicalModule.AgentChatSession);
  });

  test('Windie client module remains a compatibility wrapper for agent client runtime', () => {
    const canonicalModule = require('../../packages/windie-sdk-js/cjs/runtime/AgentClient.js');
    const compatibilityModule = require('../../packages/windie-sdk-js/cjs/runtime/WindieClient.js');

    expect(canonicalModule.AgentClient).toBeDefined();
    expect(canonicalModule.WindieClient).toBeUndefined();
    expect(compatibilityModule.AgentClient).toBe(canonicalModule.AgentClient);
    expect(compatibilityModule.WindieClient).toBe(canonicalModule.AgentClient);
  });

  test('Windie local sidecar runtime module remains a compatibility wrapper for local runtime', () => {
    const canonicalModule = require('../../packages/windie-sdk-js/cjs/runtime/LocalSidecarRuntime.js');
    const compatibilityModule = require('../../packages/windie-sdk-js/cjs/runtime/WindieLocalSidecarRuntime.js');

    expect(canonicalModule.createAgentLocalRuntimeProvider).toBeDefined();
    expect(canonicalModule.createWindieLocalRuntimeProvider).toBeUndefined();
    expect(compatibilityModule.createAgentLocalRuntimeProvider).toBe(canonicalModule.createAgentLocalRuntimeProvider);
    expect(compatibilityModule.createWindieLocalRuntimeProvider).toBe(canonicalModule.createAgentLocalRuntimeProvider);
  });

  test('Windie agent module remains a compatibility wrapper for agent runtime', () => {
    const canonicalModule = require('../../packages/windie-sdk-js/cjs/runtime/Agent.js');
    const compatibilityModule = require('../../packages/windie-sdk-js/cjs/runtime/WindieAgent.js');

    expect(canonicalModule.Agent).toBeDefined();
    expect(canonicalModule.WindieAgent).toBeUndefined();
    expect(compatibilityModule.Agent).toBe(canonicalModule.Agent);
    expect(compatibilityModule.WindieAgent).toBe(canonicalModule.Agent);
  });

  test('Windie agent stream events module remains a compatibility wrapper for agent stream events', () => {
    const canonicalModule = require('../../packages/windie-sdk-js/cjs/runtime/AgentStreamEvents.js');
    const compatibilityModule = require('../../packages/windie-sdk-js/cjs/runtime/WindieAgentStreamEvents.js');

    expect(canonicalModule.toAgentStreamEvents).toBeDefined();
    expect(compatibilityModule.toAgentStreamEvents).toBe(canonicalModule.toAgentStreamEvents);
    expect(compatibilityModule.toolOutputStreamKeys).toBe(canonicalModule.toolOutputStreamKeys);
  });

  test('Windie backend socket factory compatibility module is removed', () => {
    const canonicalModule = require('../../packages/windie-sdk-js/cjs/transport/BackendSocketFactory.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/transport/WindieBackendSocketFactory.js',
    );

    expect(canonicalModule.createAgentBackendSocket).toBeDefined();
    expect(canonicalModule.createWindieSdkBackendSocket).toBeUndefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('Windie hosted backend client compatibility module is removed', () => {
    const canonicalModule = require('../../packages/windie-sdk-js/cjs/transport/HostedBackendHttpClient.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/transport/WindieHostedBackendHttpClient.js',
    );

    expect(canonicalModule.AgentHostedBackendClient).toBeDefined();
    expect(canonicalModule.WindieSdkClient).toBeUndefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('Windie conversation runtime compatibility module is removed', () => {
    const canonicalModule = require('../../packages/windie-sdk-js/cjs/runtime/ConversationRuntime.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/runtime/WindieConversationRuntime.js',
    );

    expect(canonicalModule.SdkConversationRuntime).toBeDefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('Windie builtins compatibility module is removed', () => {
    const canonicalModule = require('../../packages/windie-sdk-js/cjs/tools/builtins.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/tools/WindieBuiltins.js',
    );

    expect(canonicalModule.agentBuiltins).toBeDefined();
    expect(canonicalModule.windieBuiltins).toBeUndefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('Windie model selection compatibility module is removed', () => {
    const canonicalModule = require('../../packages/windie-sdk-js/cjs/settings/modelSelection.js');
    const removedModulePath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/cjs/settings/WindieModelSelection.js',
    );

    expect(canonicalModule.buildModelSettingsPatch).toBeDefined();
    expect(fs.existsSync(removedModulePath)).toBe(false);
  });

  test('capability manifest module keeps summarization behind stamping API', () => {
    const manifestModule = require('../../packages/windie-sdk-js/cjs/runtime/CapabilityManifest.js');

    expect(manifestModule.stampAgentDefinitionCapabilityMetadata).toBeDefined();
    expect(manifestModule.setAgentDefinitionToolManifest).toBeDefined();
    expect(manifestModule.summarizeAgentDefinitionCapabilities).toBeUndefined();
  });
});
