/** @jest-environment node */

const fs = require('fs');
const path = require('path');

const {
  COMPILED_RPC_HANDLER_DEFINITIONS,
} = require('../../frontend/src/main/local_backend_bridge_rpc_mappers.cjs');

describe('local_backend_bridge_rpc_mappers', () => {
  test('local backend bridge does not expose direct memory storage', () => {
    expect(
      COMPILED_RPC_HANDLER_DEFINITIONS.map(definition => definition.channel),
    ).not.toContain('store-memory');
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
