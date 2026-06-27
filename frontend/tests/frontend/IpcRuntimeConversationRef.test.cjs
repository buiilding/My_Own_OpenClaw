/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const runtimeConversationRefModule = require('../../src/main/ipc/ipc_runtime_conversation_ref.cjs');
const {
  createRuntimeConversationRefRuntime,
} = runtimeConversationRefModule;

function createResolver(fallbackConversationRef = null) {
  return createRuntimeConversationRefRuntime({
    getFallbackConversationRef: () => fallbackConversationRef,
  });
}

describe('ipc_runtime_conversation_ref', () => {
  test('prefers nested backend transport conversation_ref over direct aliases', () => {
    expect(createResolver('fallback-conv').resolve({
      conversation_ref: ' direct-snake ',
      conversationRef: 'direct-camel',
      payload: {
        conversation_ref: ' nested-transport ',
      },
    })).toBe('nested-transport');
  });

  test('falls back to direct snake_case then camelCase conversation refs', () => {
    expect(createResolver('fallback-conv').resolve({
      conversation_ref: ' direct-snake ',
      conversationRef: 'direct-camel',
    })).toBe('direct-snake');
    expect(createResolver('fallback-conv').resolve({
      conversationRef: ' direct-camel ',
    })).toBe('direct-camel');
  });

  test('uses the cached current conversation fallback only when input has no ref', () => {
    expect(createResolver(' fallback-conv ').resolve({})).toBe('fallback-conv');
    expect(createResolver('').resolve({ payload: {} })).toBeNull();
    expect(createResolver(null).resolve(null)).toBeNull();
  });

  test('ignores blank and non-string values', () => {
    expect(createResolver(' fallback-conv ').resolve({
      conversation_ref: ' ',
      conversationRef: 123,
      payload: {
        conversation_ref: [],
      },
    })).toBe('fallback-conv');
  });

  test('runtime resolves against the latest fallback conversation ref', () => {
    const fallbacks = [' fallback-1 ', ' fallback-2 '];
    const runtime = createRuntimeConversationRefRuntime({
      getFallbackConversationRef: jest.fn(() => fallbacks.shift()),
    });

    expect(runtime.resolve({})).toBe('fallback-1');
    expect(runtime.resolve({ payload: {} })).toBe('fallback-2');
    expect(runtime.resolve({ conversationRef: ' direct ' })).toBe('direct');
  });

  test('ipc.cjs delegates runtime conversation reference resolution to the helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_runtime_conversation_ref.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createRuntimeConversationRefRuntime({');
    expect(mainSource).toContain('runtimeConversationRefRuntime.resolve(input)');
    expect(mainSource).not.toContain(
      'resolveRuntimeConversationRefValue(input, backendSessionState.getConversationRef())',
    );
    expect(mainSource).not.toContain('function normalizeOptionalString(value)');
    expect(mainSource).not.toContain('const fromPayload = payload && typeof payload ===');
    expect(helperSource).toContain('function createRuntimeConversationRefRuntime');
    expect(helperSource).toContain('function resolveRuntimeConversationRef');
    expect(helperSource).toContain('payload.conversation_ref');
    expect(helperSource).toContain('input.conversation_ref || input.conversationRef');
    expect(runtimeConversationRefModule.normalizeOptionalString).toBeUndefined();
    expect(runtimeConversationRefModule.resolveRuntimeConversationRef).toBeUndefined();
  });
});
