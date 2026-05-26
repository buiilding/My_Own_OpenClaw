/** @jest-environment node */

const { EventEmitter } = require('events');
const path = require('path');

const incomingContract = require('../../backend/src/api/contracts/incoming_message_contract.json');
const {
  createManagedBackendSession,
} = require('../../packages/windie-sdk-js/src/transport/ManagedBackendSession.cjs');
const {
  buildBackendQueryPayload,
} = require('../../frontend/src/main/ipc/ipc_query_runtime.cjs');
const {
  normalizeBackendPayload,
} = require('../../frontend/src/main/ipc/ipc_runtime_helpers.cjs');

class FakeSocket extends EventEmitter {
  constructor() {
    super();
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
}

async function createOpenSession() {
  const socket = new FakeSocket();
  const session = createManagedBackendSession({
    createSocket: () => socket,
    createMessageId: () => 'msg-1',
    getUserId: () => 'user-1',
    buildHandshake: () => ({ type: 'handshake', user_id: 'user-1' }),
    normalizePayload: normalizeBackendPayload,
  });

  const connected = session.ensureConnected({ timeoutMs: 100 });
  socket.open();
  await connected;
  socket.sent = [];
  return { session, socket };
}

function sentPayload(socket, index) {
  return JSON.parse(socket.sent[index]).payload;
}

describe('frontend/backend websocket incoming contract', () => {
  test('backend-owned fixture covers every frontend command family sent over websocket', () => {
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

  test('managed backend session sends exact command payloads for control families', async () => {
    const { session, socket } = await createOpenSession();

    session.sendStopQuery({ conversation_ref: 'conv-1' });
    session.sendRehydrateConversation({
      conversation_ref: 'conv-1',
      messages: [{ role: 'user', content: 'hello' }],
      rehydrate_mode: 'replace',
    });
    session.sendUpdateSettings({
      model_provider: 'openai',
      selected_model_id: 'gpt-test',
    });
    session.sendListModels({});
    session.sendWakewordDetected({});
    session.sendCompactHistory({
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
  });

  test('managed backend session sends exact tool-result and bundle-result top-level payloads', async () => {
    const { session, socket } = await createOpenSession();

    session.sendToolResult({
      request_id: 'req-1',
      success: true,
      data: {
        llm_content: 'done',
        output: 'tool-specific extra field is allowed in data',
      },
    });
    session.sendToolBundleResult({
      bundle_id: 'bundle-1',
      status: 'success',
      screenshot_url: 'renderer-only-url',
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
  });

  test('contract validator catches extra top-level backend payload keys', () => {
    expect(() => assertPayloadMatchesContract('stop-query', {
      conversation_ref: 'conv-1',
      turn_ref: 'payload-extra',
    })).toThrow();
  });
});
