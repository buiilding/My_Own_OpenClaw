/** @jest-environment node */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const incomingContract = require('../../backend/src/api/contracts/incoming_message_contract.json');
const {
  createManagedAgentSession,
} = require('../../packages/windie-sdk-js/cjs/transport/ManagedAgentSession.js');
const {
  buildBackendQueryPayload,
} = require('../../src/main/ipc/ipc_query_runtime.cjs');
const {
  filterBackendPayload,
} = require('../../packages/windie-sdk-js/cjs/transport/backendPayloadContract.js');

class FakeSocket extends EventEmitter {
  constructor(url = 'ws://backend.test/ws', options = {}) {
    super();
    this.url = url;
    this.options = options;
    this.readyState = 0;
    this.sent = [];
  }

  send(message) {
    this.sent.push(message);
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }

  open() {
    this.readyState = 1;
    this.emit('open');
  }
}

function assertAllowedKeys(label, value, allowedKeys, { allowExtra = false } = {}) {
  expect(value && typeof value === 'object' && !Array.isArray(value)).toBe(true);
  const extras = Object.keys(value).filter(key => !allowedKeys.includes(key));
  if (!allowExtra) {
    expect(extras).toEqual([]);
    for (const key of Object.keys(value)) {
      expect(allowedKeys).toContain(key);
    }
  }
}

function assertPayloadMatchesContract(type, payload) {
  const payloadContract = incomingContract.payloads[type];
  if (!payloadContract) {
    throw new Error(`Missing incoming payload contract for ${type}`);
  }
  assertAllowedKeys(`${type}.payload`, payload, payloadContract.keys);

  const dataContract = payloadContract.nested?.data;
  if (dataContract && payload.data !== undefined && payload.data !== null) {
    assertAllowedKeys(`${type}.payload.data`, payload.data, dataContract.keys, {
      allowExtra: dataContract.extra === 'allow',
    });
  }

  const stepContract = payloadContract.nested?.['step_results[]'];
  if (stepContract && Array.isArray(payload.step_results)) {
    for (const step of payload.step_results) {
      assertAllowedKeys(`${type}.payload.step_results[]`, step, stepContract.keys, {
        allowExtra: stepContract.extra === 'allow',
      });
    }
  }

  const toolsContract = payloadContract.nested?.tools;
  if (toolsContract && payload.tools !== undefined && payload.tools !== null) {
    assertAllowedKeys(`${type}.payload.tools`, payload.tools, toolsContract.keys, {
      allowExtra: toolsContract.extra === 'allow',
    });
  }

  const providerApiKeysContract = payloadContract.nested?.provider_api_keys;
  if (
    providerApiKeysContract
    && payload.provider_api_keys !== undefined
    && payload.provider_api_keys !== null
  ) {
    assertAllowedKeys(
      `${type}.payload.provider_api_keys`,
      payload.provider_api_keys,
      providerApiKeysContract.keys,
      { allowExtra: providerApiKeysContract.extra === 'ignore' },
    );
    for (const [provider, entry] of Object.entries(payload.provider_api_keys)) {
      if (!providerApiKeysContract.keys.includes(provider)) {
        continue;
      }
      assertAllowedKeys(
        `${type}.payload.provider_api_keys.${provider}`,
        entry,
        providerApiKeysContract.entry_keys,
      );
    }
  }
}

async function createOpenSession() {
  const sockets = [];
  class FakeWebSocket extends FakeSocket {
    constructor(url, options) {
      super(url, options);
      sockets.push(this);
    }
  }

  const session = createManagedAgentSession({
    backendUrl: 'http://backend.test',
    wsUrl: 'ws://backend.test/ws',
    WebSocketImpl: FakeWebSocket,
    createMessageId: () => 'msg-1',
    userId: 'user-1',
  });

  const connected = session.waitForOpen();
  const socket = sockets[0];
  socket.open();
  await connected;
  socket.sent = [];
  return { session, socket };
}

function sentPayload(socket, index) {
  return JSON.parse(socket.sent[index]).payload;
}

function expectedPayloadKeysByType() {
  return Object.fromEntries(
    Object.entries(incomingContract.payloads).map(([type, payloadContract]) => [
      type,
      payloadContract.keys,
    ]),
  );
}

function samplePayloadValue(type, key) {
  if (
    key === 'messages'
    || key === 'repo_instruction_messages'
    || key === 'client_prompt_layers'
    || key === 'screenshot_refs'
    || key === 'step_results'
  ) {
    return [];
  }
  if (key === 'display_attachments') {
    return [{
      id: `${type}:display-attachment`,
      kind: 'image',
      source: 'tool_result',
      status: 'ready',
      screenshot_ref: `${type}:display-artifact`,
    }];
  }
  if (key === 'force' || key === 'success') {
    return true;
  }
  if (key === 'data' || key === 'system_state_internal' || key === 'agent_definition') {
    return {};
  }
  if (key === 'tools') {
    return {
      mode: 'replace_client_manifest',
      client_manifest: { version: 1, tools: [] },
      renderer_only: true,
    };
  }
  if (key === 'provider_api_keys') {
    return {
      openai: {
        enabled: true,
        api_key: 'sk-test',
        renderer_only: true,
      },
      future_provider: {
        enabled: true,
        api_key: 'future',
      },
    };
  }
  if (key === 'capture_meta') {
    return {
      source_w: 100,
      source_h: 80,
      crop_x: 0,
      crop_y: 0,
      crop_w: 100,
      crop_h: 80,
      timestamp: 123,
      capture_engine: 'test',
    };
  }
  return `${type}:${key}`;
}

function samplePayloadWithAllContractKeys(type) {
  const payload = {
    renderer_only_extra: true,
  };
  for (const key of incomingContract.payloads[type].keys) {
    payload[key] = samplePayloadValue(type, key);
  }
  return payload;
}

function extractSdkBackendPayloadKeysByType() {
  const source = fs.readFileSync(
    path.join(__dirname, '../../packages/windie-sdk-js/src/transport/backendPayloadContract.ts'),
    'utf8',
  );
  const startIndex = source.indexOf('const BACKEND_PAYLOAD_KEYS_BY_TYPE');
  const endIndex = source.indexOf('const PROVIDER_API_KEY_ENTRY_KEYS');
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  const sourceBlock = source.slice(startIndex, endIndex);
  const keyMap = {};
  const entryRegex = /(?:^|\n)\s*(?:'([^']+)'|([A-Za-z][A-Za-z0-9_]*)):\s*Object\.freeze\(\[([\s\S]*?)\]\),?/g;
  let match;
  while ((match = entryRegex.exec(sourceBlock)) !== null) {
    const type = match[1] || match[2];
    const keyBody = match[3];
    keyMap[type] = Array.from(keyBody.matchAll(/'([^']+)'/g), keyMatch => keyMatch[1]);
  }
  return keyMap;
}

describe('backend-to-sdk websocket incoming contract', () => {
  test('managed agent session endpoint validation uses generic agent wording', async () => {
    const session = createManagedAgentSession({
      endpoints: [{}],
      WebSocketImpl: FakeSocket,
      userId: 'user-1',
    });

    try {
      await expect(session.waitForOpen()).rejects.toThrow('Managed agent endpoint requires backendUrl or wsUrl');
    } finally {
      session.close('test-cleanup');
    }
  });

  test('backend-owned fixture covers every SDK/main command family sent over websocket', () => {
    expect(Object.keys(incomingContract.payloads)).toEqual([
      'query',
      'stop-query',
      'rehydrate-conversation',
      'load-settings',
      'list-models',
      'update-settings',
      'wakeword-detected',
      'compact-history',
      'tool-result',
      'tool-bundle-result',
    ]);
    expect(path.basename(require.resolve(
      '../../backend/src/api/contracts/incoming_message_contract.json',
    ))).toBe('incoming_message_contract.json');
  });

  test('main outbound payload filter matches backend incoming contract keys', () => {
    for (const [type, payloadContract] of Object.entries(incomingContract.payloads)) {
      const filtered = filterBackendPayload(type, samplePayloadWithAllContractKeys(type));

      expect(Object.keys(filtered)).toEqual(payloadContract.keys);
      expect(filtered).not.toHaveProperty('renderer_only_extra');
      assertPayloadMatchesContract(type, filtered);
    }
  });

  test('main settings sync imports the SDK payload contract directly', () => {
    const settingsSyncSource = fs.readFileSync(
      path.join(__dirname, '../../src/main/ipc/ipc_settings_sync_runtime.cjs'),
      'utf8',
    );

    expect(fs.existsSync(
      path.join(__dirname, '../../src/main/ipc/ipc_backend_payload_contract.cjs'),
    )).toBe(false);
    expect(settingsSyncSource).toContain(
      'packages/windie-sdk-js/cjs/transport/backendPayloadContract.js',
    );
    expect(settingsSyncSource).not.toContain('./ipc_backend_payload_contract.cjs');
    expect(settingsSyncSource).not.toContain('BACKEND_PAYLOAD_KEYS_BY_TYPE');
    expect(settingsSyncSource).not.toContain('PROVIDER_API_KEY_KEYS');
    expect(settingsSyncSource).not.toContain('CAPTURE_META_KEYS');
  });

  test('sdk outbound provider credential filter is provider-id agnostic', () => {
    const filtered = filterBackendPayload('update-settings', {
      provider_api_keys: {
        openai: {
          enabled: true,
          api_key: 'sk-test',
          renderer_only: true,
        },
        future_provider: {
          enabled: true,
          api_key: 'future',
          renderer_only: true,
        },
        'bad provider': {
          enabled: true,
          api_key: 'bad',
        },
      },
    });

    expect(filtered).toEqual({
      provider_api_keys: {
        openai: {
          enabled: true,
          api_key: 'sk-test',
        },
        future_provider: {
          enabled: true,
          api_key: 'future',
        },
      },
    });
  });

  test('sdk outbound payload allowlist matches backend incoming contract keys', () => {
    expect(extractSdkBackendPayloadKeysByType()).toEqual(expectedPayloadKeysByType());
  });

  test('managed agent session reuses the AgentSession stop alias guard', () => {
    const managedSource = fs.readFileSync(
      path.join(__dirname, '../../packages/windie-sdk-js/src/transport/ManagedAgentSession.ts'),
      'utf8',
    );

    expect(managedSource).toContain('rejectRemovedStopInputAliases(input);');
    expect(managedSource).not.toContain("Object.prototype.hasOwnProperty.call(input, 'conversation_ref')");
    expect(managedSource).not.toContain("Object.prototype.hasOwnProperty.call(input, 'turn_ref')");
  });

  test('managed agent session sends canonical agent-definition handshake shape', async () => {
    const sockets = [];
    class FakeWebSocket extends FakeSocket {
      constructor(url, options) {
        super(url, options);
        sockets.push(this);
      }
    }
    const session = createManagedAgentSession({
      backendUrl: 'http://backend.test',
      wsUrl: 'ws://backend.test/ws',
      WebSocketImpl: FakeWebSocket,
      userId: 'user-1',
      operatingSystem: 'Windows',
      agentDefinition: {
        id: 'agent-1',
        runtime: {
          workspace_path: 'C:/work',
        },
      },
    });

    try {
      const connected = session.waitForOpen();
      sockets[0].open();
      await connected;

      const handshake = JSON.parse(sockets[0].sent[0]);
      expect(Object.keys(handshake)).toEqual(['type', 'user_id', 'agent_definition']);
      expect(handshake).toEqual({
        type: 'handshake',
        user_id: 'user-1',
        agent_definition: {
          id: 'agent-1',
          runtime: {
            workspace_path: 'C:/work',
            operating_system: 'Windows',
          },
        },
      });
    } finally {
      session.close('test-cleanup');
    }
  });

  test('query builder output is exact backend payload contract and excludes envelope context', () => {
    const payload = buildBackendQueryPayload({
      text: 'hello',
      conversation_ref: 'conv-1',
      content: '<user_query>hello</user_query>',
      screenshot_ref: 'artifact-1',
      screenshot_url: 'http://localhost/artifact-1',
      turn_ref: 'turn-envelope-only',
      session_id: 'session-envelope-only',
      user_id: 'user-envelope-only',
      unknown_backend_field: true,
    });

    expect(payload).toEqual({
      text: 'hello',
      conversation_ref: 'conv-1',
      content: '<user_query>hello</user_query>',
      screenshot_ref: 'artifact-1',
    });
    assertPayloadMatchesContract('query', payload);
  });

  test('managed agent session sends exact command payloads for control families', async () => {
    const { session, socket } = await createOpenSession();

    try {
      await session.stopQuery({ conversationRef: 'conv-1' });
      await expect(session.stopQuery({
        conversation_ref: 'legacy-conv',
        turn_ref: 'legacy-turn',
      })).rejects.toThrow(
        'AgentSession.stopQuery accepts conversationRef and turnRef; snake_case stop fields are not supported.',
      );
      await session.rehydrateConversation({
        conversation_ref: 'conv-1',
        messages: [{ role: 'user', content: 'hello' }],
        rehydrate_mode: 'replace',
      });
      await session.updateSettings({
        model_provider: 'openai',
        selected_model_id: 'gpt-test',
      });
      await session.listModels();
      await session.wakewordDetected();
      await session.compactHistory({
        force: true,
        conversation_ref: 'conv-1',
      });

      const sentTypes = socket.sent.map(message => JSON.parse(message).type);
      expect(sentTypes).toEqual([
        'stop-query',
        'rehydrate-conversation',
        'update-settings',
        'list-models',
        'wakeword-detected',
        'compact-history',
      ]);

      sentTypes.forEach((type, index) => {
        assertPayloadMatchesContract(type, sentPayload(socket, index));
      });
    } finally {
      session.close('test-cleanup');
    }
  });

  test('managed agent session strips extra top-level fields before websocket send', async () => {
    const { session, socket } = await createOpenSession();

    try {
      await session.stopQuery({
        conversationRef: 'conv-1',
        turnRef: 'payload-extra',
      });
      await session.rehydrateConversation({
        conversation_ref: 'conv-1',
        messages: [],
        rehydrate_mode: 'replace',
        agent_definition: { query_only: true },
        turn_ref: 'payload-extra',
      });
      await session.updateSettings({
        selected_model_id: 'gpt-test',
        tools: {
          mode: 'replace_client_manifest',
          client_manifest: { version: 1, tools: [] },
        },
        provider_api_keys: {
          openai: {
            enabled: true,
            api_key: 'sk-test',
            renderer_only: true,
          },
          future_provider: {
            enabled: true,
            api_key: 'future',
          },
        },
        global_agent_stop_shortcut: { resolvedAccelerator: 'Ctrl+Alt+.' },
        appearance_theme: 'graphite',
      });
      await session.listModels();
      await session.wakewordDetected({
        turn_ref: 'payload-extra',
      });
      await session.compactHistory({
        force: false,
        conversation_ref: 'conv-1',
        turn_ref: 'payload-extra',
      });

      socket.sent.forEach((message) => {
        const parsed = JSON.parse(message);
        assertPayloadMatchesContract(parsed.type, parsed.payload);
      });
      expect(sentPayload(socket, 0)).toEqual({
        conversation_ref: 'conv-1',
        turn_ref: 'payload-extra',
      });
      expect(sentPayload(socket, 1)).toEqual({
        conversation_ref: 'conv-1',
        messages: [],
        rehydrate_mode: 'replace',
      });
      expect(sentPayload(socket, 2)).toEqual({
        selected_model_id: 'gpt-test',
        tools: {
          mode: 'replace_client_manifest',
          client_manifest: { version: 1, tools: [] },
        },
        provider_api_keys: {
          openai: {
            enabled: true,
            api_key: 'sk-test',
          },
          future_provider: {
            enabled: true,
            api_key: 'future',
          },
        },
      });
      expect(sentPayload(socket, 3)).toEqual({});
      expect(sentPayload(socket, 4)).toEqual({});
      expect(sentPayload(socket, 5)).toEqual({
        force: false,
        conversation_ref: 'conv-1',
      });
    } finally {
      session.close('test-cleanup');
    }
  });

  test('managed agent session sends exact tool-result and bundle-result top-level payloads', async () => {
    const { session, socket } = await createOpenSession();

    try {
      await session.sendToolResultPayload({
        request_id: 'req-1',
        success: true,
        data: {
          output: 'tool-specific extra field is allowed in data',
          attachments: [{
            id: 'attach-tool-1',
            kind: 'image',
            source: 'tool_result',
            status: 'ready',
            screenshotRef: 'artifact-tool-1.png',
            screenshotUrl: '/api/artifacts/artifact-tool-1.png',
            previewSrc: 'data:image/png;base64,renderer-preview',
          }],
        },
      });
      await session.sendToolBundleResultPayload({
        bundle_id: 'bundle-1',
        status: 'success',
        screenshot_url: 'renderer-only-url',
        display_attachments: [{
          id: 'attach-bundle-1',
          kind: 'image',
          source: 'tool_result',
          status: 'ready',
          screenshot_ref: 'artifact-bundle-1.png',
          screenshot_url: 'data:image/png;base64,inline',
        }],
        step_results: [{
          tool: 'read_file',
          status: 'success',
          output: 'ok',
          debug: 'step-specific extra field is allowed',
        }],
      });

      const toolResultPayload = sentPayload(socket, 0);
      const bundleResultPayload = sentPayload(socket, 1);

      assertPayloadMatchesContract('tool-result', toolResultPayload);
      assertPayloadMatchesContract('tool-bundle-result', bundleResultPayload);
      expect(bundleResultPayload).not.toHaveProperty('screenshot_url');
      expect(toolResultPayload.data.display_attachments).toEqual([{
        id: 'attach-tool-1',
        kind: 'image',
        source: 'tool_result',
        status: 'ready',
        screenshot_ref: 'artifact-tool-1.png',
        screenshot_url: '/api/artifacts/artifact-tool-1.png',
      }]);
      expect(toolResultPayload.data).not.toHaveProperty('attachments');
      expect(bundleResultPayload.display_attachments).toEqual([{
        id: 'attach-bundle-1',
        kind: 'image',
        source: 'tool_result',
        status: 'ready',
        screenshot_ref: 'artifact-bundle-1.png',
      }]);
      expect(JSON.stringify([toolResultPayload, bundleResultPayload])).not.toContain('data:image');
    } finally {
      session.close('test-cleanup');
    }
  });

  test('managed agent session strips invalid strict capture metadata', async () => {
    const { session, socket } = await createOpenSession();

    try {
      await session.sendToolResultPayload({
        request_id: 'req-1',
        success: true,
        data: {
          output: 'done',
          capture_meta: {
            capture_engine: 'partial-only',
          },
          screenshot_content_type: 'image/jpeg',
        },
      });
      await session.sendToolBundleResultPayload({
        bundle_id: 'bundle-1',
        status: 'success',
        capture_meta: {
          source_w: 100,
          source_h: 80,
          crop_x: 0,
          crop_y: 0,
          crop_w: 100,
          crop_h: 80,
          timestamp: 123,
          capture_engine: 'test',
          desktop_virtual_bounds: {
            x: 0,
            y: 0,
            width: 100,
            height: 80,
            ignored: true,
          },
          ignored: true,
        },
        step_results: [{
          tool: 'screenshot',
          status: 'success',
          output: 'ok',
        }],
      });

      const toolResultPayload = sentPayload(socket, 0);
      const bundleResultPayload = sentPayload(socket, 1);

      assertPayloadMatchesContract('tool-result', toolResultPayload);
      assertPayloadMatchesContract('tool-bundle-result', bundleResultPayload);
      expect(toolResultPayload.data).toEqual({
        output: 'done',
        screenshot_content_type: 'image/jpeg',
      });
      expect(bundleResultPayload.capture_meta).toEqual({
        source_w: 100,
        source_h: 80,
        crop_x: 0,
        crop_y: 0,
        crop_w: 100,
        crop_h: 80,
        timestamp: 123,
        capture_engine: 'test',
        desktop_virtual_bounds: {
          x: 0,
          y: 0,
          width: 100,
          height: 80,
        },
      });
    } finally {
      session.close('test-cleanup');
    }
  });

  test('contract validator catches extra top-level backend payload keys', () => {
    expect(() => assertPayloadMatchesContract('stop-query', {
      conversation_ref: 'conv-1',
      turn_ref: 'payload-extra',
      renderer_only: true,
    })).toThrow();
  });
});
