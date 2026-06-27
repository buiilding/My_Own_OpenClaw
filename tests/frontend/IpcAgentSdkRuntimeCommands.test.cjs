/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createAgentSdkRuntimeCommandsRuntime,
} = require('../../frontend/src/main/ipc/ipc_agent_sdk_runtime_commands.cjs');

function createCommands(overrides = {}) {
  const agent = {
    run: jest.fn(async () => ({ queryMessageId: 'query-1' })),
    stop: jest.fn(async () => {}),
    updateSettings: jest.fn(async payload => ({ updated: payload })),
    requestModelList: jest.fn(async () => ({ models: ['gpt-test'] })),
    wakewordDetected: jest.fn(async payload => ({ detected: payload })),
  };
  const deps = {
    ensureAgent: jest.fn(async () => agent),
    getActiveAgent: jest.fn(() => agent),
    resolveConversationRefFromPayload: jest.fn(() => 'conversation-1'),
    resolveWorkspacePathForAgent: jest.fn(() => '/repo/workspace'),
    clearLatestPendingTurn: jest.fn(),
    log: jest.fn(),
    agent,
    ...overrides,
  };
  return {
    deps,
    commands: createAgentSdkRuntimeCommandsRuntime(deps),
  };
}

describe('ipc_agent_sdk_runtime_commands', () => {
  const retiredFactorySignature = `function ${['createAgentSdkRuntime', 'Commands'].join('')}(`;

  test('sends query payloads through Agent SDK runtime with resources and metadata separated', async () => {
    const { commands, deps } = createCommands();

    await expect(commands.sendQueryThroughAgentSdkRuntime({
      messageId: 'turn-1',
      payload: {
        text: 'hello',
        resources: [{ type: 'file', id: 'file-1' }],
        metadata: { source: 'renderer' },
        conversation_ref: 'conversation-1',
      },
    })).resolves.toBe('query-1');

    expect(deps.ensureAgent).toHaveBeenCalledWith({
      reason: 'query',
      conversationRef: 'conversation-1',
      workspacePath: '/repo/workspace',
    });
    const queryInput = deps.agent.run.mock.calls[0][0];
    expect(queryInput).toEqual({
      text: 'hello',
      conversationRef: 'conversation-1',
      turnRef: 'turn-1',
      backendPayload: {
        text: 'hello',
        conversation_ref: 'conversation-1',
      },
      agentDefinition: undefined,
      content: undefined,
      screenshotRef: undefined,
      screenshotRefs: undefined,
      attachmentContext: undefined,
      attachmentFilenames: undefined,
      systemStateInternal: undefined,
      workspacePath: undefined,
      resources: [{ type: 'file', id: 'file-1' }],
      metadata: { source: 'renderer' },
    });
    expect(queryInput).not.toHaveProperty('payload');
  });

  test('drops renderer-supplied resource aliases when typed turn resources are present', async () => {
    const { commands, deps } = createCommands();

    await expect(commands.sendQueryThroughAgentSdkRuntime({
      messageId: 'turn-resource-alias',
      payload: {
        text: 'hello with resources',
        conversation_ref: 'conversation-1',
        resources: [{ kind: 'query_screenshot_request', required: false }],
        screenshot_ref: 'stale-shot',
        screenshot_url: '/api/artifacts/stale-shot',
        screenshot_refs: ['stale-shot'],
        attachment_context: 'stale attachment context',
        attachment_filenames: ['stale.png'],
        capture_meta: { stale: true },
      },
    })).resolves.toBe('query-1');

    const queryInput = deps.agent.run.mock.calls[0][0];
    expect(queryInput.resources).toEqual([{ kind: 'query_screenshot_request', required: false }]);
    expect(queryInput.backendPayload).toEqual({
      text: 'hello with resources',
      conversation_ref: 'conversation-1',
    });
    expect(queryInput.screenshotRef).toBeUndefined();
    expect(queryInput.screenshotRefs).toBeUndefined();
    expect(queryInput.attachmentContext).toBeUndefined();
    expect(queryInput.attachmentFilenames).toBeUndefined();
    expect(queryInput.backendPayload).not.toHaveProperty('screenshot_ref');
    expect(queryInput.backendPayload).not.toHaveProperty('screenshot_url');
    expect(queryInput.backendPayload).not.toHaveProperty('screenshot_refs');
    expect(queryInput.backendPayload).not.toHaveProperty('attachment_context');
    expect(queryInput.backendPayload).not.toHaveProperty('attachment_filenames');
    expect(queryInput.backendPayload).not.toHaveProperty('capture_meta');
  });

  test('passes renderer model override through SDK run options instead of backend payload', async () => {
    const { commands, deps } = createCommands();

    await expect(commands.sendQueryThroughAgentSdkRuntime({
      messageId: 'turn-model',
      payload: {
        text: 'use selected model',
        conversation_ref: 'conversation-1',
        model: {
          modelProvider: 'scripted',
          modelId: 'scripted-runtime',
        },
      },
    })).resolves.toBe('query-1');

    expect(deps.agent.run).toHaveBeenCalledWith({
      text: 'use selected model',
      conversationRef: 'conversation-1',
      turnRef: 'turn-model',
      backendPayload: {
        text: 'use selected model',
        conversation_ref: 'conversation-1',
      },
      agentDefinition: undefined,
      content: undefined,
      screenshotRef: undefined,
      screenshotRefs: undefined,
      attachmentContext: undefined,
      attachmentFilenames: undefined,
      systemStateInternal: undefined,
      workspacePath: undefined,
      resources: undefined,
      metadata: undefined,
    }, {
      model: {
        modelProvider: 'scripted',
        modelId: 'scripted-runtime',
      },
    });
  });

  test('maps renderer agent settings onto SDK query input fields consumed by backend dispatch', async () => {
    const { commands, deps } = createCommands();
    const agentDefinition = {
      system_prompt: 'Use the saved prompt.',
      tools: [{ name: 'web_search', enabled: false }],
    };

    await expect(commands.sendQueryThroughAgentSdkRuntime({
      messageId: 'turn-agent-settings',
      payload: {
        text: 'hello',
        conversation_ref: 'conversation-1',
        agent_definition: agentDefinition,
        content: 'hello',
        screenshot_ref: 'screenshot-1',
        screenshot_refs: ['screenshot-1'],
        attachment_context: 'attachment summary',
        attachment_filenames: ['notes.txt'],
        system_state_internal: { platform: 'darwin' },
        workspace_path: '/repo/workspace',
      },
    })).resolves.toBe('query-1');

    const queryInput = deps.agent.run.mock.calls[0][0];
    expect(queryInput.agentDefinition).toEqual(agentDefinition);
    expect(queryInput.backendPayload.agent_definition).toEqual(agentDefinition);
    expect(queryInput.content).toBe('hello');
    expect(queryInput.screenshotRef).toBe('screenshot-1');
    expect(queryInput.screenshotRefs).toEqual(['screenshot-1']);
    expect(queryInput.attachmentContext).toBe('attachment summary');
    expect(queryInput.attachmentFilenames).toEqual(['notes.txt']);
    expect(queryInput.systemStateInternal).toEqual({ platform: 'darwin' });
    expect(queryInput.workspacePath).toBe('/repo/workspace');
    expect(queryInput).not.toHaveProperty('payload');
  });

  test('omits malformed SDK resource metadata instead of trimming it through agent run', async () => {
    const { commands, deps } = createCommands();

    await expect(commands.sendQueryThroughAgentSdkRuntime({
      messageId: 'turn-resource-metadata',
      payload: {
        text: 'hello',
        conversation_ref: 'conversation-1',
        screenshot_ref: ' screenshot-padded ',
        screenshot_refs: ['screenshot-1', ' screenshot-2 ', '', 42],
        attachment_filenames: ['notes.txt', ' notes-padded.txt ', '', null],
        capture_meta: ['display-lifecycle'],
        workspace_path: ' /repo/workspace ',
      },
    })).resolves.toBe('query-1');

    const queryInput = deps.agent.run.mock.calls[0][0];
    expect(queryInput.screenshotRef).toBeUndefined();
    expect(queryInput.screenshotRefs).toEqual(['screenshot-1']);
    expect(queryInput.attachmentFilenames).toEqual(['notes.txt']);
    expect(queryInput.workspacePath).toBeUndefined();
    expect(queryInput.backendPayload).toEqual({
      text: 'hello',
      conversation_ref: 'conversation-1',
      screenshot_refs: ['screenshot-1'],
      attachment_filenames: ['notes.txt'],
    });
  });

  test('preserves SDK attachment context without trimming file-content whitespace', async () => {
    const { commands, deps } = createCommands();

    await expect(commands.sendQueryThroughAgentSdkRuntime({
      messageId: 'turn-attachment-context',
      payload: {
        text: 'hello',
        conversation_ref: 'conversation-1',
        attachment_context: '  file context\n  ',
      },
    })).resolves.toBe('query-1');

    const queryInput = deps.agent.run.mock.calls[0][0];
    expect(queryInput.attachmentContext).toBe('  file context\n  ');
    expect(queryInput.backendPayload.attachment_context).toBe('  file context\n  ');
  });

  test('logs and returns null when query dispatch fails', async () => {
    const { commands, deps } = createCommands({
      ensureAgent: jest.fn(async () => {
        throw new Error('offline');
      }),
    });

    await expect(commands.sendQueryThroughAgentSdkRuntime({
      payload: { text: 'hello' },
    })).resolves.toBeNull();
    expect(deps.log).toHaveBeenCalledWith('Failed to send query through Agent SDK runtime: offline');
  });

  test('stops the active query and clears pending turn state', async () => {
    const { commands, deps } = createCommands();

    await expect(commands.stopQueryThroughAgentSdkRuntime({
      conversation_ref: 'conversation-1',
      turn_ref: 'turn-1',
    })).resolves.toBe(true);

    expect(deps.clearLatestPendingTurn).toHaveBeenCalledWith({
      conversationRef: 'conversation-1',
      turnRef: 'turn-1',
      broadcast: true,
    });
    expect(deps.agent.stop).toHaveBeenCalledWith({
      conversationRef: 'conversation-1',
      turnRef: 'turn-1',
    });
  });

  test('returns false for stop when no active agent is available', async () => {
    const { commands, deps } = createCommands({
      getActiveAgent: jest.fn(() => null),
    });

    await expect(commands.stopQueryThroughAgentSdkRuntime({
      conversation_ref: 'conversation-1',
    })).resolves.toBe(false);
    expect(deps.clearLatestPendingTurn).not.toHaveBeenCalled();
  });

  test('routes settings, model list, and wakeword commands through ensured agents', async () => {
    const { commands, deps } = createCommands();

    await expect(commands.updateSettingsThroughAgentSdkRuntime({ model: 'gpt-test' }))
      .resolves.toEqual({ updated: { model: 'gpt-test' } });
    await expect(commands.requestModelListThroughAgentSdkRuntime())
      .resolves.toEqual({ models: ['gpt-test'] });
    await expect(commands.sendWakewordDetectedThroughAgentSdkRuntime({ phrase: 'hey' }))
      .resolves.toEqual({ detected: { phrase: 'hey' } });

    expect(deps.ensureAgent).toHaveBeenCalledWith({ reason: 'update-settings' });
    expect(deps.ensureAgent).toHaveBeenCalledWith({ reason: 'list-models' });
    expect(deps.ensureAgent).toHaveBeenCalledWith({ reason: 'wakeword-detected' });
  });

  test('ipc.cjs delegates Agent SDK runtime command bodies to the helper module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_agent_sdk_runtime_commands.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createAgentSdkRuntimeCommandsRuntime({');
    expect(mainSource).not.toContain('agent.run({');
    expect(mainSource).not.toContain('agent.stop({');
    expect(mainSource).not.toContain('agent.updateSettings(payload)');
    expect(mainSource).not.toContain('agent.requestModelList()');
    expect(mainSource).not.toContain('agent.wakewordDetected(payload)');
    expect(helperSource).toContain('agent.run(queryInput');
    expect(helperSource).toContain('function createAgentSdkRuntimeCommandsRuntime');
    expect(helperSource).not.toContain(retiredFactorySignature);
    expect(helperSource).toContain('runtimeCommandPayload');
    expect(helperSource).toContain('backendPayload: runtimeCommandPayload');
    expect(helperSource).toContain('function optionalAttachmentContext');
    expect(helperSource).toContain('function optionalExactString');
    expect(helperSource).toContain('function optionalExactStringArray');
    expect(helperSource).toContain('function normalizeBackendResourceMetadata');
    expect(helperSource).toContain('attachmentContext: optionalAttachmentContext(runtimeCommandPayload.attachment_context) || undefined');
    expect(helperSource).toContain('screenshotRef: optionalExactString(runtimeCommandPayload.screenshot_ref) || undefined');
    expect(helperSource).toContain('workspacePath: optionalExactString(runtimeCommandPayload.workspace_path) || undefined');
    expect(helperSource).not.toContain('screenshotRef: optionalString(runtimeCommandPayload.screenshot_ref) || undefined');
    expect(helperSource).not.toContain('workspacePath: optionalString(runtimeCommandPayload.workspace_path) || undefined');
    expect(helperSource).not.toContain('payload: runtimeCommandPayload');
    expect(helperSource).toContain('agent.stop({');
    expect(helperSource).toContain('agent.updateSettings(payload)');
    expect(helperSource).toContain('agent.requestModelList()');
    expect(helperSource).toContain('agent.wakewordDetected(payload)');
  });
});
