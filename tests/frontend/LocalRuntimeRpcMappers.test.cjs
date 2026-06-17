/** @jest-environment node */

const fs = require('fs');
const path = require('path');

const {
  COMPILED_RPC_HANDLER_DEFINITIONS,
} = require('../../frontend/src/main/sidecar/local_runtime_rpc_mappers.cjs');

describe('local_runtime_rpc_mappers', () => {
  test('local runtime bridge does not expose direct memory storage', () => {
    expect(
      COMPILED_RPC_HANDLER_DEFINITIONS.map(definition => definition.channel),
    ).not.toContain('store-memory');
  });

  test('local runtime bridge does not define memory field aliases inline', () => {
    const bridgePath = path.join(
      __dirname,
      '../../frontend/src/main/sidecar/local_runtime_bridge.cjs',
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

  test('payload mapper does not support fallback source-key arrays', () => {
    const mapperPath = path.join(
      __dirname,
      '../../frontend/src/main/sidecar/local_runtime_rpc_mappers.cjs',
    );
    const mapperSource = fs.readFileSync(mapperPath, 'utf8');

    expect(mapperSource).not.toContain("mapperType: 'fallback'");
    expect(mapperSource).not.toContain('sourceKeys');
  });
});
