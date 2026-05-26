/** @jest-environment node */

const fs = require('fs');
const path = require('path');

const {
  mapStoreMemoryPayload,
} = require('../../frontend/src/main/local_backend_bridge_rpc_mappers.cjs');

describe('local_backend_bridge_rpc_mappers', () => {
  test('store-memory mapper owns camelCase and snake_case aliases', () => {
    expect(mapStoreMemoryPayload({
      userQuery: 'What is WindieOS?',
      assistantResponse: 'A desktop assistant.',
      memoryType: 'semantic',
      userId: 'user-7',
      sessionId: 'session-7',
    })).toEqual({
      user_query: 'What is WindieOS?',
      assistant_response: 'A desktop assistant.',
      memory_type: 'semantic',
      user_id: 'user-7',
      session_id: 'session-7',
    });

    expect(mapStoreMemoryPayload({
      user_query: 'What is WindieOS?',
      assistant_response: 'A desktop assistant.',
      memory_type: 'semantic',
      user_id: 'user-8',
      session_id: 'session-8',
    })).toEqual({
      user_query: 'What is WindieOS?',
      assistant_response: 'A desktop assistant.',
      memory_type: 'semantic',
      user_id: 'user-8',
      session_id: 'session-8',
    });
  });

  test('local backend bridge does not define memory field aliases inline', () => {
    const bridgePath = path.join(
      __dirname,
      '../../frontend/src/main/local_backend_bridge.cjs',
    );
    const bridgeSource = fs.readFileSync(bridgePath, 'utf8');
    const forbiddenInlineAliases = [
      'source.userQuery',
      'source.assistantResponse',
      'source.memoryType',
      'source.userId',
      'source.sessionId',
    ];

    for (const alias of forbiddenInlineAliases) {
      expect(bridgeSource).not.toContain(alias);
    }
  });
});
