/** @jest-environment node */

const path = require('path');

const fs = require('fs');

describe('local_runtime_rpc_mappers', () => {
  test('local runtime mapped IPC module has been removed', () => {
    const mapperPath = path.join(
      __dirname,
      '../../src/main/sidecar/local_runtime_rpc_mappers.cjs',
    );

    expect(fs.existsSync(mapperPath)).toBe(false);
  });

  test('local runtime bridge does not import mapped IPC handler definitions', () => {
    const bridgePath = path.join(
      __dirname,
      '../../src/main/sidecar/local_runtime_bridge.cjs',
    );
    const bridgeSource = fs.readFileSync(bridgePath, 'utf8');

    expect(bridgeSource).not.toContain('COMPILED_RPC_HANDLER_DEFINITIONS');
    expect(bridgeSource).not.toContain('registerMappedRpcHandlers');
    expect(bridgeSource).not.toContain('local_runtime_rpc_mappers');
  });
});
